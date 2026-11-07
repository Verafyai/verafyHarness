import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  Harness, mockProvider, ascHash, ruleFromRecords, verifyRuling, drawJuryFor, createIdentity, proofCheck,
  finality, bondFaults, routeInference, ApiRouter, BELOW_BAR, canonical,
} from '../../core/src/index.js'
import {
  mockProver, mockVerifier, mockCommitment, mockProof, l2Provider, proveVotes, verifyBundle, planInference,
  batches, countTokens, assertProver, assertVerifier, externalProver, externalVerifier, deepProveProver,
  deepProveVerifier, flashProveProver, flashProveVerifier, serviceProver, COMPOSITION,
} from '../src/index.js'

const root = new URL('../../../', import.meta.url)
const ex = name => JSON.parse(readFileSync(new URL(`examples/${name}.json`, root), 'utf8'))
const script = ex('mock-answers')
const config = JSON.parse(readFileSync(new URL('verafy.config.json', root), 'utf8'))
const FAKE = fileURLToPath(new URL('fixtures/fake-prover.mjs', import.meta.url))
chmodSync(FAKE, 0o755)

const l2 = (asc, jury = {}) => ({ ...asc, payment: { ...asc.payment, jury: { ...asc.payment.jury, assurance: 'L2', ...jury } } })

/** Harnesses that answer through a mock prover over the scripted provider. */
function provingPool(s = script, { contextTokens, wrong = new Set() } = {}) {
  return config.pool.map(h => {
    const complete = mockProvider(s).complete
    const prover = mockProver({ model: h.model, complete })
    const provider = l2Provider(prover, { contextTokens })
    const harness = new Harness({ ...h, provider, modelCommitment: mockCommitment(h.model) })
    // A harness in `wrong` proves under another model's commitment.
    const proveWith = wrong.has(h.id) ? mockProver({ model: 'some-other-model', complete }) : prover
    return { harness, provider, prover: proveWith }
  })
}

const verifierNode = { id: 'node-1', ...createIdentity() }
const verifiers = new Map([[verifierNode.id, verifierNode.publicKey]])

/** Commit, reveal, prove, verify and rule, the way a node does. */
async function l2Round(asc, pool, { withhold = new Set(), seed = 'genesis' } = {}) {
  const jury = drawJuryFor(asc, pool.map(p => p.harness.card), seed)
  const seated = jury.map(c => pool.find(p => p.harness.id === c.id))
  const commits = await Promise.all(seated.map(p => p.harness.commit(asc)))
  const h = ascHash(asc)
  const reveals = seated.map(p => p.harness.reveal(h))
  const proved = []
  for (const p of seated) {
    if (withhold.has(p.harness.id)) continue
    const [r] = await proveVotes(p.harness, p.provider, p.prover, [asc])
    if (r.record) proved.push(r)
  }
  const checks = []
  for (const r of proved) {
    const vote = reveals.find(x => x.harness === r.record.harness).vote
    checks.push(proofCheck(verifierNode.id, verifierNode.privateKey, r.record, await verifyBundle(mockVerifier(), asc, r.record, r.bundle, vote)))
  }
  const ruling = ruleFromRecords(asc, commits, reveals, { jury, sealer: 'node:node-1', seed, proofRecords: proved.map(r => r.record), proofChecks: checks })
  return { ruling, proved, checks, jury }
}

test('mock proofs bind commitment, input and answer; another commitment fails', () => {
  const v = mockVerifier()
  const c = mockCommitment('m')
  const p = mockProof(c, { system: 's', user: 'u' }, 'out')
  assert.equal(v.verify(p, c, { system: 's', user: 'u' }, 'out'), true)
  assert.equal(v.verify(p, mockCommitment('other'), { system: 's', user: 'u' }, 'out'), false)
  assert.equal(v.verify(p, c, { system: 's', user: 'x' }, 'out'), false)
  assert.equal(v.verify(p, c, { system: 's', user: 'u' }, 'other'), false)
  assert.throws(() => assertProver({ prove() {} }), /commitment\(\) and prove/)
  assert.throws(() => assertProver({ commitment() {}, prove() {} }, { infer: true }), /proving never blocks the commit/)
  assert.throws(() => assertVerifier({}), /verify\(proofRef/)
})

test('an L2 ruling with mock proofs finalizes, and only hashes land in it', async () => {
  const asc = l2(ex('market-resolution'))
  const { ruling, proved } = await l2Round(asc, provingPool())
  assert.equal(ruling.passed, true)
  assert.equal(ruling.votes.length, 5)
  assert.deepEqual(ruling.round.faults, [])
  assert.equal(ruling.round.proofRecords.length, 5)
  assert.ok(ruling.votes.every(v => /^[0-9a-f]{64}$/.test(v.proofHash)))
  assert.deepEqual(finality(asc, ruling), { final: true, problems: [] })
  assert.deepEqual(verifyRuling(asc, ruling, { verifiers }), { ok: true, problems: [] })
  // Proof data stays off chain: no bundle, no proof bytes, no prompt text in the ruling.
  const text = JSON.stringify(ruling)
  for (const r of proved) assert.ok(!text.includes(r.bundle) && !text.includes('"scheme"') && !text.includes('mock/1'))
  assert.ok(ruling.round.proofRecords.every(r => r.proofRef === `sha256:${r.proofHash}`))
  // A ruling that carries a proof is refused.
  const withProof = { ...ruling, round: { ...ruling.round, proofRecords: [{ ...ruling.round.proofRecords[0], proof: proved[0].bundle }] } }
  assert.match(verifyRuling(asc, withProof).problems.join('; '), /proofs stay off chain/)
})

test('one missing proof drops the vote and records a fault against the bond', async () => {
  const asc = l2(ex('market-resolution'))
  const pool = provingPool()
  const { ruling, jury } = await l2Round(asc, pool, { withhold: new Set([jury0(asc, pool)]) })
  const missing = jury0(asc, pool)
  assert.equal(ruling.votes.length, 4)
  assert.ok(!ruling.votes.some(v => v.harness === missing))
  assert.deepEqual(ruling.round.faults, [{ harness: missing, fault: 'no-proof' }])
  assert.equal(ruling.passed, true, 'four of five still clear the bar and the quorum')
  assert.ok(!ruling.diff.some(d => d.account === `harness:${missing}`), 'a dropped vote is not paid')
  assert.deepEqual(bondFaults(ruling), [{ harness: missing, fault: 'no-proof', bond: jury.find(c => c.id === missing).bond, ascHash: ascHash(asc) }])
  assert.equal(verifyRuling(asc, ruling, { verifiers }).ok, true)
})
const jury0 = (asc, pool) => drawJuryFor(asc, pool.map(p => p.harness.card), 'genesis')[0].id

test('below the bar after the drop, it escalates', async () => {
  // Three NO and two YES at equal confidence: 0.6 agreement against a 0.55 bar. Drop one NO proof: 2 to 2, 0.5.
  const base = ex('market-resolution')
  const s = { [base.id]: Object.fromEntries(Object.entries(script[base.id]).map(([family, v]) => [family, { ...v, confidence: 0.9, answer: ['gpt-oss', 'gemma'].includes(family) ? 'YES' : 'NO' }])) }
  const asc = l2({ ...base, payment: { ...base.payment, bar: 0.55 } }, { quorum: 3 })
  const pool = provingPool(s)
  const full = await l2Round(asc, provingPool(s))
  assert.equal(full.ruling.passed, true)
  assert.equal(full.ruling.agreement, 0.6)
  const jury = drawJuryFor(asc, pool.map(p => p.harness.card), 'genesis')
  const no = jury.find(c => s[base.id][c.family].answer === 'NO').id
  const { ruling } = await l2Round(asc, pool, { withhold: new Set([no]) })
  assert.equal(ruling.agreement, 0.5)
  assert.equal(ruling.passed, false)
  assert.equal(ruling.exit, BELOW_BAR)
  assert.deepEqual(ruling.triggers, [{ type: 'escalate', jurySize: asc.exits.find(e => e.outcome === BELOW_BAR).effect.jurySize }])
  assert.deepEqual(ruling.round.faults, [{ harness: no, fault: 'no-proof' }])
  assert.equal(verifyRuling(asc, ruling, { verifiers }).ok, true)
})

test('a proof for a different commitment fails verification and earns bad-proof', async () => {
  const asc = l2(ex('market-resolution'))
  const probe = provingPool()
  const liar = jury0(asc, probe)
  const { ruling, checks } = await l2Round(asc, provingPool(script, { wrong: new Set([liar]) }))
  const k = checks.find(c => c.harness === liar)
  assert.equal(k.ok, false)
  assert.match(k.reason, /does not verify under the model commitment/)
  assert.deepEqual(ruling.round.faults, [{ harness: liar, fault: 'bad-proof' }])
  assert.equal(ruling.votes.length, 4)
  assert.equal(verifyRuling(asc, ruling, { verifiers }).ok, true)
})

test('a forged proof check is refused, and an L2 ruling without proofs is not final', async () => {
  const asc = l2(ex('market-resolution'))
  const { ruling } = await l2Round(asc, provingPool())
  const stranger = createIdentity()
  const forged = { ...ruling, round: { ...ruling.round, proofChecks: ruling.round.proofChecks.map((k, i) => i ? k : { ...k, verifier: 'mallory' }) } }
  assert.match(verifyRuling(asc, forged, { verifiers }).problems.join('; '), /mallory is not a known verifier/)
  assert.ok(stranger.publicKey)
  const bare = { ...ruling, round: { ...ruling.round, proofChecks: [] } }
  assert.match(verifyRuling(asc, bare).problems.join('; '), /not final/)
})

test('proving never blocks the commit', async () => {
  const asc = l2(ex('market-resolution'))
  const h = config.pool[0]
  const prover = { ...mockProver({ model: h.model, complete: mockProvider(script).complete }), prove: () => new Promise(() => {}) }
  const harness = new Harness({ ...h, provider: l2Provider(prover), modelCommitment: mockCommitment(h.model) })
  const c = await Promise.race([harness.commit(asc), new Promise((_, reject) => setTimeout(() => reject(new Error('commit waited on proving')), 1000))])
  assert.match(c.commitment, /^[0-9a-f]{64}$/)
})

test('a long contract splits into proven chunks, map then reduce, every chunk proof attached', async () => {
  const asc = l2(ex('market-resolution'))
  const pool = provingPool(script, { contextTokens: 500 })
  const plan = planInference(await import('../../core/src/index.js').then(m => m.buildPrompt(asc)), { contextTokens: 500 })
  assert.equal(plan.composition, COMPOSITION)
  assert.ok(plan.map.length >= 2)
  assert.ok(plan.map.every(m => countTokens(m.system) + countTokens(m.user) <= 500))
  const { ruling, proved } = await l2Round(asc, pool)
  assert.equal(ruling.passed, true)
  assert.deepEqual(ruling.round.faults, [])
  for (const r of ruling.round.proofRecords) {
    assert.equal(r.composition, COMPOSITION)
    assert.equal(r.chunkProofHashes.length, plan.map.length + 1)
  }
  // Tampering with a chunk's findings breaks the reduce link.
  const r0 = proved[0]
  const b = JSON.parse(r0.bundle)
  b.steps[0].answer = 'something else'
  const tampered = canonical(b)
  const vote = l2Vote(pool, r0.record.harness, asc)
  const res = await verifyBundle(mockVerifier(), asc, { ...r0.record, proofHash: (await import('../../core/src/index.js')).sha256(tampered), chunkProofHashes: b.steps.map(s => s.proofHash) }, tampered, vote)
  assert.equal(res.ok, false)
  assert.match(res.reason, /reduce input is not the map outputs|does not verify/)
})
const l2Vote = (pool, id, asc) => pool.find(p => p.harness.id === id).harness.revealed.get(ascHash(asc)).vote

test('requests are proven in batches of at most proverBatch', async () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  const sizes = []
  const h = config.pool[0]
  const prover = mockProver({ model: h.model, complete: mockProvider(script).complete, onProve: b => sizes.push(b.length) })
  const provider = l2Provider(prover)
  const harness = new Harness({ ...h, provider, modelCommitment: mockCommitment(h.model) })
  const ascs = ['market-resolution', 'fact-check', 'forecast'].map(n => l2(ex(n)))
  for (const a of ascs) { await harness.commit(a); harness.reveal(ascHash(a)) }
  const out = await proveVotes(harness, provider, prover, ascs, { proverBatch: 2 })
  assert.deepEqual(sizes, [2, 1])
  assert.ok(out.every(o => o.record))
})

test('routeInference for L2 uses a local prover or a proving service, never a hosted API', () => {
  const asc = l2(ex('market-resolution'))
  const hostedClaim = { id: 'hosted', family: 'x', model: 'm', kind: 'hosted', proofs: true, usdPerVote: 0.0001 }
  assert.throws(() => routeInference(asc, [hostedClaim]), /no inference route meets L2; the best this harness offers is L1/)
  const routes = [hostedClaim, { id: 'local', kind: 'local-prover', proofs: true, usdPerVote: 0.05 }, { id: 'service', kind: 'proving-service', proofs: true, usdPerVote: 0.03 }]
  assert.equal(routeInference(asc, routes).route.id, 'service')
  assert.equal(routeInference(asc, routes.slice(0, 2)).route.id, 'local')
  assert.equal(routeInference(asc, routes).assurance, 'L2')
})

test('proving as a service: metered per proof, and the harness verifies before it counts', async () => {
  const h = config.pool[3]
  const asc = l2(ex('market-resolution'))
  const real = mockProver({ model: h.model, complete: mockProvider(script, asc.id, h.family).complete })
  let corrupt = false
  const service = async (url, init) => {
    const body = JSON.parse(init.body)
    const op = url.split('/').pop()
    const results = op === 'infer' ? await real.infer(body.requests) : (await real.prove(body.requests)).map(r => corrupt ? { ...r, proofRef: r.proofRef.replace(/"tag":"./, '"tag":"0') } : r)
    return new Response(JSON.stringify({ results }), { status: 200 })
  }
  const paid = []
  const router = new ApiRouter({
    apis: [],
    provers: [{ id: 'prover-co', baseURL: 'https://prover.example', payee: 'prover-co', modelCommitment: mockCommitment(h.model), price: { perProof: 0.002 } }],
    banker: { pay: (payee, amount, purpose) => paid.push({ payee, amount, purpose }) },
    fetch: service,
  })
  const prover = serviceProver({ router, prover: 'prover-co' })
  const provider = l2Provider(prover)
  const harness = new Harness({ ...h, provider, modelCommitment: await prover.commitment() })
  await harness.commit(asc)
  harness.reveal(ascHash(asc))
  const [good] = await proveVotes(harness, provider, prover, [asc], { verifier: mockVerifier() })
  assert.ok(good.record, 'a verified service proof is attached')
  assert.equal(good.record.harness, h.id, 'the harness signs the record and casts the vote')
  const metered = router.meter.find(m => m.purpose === 'proof of inference')
  assert.equal(metered.proofs, 1)
  assert.equal(metered.cost, 0.002)
  assert.deepEqual(paid.at(-1), { payee: 'prover-co', amount: 0.002, purpose: 'prover: proof of inference' })
  corrupt = true
  const [bad] = await proveVotes(harness, provider, prover, [asc], { verifier: mockVerifier() })
  assert.equal(bad.record, undefined)
  assert.match(bad.error, /does not verify; not attached/)
  assert.throws(() => serviceProver({ router, prover: 'nope' }), /no prover named "nope"/)
})

test('DeepProve and FlashProve adapters meet the external contract, by subprocess and by HTTP', async () => {
  const input = { system: 's', user: 'u' }
  for (const [P, V] of [[deepProveProver, deepProveVerifier], [flashProveProver, flashProveVerifier]]) {
    const prover = P({ command: process.execPath, args: [FAKE] })
    const verifier = V({ command: process.execPath, args: [FAKE] })
    const c = await prover.commitment()
    assert.equal(c, mockCommitment('fake-model'))
    const [r] = await prover.prove([{ id: 'a', input }])
    assert.match(r.answer, /^echo:/)
    assert.equal(await verifier.verify(r.proofRef, c, input, r.answer), true)
    assert.equal(await verifier.verify(r.proofRef, mockCommitment('other'), input, r.answer), false)
    const [i] = await prover.infer([{ id: 'a', input }])
    assert.equal(i.answer, r.answer)
  }
  const child = spawn(process.execPath, [FAKE, '--http', '0'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const port = await new Promise(r => child.stdout.once('data', d => r(String(d).match(/listening (\d+)/)[1])))
  try {
    const prover = deepProveProver({ url: `http://127.0.0.1:${port}` })
    const [r] = await prover.prove([{ id: 'x', input }])
    assert.equal(await deepProveVerifier({ url: `http://127.0.0.1:${port}` }).verify(r.proofRef, await prover.commitment(), input, r.answer), true)
    assert.equal(await flashProveVerifier({ url: `http://127.0.0.1:${port}` }).verify(r.proofRef, mockCommitment('other'), input, r.answer), false)
  } finally { child.kill() }
  await assert.rejects(externalProver({ name: 'x', command: process.execPath, args: [FAKE], env: { ...process.env, FAKE_FAIL: '1' } }).commitment(), /exit 1: fake failure/)
  assert.equal(typeof externalVerifier, 'function')
})

test('the FlashProve cp_verify mode accepts only exit 0 with a last line YES, and needs a binding check', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cpv-'))
  try {
    const id = mockCommitment('m')
    const files = Object.fromEntries(['config', 'ivk', 'req', 'y', 'proof'].map(k => [k, join(dir, k)]))
    for (const f of Object.values(files)) writeFileSync(f, 'x')
    writeFileSync(files.proof, `ok:${id}`)
    process.env.FAKE_CP_VERIFY = '1'
    const v = flashProveVerifier({ cpVerify: FAKE, bindsTo: () => true })
    assert.equal(await v.verify(files, id, {}, 'a'), true)
    assert.equal(await v.verify(files, mockCommitment('other'), {}, 'a'), false)
    assert.equal(await flashProveVerifier({ cpVerify: FAKE }).verify(files, id, {}, 'a'), false, 'no binding check, no acceptance')
    assert.equal(await flashProveVerifier({ cpVerify: FAKE, bindsTo: () => false }).verify(files, id, {}, 'a'), false)
  } finally { delete process.env.FAKE_CP_VERIFY; rmSync(dir, { recursive: true, force: true }) }
})
