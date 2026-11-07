import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Harness, mockProvider, withRetry, openaiProvider, backoffDelay, isRetryable, ProviderError,
  ascHash, pin, validate, drawJury, drawJuryFor, eligibleJurors, rule, ruleFromRecords, ruleFromReveals, verifyRuling, checkQuorum,
  checkPay, accountFor, conserves, rulingId, seal, blockHeader, sha256, canonical, exportIdentity, createIdentity,
  triggerMessage, signTrigger, verifyTrigger, TRIGGER_KIND,
  escalate, challengeContract, resolveChallenge, appendReview, reviewStatus, audit, verifyAudit, drawAuditors, sampleForAudit,
  carryAccount, escrowAccount,
} from '../src/index.js'

const ex = name => JSON.parse(readFileSync(new URL(`../../../examples/${name}.json`, import.meta.url), 'utf8'))
const mock = ex('mock-answers')
const config = JSON.parse(readFileSync(new URL('../../../verafy.config.json', import.meta.url), 'utf8'))
const poolFor = asc => config.pool.map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
const noSleep = () => Promise.resolve()

/** A provider that fails `failures` times with the given error, then answers. */
function flaky(failures, error, answer = { answer: 'NO', confidence: 0.9, reasoning: 'r', sources: [] }) {
  let calls = 0
  return { get calls() { return calls }, async complete() { calls++; if (calls <= failures) throw error(); return JSON.stringify(answer) } }
}

// ---- 1. Retry for rate-limited models -------------------------------------

test('retry: a provider that returns 429 and then succeeds is retried with capped, jittered backoff', async () => {
  const p = flaky(2, () => new ProviderError('HTTP 429', { status: 429, retryable: true }))
  const waits = []
  const r = withRetry(p, { attempts: 4, baseMs: 100, maxMs: 250, random: () => 0.99, sleep: async ms => { waits.push(ms) } })
  assert.match(await r.complete({}), /"NO"/)
  assert.equal(p.calls, 3)
  assert.deepEqual(waits, [99, 198], 'full jitter over 100 then 200 ms')
  assert.equal(backoffDelay(10, { baseMs: 100, maxMs: 250, random: () => 0.99 }), 247, 'the window is capped at maxMs')
  assert.equal(backoffDelay(0, { maxMs: 250 }, 10_000), 250, 'a long Retry-After is capped too')
})

test('retry: the OpenAI-compatible provider retries 429 and 5xx, honors Retry-After, and gives up on the last attempt', async () => {
  const replies = [
    new Response('slow down', { status: 429, headers: { 'retry-after': '1' } }),
    new Response('bad gateway', { status: 502 }),
    Response.json({ choices: [{ message: { content: '{"answer":"NO","confidence":1}' } }] }),
  ]
  let calls = 0
  const waits = []
  const p = openaiProvider({ baseURL: 'http://fake.invalid/v1', apiKey: 'test-key', fetch: async () => replies[calls++], retry: { sleep: async ms => { waits.push(ms) }, random: () => 0 } })
  assert.equal(await p.complete({ model: 'm', system: 's', user: 'u' }), '{"answer":"NO","confidence":1}')
  assert.equal(calls, 3)
  assert.deepEqual(waits, [1000, 0], 'Retry-After of 1 s, then jitter')

  let always = 0
  const down = openaiProvider({ baseURL: 'http://fake.invalid/v1', apiKey: 'test-key', fetch: async () => { always++; return new Response('overloaded', { status: 503 }) }, retry: { attempts: 3, sleep: noSleep } })
  await assert.rejects(down.complete({ model: 'm', system: 's', user: 'u' }), /HTTP 503 overloaded \(after 3 attempts\)/)
  assert.equal(always, 3)

  let bad = 0
  const refused = openaiProvider({ baseURL: 'http://fake.invalid/v1', apiKey: 'test-key', fetch: async () => { bad++; return new Response('no such model', { status: 400 }) }, retry: { sleep: noSleep } })
  await assert.rejects(refused.complete({ model: 'm', system: 's', user: 'u' }), /HTTP 400/)
  assert.equal(bad, 1, 'a 400 is not retried')

  let net = 0
  const offline = openaiProvider({ baseURL: 'http://fake.invalid/v1', apiKey: 'test-key', fetch: async () => { if (net++ === 0) throw new TypeError('fetch failed'); return Response.json({ choices: [{ message: { content: 'ok' } }] }) }, retry: { sleep: noSleep } })
  assert.equal(await offline.complete({ model: 'm', system: 's', user: 'u' }), 'ok')
  assert.equal(isRetryable(new TypeError('fetch failed')), true)
  assert.equal(isRetryable({ status: 404 }), false)
})

test('retry: a harness that still fails after its retries is dropped from the jury exactly as before', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJury(pool, asc.payment.jury, 'genesis')
  const sealer = pool.find(h => !jury.includes(h))
  let tries = 0
  jury[0].provider = withRetry({ async complete() { tries++; throw new ProviderError('HTTP 429 rate limited', { status: 429, retryable: true }) } }, { attempts: 3, sleep: noSleep })
  const events = []
  const r = await rule(asc, jury, sealer, e => events.push(e))
  assert.equal(tries, 3)
  assert.ok(events.some(e => e.phase === 'commit-failed' && e.harness === jury[0].id && /429 rate limited \(after 3 attempts\)/.test(e.error)))
  assert.equal(r.votes.length, 4)
  assert.equal(r.passed, true, 'four of five meets the quorum of four')
  assert.deepEqual(r.round.faults, [{ harness: jury[0].id, fault: 'no-commit' }])
})

// ---- 2. Core gaps the chain needs ------------------------------------------

async function recorded(asc, harnesses) {
  const commits = []
  for (const h of harnesses) commits.push(await h.commit(asc))
  const reveals = harnesses.map(h => h.reveal(ascHash(asc)))
  return { commits, reveals }
}

test('ruleFromRecords rules from recorded messages, with no stand-in jurors, and matches rule()', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'seed-1')
  const { commits, reveals } = await recorded(asc, jury)
  const fromRecords = ruleFromRecords(asc, commits, reveals, { jury: jury.map(j => j.card), sealer: 'h-sealer', seed: 'seed-1' })
  assert.equal(fromRecords.answer, 'NO')
  assert.equal(fromRecords.round.commits.length, 5)
  assert.equal(fromRecords.round.reveals.every(r => typeof r.salt === 'string'), true, 'salts are kept')
  // The same harnesses re-ruled in-process, with asynchronous reveals, give the same votes.
  const fresh = jury.map(j => new Harness({ ...config.pool.find(p => p.id === j.id), identity: j.identity, provider: mockProvider(mock) }))
  const asyncJury = fresh.map(h => ({ id: h.id, card: h.card, commit: a => h.commit(a), reveal: async x => h.reveal(x) }))
  const inProcess = await rule(asc, asyncJury, { id: 'h-sealer' }, { seed: 'seed-1' })
  assert.deepEqual(inProcess.votes.map(v => [v.harness, v.answer]), fromRecords.votes.map(v => [v.harness, v.answer]))
  assert.deepEqual(inProcess.diff, fromRecords.diff)
})

test('a committed juror that never reveals is left uncounted and recorded as a fault, not thrown', async () => {
  const asc = ex('market-resolution')
  const jury = drawJuryFor(asc, poolFor(asc), 'genesis')
  const { commits, reveals } = await recorded(asc, jury)
  const events = []
  const r = ruleFromRecords(asc, commits, reveals.slice(1), { jury: jury.map(j => j.card), sealer: 'h-sealer', seed: 'genesis', onEvent: e => events.push(e) })
  assert.equal(r.votes.length, 4)
  assert.deepEqual(r.round.faults, [{ harness: jury[0].id, fault: 'no-reveal' }])
  assert.ok(events.some(e => e.phase === 'reveal-failed' && e.harness === jury[0].id && e.error === 'never revealed'))
  // In-process: a harness whose reveal throws (it lost its pending vote) is dropped the same way.
  const jury2 = drawJuryFor(asc, poolFor(asc), 'genesis')
  const quitter = jury2[1]
  const reveal = quitter.reveal.bind(quitter)
  quitter.reveal = () => { quitter.pending.clear(); return reveal('gone') }
  const r2 = await rule(asc, jury2, { id: 'h-sealer' })
  assert.equal(r2.votes.length, 4)
  assert.deepEqual(r2.round.faults, [{ harness: quitter.id, fault: 'no-reveal' }])
})

test('verifyRuling re-verifies a ruling from the ruling alone and names what is wrong', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const seed = 'f'.repeat(64)
  const jury = drawJuryFor(asc, pool, seed)
  const r = await rule(asc, jury, pool.find(h => !jury.includes(h)), { seed })
  const alone = JSON.parse(JSON.stringify(r))
  assert.deepEqual(verifyRuling(asc, alone), { ok: true, problems: [] })
  assert.equal(verifyRuling(asc, alone, { cards: pool.map(h => h.card), pool: pool.map(h => h.card), seed }).ok, true)

  const t1 = structuredClone(alone); t1.answer = 'YES'
  assert.match(verifyRuling(asc, t1).problems.join('\n'), /does not match what its round computes \(answer\)/)
  const t2 = structuredClone(alone); t2.diff[0].delta += 0.01; t2.diff[1].delta -= 0.01
  assert.match(verifyRuling(asc, t2).problems.join('\n'), /not paid equally/)
  const t3 = structuredClone(alone); t3.round.reveals[0].vote.answer = 'YES'
  assert.match(verifyRuling(asc, t3).problems.join('\n'), /reveal: reveal does not match its commitment/)
  assert.match(verifyRuling(asc, alone, { seed: 'other' }).problems.join('\n'), /seed is not the expected parent hash/)
  assert.match(verifyRuling(asc, alone, { pool: pool.map(h => h.card).filter(c => c.id !== jury[0].id) }).problems.join('\n'), /seeded draw|cannot be redrawn/)
  const { round, ...bare } = alone
  assert.deepEqual(verifyRuling(asc, bare).problems, ['ruling carries no round record'])

  const q = checkQuorum(asc, alone.votes.slice(0, 3))
  assert.equal(q.ok, false); assert.equal(q.quorum, 4)
  assert.equal(checkQuorum(asc, alone.votes).ok, true)
  const t4 = structuredClone(alone); t4.round.reveals = t4.round.reveals.slice(0, 3)
  assert.match(verifyRuling(asc, t4).problems.join('\n'), /passed without a quorum/)
})

test('the sealer account is configurable, and the pay rules are an exported check', async () => {
  const asc = ex('market-resolution')
  const jury = drawJuryFor(asc, poolFor(asc), 'genesis')
  const r = await rule(asc, jury, { id: 'node-1' }, { sealerAccount: { id: 'node-1', kind: 'node' } })
  assert.ok(r.diff.some(d => d.account === 'node:node-1' && d.delta > 0))
  assert.ok(!r.diff.some(d => d.account === 'harness:node-1'))
  assert.equal(r.round.sealer, 'node:node-1')
  assert.deepEqual(checkPay(asc, r), [])
  assert.equal(verifyRuling(asc, r).ok, true)
  assert.equal(accountFor('h-x'), 'harness:h-x'); assert.equal(accountFor('node:n'), 'node:n')

  const skimmed = structuredClone(r); skimmed.diff.push({ account: 'harness:stranger', delta: 0.01 }, { account: 'pool:storage', delta: -0.01 })
  assert.match(checkPay(asc, skimmed).join('\n'), /harness:stranger is paid but its vote was not counted/)
  const below = ex('fact-check-escalation')
  const rb = await rule(below, drawJuryFor(below, poolFor(below), 'genesis'), { id: 'node-1' }, { sealerAccount: 'node:node-1' })
  assert.equal(rb.passed, false)
  assert.deepEqual(checkPay(below, rb), [])
  const paidBelow = structuredClone(rb); paidBelow.diff.push({ account: 'node:node-1', delta: 0.1 }, { account: carryAccount(below), delta: -0.1 })
  assert.match(checkPay(below, paidBelow).join('\n'), /never pays jurors or the sealer[\s\S]*carry its whole escrow/)
})

test('drawJury filters by bond and draws the same jury as a caller that filtered first', () => {
  const asc = ex('delay-cover')
  const cards = [...config.pool, { id: 'h-tiny-1', family: 'mistral', model: 'm', bond: 10 }, { id: 'h-tiny-2', family: 'mistral', model: 'm', bond: 249 }]
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'genesis']) {
    const jury = drawJuryFor(asc, cards, seed)
    assert.ok(jury.every(j => j.bond >= asc.payment.maxValuePerVote), seed)
    const prefiltered = drawJury(cards.filter(c => c.bond >= 250), asc.payment.jury, seed)
    assert.deepEqual(jury.map(j => j.id), prefiltered.map(j => j.id))
  }
  assert.equal(eligibleJurors(cards, asc).length, config.pool.length)
  assert.throws(() => drawJury(cards, asc.payment.jury, 'x', { minBond: 1000 }), /bonded for 1000/)
})

test('a Harness loads and keeps its identity instead of always generating one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vh-id-'))
  const file = join(dir, 'keys', 'identity.pem')
  const a = new Harness({ ...config.pool[0], provider: null, identityFile: file })
  assert.equal(statSync(file).mode & 0o777, 0o600)
  const b = new Harness({ ...config.pool[0], provider: null, identityFile: file })
  assert.equal(a.card.publicKey, b.card.publicKey, 'a restarted harness is the same harness')
  const kept = createIdentity()
  assert.equal(new Harness({ ...config.pool[0], provider: null, identity: exportIdentity(kept) }).card.publicKey, kept.publicKey)
  assert.equal(new Harness({ ...config.pool[0], provider: null, identity: kept }).card.publicKey, kept.publicKey)
  assert.throws(() => new Harness({ ...config.pool[0], provider: null, identity: { ...kept, publicKey: createIdentity().publicKey } }), /does not match/)
  assert.notEqual(new Harness({ ...config.pool[0], provider: null }).card.publicKey, a.card.publicKey)
})

test('mockProvider is not bound to one contract: one long-lived harness answers several', async () => {
  const h = new Harness({ ...config.pool[0], provider: mockProvider(mock) })
  for (const n of ['market-resolution', 'fact-check', 'forecast']) {
    const asc = ex(n)
    await h.commit(asc)
    assert.equal(h.reveal(ascHash(asc)).vote.answer, mock[asc.id].mistral.answer)
  }
  await assert.rejects(new Harness({ ...config.pool[0], provider: mockProvider(mock, 'nope') }).commit(ex('fact-check')), /no scripted answer for nope \/ mistral/)
})

test('verafy.trigger/1: a call trigger is released only by a quorum of counted jurors', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const r = await rule(asc, jury, pool.find(h => !jury.includes(h)))
  const block = seal(null, [r], pool[0], { time: '2026-11-06T12:00:00Z' })
  const msg = triggerMessage(r, r.triggers[0], { block: block.hash })
  assert.equal(msg.kind, TRIGGER_KIND)
  const sigs = jury.map(j => signTrigger(j, msg))
  assert.deepEqual(verifyTrigger(msg, sigs, r, { asc }).ok, true)
  assert.match(verifyTrigger(msg, sigs.slice(0, 3), r, { asc }).problems[0], /3 valid signatures .* quorum is 4/)
  const outsider = pool.find(h => !jury.includes(h))
  assert.equal(verifyTrigger(msg, [...sigs.slice(0, 3), signTrigger(outsider, msg), sigs[0]], r, { asc }).signers.length, 3, 'outsiders and repeats do not count')
  const forged = { ...msg, trigger: { ...msg.trigger, args: ['YES'] } }
  assert.match(verifyTrigger(forged, jury.map(j => signTrigger(j, forged)), r, { asc }).problems.join('\n'), /not one the ruling emitted/)
  assert.throws(() => triggerMessage(r, { type: 'call', chain: 'solana', target: 'market.settle', args: ['YES'] }), /not one the ruling emitted/)
})

test('votes may carry a proofHash; proofs themselves stay off chain', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const proofHash = sha256('an off-chain proof of this inference')
  const inner = jury[0].provider
  jury[0].provider = { async complete(req) { return { content: await inner.complete(req), proofHash } } }
  const r = await rule(asc, jury, { id: 'h-sealer' })
  assert.equal(r.votes.find(v => v.harness === jury[0].id).proofHash, proofHash)
  assert.equal(r.votes.filter(v => v.proofHash).length, 1)
  assert.equal(verifyRuling(asc, r).ok, true)
  const withProof = structuredClone(r); withProof.votes[0].proof = 'deadbeef'
  assert.match(verifyRuling(asc, withProof).problems.join('\n'), /proofs stay off chain; found "votes.0.proof"/)
  jury[1].provider = { async complete() { return { content: '{"answer":"NO","confidence":1}', proofHash: 'not-a-hash' } } }
  await assert.rejects(jury[1].commit(asc), /proofHash must be a SHA-256 hex digest/)
})

test('seal takes an explicit timestamp, so any node rebuilds the same header', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const r = await rule(asc, jury, pool[7])
  const a = seal(null, [r], pool[7], { time: '2026-11-06T12:00:00Z' })
  const b = seal(null, [JSON.parse(JSON.stringify(r))], pool[7], '2026-11-06T12:00:00.000Z')
  assert.equal(a.hash, b.hash)
  assert.equal(a.time, '2026-11-06T12:00:00.000Z')
  assert.equal(sha256(blockHeader(a)), a.hash)
  assert.throws(() => seal(null, [r], pool[7], { time: 'not a date' }), /not a date/)
  assert.throws(() => seal(null, [r], pool[7], { reviews: [{ by: 'x' }] }), /sealed only with the challenge ruling/)
})

// ---- 3. Auditors, challenges and escalation (milestone 3) -------------------

const OTHER_LABS = ['mistral', 'xai', 'moonshot', 'zai', 'cohere']

test('escalation: below-bar escrow is carried to a wider jury drawn from families not on the original jury', async () => {
  const asc = ex('fact-check-escalation')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const first = await rule(asc, jury, pool.find(h => !jury.includes(h)), { seed: 'genesis' })
  assert.equal(first.passed, false)
  assert.throws(() => escalate(ex('market-resolution'), first), /another contract/)

  const up = escalate(asc, first)
  assert.deepEqual(validate(up), [])
  assert.equal(up.payment.escrow, asc.payment.escrow)
  assert.equal(up.payment.jury.size, 9)
  assert.equal(up.escalation.from, rulingId(first))
  assert.equal(escrowAccount(up), carryAccount(asc))
  const juryLabs = new Set(jury.map(j => j.family))
  assert.deepEqual(new Set(up.payment.jury.excludeFamilies), juryLabs)

  // A wider pool: two harnesses on each of five more families, scripted to grade the claim misleading.
  const script = { [up.id]: Object.fromEntries([...OTHER_LABS, ...config.pool.map(p => p.family)].map(l => [l, { answer: 'misleading', confidence: 0.9, reasoning: 'Half only in a subgroup.', sources: ['c0'] }])) }
  const wide = [...pool, ...OTHER_LABS.flatMap(l => [1, 2].map(n => new Harness({ id: `h-${l}-${n}`, family: l, model: `${l}/m`, bond: 500, provider: mockProvider(script) })))]
  for (const h of pool) h.provider = mockProvider(script)
  const seed = sha256('block 5')
  const jury2 = drawJuryFor(up, wide, seed)
  assert.equal(jury2.length, 9)
  assert.ok(jury2.every(j => !juryLabs.has(j.family) && !jury.includes(j)), 'no family and no harness from the original jury')
  const second = await rule(up, jury2, wide.find(h => !jury2.includes(h)), { seed })
  assert.equal(second.passed, true)
  assert.equal(second.answer, 'misleading')
  assert.equal(second.votes.length, 9)
  assert.deepEqual(checkPay(up, second), [])
  assert.equal(verifyRuling(up, second, { pool: wide.map(h => h.card), seed }).ok, true)
  // Across both rulings the carry account nets to zero and totals conserve.
  const both = [...first.diff, ...second.diff]
  assert.ok(conserves(both))
  assert.equal(Math.abs(both.filter(d => d.account === carryAccount(asc)).reduce((s, d) => s + d.delta, 0)) < 1e-9, true)
  assert.throws(() => escalate(up, second), /only a ruling below the bar escalates/)
})

/** A contract built for the poison path: a pinned page that turns out to be forged. */
function shipmentContract() {
  return pin({
    kind: 'verafy.asc/1',
    id: 'cover-shipment-1182',
    title: 'Did shipment 1182 arrive by Nov 3?',
    instructions: 'Decide from the pinned carrier records whether shipment 1182 was delivered on or before Nov 3, 2026. Answer YES or NO.',
    context: [
      { kind: 'link', url: 'https://carrier.example/track/1182', snapshotAt: '2026-11-04T09:00:00Z', content: 'Tracking 1182: Delivered Nov 2, 2026, 14:10, front desk.' },
      { kind: 'policy', content: 'Delivery means a carrier scan of delivered at the consignee address.' },
    ],
    question: { prompt: 'Was shipment 1182 delivered on or before Nov 3, 2026?', answer: { type: 'verdict', options: ['YES', 'NO'] } },
    payment: { escrow: 1, currency: 'USDC', chain: 'solana', bar: 0.6, jury: { size: 3, minFamilies: 3, quorum: 2 }, split: { jurors: 0.8, auditors: 0.1, storage: 0.05, sealer: 0.05 } },
    exits: [
      { outcome: 'YES', effect: { type: 'call', chain: 'solana', target: 'cover.close', args: ['delivered'] } },
      { outcome: 'NO', effect: { type: 'call', chain: 'solana', target: 'cover.pay', args: ['late'] } },
      { outcome: '*below-bar', effect: { type: 'escalate', jurySize: 5 } },
    ],
  })
}

/** A fake model that rules on whatever evidence it is shown. */
const readsEvidence = {
  async complete({ user }) {
    const forged = /not issued by the carrier/.test(user)
    return JSON.stringify({ answer: forged ? 'NO' : 'YES', confidence: 0.9, reasoning: forged ? 'The carrier says the Nov 2 page was forged; first delivery scan Nov 6.' : 'The tracking page shows delivered Nov 2.', sources: ['c0'] })
  },
}
const labs8 = ['mistral', 'gpt-oss', 'gemma', 'llama', 'qwen', 'deepseek', 'mistral', 'xai']
const evidencePool = () => labs8.map(l => new Harness({ id: `h-${l}`, family: l, model: `${l}/m`, bond: 100, provider: readsEvidence }))
const correction = { kind: 'document', url: 'https://carrier.example/notices/1182', snapshotAt: '2026-11-07T10:00:00Z', content: 'Carrier notice: the Nov 2 page for 1182 was not issued by the carrier. First delivery scan: Nov 6, 2026, 11:02.' }

test('poison, then challenge, then overturned: the original ruling is never edited', async () => {
  const asc = shipmentContract()
  assert.deepEqual(validate(asc), [])
  const pool = evidencePool()
  const seed = 'genesis'
  const jury = drawJuryFor(asc, pool, seed)
  const sealer = pool.find(h => !jury.includes(h))
  const original = await rule(asc, jury, sealer, { seed })
  assert.equal(original.answer, 'YES', 'the jury ruled on the forged page, as pinned')
  assert.equal(original.passed, true)
  const b1 = seal(null, [original], sealer, { time: '2026-11-04T12:00:00Z' })
  const frozen = canonical(original)
  const id = rulingId(original)

  // An auditor from another family re-checks it: the record verifies, and on the same evidence it agrees. Audits do not catch forged evidence; challenges do.
  const auditor = drawAuditors(pool, original, b1.hash)[0]
  const rep = await audit(asc, original, auditor, { pool: pool.map(h => h.card), seed })
  assert.equal(rep.verified, true); assert.equal(rep.flagged, false)

  // The challenge: false evidence, with the carrier's notice as new material.
  assert.throws(() => challengeContract(asc, original, { grounds: 'false-evidence' }), /must bring evidence/)
  assert.throws(() => challengeContract(asc, original, { grounds: 'gut-feeling', evidence: [correction] }), /grounds must be one of/)
  const ch = challengeContract(asc, original, { grounds: 'false-evidence', evidence: [correction] })
  assert.deepEqual(validate(ch), [])
  assert.equal(ch.review.ruling, id)
  assert.equal(ch.context[0].kind, 'ruling')
  assert.equal(ch.context.at(-1).label, 'new evidence')
  assert.ok(ch.exits.every(e => e.effect.type === 'record'), 'a challenge records; it never fires the original calls again')
  assert.throws(() => challengeContract(asc, original, { grounds: 'new-evidence', evidence: [asc.context[0]] }), /no earlier ruling or review considered/)

  const jury2 = drawJuryFor(ch, pool, b1.hash)
  const origLabs = new Set(jury.map(j => j.family))
  assert.ok(jury2.every(j => !origLabs.has(j.family)), 'the challenge jury shares no family with the original')
  const sealer2 = pool.find(h => !jury2.includes(h))
  const overturning = await rule(ch, jury2, sealer2, { seed: b1.hash })
  assert.equal(overturning.answer, 'NO')
  assert.equal(verifyRuling(ch, overturning, { pool: pool.map(h => h.card), seed: b1.hash }).ok, true)

  const review = resolveChallenge(ch, overturning, original)
  assert.equal(review.result, 'overturn')
  const log = appendReview([], review)
  assert.equal(reviewStatus(id, log), 'overturned')
  assert.throws(() => appendReview(log, review), /already reviewed/)
  const b2 = seal(b1, [overturning], sealer2, { time: '2026-11-07T12:00:00Z', reviews: [review] })
  assert.equal(b2.reviews[0].result, 'overturn')
  assert.ok(b2.reviewsRoot)
  assert.equal(canonical(original), frozen, 'the original ruling is unchanged')
  assert.equal(rulingId(b1.rulings[0]), id)
  assert.equal(verifyRuling(asc, b1.rulings[0]).ok, true, 'and it still verifies as sealed')
})

test('challenge results: affirm, supersede under changed rules, and stands when the challenge jury falls below the bar', async () => {
  const asc = shipmentContract()
  const pool = evidencePool()
  const jury = drawJuryFor(asc, pool, 'genesis')
  const original = await rule(asc, jury, pool.find(h => !jury.includes(h)), { seed: 'genesis' })

  const support = { kind: 'document', content: 'Front desk log: parcel 1182 signed for Nov 2, 14:12.' }
  const chA = challengeContract(asc, original, { grounds: 'new-evidence', evidence: [support] })
  const jA = drawJuryFor(chA, pool, 's1')
  const rA = await rule(chA, jA, pool.find(h => !jA.includes(h)))
  assert.equal(resolveChallenge(chA, rA, original).result, 'affirm')

  const rules2 = [asc.context[0], { kind: 'policy', content: 'From Nov 5: delivery means a carrier scan; carrier notices override tracking pages. ' + correction.content }]
  const chS = challengeContract(asc, original, { grounds: 'changed-rules', context: rules2 })
  const jS = drawJuryFor(chS, pool, 's2')
  const rS = await rule(chS, jS, pool.find(h => !jS.includes(h)))
  const sup = resolveChallenge(chS, rS, original)
  assert.equal(sup.result, 'supersede')

  const chN = challengeContract(asc, original, { grounds: 'error' })
  const jN = drawJuryFor(chN, pool, 's3')
  const split = { async complete({ family }) { return JSON.stringify({ answer: family === jN[0].family ? 'NO' : 'YES', confidence: 0.5, reasoning: 'unsure', sources: [] }) } }
  for (const h of jN) h.provider = split
  chN.payment.bar = 0.9
  const rN = await rule(chN, jN, pool.find(h => !jN.includes(h)))
  assert.equal(rN.passed, false)
  const stands = resolveChallenge(chN, rN, original)
  assert.equal(stands.result, 'stands')
  let log = appendReview([], stands)
  assert.equal(reviewStatus(rulingId(original), log), 'none')
  log = appendReview(log, sup)
  assert.equal(reviewStatus(rulingId(original), log), 'superseded')
  assert.throws(() => challengeContract(asc, rN.passed ? rN : { ...original, passed: false }, { grounds: 'error' }), /only a final ruling can be challenged/)
})

test('auditors from another family re-check sealed rulings and flag disagreement or a bad record', async () => {
  const asc = ex('market-resolution')
  const pool = poolFor(asc)
  const jury = drawJuryFor(asc, pool, 'genesis')
  const r = await rule(asc, jury, pool.find(h => !jury.includes(h)), { seed: 'genesis' })
  const [auditor] = drawAuditors(pool, r, 'b1')
  assert.ok(!jury.some(j => j.family === auditor.family))
  const ok = await audit(asc, r, auditor)
  assert.equal(ok.verified, true); assert.equal(ok.agrees, true); assert.equal(ok.flagged, false)
  assert.equal(verifyAudit(ok, auditor.card), true)
  assert.equal(verifyAudit({ ...ok, agrees: false }, auditor.card), false)

  const dissenter = new Harness({ id: 'h-audit-x', family: auditor.family, model: 'm', bond: 500, provider: { async complete() { return '{"answer":"YES","confidence":0.8,"reasoning":"r"}' } } })
  const flagged = await audit(asc, r, dissenter)
  assert.equal(flagged.agrees, false); assert.equal(flagged.flagged, true)
  const tampered = structuredClone(r); tampered.votes[0].confidence = 0.1
  const bad = await audit(asc, tampered, auditor)
  assert.equal(bad.verified, false); assert.equal(bad.flagged, true)
  await assert.rejects(audit(asc, r, jury[0]), /a model family on the jury/)

  const rulings = Array.from({ length: 40 }, (_, i) => ({ ...r, agreement: i }))
  const s1 = sampleForAudit(rulings, 'seed', 0.25)
  assert.deepEqual(s1, sampleForAudit(rulings, 'seed', 0.25))
  assert.ok(s1.length > 0 && s1.length < 40)
})

test('ruleFromReveals still rules from separate processes and applies the bond floor', async () => {
  const asc = ex('delay-cover')
  const entries = []
  for (const p of [...config.pool, { id: 'h-tiny', family: 'qwen', model: 'qwen/qwen3-235b-a22b-2507', bond: 5 }]) {
    const h = new Harness({ ...p, provider: mockProvider(mock), payments: undefined })
    h.bond = 500 // intake would refuse a small bond; force it to commit so the draw is what keeps it out
    const c = await h.commit(asc)
    entries.push({ card: { ...h.card, bond: p.bond }, commit: c, reveal: h.reveal(ascHash(asc)) })
  }
  const events = []
  const r = ruleFromReveals(asc, entries, 'h-sealer', 'genesis', e => events.push(e))
  assert.ok(!r.round.jury.some(j => j.id === 'h-tiny'))
  assert.ok(events.some(e => e.phase === 'commit-failed' && e.harness === 'h-tiny' && e.error === 'not drawn for this jury'))
  assert.equal(events[0].phase, 'propose')
  assert.equal(verifyRuling(asc, r, { pool: entries.map(e => e.card), seed: 'genesis' }).ok, true)
})
