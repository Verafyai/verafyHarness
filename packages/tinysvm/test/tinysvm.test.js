// Cross-runtime tests: runtime.js and TinySVM side by side. Disagreement is a
// fault. Without the engine every engine test is skipped, with the reason, and
// nothing reports a pass it did not run.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  Harness, mockProvider, rule, drawJuryFor, settle, jsRuntime, accountKey, canonical, initialState,
  EXIT_PROGRAMS, PROGRAM_HASHES,
} from '../../core/src/index.js'
import { findEngine, Engine, tinySvmRuntime, dualRuntime, SettlementFault, LOCK, findSvmllm, SvmllmEngine, svmllmRuntime, crossRuntime } from '../src/index.js'

const ROOT = new URL('../../../', import.meta.url)
const ex = name => JSON.parse(readFileSync(new URL(`examples/${name}.json`, ROOT), 'utf8'))
const mock = ex('mock-answers')
const config = JSON.parse(readFileSync(new URL('verafy.config.json', ROOT), 'utf8'))
const EXAMPLES = readdirSync(new URL('examples/', ROOT)).filter(f => f.endsWith('.json') && f !== 'mock-answers.json').map(f => f.replace(/\.json$/, '')).sort()
const CASES = Number(process.env.TINYSVM_CASES ?? 300)
const SEED = Number(process.env.TINYSVM_SEED ?? 20261106)

const where = findEngine()
const skip = where.ok ? false : `${where.reason}; cross-runtime tests skipped`
if (skip) console.log(`# tinysvm: ${skip}`)
let engine
let dual
async function both() {
  if (!dual) {
    engine = await Engine.start(where)
    dual = dualRuntime(jsRuntime, tinySvmRuntime(engine))
  }
  return dual
}
after(() => engine?.close())

// svmLLM, the optional third runtime (Part H): the integer programs only.
const whereS = findSvmllm()
const skipS = whereS.ok ? false : `${whereS.reason}; svmLLM runtime tests skipped`
if (skipS) console.log(`# svmllm: ${skipS}`)
const SVMLLM_CASES = Number(process.env.SVMLLM_CASES ?? 50)
let sEngine
let cross
const crossOthers = []
async function three() {
  if (!cross) {
    sEngine = await SvmllmEngine.start(whereS)
    if (where.ok) { await both(); crossOthers.push(tinySvmRuntime(engine)) }
    crossOthers.push(svmllmRuntime(sEngine))
    cross = crossRuntime(jsRuntime, crossOthers)
  }
  return cross
}
after(() => sEngine?.close())

// A small deterministic PRNG, so a failing case can be replayed with TINYSVM_SEED.
function rng(seed) {
  let s = seed >>> 0
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1))
  const big = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1))
  const pick = xs => xs[int(0, xs.length - 1)]
  const shuffle = xs => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = int(0, i); [a[i], a[j]] = [a[j], a[i]] } return a }
  const partition = (total, k) => { const cuts = Array.from({ length: k - 1 }, () => int(0, total)).sort((a, b) => a - b); return [...cuts, total].map((c, i) => c - (i ? cuts[i - 1] : 0)) }
  return { next, int, big, pick, shuffle, partition }
}

test('core names the same exit programs, by hash, that programs.lock.json pins', () => {
  for (const name of ['graded_payout', 'ranked_split', 'milestone_escrow']) {
    assert.equal(PROGRAM_HASHES[name], LOCK.programs[name].sha256, name)
    assert.equal(LOCK.programs[name].builtin, false)
  }
  for (const name of ['escrow', 'bond', 'ledger']) assert.equal(LOCK.programs[name].builtin, true)
  assert.equal(Object.keys(EXIT_PROGRAMS).length, 3)
})

test('the engine refuses a program the lock does not pin, and a call outside the allowlist', { skip }, async () => {
  const d = await both()
  const e = d.jury && engine
  const hello = e.hello
  assert.equal(hello.litesvm, '0.18.2')
  assert.deepEqual(Object.keys(hello.programs).sort(), Object.keys(LOCK.programs).sort())
  // An exit program the request did not allow cannot run, even though it is installed.
  const r = await e.request({ op: 'run', accounts: [{ name: 'out', owner: 'system', data: '00' }], instructions: [{ program: LOCK.programs.ranked_split.sha256, accounts: [{ name: 'out', writable: true }], data: '00' }] })
  assert.equal(r.ok, false)
  assert.match(r.error.message, /not on the allowlist/)
  const u = await e.request({ op: 'run', allow: ['ab'.repeat(32)], accounts: [], instructions: [] })
  assert.match(u.error.message, /not installed/)
})

test('every example contract: the jury pay rule agrees across runtimes, passed and below the bar', { skip }, async () => {
  const d = await both()
  for (const name of EXAMPLES) {
    const asc = ex(name)
    const pool = config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
    const jury = drawJuryFor(asc, pool, 'genesis')
    const ruling = await rule(asc, jury, jury[0], { seed: 'genesis' })
    const counted = ruling.votes.map(v => v.harness)
    const exit = asc.exits.find(e => e.outcome === ruling.exit)
    for (const passed of [ruling.passed, !ruling.passed]) {
      const input = { id: asc.id, escalation: asc.escalation, escrow: asc.payment.escrow, split: asc.payment.split, counted, passed, sealer: ruling.round.sealer, pay: exit.effect.type === 'pay' ? exit.effect : undefined }
      const r = await d.jury(input)
      assert.equal(r.ok, true, name)
      assert.equal(r.diff.reduce((s, x) => s + x.delta, 0), 0, `${name} conserves in micro-units`)
    }
    // And the sealed ruling's own diff is what both runtimes compute.
    const sealed = await d.jury({ id: asc.id, escalation: asc.escalation, escrow: asc.payment.escrow, split: asc.payment.split, counted, passed: ruling.passed, sealer: ruling.round.sealer })
    assert.equal(canonical(sealed.diff), canonical(ruling.diff.map(x => ({ account: x.account, delta: Math.round(x.delta * 1e6) }))), name)
  }
})

test('the three exit examples settle identically on both runtimes, from a real ruling', { skip }, async () => {
  const d = await both()
  for (const name of ['graded-insurance', 'ranked-prize', 'milestone-escrow']) {
    const asc = ex(name)
    const pool = config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
    const jury = drawJuryFor(asc, pool, 'genesis')
    const ruling = await rule(asc, jury, jury[0], { seed: 'genesis' })
    const s = await settle(asc, ruling, { runtime: d })
    assert.equal(s.ok, true, name)
    assert.deepEqual(s, settle(asc, ruling), `${name}: the dual result is the reference result`)
    assert.equal(s.transfers.reduce((t, x) => t + x.delta, 0), 0)
  }
})

test('graded insurance: claims over time from one reserve, in lockstep', { skip }, async () => {
  const d = await both()
  const asc = ex('graded-insurance')
  let state
  let total = 0
  for (const percent of [43, 100, 7, 100, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100]) {
    const s = await settle(asc, { exit: 'PAY', passed: true, params: { percent } }, { state, runtime: d })
    assert.equal(s.ok, true)
    total += s.transfers[1]?.delta ?? 0
    state = s.state
  }
  assert.equal(total, 50_000_000_000)
  assert.equal(state.reserve, 0)
})

test('an out-of-range grade is rejected: by the bounds before execution, and by the program on both runtimes', { skip }, async () => {
  const d = await both()
  const asc = ex('graded-insurance')
  const s = await settle(asc, { exit: 'PAY', passed: true, params: { percent: 101 } }, { runtime: d })
  assert.equal(s.ok, false)
  assert.match(s.problems[0], /outside \[0, 100\]/)
  const r = await d.exit({ program: 'graded_payout', entry: 'claim', state: initialState('graded_payout', { reserve: 1000 }), input: { percent: 101, coverage: 1000, pot: accountKey('pot'), beneficiary: accountKey('b') } })
  assert.deepEqual([r.ok, r.code], [false, 6])
})

test('a slash can never exceed the bond, on both runtimes', { skip }, async () => {
  const d = await both()
  let st = { deposited: 0, locked: 0, slashed: 0, released: 0 }
  st = (await d.bond({ state: st, op: 'lock', amount: 500_000_000 })).state
  assert.equal((await d.bond({ state: st, op: 'slash', amount: 500_000_001 })).code, 100)
  st = (await d.bond({ state: st, op: 'slash', amount: 499_999_999 })).state
  assert.equal((await d.bond({ state: st, op: 'slash', amount: 2 })).code, 100)
  assert.equal((await d.bond({ state: st, op: 'spend', amount: 1 })).code, 1)
  assert.deepEqual(st, { deposited: 500_000_000, locked: 1, slashed: 499_999_999, released: 0 })
})

test('a disagreement is a fault', { skip }, async () => {
  const d = await both()
  const liar = { ...jsRuntime, name: 'liar', bond: input => { const r = jsRuntime.bond(input); return r.ok ? { ...r, state: { ...r.state, slashed: r.state.slashed + 1 } } : r } }
  const check = dualRuntime(liar, tinySvmRuntime(engine))
  await assert.rejects(check.bond({ state: { deposited: 5, locked: 5, slashed: 0, released: 0 }, op: 'slash', amount: 2 }), SettlementFault)
  assert.equal(check.faults, 1)
  assert.equal(d.faults, 0)
})

test(`property: ${CASES} random in-bounds rulings per program produce identical results on both runtimes (seed ${SEED})`, { skip }, async () => {
  const d = await both()
  const r = rng(SEED)
  const counts = { jury: 0, graded: 0, ranked: 0, milestone: 0, bond: 0, ledger: 0, escrow: 0, refusals: 0 }
  const note = res => { if (!res.ok) counts.refusals++ }
  for (let i = 0; i < CASES; i++) {
    // Jury pay rule: escrow and split as a contract carries them (decimals to 1e-6).
    const j = r.int(100_000, 950_000), a = r.int(0, 1_000_000 - j), s = r.int(0, 1_000_000 - j - a)
    const split = { jurors: j / 1e6, auditors: a / 1e6, storage: s / 1e6, sealer: 1 - j / 1e6 - a / 1e6 - s / 1e6 }
    const counted = Array.from({ length: r.int(1, 15) }, (_, q) => `h-${q}`)
    const pay = r.next() < 0.3 ? { from: 'escrow:payer', to: 'wallet:payee', amount: r.int(1, 1e9) / 1e6 } : undefined
    const jr = await d.jury({ id: `c${i}`, escrow: r.int(1, 50_000_000) / 1e6, split, counted, passed: r.next() < 0.8, sealer: r.pick(['h-0', 'node:node-1']), pay })
    assert.equal(jr.diff.reduce((t, x) => t + x.delta, 0), 0, 'jury diff conserves')
    counts.jury++

    // graded_payout: any percent in bounds, any reserve.
    const g = await d.exit({ program: 'graded_payout', entry: 'claim', state: { reserve: r.big(0, 2 ** 50), paid: r.big(0, 2 ** 40), claims: r.int(0, 1000) }, input: { percent: r.int(0, 100), coverage: r.big(0, 2 ** 50), pot: accountKey(`pot:${i}`), beneficiary: accountKey(`b:${i}`) } })
    note(g); if (g.ok) assert.equal(g.transfers.reduce((t, x) => t + x.delta, 0), 0)
    counts.graded++

    // ranked_split: any ranking in bounds.
    const n = r.int(1, 12), k = r.int(1, Math.min(n, 15))
    const rs = await d.exit({ program: 'ranked_split', entry: 'split', state: {}, input: { prize: r.big(0, 2 ** 52), shares: r.partition(1_000_000, k), ranking: r.shuffle([...Array(n).keys()]).slice(0, k), pot: accountKey(`pot:${i}`), entrants: Array.from({ length: n }, (_, q) => accountKey(`e:${i}:${q}`)) } })
    note(rs); if (rs.ok) assert.equal(rs.transfers.reduce((t, x) => t + x.delta, 0), 0)
    counts.ranked++

    // milestone_escrow: any milestone in bounds, some already released.
    const m = r.int(1, 64)
    const released = [...Array(m).keys()].filter(() => r.next() < 0.3)
    const ms = await d.exit({ program: 'milestone_escrow', entry: 'release', state: { released, paid: r.big(0, 2 ** 40) }, input: { milestone: r.int(0, m - 1), tranches: Array.from({ length: m }, () => r.big(0, 2 ** 45)), pot: accountKey('pot'), contractor: accountKey('c') } })
    note(ms)
    counts.milestone++

    // bond: lock, release, slash with amounts that sometimes exceed what is locked.
    const locked = r.big(0, 2 ** 45)
    const bs = await d.bond({ state: { deposited: locked + 10, locked, slashed: 6, released: 4 }, op: r.pick(['lock', 'release', 'slash', 'slash']), amount: r.big(0, locked * 2 + 1) })
    note(bs); if (bs.ok) assert.equal(bs.state.locked + bs.state.slashed + bs.state.released, bs.state.deposited)
    counts.bond++

    // ledger: a conserving transfer list over a small table, sometimes overdrawing.
    const keys = Array.from({ length: r.int(1, 6) }, (_, q) => accountKey(`acct:${i}:${q}`))
    const table = keys.slice(0, r.int(0, keys.length)).map(key => ({ key, balance: r.big(0, 1e9) }))
    const moves = Array.from({ length: r.int(1, 4) }, () => { const amt = r.big(0, 1e9); return [{ key: r.pick(keys), delta: -amt }, { key: r.pick(keys), delta: amt }] }).flat()
    const ls = await d.ledger({ table, transfers: moves, capacity: 6 })
    note(ls)
    counts.ledger++

    // escrow hold then release against an exit's transfer list.
    const pot = accountKey(`pot:${i}`)
    const held = await d.escrow({ op: 'hold', state: { held: 0, released: 0 }, key: pot, amount: r.big(0, 1e12) })
    const take = r.big(0, 2e12)
    note(await d.escrow({ op: 'release', state: held.state, transfers: [{ key: pot, delta: -take }, { key: accountKey('w'), delta: take }] }))
    counts.escrow++
  }
  console.log(`# tinysvm property test: ${JSON.stringify(counts)}, faults ${d.faults}`)
  assert.equal(d.faults, 0)
})

/* ------------------------------------------------------------------------- */
/* svmLLM: the third runtime, integer programs only.                          */
/* ------------------------------------------------------------------------- */

// The integer calls of the property test above, same generator, same ranges.
function integerCalls(r, i) {
  const out = []
  out.push(['exit', { program: 'graded_payout', entry: 'claim', state: { reserve: r.big(0, 2 ** 50), paid: r.big(0, 2 ** 40), claims: r.int(0, 1000) }, input: { percent: r.int(0, 100), coverage: r.big(0, 2 ** 50), pot: accountKey(`pot:${i}`), beneficiary: accountKey(`b:${i}`) } }])
  const n = r.int(1, 12), k = r.int(1, Math.min(n, 15))
  out.push(['exit', { program: 'ranked_split', entry: 'split', state: {}, input: { prize: r.big(0, 2 ** 52), shares: r.partition(1_000_000, k), ranking: r.shuffle([...Array(n).keys()]).slice(0, k), pot: accountKey(`pot:${i}`), entrants: Array.from({ length: n }, (_, q) => accountKey(`e:${i}:${q}`)) } }])
  const m = r.int(1, 64)
  const released = [...Array(m).keys()].filter(() => r.next() < 0.3)
  out.push(['exit', { program: 'milestone_escrow', entry: 'release', state: { released, paid: r.big(0, 2 ** 40) }, input: { milestone: r.int(0, m - 1), tranches: Array.from({ length: m }, () => r.big(0, 2 ** 45)), pot: accountKey('pot'), contractor: accountKey('c') } }])
  const locked = r.big(0, 2 ** 45)
  out.push(['bond', { state: { deposited: locked + 10, locked, slashed: 6, released: 4 }, op: r.pick(['lock', 'release', 'slash', 'slash']), amount: r.big(0, locked * 2 + 1) }])
  const keys = Array.from({ length: r.int(1, 6) }, (_, q) => accountKey(`acct:${i}:${q}`))
  const table = keys.slice(0, r.int(0, keys.length)).map(key => ({ key, balance: r.big(0, 1e9) }))
  const moves = Array.from({ length: r.int(1, 4) }, () => { const amt = r.big(0, 1e9); return [{ key: r.pick(keys), delta: -amt }, { key: r.pick(keys), delta: amt }] }).flat()
  out.push(['ledger', { table, transfers: moves, capacity: 6 }])
  return out
}

test('svmLLM covers exactly the integer programs, and nothing else', () => {
  const rt = svmllmRuntime({ request: () => { throw new Error('not started') } })
  assert.deepEqual(rt.covers, ['exit', 'bond', 'ledger'])
  assert.equal(rt.jury, undefined, 'the jury pay rule is IEEE-754 doubles; the svmLLM core is integer only')
  assert.equal(rt.escrow, undefined)
})

test('svmLLM: the three exit examples settle identically on every runtime, from a real ruling', { skip: skipS }, async () => {
  const x = await three()
  for (const name of ['graded-insurance', 'ranked-prize', 'milestone-escrow']) {
    const asc = ex(name)
    const pool = config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
    const jury = drawJuryFor(asc, pool, 'genesis')
    const ruling = await rule(asc, jury, jury[0], { seed: 'genesis' })
    const s = await settle(asc, ruling, { runtime: x })
    assert.equal(s.ok, true, name)
    assert.deepEqual(s, settle(asc, ruling), `${name}: the cross-runtime result is the reference result`)
  }
  console.log(`# svmllm examples ran on: ${JSON.stringify(x.calls)}`)
})

test('svmLLM: graded claims over time from one reserve, a bad grade, and an oversized slash, on every runtime', { skip: skipS }, async () => {
  const x = await three()
  const asc = ex('graded-insurance')
  let state
  let total = 0
  for (const percent of [43, 100, 7, 100, 0, 100, 100, 100, 100, 100, 100, 100, 100, 100]) {
    const s = await settle(asc, { exit: 'PAY', passed: true, params: { percent } }, { state, runtime: x })
    assert.equal(s.ok, true)
    total += s.transfers[1]?.delta ?? 0
    state = s.state
  }
  assert.equal(total, 50_000_000_000)
  const r = await x.exit({ program: 'graded_payout', entry: 'claim', state: initialState('graded_payout', { reserve: 1000 }), input: { percent: 101, coverage: 1000, pot: accountKey('pot'), beneficiary: accountKey('b') } })
  assert.deepEqual([r.ok, r.code], [false, 6])
  let st = { deposited: 0, locked: 0, slashed: 0, released: 0 }
  st = (await x.bond({ state: st, op: 'lock', amount: 500_000_000 })).state
  assert.equal((await x.bond({ state: st, op: 'slash', amount: 500_000_001 })).code, 100)
  assert.equal((await x.bond({ state: st, op: 'spend', amount: 1 })).code, 1)
  assert.equal(x.faults, 0)
})

test('svmLLM: a disagreement with the third runtime is a fault', { skip: skipS }, async () => {
  await three()
  const liar = { ...jsRuntime, name: 'liar', bond: input => { const r = jsRuntime.bond(input); return r.ok ? { ...r, state: { ...r.state, locked: r.state.locked + 1 } } : r } }
  const check = crossRuntime(liar, [svmllmRuntime(sEngine)])
  await assert.rejects(check.bond({ state: { deposited: 5, locked: 5, slashed: 0, released: 0 }, op: 'slash', amount: 2 }), SettlementFault)
  assert.equal(check.faults, 1)
})

test(`property (svmLLM): ${SVMLLM_CASES} random in-bounds calls per integer program agree on every runtime (seed ${SEED})`, { skip: skipS }, async () => {
  await three()
  const x = crossRuntime(jsRuntime, crossOthers)
  const r = rng(SEED)
  const calls = []
  for (let i = 0; i < SVMLLM_CASES; i++) calls.push(...integerCalls(r, i))
  const t0 = Date.now()
  const results = await Promise.all(calls.map(([m, input]) => x[m](input)))
  const counts = {}
  calls.forEach(([m, input], i) => {
    const k = m === 'exit' ? input.program : m
    counts[k] = counts[k] ?? { calls: 0, refusals: 0 }
    counts[k].calls++
    if (!results[i].ok) counts[k].refusals++
    if (results[i].ok && results[i].transfers) assert.equal(results[i].transfers.reduce((t, y) => t + BigInt(y.delta), 0n), 0n)
  })
  console.log(`# svmllm property test: ${JSON.stringify(counts)}, runtimes ${JSON.stringify(x.calls)}, faults ${x.faults}, ${Date.now() - t0} ms`)
  assert.equal(x.faults, 0)
})
