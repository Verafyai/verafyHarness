// Consensus hardening and slashing (v0.0.3-alpha): model families, the jury
// scheduler, the beacon, operator caps, weighting, slashing, payout holds and
// challenge bonds. Scripted models only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  Harness, mockProvider, ascHash, validate, drawJury, drawJuryFor, drawOrder, rule, ruleFromRecords, verifyRuling, seal, blockHeader,
  rulingId, conserves, checkPay, familyOf, minFamiliesOf,
  beaconChain, beaconEntry, verifyBeacon, seedAt, BEACON_GENESIS,
  JuryScheduler, scheduleJury, replaceNoShows, scheduleRecord, checkPolicy, pastDeadline, auditSample, NETWORK_POLICY,
  DEFAULT_SLASHING, penalties, slashRuling, slashDiff, exposure, validateSlashing, slashingHash, bondAccount, operatorBondAccount,
  releaseHeld, challengeContract, resolveChallenge, appendReview, lockChallengeBond, settleChallengeBond, challengeBondFor, heldAccount,
} from '../src/index.js'

const ROOT = new URL('../../../', import.meta.url)
const read = p => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'))
const ex = name => read(`examples/${name}.json`)
const mock = ex('mock-answers')
const config = read('verafy.config.json')
const poolFor = asc => config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))

// ---- Model families -------------------------------------------------------

test('juries span open-weight model families; old contracts and cards that say lab still rule, with their old hashes', async () => {
  const asc = ex('market-resolution')
  assert.equal(asc.payment.jury.minFamilies, 5)
  assert.equal(asc.payment.jury.minLabs, undefined)
  const jury = drawJuryFor(asc, poolFor(asc), 'genesis')
  assert.ok(new Set(jury.map(familyOf)).size >= 5)
  const r = await rule(asc, jury, jury[0], { seed: 'genesis' })
  assert.ok(r.round.jury.every(c => c.family && !('lab' in c)), 'new cards carry family')
  assert.equal(verifyRuling(asc, r, { pool: poolFor(asc).map(h => h.card), seed: 'genesis' }).ok, true)

  const old = read('packages/core/test/fixtures/v0.0.2/market-resolution.json')
  const oldConfig = read('packages/core/test/fixtures/v0.0.2/verafy.config.json')
  const oldMock = read('packages/core/test/fixtures/v0.0.2/mock-answers.json')
  assert.equal(ascHash(old), '595232d4a4ba556bc6d43f1e1d65a1c22842462b649020dd45365aa230f47d5e')
  assert.equal(minFamiliesOf(old.payment.jury), 5, 'minLabs reads as minFamilies')
  const oldPool = oldConfig.pool.map(h => new Harness({ ...h, provider: mockProvider(oldMock, old.id, h.lab) }))
  const oldJury = drawJuryFor(old, oldPool, 'genesis')
  const r0 = await rule(old, oldJury, oldJury[0], { seed: 'genesis' })
  assert.ok(r0.round.jury.every(c => c.lab && !('family' in c)), 'old cards keep the field name they were signed with')
  assert.equal(verifyRuling(old, r0, { pool: oldPool.map(h => h.card), seed: 'genesis' }).ok, true)
  assert.deepEqual(validate({ ...asc, payment: { ...asc.payment, jury: { ...asc.payment.jury, minLabs: 5 } } }).filter(p => /keep one/.test(p)).length, 1)
})

// ---- Operators and weighting ---------------------------------------------

const cards = (n, f) => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, family: `f${i % 6}`, model: 'm', bond: 100 * (1 + (i % 4)), publicKey: 'k', ...(f ? f(i) : {}) }))

test('operators: a seat cap per operator, even when one operator runs harnesses of different families', () => {
  // One operator runs half the pool, across every family.
  const pool = cards(24, i => ({ operator: i % 2 === 0 ? 'op-big' : `op-${i}` }))
  const rules = { size: 5, minFamilies: 3 }
  const loose = drawJury(pool, rules, 'seed-a')
  const capped = drawJury(pool, { ...rules, maxSeatsPerOperator: 1 }, 'seed-a')
  assert.ok(capped.filter(h => h.operator === 'op-big').length <= 1)
  assert.ok(new Set(capped.map(h => h.operator)).size === 5)
  assert.ok(loose.length === 5)
  assert.throws(() => drawJury(cards(6, () => ({ operator: 'solo' })), { size: 3, minFamilies: 2, maxSeatsPerOperator: 1 }, 's'), /at most 1 per operator/)
  assert.throws(() => drawJury(pool, { ...rules, minOperators: 6 }, 's'), /across 6 operators/)
})

test('weighting: equal by default and unchanged; bond weighting is deterministic, capped, and favors larger bonds', () => {
  const pool = cards(40)
  const rules = { size: 5, minFamilies: 3 }
  assert.deepEqual(drawOrder(pool, rules, 's').map(h => h.id), [...pool].sort((a, b) => (a.id < b.id ? -1 : 1)).length ? drawOrder(pool, { ...rules, weighting: 'equal' }, 's').map(h => h.id) : [])
  const w = { ...rules, weighting: 'bond', weightCap: 4 }
  assert.deepEqual(drawJury(pool, w, 's').map(h => h.id), drawJury(pool, w, 's').map(h => h.id))
  let big = 0, small = 0
  for (let i = 0; i < 400; i++) { const first = drawOrder(pool, w, `s${i}`)[0]; if (first.bond === 400) big++; if (first.bond === 100) small++ }
  assert.ok(big > small * 2, `a 4x bond comes first more often (${big} vs ${small})`)
  assert.throws(() => drawOrder(pool, { ...rules, weighting: 'stake' }, 's'), /unknown jury weighting/)
  assert.deepEqual(validate({ ...ex('fact-check'), payment: { ...ex('fact-check').payment, jury: { ...ex('fact-check').payment.jury, weighting: 'stake' } } }).filter(p => /weighting/.test(p)).length, 1)
})

// ---- The beacon -----------------------------------------------------------

test('beacon: reveals are fixed by the anchor, a withheld reveal is a fault, and a bad reveal is caught', () => {
  const chain = beaconChain({ length: 50 })
  const blocks = []
  let parent = null
  for (let h = 1; h <= 5; h++) {
    const entry = beaconEntry(parent, { sealer: 'node-1', reveal: h === 3 ? null : chain.reveal(h - (h > 3 ? 1 : 0)) }, h)
    const b = seal(parent, [{ asc: 'x', n: h }], { id: 'node-1', sign: () => 'sig' }, { time: '2026-11-07T00:00:00Z', beacon: entry })
    blocks.push(b); parent = b
  }
  const v = verifyBeacon(blocks, { 'node-1': chain.anchor })
  assert.equal(v.ok, true, v.problems.join('; '))
  assert.deepEqual(v.faults, [{ sealer: 'node-1', height: 3, fault: 'no-beacon-reveal' }])
  assert.equal(seedAt(blocks, 1, 1), blocks[1].beacon.value)
  assert.equal(blockHeader(blocks[0]).beacon.value, blocks[0].beacon.value, 'the beacon is in the signed header')
  // A sealer cannot choose its reveal: anything but the next link fails.
  const forged = structuredClone(blocks); forged[1].beacon.reveal = 'ab'.repeat(32)
  assert.equal(verifyBeacon(forged, { 'node-1': chain.anchor }).ok, false)
  // A block without a beacon hashes exactly as before.
  const plain = seal(null, [{ asc: 'x', n: 1 }], { id: 'node-1', sign: () => 'sig' }, { time: '2026-11-06T00:00:00.000Z' })
  assert.equal(plain.hash, '377431ba9c524bfe72550becac7e4301769508316103bd5a2dcb39983c4a2ea1')
  assert.notEqual(BEACON_GENESIS, blocks[0].beacon.value)
})

// ---- The scheduler --------------------------------------------------------

test('scheduler: deadlines in blocks, alternates fixed at draw, commit-phase replacement that verifyRuling recomputes', async () => {
  const asc = ex('fact-check')
  const pool = poolFor(asc)
  const s = scheduleJury(asc, pool, { seed: 'beacon-1', height: 10 })
  assert.equal(s.schedule.commitBy, 12); assert.equal(s.schedule.revealBy, 14)
  assert.equal(pastDeadline(s.schedule, 'commit', 12), false); assert.equal(pastDeadline(s.schedule, 'commit', 13), true)
  assert.ok(s.alternates.length >= 1)
  const missing = [s.jury[0].id]
  const r2 = replaceNoShows(asc, s, missing, { height: 13 })
  assert.equal(r2.schedule.replaced[0].seat, missing[0])
  assert.equal(r2.schedule.commitBy, 15, 'replacements get a fresh commit window')
  assert.ok(!r2.jury.some(h => h.id === missing[0]))
  const r = await rule(asc, r2.jury, r2.jury[0], { seed: 'beacon-1', schedule: scheduleRecord(r2.schedule) })
  assert.equal(verifyRuling(asc, r, { pool: pool.map(h => h.card), seed: 'beacon-1' }).ok, true)
  const lied = structuredClone(r); lied.round.schedule.replaced[0].by = s.alternates.at(-1).id
  assert.ok(verifyRuling(asc, lied, { pool: pool.map(h => h.card) }).problems.some(p => /replacements are not the ones/.test(p)))
  assert.equal(new JuryScheduler().families(asc), 4)
})

test('policy: a jury of one needs a challenge window and is always audited', () => {
  const one = { ...ex('fact-check'), payment: { ...ex('fact-check').payment, bar: 1, jury: { size: 1, minFamilies: 1 } } }
  assert.match(checkPolicy(one).join(), /jury of one needs a challenge window/)
  assert.deepEqual(checkPolicy({ ...one, payment: { ...one.payment, challengeWindow: 60 } }), [])
  assert.match(checkPolicy(one, { ...NETWORK_POLICY, singleHarness: { allowed: false } }).join(), /does not allow a jury of one/)
  const rulings = [{ asc: one, ruling: { n: 1 } }, ...Array.from({ length: 30 }, (_, i) => ({ asc: ex('fact-check'), ruling: { n: i + 2 } }))]
  const sample = auditSample(rulings, 'seed')
  assert.ok(sample.includes(rulings[0]))
  assert.ok(sample.length < rulings.length)
})

// ---- Faults and slashing --------------------------------------------------

async function ruledWith(asc, mutate) {
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const commits = []
  for (const j of jury) commits.push(await j.commit(asc))
  const reveals = jury.map(j => j.reveal(ascHash(asc)))
  mutate?.({ jury, commits, reveals })
  return { jury, ruling: ruleFromRecords(asc, commits, reveals, { jury: jury.map(j => j.card), sealer: 'node:node-1', seed: 'genesis' }) }
}

test('faults: double commits and bad reveals are recorded with signed evidence', async () => {
  const asc = ex('market-resolution')
  const { ruling, jury } = await ruledWith(asc, ({ jury, commits, reveals }) => {
    // Juror 0 equivocates: a second, different commitment, also validly signed.
    const extra = { ...commits[0], commitment: 'f'.repeat(64), attestation: { ...commits[0].attestation, commitment: 'f'.repeat(64) } }
    extra.signature = jury[0].sign(extra.attestation)
    commits.push(extra)
    // Juror 1 reveals a different answer, signed, which does not open its commitment.
    const r = reveals[1]
    const wrong = { harness: r.harness, ascHash: r.ascHash, vote: { ...r.vote, answer: r.vote.answer === 'YES' ? 'NO' : 'YES' }, salt: r.salt }
    reveals[1] = { ...wrong, signature: jury[1].sign(wrong) }
    // Juror 2 says nothing.
    reveals[2] = null
  })
  const f = Object.fromEntries(ruling.round.faults.map(x => [x.harness, x]))
  assert.equal(f[jury[0].id].fault, 'double-commit'); assert.equal(f[jury[0].id].evidence.length, 2)
  assert.equal(f[jury[1].id].fault, 'bad-reveal'); assert.equal(f[jury[1].id].evidence.length, 1)
  assert.equal(f[jury[2].id].fault, 'no-reveal'); assert.equal(f[jury[2].id].evidence, undefined)
})

test('slashing: the schedule prices each fault, grace forgives one outage, and the diff conserves', async () => {
  assert.deepEqual(validateSlashing(DEFAULT_SLASHING), [])
  assert.match(slashingHash(), /^[0-9a-f]{64}$/)
  const asc = ex('market-resolution')
  const { ruling, jury } = await ruledWith(asc, ({ reveals }) => { reveals[0] = null })
  const list = slashRuling(ruling)
  assert.equal(list.length, 1)
  assert.equal(list[0].fault, 'no-reveal'); assert.equal(list[0].rate, 0.05)
  assert.equal(list[0].amount, jury[0].bond * 0.05)
  assert.equal(list[0].ruling, rulingId(ruling))
  const { diff } = slashDiff(list)
  assert.ok(conserves(diff))
  assert.deepEqual(diff, [{ account: bondAccount(jury[0].id), delta: -jury[0].bond * 0.05 }, { account: 'pool:slashed', delta: jury[0].bond * 0.05 }])

  const outages = penalties([{ harness: 'h', fault: 'no-commit', height: 5 }, { harness: 'h', fault: 'no-commit', height: 9 }, { harness: 'h', fault: 'no-commit', height: 5000 }], DEFAULT_SLASHING, { bonds: { h: 1000 } })
  assert.deepEqual(outages.map(p => [p.forgiven, p.amount]), [[true, 0], [false, 10], [true, 0]], 'one free outage per window, then 1%')

  // A reporter that proves a fault takes half; a bond that runs short reaches the operator's bond, then records the rest unpaid.
  const proven = penalties([{ harness: 'h', fault: 'double-commit', reporter: 'harness:watcher' }], DEFAULT_SLASHING, { bonds: { h: 500 } })
  const out = slashDiff(proven, { balances: { [bondAccount('h')]: 300, [operatorBondAccount('op')]: 100 }, operators: { h: 'op' } })
  assert.ok(conserves(out.diff))
  assert.deepEqual(out.unpaid, [{ harness: 'h', amount: 100 }])
  assert.equal(out.diff.find(d => d.account === 'harness:watcher').delta, 200)
  assert.deepEqual(exposure(500), { bond: 500, worstFault: 'double-commit', atStake: 500 })
})

test('slashings ride in the block that applies them, under a signed root', () => {
  const s = penalties([{ harness: 'h', fault: 'no-reveal' }], DEFAULT_SLASHING, { bonds: { h: 100 } })
  const b = seal(null, [{ asc: 'x' }], { id: 'node-1', sign: () => 'sig' }, { time: '2026-11-07T00:00:00Z', slashings: s })
  assert.ok(b.slashingsRoot && b.slashings.length === 1)
  assert.ok(blockHeader(b).slashingsRoot)
})

// ---- Payout holds and challenge bonds -------------------------------------

const held = asc => ({ ...asc, payment: { ...asc.payment, challengeWindow: 6 } })

test('hold: a contract with a challenge window parks every credit, then releases after the window', async () => {
  const asc = held(ex('delay-cover'))
  assert.deepEqual(validate(asc), [])
  const { ruling } = await ruledWith(asc)
  assert.equal(ruling.passed, true)
  assert.ok(ruling.held)
  assert.deepEqual(ruling.diff.filter(d => d.delta > 0), [{ account: heldAccount(asc), delta: ruling.held.amount }])
  assert.deepEqual(checkPay(asc, ruling), [])
  assert.equal(verifyRuling(asc, ruling).ok, true)
  assert.deepEqual(ruling.triggers, [], 'calls on other chains wait for release too')
  assert.equal(releaseHeld(asc, ruling, { sealedAt: 10, height: 15 }).status, 'waiting')
  assert.equal(releaseHeld(asc, ruling, { sealedAt: 10, height: 16, open: [rulingId(ruling)] }).status, 'frozen')
  const rel = releaseHeld(asc, ruling, { sealedAt: 10, height: 16 })
  assert.equal(rel.status, 'release')
  assert.ok(conserves(rel.diff))
  assert.deepEqual(rel.diff.slice(1), ruling.held.payouts)
  const cheat = structuredClone(ruling); cheat.held.payouts[0].delta += 1
  assert.ok(checkPay(asc, cheat).length > 0)
  // Without a window nothing is held, exactly as before.
  const { ruling: plain } = await ruledWith(ex('delay-cover'))
  assert.equal(plain.held, undefined)
  assert.equal(releaseHeld(ex('delay-cover'), plain, { sealedAt: 1, height: 1 }).status, 'not-held')
})

test('hold: an overturn inside the window redirects the held escrow; the challenger takes the forfeited juror share', async () => {
  const asc = held(ex('market-resolution'))
  const { ruling } = await ruledWith(asc)
  const ch = challengeContract(asc, ruling, { grounds: 'error' })
  const bond = challengeBondFor(ch)
  assert.ok(Math.abs(bond - 1.5 * ch.payment.escrow) < 1e-9)
  const lock = lockChallengeBond(ch, 'harness:challenger')
  assert.ok(conserves(lock))
  assert.throws(() => lockChallengeBond(ch, 'harness:challenger', 1), /at least/)
  // The challenge jury rules the other way.
  const other = asc.question.answer.options.find(o => o !== ruling.answer)
  const fake = { ...ruling, round: undefined, ascHash: ascHash(ch), passed: true, answer: other, votes: [] }
  const review = resolveChallenge(ch, fake, ruling)
  assert.equal(review.result, 'overturn')
  const log = appendReview([], review)
  const r = releaseHeld(asc, ruling, { sealedAt: 10, height: 11, reviews: log, challenger: 'harness:challenger' })
  assert.equal(r.status, 'redirect')
  assert.ok(conserves(r.diff))
  const each = Math.round(asc.payment.escrow * asc.payment.split.jurors / ruling.votes.length * 1e6) / 1e6
  const wrong = ruling.votes.filter(v => v.answer !== other).length
  assert.ok(Math.abs(r.diff.find(d => d.account === 'harness:challenger').delta - each * wrong) < 1e-6)
  const back = settleChallengeBond(ch, review, ruling, { from: 'harness:challenger', amount: bond })
  assert.deepEqual(back.diff.at(-1), { account: 'harness:challenger', delta: bond })
  // An affirmed ruling forfeits the bond: half to the jurors wrongly challenged, half to the pool.
  const affirm = settleChallengeBond(ch, { ...review, result: 'affirm' }, ruling, { from: 'harness:challenger', amount: bond })
  assert.ok(conserves(affirm.diff))
  assert.ok(affirm.diff.some(d => d.account === 'pool:slashed' && d.delta > 0))
  assert.ok(!affirm.diff.some(d => d.account === 'harness:challenger'))
})
