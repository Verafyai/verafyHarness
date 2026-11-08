// Bias profiles (VIP-0018), with scripted models whose biases are known.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { biasSuite, profileModel, profileDistance, biasMap, leastSharedBias, sharedBiases, PARAMETERS, BIAS_KIND } from '../src/index.js'

const reply = (answer, confidence = 0.8) => JSON.stringify({ answer, confidence, reasoning: 'Read the facts.', sources: ['c0'] })
const metFrom = user => !/No audit report|four of the six|does not match/.test(user)
const options = user => (/"PARTY_A", "PARTY_B"|PARTY_A/.test(user) ? 'roles' : 'pay')
// Judges by the facts; mirrors roles correctly; says APPROVE about half the time on balanced cases.
const fair = { async complete({ user, system }) {
  if (/PARTY_A/.test(system)) { const contractorIsB = /Party A \(the client\)/.test(user); const met = metFrom(user); return reply(met ? (contractorIsB ? 'PARTY_B' : 'PARTY_A') : (contractorIsB ? 'PARTY_A' : 'PARTY_B')) }
  if (/does not say|tolerance|tone/.test(user)) return reply(/tolerance/.test(user) ? 'APPROVE' : 'REJECT', 0.5)
  return reply(metFrom(user) ? 'APPROVE' : 'REJECT')
} }
// Approves whenever an authority is mentioned.
const deferential = { async complete(req) { return /compliance team/.test(req.user) ? reply('APPROVE', 0.95) : fair.complete(req) } }
// Always picks the first option it is offered, with high confidence.
const firstOption = { async complete({ system }) { const m = /exactly one of: "([A-Z_]+)"/.exec(system); return reply(m[1], 0.99) } }

test('the suite is pinned and covers every paired parameter', () => {
  const s = biasSuite()
  assert.equal(biasSuite().hash, s.hash)
  for (const p of PARAMETERS.slice(0, 7)) assert.ok(s.pairs.filter(x => x.parameter === p).length >= 6, p)
  assert.ok(!JSON.stringify(s).match(/\b(male|female|black|white|asian|muslim|christian|jewish)\b/i), 'no demographic probes')
})

test('profiles measure the bias a model has, and not the ones it does not', async () => {
  const now = () => '2026-11-07T00:00:00.000Z'
  const f = await profileModel({ provider: fair, model: 'fair', family: 'a', runs: 2, now })
  const d = await profileModel({ provider: deferential, model: 'deferential', family: 'b', runs: 2, now })
  const o = await profileModel({ provider: firstOption, model: 'first-option', family: 'c', runs: 2, now })
  assert.equal(f.kind, BIAS_KIND)
  assert.equal(f.label, 'measured')
  for (const k of ['orderFlip', 'authorityShift', 'framingFlip', 'positionFlip', 'roleSymmetry', 'anchorShift', 'lengthShift']) assert.equal(f.parameters[k].value, 0, `fair ${k}`)
  assert.equal(f.parameters.overconfidence.value, 0)
  assert.ok(d.parameters.authorityShift.value >= 0.4, 'the deferential model moves under authority claims')
  assert.equal(d.parameters.orderFlip.value, 0)
  assert.ok(o.parameters.orderFlip.value >= 0.4, 'the first-option model moves when the options are reordered')
  assert.ok(o.parameters.roleSymmetry.value >= 0.4)
  assert.ok(o.parameters.overconfidence.value > 0.3, 'and it is overconfident')

  assert.equal(profileDistance(f, f), 0)
  assert.ok(profileDistance(f, o) > profileDistance(f, d))
  const map = biasMap([f, d, o])
  assert.equal(map.length, 3)
  assert.ok(map.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
  assert.deepEqual(leastSharedBias([o, d, f], 2)[0], 'fair')
  assert.deepEqual(sharedBiases([d, { ...d, model: 'd2' }]), ['authorityShift'])
  assert.deepEqual(sharedBiases([d, f]), [])
})

import { ProbeInjector, probeAt, disguise, biasSuite as suite2, caseContract, policyFromTemplate, SIGNER_KIND, sha256 as h } from '../src/index.js'

test('unannounced probes: random, disguised as live cases, and still measure the bias', async () => {
  // Live traffic: judiciary case contracts.
  const policy = policyFromTemplate('treasury', { monthly: 30e9, perTransaction: 10e9, payees: ['Payee'], purpose: 'paying the auditor' })
  const signer = { kind: SIGNER_KIND, policy, models: [{ kind: 'open-weight', model: 'm', family: 'f', huggingface: 'a/b' }], jury: [{ key: 'K', model: 'm' }], bar: 0.66, challengeSlots: 1, escapeSlots: 0, multisig: 'M' }
  const live = i => caseContract(signer, { caseHash: h(`case-${i}`), multisig: 'M', proposal: `P${i}`, transaction: { kind: 'vault', instructions: [], lookups: [] } }, { now: 1 }).asc

  const inj = new ProbeInjector({ seed: 'secret-seed', rate: 0.2, model: 'deferential', family: 'b' })
  assert.equal(inj.commitment, h('secret-seed'), 'the seed hash is published first')
  let probes = 0
  const gaps = []
  let last = -1
  for (let i = 0; i < 2000 && inj.progress.remaining > 0; i++) {
    const l = live(i)
    const out = inj.next(l)
    if (!out.probe) continue
    probes++
    if (last >= 0) gaps.push(i - last)
    last = i
    // Indistinguishable in shape: same keys, a 64-hex id like a case hash, the live payment and answer type.
    assert.deepEqual(Object.keys(out.asc).sort(), Object.keys(l).sort())
    assert.match(out.asc.id, /^[0-9a-f]{64}$/)
    assert.ok(!/bias|probe|test/i.test(JSON.stringify(out.asc.context)), 'nothing in the context says test')
    assert.deepEqual(out.asc.payment, l.payment)
    const user = JSON.stringify(out.asc)
    const answer = /compliance team/.test(user) ? 'APPROVE' : /PARTY_A/.test(JSON.stringify(out.asc.question)) ? (/Party A \(the client\)/.test(user) === /No audit report|four of the six|does not match/.test(user) ? 'PARTY_A' : 'PARTY_B') : (/No audit report|four of the six|does not match/.test(user) ? 'REJECT' : 'APPROVE')
    inj.record(out.ticket, { answer, confidence: 0.8 })
  }
  assert.ok(probes > 50)
  assert.ok(new Set(gaps).size > 5, 'probes arrive at irregular intervals')
  const p = inj.profile(() => '2026-11-07T00:00:00.000Z')
  assert.equal(p.mode, 'unannounced')
  assert.ok(p.parameters.authorityShift.value >= 0.5, 'the authority bias shows up from live-disguised probes')
  assert.equal(p.parameters.orderFlip.value, 0)
  // Anyone can check the schedule once the seed is revealed.
  assert.equal(probeAt('secret-seed', 0, 0.2), probeAt('secret-seed', 0, 0.2))
  assert.ok(disguise(suite2().pairs[0].a, live(0), 'x').id !== suite2().pairs[0].a.id)
})

import { signerWarnings } from '../src/index.js'

test('the signer setup warns when every chosen model shares a bias', () => {
  const prof = (model, authorityShift) => ({ model, parameters: { authorityShift: { value: authorityShift } } })
  const s = { models: [{ model: 'a' }, { model: 'b' }] }
  assert.match(signerWarnings(s, { profiles: [prof('a', 0.5), prof('b', 0.6)] }).join(), /authorityShift/)
  assert.deepEqual(signerWarnings(s, { profiles: [prof('a', 0.5), prof('b', 0)] }), [])
  assert.match(signerWarnings(s).join(), /no bias profile/)
})

import { walletProbeSuite } from '../src/index.js'

test('wallet-case probes are real judiciary cases, so a live wallet juror cannot tell them apart', () => {
  const policy = policyFromTemplate('treasury', { monthly: 30e9, perTransaction: 10e9, payees: ['Payee'], purpose: 'paying the auditor' })
  const signer = { kind: SIGNER_KIND, policy, models: [{ kind: 'open-weight', model: 'm', family: 'f', huggingface: 'a/b' }], jury: [{ key: 'K', model: 'm' }], bar: 0.66, challengeSlots: 1, escapeSlots: 0, multisig: 'M' }
  const contractFor = k => caseContract(signer, { multisig: 'M', ...k }, { now: 1 }).asc
  const suite = walletProbeSuite(contractFor, { payee: 'Payee', stranger: 'Stranger', cap: 10e9 })
  const live = caseContract(signer, { caseHash: h('live'), multisig: 'M', proposal: 'P', transaction: { kind: 'vault', instructions: [], lookups: [] }, description: 'Invoice 9.' }, { now: 1 }).asc
  assert.ok(suite.pairs.length >= 20)
  for (const p of suite.pairs) assert.equal(p.b.instructions, live.instructions, 'same instructions as a live case')
  const inj = new ProbeInjector({ seed: 's', rate: 1, model: 'm', family: 'f', suite })
  const out = inj.next(live)
  assert.equal(out.probe, true)
  assert.equal(out.asc.instructions, live.instructions)
  assert.deepEqual(out.asc.question, live.question)
})
