/**
 * The harness daemon (JURY-009): a long-running process that keeps one
 * `Harness` online for Verafy Chain nodes.
 *
 * It registers with every node (signed with the harness's own key), watches
 * each node's mempool for funded contracts, and serves the juror routes nodes call
 * when the harness is drawn: commit, reveal and, at L2, proof. A contract the
 * harness cannot admit (intake, then the funding check), or that no watched
 * node holds, is refused at commit, so a seat is only taken on a contract this
 * harness checked.
 *
 * Commitments survive a restart: the vote and salt behind every open
 * commitment are written to `stateFile` before the commitment leaves the
 * process, so a restarted daemon can still reveal. The file holds no key.
 *
 *   GET  /health   liveness, counts and the last watch time
 *   GET  /card     the public card
 *   GET  /status   admitted, refused and open commitments, the record
 *   POST /commit   { asc } -> the signed commitment (409 if not admitted)
 *   POST /reveal   { ascHash } -> the signed reveal
 *   POST /proof    { asc, ascHash } -> { record, bundle } (L2, with a prover)
 *
 * @module @verafyharness/daemon
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { ascHash } from '../../core/src/index.js'

const MAX_BODY = 4 * 1024 * 1024

export class HarnessDaemon {
  /**
   * @param {object} o
   * @param {import('@verafyharness/core').Harness} o.harness - the harness to serve.
   * @param {string[]} [o.nodes] - node base URLs to register with and watch.
   * @param {string} o.publicUrl - the URL nodes reach this daemon at.
   * @param {number} [o.port] - port to listen on (0 for any).
   * @param {string} [o.host] - interface to bind.
   * @param {string} [o.stateFile] - where open commitments are kept across restarts.
   * @param {number} [o.watchMs] - how often to read each node's mempool.
   * @param {object} [o.prove] - L2: `{ provider, prover, proveVotes }` from `@verafyharness/prove`.
   * @param {boolean} [o.requireFunding] - refuse contracts with no `payment.source` when a light client is set.
   * @param {Function} [o.fetch] - fetch, for tests.
   * @param {Function} [o.log] - event sink, one object per event.
   */
  constructor({ harness, nodes = [], publicUrl, port = 7200, host = '0.0.0.0', stateFile = null, watchMs = 5000, prove = null, requireFunding = false, fetch: f = globalThis.fetch, log = e => console.log(JSON.stringify(e)) }) {
    if (!harness) throw new Error('daemon needs a harness')
    if (!publicUrl) throw new Error('daemon needs publicUrl: the address nodes call')
    Object.assign(this, { harness, nodes, publicUrl, port, host, stateFile, watchMs, prove, requireFunding, fetch: f, log })
    this.admitted = new Map()   // ascHash -> { at, title }
    this.refused = new Map()    // ascHash -> problems
    this.registered = new Set()
    this.seen = new Map()       // ascHash -> { node, title }: pending in a watched mempool
    this.lastWatch = null
    this.server = null
    this.timer = null
    this.restore()
  }

  /** Reload open commitments written before a restart. */
  restore() {
    if (!this.stateFile || !existsSync(this.stateFile)) return
    const s = JSON.parse(readFileSync(this.stateFile, 'utf8'))
    for (const [h, p] of Object.entries(s.pending ?? {})) this.harness.pending.set(h, p)
    for (const [h, a] of Object.entries(s.admitted ?? {})) this.admitted.set(h, a)
    this.log({ event: 'restored', harness: this.harness.id, pending: this.harness.pending.size })
  }

  /** Write open commitments atomically (temp file, then rename). */
  persist() {
    if (!this.stateFile) return
    const tmp = this.stateFile + '.tmp'
    writeFileSync(tmp, JSON.stringify({ harness: this.harness.id, pending: Object.fromEntries(this.harness.pending), admitted: Object.fromEntries(this.admitted) }), { mode: 0o600 })
    renameSync(tmp, this.stateFile)
  }

  /** The signed registration body a node checks. */
  registration() {
    const card = this.harness.card
    return { card, url: this.publicUrl, signature: this.harness.sign({ card, url: this.publicUrl }) }
  }

  async #json(url, init) {
    const res = await this.fetch(url, { ...init, signal: AbortSignal.timeout(10_000) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    return body
  }

  /** Register with every node not yet registered. Failures are retried on the next watch. */
  async register() {
    const body = JSON.stringify(this.registration())
    for (const node of this.nodes) {
      if (this.registered.has(node)) continue
      try {
        await this.#json(`${node}/harnesses`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
        this.registered.add(node)
        this.log({ event: 'registered', harness: this.harness.id, node })
      } catch (err) {
        this.log({ event: 'register-failed', harness: this.harness.id, node, error: err.message })
      }
    }
  }

  /** Admit one contract: intake and the funding check. Returns the decision. */
  async admit(asc) {
    const h = ascHash(asc)
    if (this.admitted.has(h)) return { admitted: true, ascHash: h }
    const d = await this.harness.admit(asc, { require: this.requireFunding })
    if (d.admitted) {
      this.admitted.set(h, { at: new Date().toISOString(), title: asc.title ?? asc.id })
      this.refused.delete(h)
      this.log({ event: 'admitted', harness: this.harness.id, asc: asc.id, ascHash: h })
    } else {
      this.refused.set(h, d.problems)
      this.log({ event: 'refused', harness: this.harness.id, asc: asc.id, ascHash: h, problems: d.problems })
    }
    return { ...d, ascHash: h }
  }

  /**
   * One watch pass: register, then read each node's mempool. Pending contracts
   * are recorded as seen; a node seats this harness only on a contract in its
   * mempool, so with nodes configured a commit request for anything unseen is
   * refused (nobody can spend this harness's model budget on a contract no node holds).
   */
  async watch() {
    await this.register()
    const seen = new Map()
    for (const node of this.nodes) {
      let list
      try { list = await this.#json(`${node}/contracts`) } catch (err) { this.log({ event: 'watch-failed', node, error: err.message }); continue }
      for (const c of list) if (c.ascHash && (!c.status || c.status === 'pending')) seen.set(c.ascHash, { node, title: c.title })
    }
    for (const [h, s] of seen) if (!this.seen.has(h)) this.log({ event: 'seen', harness: this.harness.id, ascHash: h, node: s.node, title: s.title })
    if (this.nodes.length) this.seen = seen
    this.lastWatch = new Date().toISOString()
  }

  /** Is this contract in some node's mempool? Checks the nodes directly if the last watch missed it. */
  async inMempool(h) {
    if (!this.nodes.length || this.seen.has(h)) return true
    for (const node of this.nodes) {
      try { await this.#json(`${node}/contracts/${h}`); this.seen.set(h, { node }); return true } catch { /* not on this node */ }
    }
    return false
  }

  async #route(method, path, body) {
    const h = this.harness
    if (method === 'GET' && path === '/health') return [200, { ok: true, harness: h.id, family: h.family, model: h.model, nodes: this.nodes.length, registered: this.registered.size, seen: this.seen.size, admitted: this.admitted.size, open: h.pending.size, lastWatch: this.lastWatch }]
    if (method === 'GET' && path === '/card') return [200, h.card]
    if (method === 'GET' && path === '/status') return [200, { harness: h.id, record: h.record, admitted: Object.fromEntries(this.admitted), refused: Object.fromEntries(this.refused), open: [...h.pending.keys()] }]
    if (method === 'POST' && path === '/commit') {
      if (!body?.asc) return [400, { error: 'commit needs { asc }' }]
      if (!(await this.inMempool(ascHash(body.asc)))) return [409, { error: 'not in any watched node\'s mempool' }]
      const d = await this.admit(body.asc)
      if (!d.admitted) return [409, { error: `not admitted: ${d.problems.join('; ')}` }]
      const c = await h.commit(body.asc)
      this.persist()
      this.log({ event: 'commit', harness: h.id, asc: body.asc.id, commitment: c.commitment })
      return [200, c]
    }
    if (method === 'POST' && path === '/reveal') {
      if (!body?.ascHash) return [400, { error: 'reveal needs { ascHash }' }]
      const r = h.reveal(body.ascHash)
      this.admitted.delete(body.ascHash)
      this.persist()
      this.log({ event: 'reveal', harness: h.id, ascHash: body.ascHash, answer: r.vote.answer })
      return [200, r]
    }
    if (method === 'POST' && path === '/proof') {
      if (!this.prove) return [404, { error: 'this harness does not prove (no prover configured)' }]
      const { provider, prover, proveVotes } = this.prove
      const [r] = await proveVotes(h, provider, prover, [body.asc])
      if (!r.record) return [409, { error: r.error }]
      this.log({ event: 'proof', harness: h.id, asc: body.asc.id, proofHash: r.record.proofHash })
      return [200, { record: r.record, bundle: r.bundle }]
    }
    return [404, { error: 'no such route' }]
  }

  /** Handle one request without a socket, for tests and other transports. */
  async handle(method, path, body = null) {
    try { return await this.#route(method, path, body) } catch (err) { return [400, { error: err.message }] }
  }

  /** Listen, register and start watching. Resolves with the bound port. */
  async start() {
    this.server = createServer(async (req, res) => {
      let size = 0
      const chunks = []
      for await (const ch of req) { size += ch.length; if (size > MAX_BODY) { res.writeHead(413).end(); return } chunks.push(ch) }
      let body = null
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null } catch { res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"bad JSON"}'); return }
      const [status, json] = await this.handle(req.method, new URL(req.url, 'http://x').pathname, body)
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    })
    await new Promise(r => this.server.listen(this.port, this.host, r))
    this.port = this.server.address().port
    this.log({ event: 'listening', harness: this.harness.id, port: this.port, url: this.publicUrl })
    const loop = async () => { await this.watch().catch(err => this.log({ event: 'watch-error', error: err.message })); if (this.server) this.timer = setTimeout(loop, this.watchMs) }
    await loop()
    return this.port
  }

  /** Stop watching and close the server; open commitments stay on disk. */
  async stop() {
    clearTimeout(this.timer)
    this.timer = null
    const s = this.server
    this.server = null
    if (s) { s.closeAllConnections?.(); await new Promise(r => s.close(r)) }
    this.persist()
  }
}
