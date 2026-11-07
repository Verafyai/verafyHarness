import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { packedBlock, PLAN_KIND } from '../src/index.js'
import { mockProver, mockVerifier } from '../../prove/src/index.js'

const base = JSON.parse(await readFile(new URL('../../../examples/market-resolution.json', import.meta.url), 'utf8'))
const pin = base.context[0].sha256
const yn = (id, q, fact) => ({ id, q, answer: { type: 'yes-no' }, facts: [{ text: fact, pin, loc: 'p1' }] })
const shared = yn('rec', 'Is the official Senate roll-call record available for November 2026?', 'Snapshot of senate.gov roll-call votes, taken Dec 1, 2026.')
const senate = { kind: PLAN_KIND, atoms: [yn('pass', 'Does the snapshot record a passing Senate roll-call vote on H.R. 4410?', 'Vote 302 (Nov 19): motion to proceed to H.R. 4410, rejected 46-53.'), shared], decide: [{ when: { not: { atom: 'rec' } }, outcome: 'UNCLEAR' }, { when: { atom: 'pass' }, outcome: 'YES' }, { else: 'NO' }], onUnknown: 'UNCLEAR' }
const cloture = { kind: PLAN_KIND, atoms: [yn('clo', 'Was cloture on a nomination agreed in the Senate on Nov 18?', 'Vote 301 (Nov 18): cloture on a nomination, agreed 52-47.'), shared], decide: [{ when: { not: { atom: 'rec' } }, outcome: 'UNCLEAR' }, { when: { atom: 'clo' }, outcome: 'YES' }, { else: 'NO' }], onUnknown: 'UNCLEAR' }
const c1 = base
const c2 = { ...base, id: 'market-cloture-nov18', question: { ...base.question, prompt: 'Was cloture agreed on Nov 18?' } }

const TRUTH = { [senate.atoms[0].q]: 'NO', [shared.q]: 'YES', [cloture.atoms[0].q]: 'YES' }
/** A model that answers packed slots from the facts it was given. */
const oracle = (truth = TRUTH) => ({ complete: async ({ user }) => [...user.matchAll(/\[S(\d+)\] Q: (.+)/g)].map(([, n, q]) => `S${n}: ${truth[q] ?? 'UNKNOWN'}`).join('\n') })
const panelist = (family, answer = 'FAITHFUL') => ({ family, model: `${family}-m`, provider: { complete: async () => JSON.stringify({ answer, confidence: 0.9, reasoning: 'checked against the pin', sources: ['c0'] }) } })
const panel = (answers = ['FAITHFUL', 'FAITHFUL', 'FAITHFUL']) => answers.map((a, i) => panelist(['mistral', 'gpt-oss', 'gemma'][i], a))
const run = (o = {}) => packedBlock([c1, c2], { plans: { [c1.id]: senate, [c2.id]: cloture }, panel: panel(), prover: mockProver({ model: 'llama-4-maverick', complete: oracle().complete }), verifier: mockVerifier(), seed: 'block-1', ...o })

test('end to end: two contracts, one shared atom, one proven request, verified', async () => {
  const r = await run()
  assert.equal(r.results[c1.id].outcome, 'NO')
  assert.equal(r.results[c2.id].outcome, 'YES')
  assert.equal(r.stats.deduped, 1)
  assert.equal(r.stats.requests, 1)
  assert.equal(r.stats.packedContracts, 2)
  assert.ok(r.results[c1.id].proofs.every(p => p.verified && /^[0-9a-f]{64}$/.test(p.proofHash)))
  assert.equal(r.results[c1.id].proofs[0].request, r.results[c2.id].proofs[0].request, 'both contracts share the one proof')
  assert.equal(r.fallback.length, 0)
})

test('a plan the panel does not rule FAITHFUL is never packed', async () => {
  const r = await run({ panel: panel(['FAITHFUL', 'NOT_FAITHFUL', 'UNCLEAR']) })
  assert.deepEqual(r.fallback.sort(), [c1.id, c2.id].sort())
  assert.equal(r.results[c1.id].stage, 'fidelity')
  assert.equal(r.stats.proofs, 0)
})

test('a proof that does not verify sends its contracts back', async () => {
  const r = await run({ verifier: { verify: () => false } })
  assert.equal(r.results[c1.id].packed, false)
  assert.equal(r.results[c1.id].stage, 'prove')
})

test('a mangled reply fails the whole request', async () => {
  const bad = { complete: async ({ user }) => [...user.matchAll(/\[S(\d+)\]/g)].map(([, n]) => `S${n}: maybe`).join('\n') }
  const r = await run({ prover: mockProver({ model: 'llama-4-maverick', complete: bad.complete }) })
  assert.equal(r.stats.failedRequests, 1)
  assert.equal(r.fallback.length, 2)
})

test('an invalid plan falls back at atomize, and UNKNOWN composes to the contract rule', async () => {
  const r = await run({ plans: { [c1.id]: { ...senate, decide: [{ else: 'MAYBE' }] }, [c2.id]: cloture }, prover: mockProver({ model: 'm', complete: oracle({ ...TRUTH, [cloture.atoms[0].q]: 'UNKNOWN' }).complete }) })
  assert.equal(r.results[c1.id].stage, 'atomize')
  assert.equal(r.results[c2.id].outcome, 'UNCLEAR')
  assert.equal(r.results[c2.id].unknown, 'clo')
})

test('refuses to run without a panel, a prover or a verifier', async () => {
  await assert.rejects(packedBlock([c1], { plans: { [c1.id]: senate }, panel: [], prover: {}, verifier: {} }), /panel/)
  await assert.rejects(packedBlock([c1], { plans: { [c1.id]: senate }, panel: panel() }), /prover/)
})
