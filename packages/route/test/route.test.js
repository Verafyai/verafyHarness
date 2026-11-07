import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Router, routeBlock, audited, atomType, mockScreen, jevScreen, calibrate, recheck, wilsonLower } from '../src/index.js'
import { PLAN_KIND, atomKey } from '../../pack/src/index.js'

const pin = 'a'.repeat(64)
const yn = (id, q) => ({ id, q, answer: { type: 'yes-no' }, facts: [{ text: `fact for ${q}`, pin }] })
const juror = (family, answers, usd = 0.001, ms = 2000) => ({ family, usd, ms, decide: async atom => ({ answer: answers[atom.q] ?? null }) })
const panel = (id, families, answers, usd, ms) => ({ id, jurors: families.map(l => juror(l, typeof answers === 'function' ? answers(l) : answers, usd, ms)) })

const easy = yn('e', 'Was the shipment delivered by Oct 5?')
const hard = yn('h', 'Does the delegated token bypass rule 4?')
const truth = { [easy.q]: true, [hard.q]: false }
const split = family => ({ [easy.q]: true, [hard.q]: family === 'b' ? true : false })

function router(opts = {}) {
  return new Router({
    screen: mockScreen({ [easy.q]: { answer: 'YES', p: 0.99 }, [hard.q]: { answer: 'YES', p: 0.6 } }),
    tiers: [panel('small', ['a', 'b', 'c'], split, 0.001, 2000), panel('mid', ['a', 'd', 'e', 'f', 'g'], truth, 0.0033, 10000), panel('frontier', ['h', 'i', 'j', 'k', 'l'], truth, 0.03, 35000)],
    cutoffs: { 'yes-no': { cutoff: 0.97 } },
    auditRate: 0,
    ...opts,
  })
}

test('shadow mode: the screen sizes the jury but settles nothing', async () => {
  const r = await router().route(easy, { assurance: 'L0', allowScreen: true })
  assert.equal(r.settledBy, 'small')
  assert.deepEqual(r.shadow, { wouldSettle: true, p: 0.99 })
  assert.equal(r.answer, true)
})

test('live mode: a confident screen settles only what the contract allows', async () => {
  const live = router({ mode: 'live' })
  assert.equal((await live.route(easy, { assurance: 'L0', allowScreen: true })).settledBy, 'screen')
  assert.equal((await live.route(easy, { assurance: 'L0', allowScreen: false })).settledBy, 'small', 'contract forbids')
  assert.equal((await live.route(easy, { assurance: 'L1', allowScreen: true })).settledBy, 'small', 'L1 needs a jury')
  assert.equal((await live.route(easy, { assurance: 'L0', allowScreen: true, stakesUsd: 10000, maxLossUsd: 10 })).settledBy, 'small', 'stakes too high')
  const noCut = router({ mode: 'live', cutoffs: {} })
  assert.equal((await noCut.route(easy, { assurance: 'L0', allowScreen: true })).settledBy, 'small', 'uncalibrated type never settles')
})

test('disagreement moves a question up; an unsure screen starts it higher', async () => {
  const r = await router().route(hard, { assurance: 'L1' })
  assert.equal(r.path[1].tier, 'frontier', 'p 0.6 is below every sizing rule, so it starts at the top')
  assert.equal(r.settledBy, 'frontier')
  assert.equal(r.answer, false)
  const noScreen = new Router({ tiers: router().tiers, auditRate: 0 })
  const r2 = await noScreen.route(hard, { assurance: 'L1' })
  assert.deepEqual(r2.path.map(p => p.tier), ['small', 'mid'], 'split small panel escalates')
})

test('the contract floor is never lowered', async () => {
  const r = await router().route(easy, { assurance: 'L1', floorTier: 2 })
  assert.equal(r.settledBy, 'frontier')
})

test('L2 goes to the proven lane and never uses the screen answer', async () => {
  const r = await router({ mode: 'live' }).route(easy, { assurance: 'L2', allowScreen: true })
  assert.equal(r.lane, 'proven')
  assert.equal(r.answer, null)
})

test('a split top tier below the bar returns UNKNOWN for the fallback', async () => {
  const r = new Router({ tiers: [panel('top', ['a', 'b', 'c', 'd', 'e'], l => ({ [hard.q]: ['a', 'b', 'c'].includes(l) })) ], auditRate: 0 })
  const out = await r.route(hard, { assurance: 'L1' })
  assert.equal(out.settledBy, 'below-bar')
  assert.equal(out.answer, null)
})

test('audits are drawn from the block hash and re-check at the top tier', async () => {
  const keys = Array.from({ length: 1000 }, (_, i) => `k${i}`)
  const share = keys.filter(k => audited('block-9', k, 0.05)).length / keys.length
  assert.ok(share > 0.02 && share < 0.09, `about 5%, got ${share}`)
  assert.equal(audited('block-9', 'k1', 0.05), audited('block-9', 'k1', 0.05))
  const r = router({ auditRate: 1 })
  const out = await r.route(easy, { assurance: 'L0', allowScreen: true })
  assert.equal(out.audited.tier, 'frontier')
  assert.equal(out.audited.agreement, 1)
})

test('calibration: cutoffs need a confident accuracy bound and enough samples', () => {
  assert.ok(Math.abs(wilsonLower(98, 100) - 0.9297) < 0.001)
  const recs = []
  for (let i = 0; i < 400; i++) recs.push({ type: 'yes-no', p: 0.99, correct: i % 100 !== 0 })   // 99% right at 0.99
  for (let i = 0; i < 400; i++) recs.push({ type: 'yes-no', p: 0.7, correct: i % 4 !== 0 })      // 75% right at 0.7
  for (let i = 0; i < 20; i++) recs.push({ type: 'integer', p: 0.99, correct: true })             // too few
  const c = calibrate(recs, { target: 0.97 })
  assert.equal(c['yes-no'].cutoff, 0.99)
  assert.equal(c['yes-no'].coverage, 0.5)
  assert.equal(c.integer.cutoff, null)
  const live = Array.from({ length: 100 }, (_, i) => ({ type: 'yes-no', p: 0.99, correct: i % 10 !== 0 })) // 90% live
  const { cutoffs, withdrawn } = recheck(c, live, { target: 0.97 })
  assert.deepEqual(withdrawn, ['yes-no'])
  assert.equal(cutoffs['yes-no'].cutoff, null)
})

test('the router logs labeled screen records for calibration', async () => {
  const r = router()
  await r.route(easy, { assurance: 'L1' })
  await r.route(hard, { assurance: 'L1' })
  assert.deepEqual(r.screenRecords().map(x => x.correct), [true, false])
})

test('routeBlock sends only L2 atoms to the packer and answers the rest once', async () => {
  const plan = (atoms) => ({ kind: PLAN_KIND, onUnknown: 'NO', atoms, decide: [{ else: 'NO' }] })
  const items = [
    { id: 'c1', plan: plan([easy, hard]), ctx: { assurance: 'L1' } },
    { id: 'c2', plan: plan([easy]), ctx: { assurance: 'L1' } },
    { id: 'c3', plan: plan([yn('p', 'Did the vote pass?')]), ctx: { assurance: 'L2' } },
  ]
  const { answers, proven, results } = await routeBlock(items, router(), 'block-1')
  assert.equal(answers[atomKey(easy)], true)
  assert.equal(results.filter(r => r.atom === 'e').length, 1, 'shared atom routed once')
  assert.deepEqual(proven.map(p => p.id), ['c3'])
})

test('the Jev adapter maps typed answers and refuses bad replies', async () => {
  const s = jevScreen({ call: async ({ options }) => ({ label: options[0], probability: 0.93 }) })
  assert.deepEqual(await s.decide(easy), { answer: true, p: 0.93 })
  const bad = jevScreen({ call: async () => ({ label: 'maybe', probability: 2 }) })
  assert.deepEqual(await bad.decide(easy), { answer: null, p: 0 })
  assert.throws(() => jevScreen({}), /call function/)
  assert.equal(atomType({ answer: { type: 'integer' } }), 'integer')
})

test('tiers must span families', () => {
  assert.throws(() => new Router({ tiers: [{ id: 'x', jurors: [juror('a', {}), juror('a', {})] }] }), /span families/)
})
