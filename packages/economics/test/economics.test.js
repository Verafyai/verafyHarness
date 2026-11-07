import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimate, curve, DEFAULTS, PRESETS, cascade, CASCADE_EXAMPLE } from '../src/index.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.00005, `${msg}: ${a} vs ${b}`)

test('per proof parts match the published vectors', () => {
  const e = estimate()
  near(e.secondsPerProof, 9.2917, 'seconds per proof')
  near(e.proveUsd, 0.0103, 'prove')
  near(e.verifyUsd, 0.0047, 'verify')
  near(e.storeUsd, 0.0011, 'store')
  near(e.perProofAllIn, 0.0209, 'per vote')
  near(e.perRequestUsd, 0.1043, 'per ruling, 5 provers')
  assert.equal(Math.round(e.capacityPerHour), 387)
  near(e.breakEvenFeePerProof, 0.0206, 'break even at 50%')
  near(estimate({ utilizationPct: 25 }).breakEvenFeePerProof, 0.0413, 'break even at 25%')
})

test('unpacked blocks', () => {
  const a = estimate()
  assert.equal(a.requestsInBlock, 24)
  assert.equal(Math.round(a.sealSeconds / 6) / 10, 3.7)
  near(a.proofGB, 2.2008, 'proof GB')
  near(a.blockCostUsd, 7.5043, 'block cost')
  near(a.parts.warmup, 5, 'warmup')
  near(a.perContractUsd, 0.3127, 'per contract')
  const b = estimate({ tokensPerContract: 4000 })
  assert.equal(b.requestsInBlock, 96)
  near(b.blockCostUsd, 15.0172, 'long contracts')
  const c = estimate({ contracts: 100, tokensPerContract: 1000 })
  near(c.perContractUsd, 0.1543, '100 contracts')
  assert.equal(a.minRequestsForWarmup, 432)
})

test('proof packing vectors', () => {
  near(estimate({ packing: true, proveOnce: true, decisionsPerRequest: 1 }).perDecisionUsd, 0.0241, 'prove once, 1 per request')
  near(estimate({ packing: true, proveOnce: true }).perDecisionUsd, 0.0085, 'prove once, 4 per request')
  near(estimate({ packing: true, proveOnce: true, verifiersPerProof: 3 }).perDecisionUsd, 0.0097, '3 verifiers')
  const p = estimate({ packing: true, proveOnce: true, contracts: 96 })
  assert.equal(p.requestsInBlock, 24)
  near(p.blockCostUsd, 1.8138, '96 decisions')
  near(p.parts.warmup, 1, 'one prover warms up')
  near(p.perContractUsd, 0.0189, 'per decision in block')
  assert.equal(p.minDecisionsForWarmup, 1728)
})

test('atomize and screen vectors', () => {
  const a = estimate(PRESETS.atomized.values)
  assert.equal(a.atomsPerRequest, 16)
  assert.equal(a.requestsInBlock, 3)
  near(a.perDecisionUsd, 0.0059, 'atomized per decision')
  near(a.blockCostUsd, 1.1408, 'atomized block')
  const j = estimate(PRESETS.jev.values)
  assert.equal(j.requestsInBlock, 2)
  near(j.perDecisionUsd, 0.0039, 'with a screen')
  const big = estimate({ ...PRESETS.atomized.values, contracts: 1000 })
  near(big.parts.proving, 1.2905, 'proving at 1000 contracts')
  near(big.parts.fidelity, 3.26, 'fidelity checks outweigh proving once packed')
  near(estimate({ ...PRESETS.jev.values, contracts: 1000 }).perContractUsd, 0.0045, 'screen at 1000')
  near(estimate({ ...PRESETS.atomized.values, contracts: 1000, dedupePct: 30 }).requestsInBlock, 88, 'dedupe')
})

test('packing fits in one request', () => {
  const e = estimate({ packing: true, proveOnce: true })
  assert.equal(e.packedTokens, 1024)
  assert.equal(e.packingFits, true)
  assert.equal(estimate({ packing: true, decisionsPerRequest: 5 }).packingFits, false)
})

test('conservation of the cost breakdown', () => {
  for (const preset of Object.values(PRESETS)) {
    const e = estimate(preset.values)
    const sum = Object.values(e.parts).reduce((a, b) => a + b, 0)
    near(sum, e.blockCostUsd, preset.name)
  }
})

test('the batch curve falls as blocks grow', () => {
  const pts = curve()
  for (let k = 1; k < pts.length; k++) assert.ok(pts[k].perContractUsd <= pts[k - 1].perContractUsd + 1e-12)
})

test('every default is labeled', () => {
  for (const [k, d] of Object.entries(DEFAULTS)) {
    assert.ok(d.label && d.source, k)
    if (['vendor-reported', 'measured', 'modeled'].includes(d.label)) assert.ok(d.url && d.date, `${k} needs url and date`)
  }
})

test('cascade vectors (illustrative shares)', () => {
  const c = cascade(CASCADE_EXAMPLE)
  near(c.avgUsd, 0.0068, 'average cost')
  assert.ok(Math.abs(c.avgSeconds - 10.45) < 0.01, `average seconds ${c.avgSeconds}`)
  assert.equal(c.medianSeconds, 2.3)
  near(c.worstUsd, 0.0347, 'a hard question pays every tier')
  assert.ok(Math.abs(c.worstSeconds - 47.3) < 1e-9)
  assert.ok(Math.abs(c.cheaper - 4.44) < 0.01)
  assert.throws(() => cascade([{ id: 'x', usd: 1, seconds: 1, stopShare: 0.5 }]), /sum to 1/)
})

test('reasoning length uses the proof window (modeled, 1,000 contracts)', () => {
  const b = { ...PRESETS.atomized.values, contracts: 1000 }
  const r = t => estimate({ ...b, reasoningTokens: t })
  assert.equal(r(0).atomsPerRequest, 16)
  assert.equal(r(40).atomsPerRequest, 9)
  near(r(40).perContractUsd, 0.0089, 'short reasons')
  assert.equal(r(150).atomsPerRequest, 4)
  near(r(150).perContractUsd, 0.0147, 'full reasoning')
  near(r(400).perContractUsd, 0.0251, 'long reasoning')
})

test('stake: bond capital is cents per block, an honest harness inside the grace loses nothing, and one provable fault costs thousands of seat fees', async () => {
  const { stake, STAKE_DEFAULTS } = await import('../src/index.js')
  for (const d of Object.values(STAKE_DEFAULTS)) assert.ok(['illustrative', 'modeled', 'input', 'prototype default'].includes(d.label))
  const s = stake()
  assert.equal(s.seatsPerDay, 2400)
  assert.ok(s.capitalPerBlockUsd > 0.2 && s.capitalPerBlockUsd < 0.25)
  assert.equal(s.honestSlashPerSeatUsd, 0, '1% missed commits is inside the 2% grace')
  assert.ok(stake({ missCommitPct: 5, missRevealPct: 0.5 }).honestSlashShareOfFees > 1, 'an unreliable harness loses more than it earns')
  assert.equal(s.badRevealUsd, 125)
  assert.ok(s.badRevealInSeatFees > 50_000)
  assert.equal(s.majorityBondsUsd, 1500)
})
