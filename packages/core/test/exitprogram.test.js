// Exit programs in the contract format, and the reference runtime (runtime.js
// side of TinySVM). These run with nothing optional installed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  ascHash, validate, buildPrompt, parseVote, Harness, mockProvider, rule, drawJuryFor, verifyRuling, conserves,
  settle, jsRuntime, checkParams, aggregateParams, paramsSchema, accountKey, EXIT_PROGRAMS, PROGRAM_HASHES,
} from '../src/index.js'

const ROOT = new URL('../../../', import.meta.url)
const ex = name => JSON.parse(readFileSync(new URL(`examples/${name}.json`, ROOT), 'utf8'))
const mock = ex('mock-answers')
const config = JSON.parse(readFileSync(new URL('verafy.config.json', ROOT), 'utf8'))
const poolFor = asc => config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
const ruleOn = async asc => { const jury = drawJuryFor(asc, poolFor(asc), 'genesis'); return rule(asc, jury, jury[0], { seed: 'genesis' }) }
const EXITS = ['graded-insurance', 'ranked-prize', 'milestone-escrow']

// The hashes every pre-existing contract had on main before exitProgram existed (21bae03).
const HASHES_BEFORE = {
  'delay-cover': 'df77fbc0585ce36a07b13ccb88bb9c52629dd49ec0ed6680d625095f6858ff87',
  'fact-check-escalation': '93cee3b79b06407de87caf5cb0ba96910ea99f1b48abd6a3bfaa321011b4a6b3',
  'fact-check': 'a6f64dc02727257fd81c77c1dedb9e24155e15b7cc02bf8f843c2586776ff1ad',
  forecast: '0fff4eed4ceb9431ec351f4c6df058bc5bc25e1e7681bfd849f0bd90ea5a45cb',
  'market-resolution': '595232d4a4ba556bc6d43f1e1d65a1c22842462b649020dd45365aa230f47d5e',
}

test('exitProgram is optional: every existing contract keeps its hash and still validates', () => {
  const fixture = name => JSON.parse(readFileSync(new URL(`packages/core/test/fixtures/v0.0.2/${name}.json`, ROOT), 'utf8'))
  for (const [name, h] of Object.entries(HASHES_BEFORE)) {
    assert.equal(ascHash(fixture(name)), h, `${name}, as written with the pre-0.0.3 names`)
    assert.deepEqual(validate(ex(name)), [], name)
    assert.ok(!ex(name).exits.some(e => 'exitProgram' in e), `${name} declares no exit program`)
  }
  const legacy = JSON.parse(readFileSync(new URL('packages/core/test/fixtures/market-resolution.swarm-asc-0.json', ROOT), 'utf8'))
  assert.equal(ascHash(legacy), 'b5f49f8fd98b80a8d0ea20a18b7695c4b14c60ff2c657a1e347355d4ce0ae61c')
})

test('a contract without exit programs gets the same prompt and votes as before', () => {
  for (const name of Object.keys(HASHES_BEFORE)) {
    assert.deepEqual(paramsSchema(ex(name)), {})
    assert.doesNotMatch(buildPrompt(ex(name)).system, /params/)
  }
  const v = parseVote(ex('delay-cover'), '{"answer":"PAY","confidence":0.9,"reasoning":"r","params":{"percent":40}}')
  assert.equal('params' in v, false, 'params are ignored when the contract declares none')
})

test('the three exit examples validate, and every example file is accounted for', () => {
  for (const name of EXITS) assert.deepEqual(validate(ex(name)), [], name)
  const files = readdirSync(new URL('examples/', ROOT)).filter(f => f.endsWith('.json') && f !== 'mock-answers.json').map(f => f.replace(/\.json$/, '')).sort()
  assert.deepEqual(files, [...Object.keys(HASHES_BEFORE), ...EXITS].sort())
  assert.deepEqual(Object.keys(PROGRAM_HASHES).sort(), ['graded_payout', 'milestone_escrow', 'ranked_split'])
})

test('the validator rejects malformed exit programs, and one on the below-bar exit', () => {
  const asc = ex('graded-insurance')
  const pay = asc.exits.find(e => e.outcome === 'PAY')
  const bad = (patch, re) => {
    const a = structuredClone(asc)
    patch(a.exits.find(e => e.outcome === 'PAY').exitProgram, a)
    assert.ok(validate(a).some(x => re.test(x)), `${re} in ${validate(a).join(' | ')}`)
  }
  bad(ep => { ep.programHash = '0'.repeat(64) }, /not a known exit program/)
  bad(ep => { ep.entry = 'spend' }, /entry must be one of claim/)
  bad(ep => { delete ep.args.coverage }, /coverage must be given/)
  bad(ep => { ep.args.percent = 5 }, /percent is both a param and an arg/)
  bad(ep => { ep.params.percent.max = -1 }, /integer bounds/)
  bad(ep => { ep.args.coverage = 1.5 }, /coverage must be a whole number/)
  bad(ep => { ep.args.extra = 1 }, /extra is not a field/)
  bad((ep, a) => { a.exits.find(e => e.outcome === '*below-bar').exitProgram = structuredClone(pay.exitProgram) }, /never reaches a paying exit/)
})

test('bounds reject an out-of-range grade before anything runs', () => {
  const asc = ex('graded-insurance')
  const schema = paramsSchema(asc)
  assert.deepEqual(checkParams(schema, { percent: 100 }), [])
  assert.match(checkParams(schema, { percent: 101 })[0], /outside \[0, 100\]/)
  assert.match(checkParams(schema, { percent: -1 })[0], /outside/)
  assert.match(checkParams(schema, { percent: 4.5 })[0], /must be an integer/)
  assert.match(checkParams(schema, {})[0], /missing/)
  assert.throws(() => parseVote(asc, '{"answer":"PAY","confidence":0.9,"params":{"percent":140}}'), /params out of bounds/)
  const ruling = { exit: 'PAY', passed: true, params: { percent: 101 } }
  const s = settle(asc, ruling)
  assert.equal(s.ok, false)
  assert.match(s.problems[0], /outside \[0, 100\]/)
  // The program enforces its own bound too, for a contract with looser bounds.
  const r = jsRuntime.exit({ program: 'graded_payout', entry: 'claim', state: { reserve: 10, paid: 0, claims: 0 }, input: { percent: 101, coverage: 10, pot: accountKey('p'), beneficiary: accountKey('b') } })
  assert.deepEqual([r.ok, r.code], [false, 6])
  const rk = paramsSchema(ex('ranked-prize'))
  assert.match(checkParams(rk, { ranking: [3, 3, 1] })[0], /twice/)
  assert.match(checkParams(rk, { ranking: [3, 0, 5] })[0], /below 5/)
  assert.match(checkParams(rk, { ranking: [3, 0] })[0], /exactly 3/)
})

test('a ruling below the bar never reaches a paying exit', () => {
  const asc = ex('graded-insurance')
  const s = settle(asc, { exit: 'PAY', passed: false, params: { percent: 50 } })
  assert.equal(s.ok, false)
  assert.match(s.problems[0], /below the bar/)
  assert.deepEqual(settle(asc, { exit: '*below-bar', passed: false }).transfers, [])
})

test('params are the lower median of the votes for the winning answer; a ranking is the plurality', () => {
  const s = { percent: { type: 'integer', min: 0, max: 100 } }
  assert.deepEqual(aggregateParams(s, [{ answer: 'PAY', params: { percent: 40 } }, { answer: 'PAY', params: { percent: 50 } }, { answer: 'DENY', params: { percent: 0 } }, { answer: 'PAY' }], 'PAY'), { percent: 40 })
  assert.equal(aggregateParams(s, [{ answer: 'PAY' }], 'PAY'), null)
  const r = { ranking: { type: 'ranking', size: 2, of: 3 } }
  assert.deepEqual(aggregateParams(r, [{ answer: 'A', params: { ranking: [1, 0] } }, { answer: 'A', params: { ranking: [0, 2] } }, { answer: 'A', params: { ranking: [1, 0] } }], 'A'), { ranking: [1, 0] })
  assert.deepEqual(aggregateParams(r, [{ answer: 'A', params: { ranking: [1, 0] } }, { answer: 'A', params: { ranking: [0, 2] } }], 'A'), { ranking: [0, 2] })
})

test('each exit example rules with the mock jury, verifies, and settles with totals conserved', async () => {
  const expect = {
    'graded-insurance': { params: { percent: 43 }, paid: 2_150_000_000 },
    'ranked-prize': { params: { ranking: [3, 0, 1] }, paid: 10_000_000_000 },
    'milestone-escrow': { params: undefined, paid: 3_000_000_000 },
  }
  for (const name of EXITS) {
    const asc = ex(name)
    const ruling = await ruleOn(asc)
    assert.equal(ruling.passed, true, name)
    assert.deepEqual(ruling.params, expect[name].params, name)
    assert.ok(conserves(ruling.diff), `${name} jury diff conserves`)
    assert.equal(verifyRuling(asc, ruling).ok, true, name)
    const s = settle(asc, ruling)
    assert.equal(s.ok, true, name)
    assert.equal(s.transfers.reduce((t, x) => t + x.delta, 0), 0, `${name} settlement conserves`)
    assert.equal(s.transfers.filter(t => t.delta > 0).reduce((t, x) => t + x.delta, 0), expect[name].paid, name)
  }
})

test('graded insurance keeps its reserve across claims and never pays past it', () => {
  const asc = ex('graded-insurance')
  let state
  const paid = []
  for (const percent of [43, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]) {
    const s = settle(asc, { exit: 'PAY', passed: true, params: { percent } }, { state })
    assert.equal(s.ok, true)
    paid.push(s.transfers[1]?.delta ?? 0)
    state = s.state
  }
  assert.equal(paid.reduce((a, b) => a + b, 0), 50_000_000_000, 'the whole reserve, and no more')
  assert.deepEqual(state, { reserve: 0, paid: 50_000_000_000, claims: 12 })
  assert.equal(paid.at(-1), 0)
})

test('milestone escrow releases each milestone once', () => {
  const asc = ex('milestone-escrow')
  const first = settle(asc, { exit: 'MET', passed: true })
  assert.deepEqual(first.state, { released: [1], paid: 3_000_000_000 })
  const again = settle(asc, { exit: 'MET', passed: true }, { state: first.state })
  assert.deepEqual([again.ok, again.code], [false, 100])
})

test('a slash can never exceed the bond, and a bond is never spent', () => {
  let st = { deposited: 0, locked: 0, slashed: 0, released: 0 }
  st = jsRuntime.bond({ state: st, op: 'lock', amount: 500 }).state
  assert.deepEqual(jsRuntime.bond({ state: st, op: 'slash', amount: 501 }).code, 100)
  st = jsRuntime.bond({ state: st, op: 'slash', amount: 300 }).state
  assert.equal(jsRuntime.bond({ state: st, op: 'slash', amount: 201 }).code, 100)
  assert.equal(jsRuntime.bond({ state: st, op: 'spend', amount: 1 }).code, 1)
  st = jsRuntime.bond({ state: st, op: 'release', amount: 200 }).state
  assert.deepEqual(st, { deposited: 500, locked: 0, slashed: 300, released: 200 })
})

test('the ledger conserves totals and never goes negative', () => {
  const [a, b] = [accountKey('wallet:a'), accountKey('wallet:b')]
  const t0 = jsRuntime.ledger({ table: [{ key: a, balance: 10 }], transfers: [{ key: a, delta: -4 }, { key: b, delta: 4 }], capacity: 4 })
  assert.deepEqual(t0.table, [{ key: a, balance: 6 }, { key: b, balance: 4 }])
  assert.equal(jsRuntime.ledger({ table: t0.table, transfers: [{ key: a, delta: -7 }, { key: b, delta: 7 }], capacity: 4 }).code, 100)
  assert.equal(jsRuntime.ledger({ table: t0.table, transfers: [{ key: a, delta: -1 }], capacity: 4 }).code, 5)
})

test('the exit program table names programs by hash', () => {
  for (const [h, n] of Object.entries(EXIT_PROGRAMS)) { assert.match(h, /^[0-9a-f]{64}$/); assert.equal(PROGRAM_HASHES[n], h) }
})
