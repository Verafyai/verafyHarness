/**
 * `verafy testnet`: a whole testnet on one machine.
 *
 * It starts one harness daemon per open-weight model family as its own
 * process (the same `verafy harness serve` an operator runs), then a local
 * coordinator that does what a Verafy Chain node does:
 *   - draws each jury with the jury scheduler, seeded by the randomness beacon
 *     (the coordinator's hash chain), never by a block hash;
 *   - runs the commit round over HTTP, replaces seats that miss it from the
 *     draw's alternates, then runs the reveal round;
 *   - rules, prices every recorded fault with the slashing schedule, takes
 *     the penalty from the harness's bond, and holds payouts for contracts
 *     with a challenge window;
 *   - seals a block carrying the beacon entry, the slashings and any releases.
 * `misbehave` makes chosen harnesses skip a commit or a reveal, or reveal a
 * changed answer, so slashing can be watched end to end. Optionally it settles every ruling on Solana
 * (a local test validator, or any RPC) through the verafy_ruling program,
 * each harness signing its own commit and reveal with its harness key.
 *
 * AI calls are scripted by default (examples/mock-answers.json), so nothing
 * costs money. `--live` uses real models with VERAFY_API_KEY.
 *
 * For the full chain (nodes, gossip, the encrypted queue, the explorer), run
 * the verafyChain devnet: `verafy testnet up --chain ../verafyChain`.
 *
 * @module @verafyharness/deploy/testnet
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Harness, seal, ascHash, mockProvider, importIdentity, ruleFromRecords, JuryScheduler, scheduleRecord, beaconChain, beaconEntry, verifyBeacon, penalties, slashDiff, bondAccount, releaseHeld, rulingId, DEFAULT_SLASHING } from '../../core/src/index.js'

const ROOT = new URL('../../../', import.meta.url).pathname

async function waitHealthy(url, ms = 15_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { const r = await fetch(`${url}/health`); if (r.ok) return r.json() } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`${url} did not come up`)
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j
}

/** A remote harness, shaped like a Harness for drawJuryFor and rule. */
export function remote(card, url) {
  return { ...card, card, url, commit: asc => post(`${url}/commit`, { asc }), reveal: h => post(`${url}/reveal`, { ascHash: h }) }
}

/**
 * @param {object} o
 * @param {string} [o.dir] - testnet state: data dirs, logs, the chain.
 * @param {number} [o.basePort] - first harness port.
 * @param {boolean} [o.live] - real models.
 * @param {string[]} [o.contracts] - contract files to rule on, one block each.
 * @param {{rpc?: string, program?: string, payer?: string, validator?: boolean}} [o.solana] - settle on Solana too.
 * @param {Record<string, 'no-commit' | 'no-reveal' | 'bad-reveal'>} [o.misbehave] - harness id to misbehavior (scripted answers only).
 * @param {Function} [o.say]
 * @returns {Promise<{blocks: object[], harnesses: object[], solana: object[], stop: Function}>}
 */
export async function testnetUp({ dir = join(ROOT, '.verafy/testnet'), basePort = 7201, live = false, contracts, solana = null, keep = false, misbehave = {}, say = console.log } = {}) {
  if (live && Object.keys(misbehave).length) throw new Error('misbehave is for scripted testnets only')
  mkdirSync(dir, { recursive: true })
  const config = JSON.parse(readFileSync(join(ROOT, 'verafy.config.json'), 'utf8'))
  const files = contracts ?? ['examples/market-resolution.json', 'examples/fact-check.json', 'examples/delay-cover.json'].map(f => join(ROOT, f))
  const procs = []
  const harnesses = []
  const stops = []
  const stop = () => { for (const p of procs) try { p.kill('SIGTERM') } catch { /* gone */ } for (const s of stops) s() }
  process.on('exit', stop)
  try {
    for (const [i, h] of config.pool.entries()) {
      const port = basePort + i
      const dataDir = join(dir, h.id)
      const env = { ...process.env, VERAFY_HARNESS_ID: h.id, VERAFY_FAMILY: h.family, VERAFY_MODEL: h.model, VERAFY_BOND: String(h.bond), VERAFY_PORT: String(port), VERAFY_PUBLIC_URL: `http://127.0.0.1:${port}`, VERAFY_DATA_DIR: dataDir, ...(live ? {} : { VERAFY_MOCK: '1' }), ...(misbehave[h.id] ? { VERAFY_MISBEHAVE: misbehave[h.id] } : {}) }
      delete env.VERAFY_NODES
      if (!misbehave[h.id]) delete env.VERAFY_MISBEHAVE
      const p = spawn(process.execPath, [join(ROOT, 'bin/verafy.js'), 'harness', 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      const log = []
      p.stdout.on('data', d => log.push(String(d)))
      p.stderr.on('data', d => log.push(String(d)))
      procs.push(p)
      harnesses.push({ ...h, url: `http://127.0.0.1:${port}`, dataDir, pid: p.pid, log })
    }
    for (const h of harnesses) await waitHealthy(h.url)
    const pool = await Promise.all(harnesses.map(async h => remote(await (await fetch(`${h.url}/card`)).json(), h.url)))
    say(`${pool.length} harnesses up: ${pool.map(p => `${p.id} (${p.family})`).join(', ')}${live ? '' : ' (scripted answers, no model calls)'}`)
    writeFileSync(join(dir, 'pids.json'), JSON.stringify(harnesses.map(h => ({ id: h.id, pid: h.pid, url: h.url }))))

    // The coordinator's own key seals blocks, as a node would, and its hash chain feeds the beacon.
    const sealer = new Harness({ id: 'node-local', family: 'node', model: 'none', bond: 0, provider: mockProvider({}), identityFile: join(dir, 'node-local.identity.pem') })
    const beaconFile = join(dir, 'beacon.json')
    const saved = existsSync(beaconFile) ? JSON.parse(readFileSync(beaconFile, 'utf8')) : null
    const bchain = beaconChain(saved ? { secret: saved.secret, length: saved.length } : { length: 10_000 })
    const anchors = { [sealer.id]: bchain.anchor }
    const chainFile = join(dir, 'chain.json')
    const chain = existsSync(chainFile) ? JSON.parse(readFileSync(chainFile, 'utf8')) : []
    let revealed = saved?.revealed ?? 0
    // Bonds: each harness posts its card's bond; slashing takes from it.
    const bondsFile = join(dir, 'bonds.json')
    const bonds = existsSync(bondsFile) ? JSON.parse(readFileSync(bondsFile, 'utf8')) : Object.fromEntries(pool.map(h => [bondAccount(h.id), Number(h.bond)]))
    const holdsFile = join(dir, 'holds.json')
    const holds = existsSync(holdsFile) ? JSON.parse(readFileSync(holdsFile, 'utf8')) : []
    const history = chain.flatMap(b => (b.slashings ?? []).map(x => ({ harness: x.harness, fault: x.fault, height: b.height })))
    const scheduler = new JuryScheduler()
    const blocks = []
    const settled = []
    const slashed = []
    let sol = null
    if (solana) sol = await solanaSetup({ ...solana, onStop: f => stops.push(f) }, dir, say)
    for (const f of files) {
      const asc = JSON.parse(readFileSync(f, 'utf8'))
      const parent = chain.at(-1) ?? null
      const height = (parent?.height ?? 0) + 1
      // The seed is this block's beacon value: fixed by the sealer's registered anchor, not by anything in the block.
      const beacon = beaconEntry(parent, { sealer: sealer.id, reveal: bchain.reveal(++revealed) }, height)
      const s0 = scheduler.draw(asc, pool, { seed: beacon.value, height })
      // Commit round; seats that miss it take the draw's alternates (commit phase only).
      const commits = []
      const failed = []
      const tryCommit = async j => { try { commits.push(await j.commit(asc)) } catch (err) { failed.push(j.id); say(`  ${j.id} missed the commit: ${err.message}`) } }
      await Promise.all(s0.jury.map(tryCommit))
      let s = s0
      if (failed.length) {
        s = scheduler.replace(asc, s0, failed, { height: s0.schedule.commitBy + 1 })
        for (const r of s.schedule.replaced) say(`  seat ${r.seat} replaced by alternate ${r.by}`)
        await Promise.all(s.added.map(tryCommit))
      }
      // Reveal round.
      const reveals = []
      for (const c of commits) {
        const j = s.jury.find(x => x.id === c.harness)
        try { reveals.push(await j.reveal(ascHash(asc))) } catch (err) { say(`  ${j.id} withheld its reveal: ${err.message}`) }
      }
      const ruling = ruleFromRecords(asc, commits, reveals, { jury: s.jury.map(j => j.card), sealer: sealer.id, seed: beacon.value, schedule: scheduleRecord(s.schedule) })
      // A replaced seat's missed commit is still a fault against its own bond; the ruling's own faults cover everyone still seated.
      const juryCards = [...new Map([...s0.jury, ...s.jury].map(j => [j.id, j.card])).values()]
      const replacedFaults = s.schedule.replaced.map(r => ({ harness: r.seat, fault: 'no-commit' }))
      // Penalties are shares of what each harness still has posted, not of the bond its card advertises.
      const posted = Object.fromEntries(juryCards.map(c => [c.id, bonds[bondAccount(c.id)] ?? Number(c.bond)]))
      // Grace is a share of the seats each harness held in the window, this one included.
      const seats = {}
      for (const b of [...chain.filter(b => height - b.height < DEFAULT_SLASHING.window), { rulings: [{ round: { jury: juryCards } }] }]) for (const r of b.rulings ?? []) for (const c of r.round?.jury ?? []) seats[c.id] = (seats[c.id] ?? 0) + 1
      const priced = penalties([...replacedFaults, ...ruling.round.faults].map(x => ({ ...x, ruling: rulingId(ruling) })), DEFAULT_SLASHING, { bonds: posted, history, height, seats })
      const { diff } = slashDiff(priced, { balances: bonds })
      for (const d of diff) bonds[d.account] = Math.round(((bonds[d.account] ?? 0) + d.delta) * 1e6) / 1e6
      const slashings = priced.filter(x => x.amount > 0 || x.forgiven)
      for (const x of slashings) { history.push({ harness: x.harness, fault: x.fault, height }); slashed.push({ ...x, height }) }
      // Held payouts whose window has closed are released in this block.
      const releases = []
      for (const hd of holds.filter(x => !x.released)) {
        const a = JSON.parse(readFileSync(hd.file, 'utf8'))
        const d = releaseHeld(a, hd.ruling, { sealedAt: hd.sealedAt, height })
        if (d.status === 'release') { releases.push({ ruling: hd.id, diff: d.diff }); hd.released = height }
      }
      const block = seal(parent, [ruling], sealer, { beacon, slashings, releases })
      if (ruling.held) holds.push({ id: rulingId(ruling), file: f, ruling, sealedAt: block.height })
      chain.push(block)
      blocks.push(block)
      writeFileSync(beaconFile, JSON.stringify({ secret: bchain.secret, length: bchain.length, anchor: bchain.anchor, revealed }), { mode: 0o600 })
      say(`block ${block.height}  ${block.hash.slice(0, 12)}  ${asc.id}: ${ruling.passed ? ruling.exit ?? ruling.answer : 'below bar'}  jury ${s.jury.map(j => j.family).join(',')}  seed ${beacon.value.slice(0, 8)}`)
      for (const x of slashings) say(`  slashed ${x.harness}: ${x.fault}, ${x.forgiven ? 'forgiven (first in the window)' : `${x.amount} taken from its bond (${+(x.rate * 100).toFixed(3)}%)`}`)
      if (ruling.held) say(`  payouts held until block ${block.height + ruling.held.window} (challenge window)`)
      for (const r of releases) say(`  released held payouts for ${r.ruling.slice(0, 12)}`)
      if (sol && asc.question?.answer?.options) settled.push(await settleOnSolana(sol, asc, ruling, s.jury, harnesses, say))
    }
    const bv = verifyBeacon(chain, anchors)
    say(`beacon: ${bv.ok ? 'every reveal checks against the anchor' : bv.problems.join('; ')}${bv.faults.length ? `; ${bv.faults.length} withheld` : ''}`)
    writeFileSync(beaconFile, JSON.stringify({ secret: bchain.secret, length: bchain.length, anchor: bchain.anchor, revealed }), { mode: 0o600 })
    writeFileSync(bondsFile, JSON.stringify(bonds, null, 2))
    writeFileSync(holdsFile, JSON.stringify(holds, null, 2))
    writeFileSync(chainFile, JSON.stringify(chain, null, 2))
    say(`chain: ${chainFile} (${chain.length} blocks)`)
    if (!keep) stop()
    return { blocks, harnesses: harnesses.map(({ log, ...h }) => h), solana: settled, slashed, bonds, beacon: bv, stop }
  } catch (err) {
    stop()
    for (const h of harnesses) if (h.log.length) say(`--- ${h.id}\n${h.log.join('').slice(-800)}`)
    throw err
  }
}

/** Stop harnesses a kept testnet left running. */
export function testnetDown({ dir = join(ROOT, '.verafy/testnet') } = {}) {
  const f = join(dir, 'pids.json')
  if (!existsSync(f)) return 0
  let n = 0
  for (const p of JSON.parse(readFileSync(f, 'utf8'))) { try { process.kill(p.pid, 'SIGTERM'); n++ } catch { /* already gone */ } }
  return n
}

async function solanaSetup(o, dir, say) {
  const { rpc: rpcClient, keypair } = await import('../../solana/src/index.js')
  const bin = join(process.env.HOME ?? '', '.local/share/solana/install/active_release/bin')
  const PATH = `${bin}:${process.env.PATH}`
  let url = o.rpc
  if (!url) {
    if (spawnSync('solana-test-validator', ['--version'], { env: { ...process.env, PATH } }).status !== 0) throw new Error('--solana needs solana-test-validator (the Solana CLI) or --rpc <url>')
    const v = spawn('solana-test-validator', ['--reset', '--quiet', '--ledger', join(dir, 'ledger')], { env: { ...process.env, PATH }, stdio: 'ignore', detached: true })
    o.onStop?.(() => { try { process.kill(-v.pid, 'SIGKILL') } catch { try { v.kill('SIGKILL') } catch { /* gone */ } } })
    url = 'http://127.0.0.1:8899'
    for (let i = 0; i < 60; i++) { try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' }); if ((await r.json()).result === 'ok') break } catch { /* starting */ } await new Promise(r => setTimeout(r, 500)) }
    say('solana-test-validator up at http://127.0.0.1:8899')
  }
  const rpc = rpcClient(url)
  const payerFile = o.payer ?? join(dir, 'solana-payer.json')
  if (!existsSync(payerFile)) writeFileSync(payerFile, JSON.stringify([...keypair().secret]), { mode: 0o600 })
  const payer = keypair(JSON.parse(readFileSync(payerFile, 'utf8')))
  if ((await rpc.balance(payer.address)) < 1e9 && !o.rpc) { await rpc.confirm(await rpc.airdrop(payer.address, 10e9)) }
  let program = o.program
  if (!program) {
    const so = join(ROOT, 'packages/solana/program/target/deploy/verafy_ruling.so')
    if (!existsSync(so)) throw new Error('build the program first: (cd packages/solana/program && cargo-build-sbf), or pass --program')
    const r = spawnSync('solana', ['-u', url, '-k', payerFile, 'program', 'deploy', so, '--output', 'json'], { env: { ...process.env, PATH }, encoding: 'utf8' })
    if (r.status !== 0) throw new Error(`deploy failed: ${r.stderr || r.stdout}`)
    program = JSON.parse(r.stdout).programId
    // A program deployed in this slot is usable from the next one.
    const s0 = await rpc.call('getSlot', [{ commitment: 'confirmed' }])
    while ((await rpc.call('getSlot', [{ commitment: 'confirmed' }])) < s0 + 2) await new Promise(r => setTimeout(r, 300))
  }
  say(`verafy_ruling program ${program} on ${url}`)
  return { rpc, payer, program, url }
}

async function settleOnSolana(sol, asc, ruling, jury, harnesses, say) {
  const { identitySigner, settleRuling } = await import('../../solana/src/index.js')
  const { createHash } = await import('node:crypto')
  const options = asc.question.answer.options
  const votes = []
  for (const v of ruling.votes ?? []) {
    const h = harnesses.find(x => x.id === v.harness)
    const idx = options.indexOf(v.answer)
    if (!h || idx < 0) continue
    // Local testnet only: the coordinator reads each harness's key from its data directory to sign for it.
    const identity = importIdentity(readFileSync(join(h.dataDir, `${h.id}.identity.pem`), 'utf8'))
    votes.push({ keypair: identitySigner(identity), answer: idx, reasoningHash: v.reasoningHash ?? createHash('sha256').update('').digest('hex') })
  }
  if (!votes.length) return { asc: asc.id, skipped: 'no votes with an option answer' }
  // A juror that committed and withheld its reveal holds a seat on chain too: it commits and never reveals,
  // and the program's reveal deadline lets the seal go ahead without it.
  const withhold = []
  for (const f of ruling.round?.faults ?? []) {
    if (f.fault !== 'no-reveal') continue
    const h = harnesses.find(x => x.id === f.harness)
    if (!h) continue
    const identity = importIdentity(readFileSync(join(h.dataDir, `${h.id}.identity.pem`), 'utf8'))
    withhold.push(votes.length)
    votes.push({ keypair: identitySigner(identity), answer: 0, reasoningHash: createHash('sha256').update('').digest('hex') })
  }
  const r = await settleRuling({ rpc: sol.rpc, programId: sol.program, payer: sol.payer, contractHash: ascHash(asc), votes, withhold, revealWindow: 6, challengeWindow: asc.payment?.challengeWindow ?? 0, barPpm: Math.round((asc.payment?.bar ?? 0.8) * 1e6), summary: JSON.stringify({ asc: asc.id, rulingAnswer: ruling.answer }).slice(0, 512), say: withhold.length ? say : () => {} })
  say(`  solana: ruling account ${r.ruling} ${r.state.status}, ${options[r.state.answer]} ${r.state.agree}/${r.state.seats}${withhold.length ? `, ${withhold.length} seat(s) unrevealed past the deadline` : ''}`)
  return { asc: asc.id, account: r.ruling, status: r.state.status, answer: options[r.state.answer] }
}
