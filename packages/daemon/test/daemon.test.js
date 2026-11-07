import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HarnessDaemon } from '../src/index.js'
import { Harness, mockProvider, ascHash, verifyMessage, checkReveal } from '../../core/src/index.js'

const ROOT = new URL('../../../', import.meta.url).pathname
const asc = JSON.parse(readFileSync(join(ROOT, 'examples/market-resolution.json'), 'utf8'))
const script = JSON.parse(readFileSync(join(ROOT, 'examples/mock-answers.json'), 'utf8'))
const h = ascHash(asc)

function harness(identity) {
  return new Harness({ id: 'h-mistral-1', family: 'mistral', model: 'mock', bond: 500, provider: mockProvider(script), ...(identity ? { identity } : {}) })
}

/** A fake node: records registrations, serves a one-contract mempool. */
function fakeNode(contracts = [asc]) {
  const registered = []
  const fetch = async (url, init = {}) => {
    const u = new URL(url)
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body })
    if (u.pathname === '/harnesses' && init.method === 'POST') { registered.push(JSON.parse(init.body)); return reply(201, { registered: true }) }
    if (u.pathname === '/contracts') return reply(200, contracts.map(c => ({ ascHash: ascHash(c), status: 'pending', title: c.title })))
    const m = u.pathname.match(/^\/contracts\/(.+)$/)
    if (m) { const c = contracts.find(x => ascHash(x) === m[1]); return c ? reply(200, { entry: { ascHash: m[1] }, asc: c }) : reply(404, { error: 'no' }) }
    return reply(404, { error: 'no route' })
  }
  return { fetch, registered }
}

const quiet = () => {}

test('registers with a signed card and tracks pending contracts in the mempool', async () => {
  const node = fakeNode()
  const d = new HarnessDaemon({ harness: harness(), nodes: ['http://node-a'], publicUrl: 'http://me:7200', fetch: node.fetch, log: quiet })
  await d.watch()
  assert.equal(node.registered.length, 1)
  const { card, url, signature } = node.registered[0]
  assert.ok(verifyMessage(card.publicKey, { card, url }, signature))
  assert.ok(d.seen.has(h))
  await d.watch()
  assert.equal(node.registered.length, 1, 'registers once')
})

test('commit and reveal through the routes; the reveal opens the commitment', async () => {
  const d = new HarnessDaemon({ harness: harness(), publicUrl: 'http://me', log: quiet })
  const [s1, c] = await d.handle('POST', '/commit', { asc })
  assert.equal(s1, 200)
  const [s2, r] = await d.handle('POST', '/reveal', { ascHash: h })
  assert.equal(s2, 200)
  assert.equal(r.vote.answer, 'NO')
  assert.ok(checkReveal(h, r.vote, r.salt, c.commitment))
})

test('refuses to commit on a contract it cannot admit', async () => {
  const d = new HarnessDaemon({ harness: harness(), publicUrl: 'http://me', log: quiet })
  const big = { ...asc, payment: { ...(asc.payment ?? {}), maxValuePerVote: 10_000 } }
  const [s, body] = await d.handle('POST', '/commit', { asc: big })
  assert.equal(s, 409)
  assert.match(body.error, /not admitted/)
})

test('an open commitment survives a restart and can still be revealed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'daemon-'))
  const stateFile = join(dir, 'state.json')
  const first = harness()
  const d1 = new HarnessDaemon({ harness: first, publicUrl: 'http://me', stateFile, log: quiet })
  const [, c] = await d1.handle('POST', '/commit', { asc })
  assert.ok(existsSync(stateFile))
  // A new process: same key, fresh memory.
  const d2 = new HarnessDaemon({ harness: harness(first.identity), publicUrl: 'http://me', stateFile, log: quiet })
  const [s, r] = await d2.handle('POST', '/reveal', { ascHash: h })
  assert.equal(s, 200)
  assert.ok(checkReveal(h, r.vote, r.salt, c.commitment))
  const [, status] = await d2.handle('GET', '/status')
  assert.deepEqual(status.open, [])
})

test('serves over HTTP and stops cleanly', async () => {
  const d = new HarnessDaemon({ harness: harness(), publicUrl: 'http://127.0.0.1', port: 0, host: '127.0.0.1', watchMs: 60_000, log: quiet })
  const port = await d.start()
  const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json()
  assert.equal(health.ok, true)
  assert.equal(health.harness, 'h-mistral-1')
  const res = await fetch(`http://127.0.0.1:${port}/proof`, { method: 'POST', body: '{}' })
  assert.equal(res.status, 404)
  await d.stop()
})

test('with nodes configured, refuses to commit on a contract no node holds', async () => {
  const node = fakeNode([])
  const d = new HarnessDaemon({ harness: harness(), nodes: ['http://node-a'], publicUrl: 'http://me', fetch: node.fetch, log: quiet })
  await d.watch()
  const [s, body] = await d.handle('POST', '/commit', { asc })
  assert.equal(s, 409)
  assert.match(body.error, /mempool/)
  const held = fakeNode([asc])
  const d2 = new HarnessDaemon({ harness: harness(), nodes: ['http://node-a'], publicUrl: 'http://me', fetch: held.fetch, log: quiet })
  const [s2] = await d2.handle('POST', '/commit', { asc })
  assert.equal(s2, 200, 'found on the node directly even before a watch')
})
