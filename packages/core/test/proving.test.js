import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Harness, mockProvider, ascHash, rule, ruleFromRecords, verifyRuling, createIdentity, signMessage, sha256,
  proofRecord, checkProofRecord, proofCheck, checkProofCheck, proofVerified, needsProofs, finality,
} from '../src/index.js'

// Core alone: no prover code. Proof hashes are opaque digests here.
const ex = name => JSON.parse(readFileSync(new URL(`../../../examples/${name}.json`, import.meta.url), 'utf8'))
const mock = ex('mock-answers')
const config = JSON.parse(readFileSync(new URL('../../../verafy.config.json', import.meta.url), 'utf8'))

test('a proof record must match the harness card, the vote commitment and the model commitment', () => {
  const h = new Harness({ ...config.pool[0], provider: null, modelCommitment: sha256('model') })
  const c = { commitment: sha256('vote') }
  const fields = { harness: h.id, ascHash: sha256('asc'), commitment: c.commitment, modelCommitment: h.modelCommitment, proofHash: sha256('bundle') }
  const r = proofRecord(h, fields)
  assert.equal(checkProofRecord(h.card, c, r, fields.ascHash), null)
  assert.match(checkProofRecord(h.card, c, proofRecord(h, { ...fields, modelCommitment: sha256('other') }), fields.ascHash), /different model commitment/)
  assert.match(checkProofRecord(h.card, { commitment: sha256('x') }, r, fields.ascHash), /another vote commitment/)
  assert.match(checkProofRecord(h.card, c, { ...r, proofHash: sha256('swapped') }, fields.ascHash), /bad proof record signature/)
  assert.match(checkProofRecord(h.card, c, proofRecord(h, { ...fields, chunkProofHashes: [sha256('a'), sha256('b')] }), fields.ascHash), /declares its composition rule/)
  assert.match(checkProofRecord({ ...h.card, modelCommitment: undefined }, c, r, fields.ascHash), /no model commitment/)
})

test('proof checks are signed by known verifiers and pass by count', () => {
  const v1 = createIdentity()
  const v2 = createIdentity()
  const rec = { harness: 'h', ascHash: sha256('a'), proofHash: sha256('p'), modelCommitment: sha256('m') }
  const ok1 = proofCheck('v1', v1.privateKey, rec, { ok: true })
  const no2 = proofCheck('v2', v2.privateKey, rec, { ok: false, reason: 'no' })
  assert.equal(checkProofCheck(ok1, new Map([['v1', v1.publicKey]])), null)
  assert.match(checkProofCheck(ok1, new Map([['v1', v2.publicKey]])), /bad proof check signature/)
  assert.equal(proofVerified(rec, [ok1], 1).ok, true)
  assert.equal(proofVerified(rec, [ok1, no2], 1).ok, false, 'a tie does not pass')
  assert.equal(proofVerified(rec, [ok1], 2).ok, false)
  assert.equal(signMessage.length, 2)
})

test('L1 rulings are untouched by the proof gate and may not carry proof records', async () => {
  const asc = ex('market-resolution')
  assert.equal(needsProofs(asc), false)
  const jury = config.pool.slice(0, 5).map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family) }))
  const ruling = await rule(asc, jury, jury[0])
  assert.equal(ruling.round.proofRecords, undefined)
  assert.deepEqual(finality(asc, ruling), { final: true, problems: [] })
  const tagged = { ...ruling, round: { ...ruling.round, proofRecords: [] } }
  assert.match(verifyRuling(asc, tagged).problems.join('; '), /needs no proofs carries proof records/)
})

test('an L2 round with no proofs counts no votes and escalates', async () => {
  const base = ex('market-resolution')
  const asc = { ...base, payment: { ...base.payment, jury: { ...base.payment.jury, assurance: 'L2' } } }
  const jurors = config.pool.slice(0, 5).map(h => new Harness({ ...h, provider: mockProvider(mock, asc.id, h.family), modelCommitment: sha256(h.model) }))
  const commits = await Promise.all(jurors.map(j => j.commit(asc)))
  const reveals = jurors.map(j => j.reveal(ascHash(asc)))
  const ruling = ruleFromRecords(asc, commits, reveals, { jury: jurors.map(j => j.card), sealer: 'node:n' })
  assert.equal(ruling.votes.length, 0)
  assert.equal(ruling.passed, false)
  assert.deepEqual(ruling.round.faults.map(f => f.fault), ['no-proof', 'no-proof', 'no-proof', 'no-proof', 'no-proof'])
  assert.equal(ruling.round.reveals.length, 5, 'the reveals stay on the record')
})

test('verafy harness commit-model writes the commitment onto the pool entry, and refuses a malformed one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'commit-model-'))
  try {
    const file = join(dir, 'verafy.config.json')
    writeFileSync(file, JSON.stringify(config))
    const cli = fileURLToPath(new URL('../../../bin/verafy.js', import.meta.url))
    const id = sha256('a FlashProve commitment ID')
    const ok = spawnSync(process.execPath, [cli, 'harness', 'commit-model', 'h-llama-1', id, '--config', file], { encoding: 'utf8' })
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.match(ok.stdout, new RegExp(`h-llama-1: model commitment set to ${id}`))
    const after = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(after.pool.find(h => h.id === 'h-llama-1').modelCommitment, id)
    assert.equal(new Harness({ ...after.pool.find(h => h.id === 'h-llama-1'), provider: null }).card.modelCommitment, id)
    const bad = spawnSync(process.execPath, [cli, 'harness', 'commit-model', 'h-llama-1', 'NOT-HEX', '--config', file], { encoding: 'utf8' })
    assert.equal(bad.status, 2)
    const none = spawnSync(process.execPath, [cli, 'harness', 'commit-model', 'h-nobody', id, '--config', file], { encoding: 'utf8' })
    assert.equal(none.status, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
