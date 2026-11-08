/**
 * Proof records for L2 (proof of inference per vote). There is no prover code
 * here: the core stores proof hashes and checks verification results. Provers
 * and verifiers live in `packages/prove`, behind the Prover and Verifier
 * interfaces.
 *
 * The timing, in order:
 *   1. commit    the juror publishes its answer hash (proving never blocks it)
 *   2. reveal    the juror opens its vote
 *   3. prove     before the proof deadline, the juror signs a proof record
 *                (`verafy.proof/1`) carrying the proof hash, and uploads the
 *                proof itself to the availability layer. Only the hash travels.
 *   4. check     verifiers (auditors and nodes) run the CPU verifier and sign
 *                a check (`verafy.proof-check/1`) for each proof hash.
 *
 * Finality: an L2 ruling is final only when every counted vote's proof
 * verifies. A vote with a missing or failed proof is dropped from the count,
 * agreement is recomputed against the bar (a ruling that falls below it takes
 * the below-bar exit and escalates), and the round records a `no-proof` or
 * `bad-proof` fault against that harness's bond.
 * @module @verafyharness/core/proving
 */
import { sha256, canonical } from './hash.js'
import { signMessage, verifyMessage } from './signer.js'
import { PROOF_HASH } from './juror.js'

export const PROOF_RECORD_KIND = 'verafy.proof/1'
export const PROOF_CHECK_KIND = 'verafy.proof-check/1'
/** Assurance levels that need a proof of inference per counted vote. */
export const PROVEN_LEVELS = ['L2', 'L3']
/** Faults a proof can earn, recorded against the harness's bond. */
export const PROOF_FAULTS = ['no-proof', 'bad-proof']
/** The one composition rule a split contract may declare: prove each chunk (map), then prove the combination (reduce). */
export const COMPOSITIONS = ['map-reduce/1']

/**
 * Whether a contract needs a proof per counted vote.
 * @param {object} asc - the contract.
 * @returns {boolean} true for L2 and L3.
 */
export function needsProofs(asc) {
  return PROVEN_LEVELS.includes(asc?.payment?.jury?.assurance)
}

/**
 * The fields a harness signs for a proof record.
 * @param {{harness: string, ascHash: string, commitment: string, modelCommitment: string, proofHash: string, proofRef?: string, chunkProofHashes?: string[], composition?: string}} r - the record.
 * @returns {object} the signed message.
 */
function recordMessage(r) {
  const m = { kind: PROOF_RECORD_KIND, harness: r.harness, ascHash: r.ascHash, commitment: r.commitment, modelCommitment: r.modelCommitment, proofHash: r.proofHash }
  if (r.proofRef !== undefined) m.proofRef = r.proofRef
  // VIP-0009: who ran the proof. Absent means the harness proved its own answer.
  if (r.prover !== undefined) m.prover = r.prover
  if (r.chunkProofHashes !== undefined) { m.chunkProofHashes = r.chunkProofHashes; m.composition = r.composition }
  return m
}

/**
 * Build and sign a proof record. Call it after the reveal, with the hash of the
 * proof bundle already uploaded off chain.
 * @param {{sign: (payload: unknown) => string}} signer - the harness (anything with `sign`).
 * @param {{harness: string, ascHash: string, commitment: string, modelCommitment: string, proofHash: string, proofRef?: string, chunkProofHashes?: string[], composition?: string}} fields -
 *   `commitment` is the vote commitment the proof is for; `proofRef` says where the proof bundle is held (a locator, never the data).
 * @returns {object} the signed record.
 */
export function proofRecord(signer, fields) {
  const m = recordMessage(fields)
  return { ...m, signature: signer.sign(m) }
}

/**
 * Check one proof record against the juror's card and accepted commitment.
 * @param {{id: string, publicKey: string, modelCommitment?: string}} card - the juror.
 * @param {{commitment: string}} c - the accepted vote commitment.
 * @param {object | null | undefined} r - the proof record.
 * @param {string} h - the contract hash.
 * @returns {string | null} the problem, or null when it checks.
 */
export function checkProofRecord(card, c, r, h) {
  if (!r) return 'no proof record'
  if (r.kind !== PROOF_RECORD_KIND) return `a proof record is "${PROOF_RECORD_KIND}"`
  if (r.harness !== card.id) return 'proof record names another harness'
  if (r.ascHash !== h) return 'proof record is for another contract'
  if (r.commitment !== c.commitment) return 'proof record is for another vote commitment'
  if (!card.modelCommitment) return 'the harness card carries no model commitment'
  if (r.modelCommitment !== card.modelCommitment) return 'proof is for a different model commitment than the harness card'
  if (!PROOF_HASH.test(String(r.proofHash))) return 'proofHash is not a SHA-256 hex digest'
  if (r.prover !== undefined && !(typeof r.prover === 'string' && r.prover)) return 'prover must name who ran the proof'
  if (r.chunkProofHashes !== undefined) {
    if (!Array.isArray(r.chunkProofHashes) || r.chunkProofHashes.length < 2) return 'a split contract lists at least two chunk proof hashes'
    if (!r.chunkProofHashes.every(x => PROOF_HASH.test(String(x)))) return 'a chunk proof hash is not a SHA-256 hex digest'
    if (!COMPOSITIONS.includes(r.composition)) return `a split contract declares its composition rule (${COMPOSITIONS.join(', ')})`
  }
  try {
    if (!verifyMessage(card.publicKey, recordMessage(r), r.signature)) return 'bad proof record signature'
  } catch { return 'bad proof record signature' }
  return null
}

/**
 * The fields a verifier signs for a check.
 * @param {{verifier: string, harness: string, ascHash: string, proofHash: string, modelCommitment: string, ok: boolean, reason?: string}} k - the check.
 * @returns {object} the signed message.
 */
function checkMessage(k) {
  const m = { kind: PROOF_CHECK_KIND, verifier: k.verifier, harness: k.harness, ascHash: k.ascHash, proofHash: k.proofHash, modelCommitment: k.modelCommitment, ok: k.ok === true }
  if (k.reason) m.reason = String(k.reason)
  return m
}

/**
 * Sign a verification result. The verifier (an auditor or a node) ran a
 * Verifier from `packages/prove` and reports what it found.
 * @param {string} verifier - the verifier's id.
 * @param {import('node:crypto').KeyObject} privateKey - its signing key.
 * @param {object} record - the proof record it checked.
 * @param {{ok: boolean, reason?: string}} result - the result.
 * @returns {object} the signed check.
 */
export function proofCheck(verifier, privateKey, record, { ok, reason }) {
  const m = checkMessage({ verifier, harness: record.harness, ascHash: record.ascHash, proofHash: record.proofHash, modelCommitment: record.modelCommitment, ok, reason })
  return { ...m, signature: signMessage(privateKey, m) }
}

/**
 * Check a verification result's signature.
 * @param {object} k - the check.
 * @param {Map<string, string> | Record<string, string>} verifiers - verifier id to public key.
 * @returns {string | null} the problem, or null.
 */
export function checkProofCheck(k, verifiers) {
  if (k?.kind !== PROOF_CHECK_KIND) return `a proof check is "${PROOF_CHECK_KIND}"`
  const key = verifiers instanceof Map ? verifiers.get(k.verifier) : verifiers?.[k.verifier]
  if (!key) return `${k.verifier} is not a known verifier`
  try { return verifyMessage(key, checkMessage(k), k.signature) ? null : 'bad proof check signature' } catch { return 'bad proof check signature' }
}

/**
 * Whether the checks for one proof record pass: at least `need` checks say it
 * verifies, and more say it verifies than say it fails.
 * @param {object} record - the proof record.
 * @param {object[]} checks - checks for any record.
 * @param {number} need - checks needed.
 * @returns {{ok: boolean, passed: number, failed: number}} the result.
 */
export function proofVerified(record, checks, need = 1) {
  const mine = (checks ?? []).filter(k => k?.harness === record.harness && k.ascHash === record.ascHash && k.proofHash === record.proofHash && k.modelCommitment === record.modelCommitment)
  const by = new Map()
  for (const k of mine) if (!by.has(k.verifier)) by.set(k.verifier, k.ok === true)
  const passed = [...by.values()].filter(Boolean).length
  const failed = by.size - passed
  return { ok: passed >= need && passed > failed, passed, failed }
}

/**
 * The proof gate a round runs before it counts L2 votes. Pure. Each counted
 * reveal keeps its vote only with a valid, signed proof record for its
 * commitment and model commitment, whose checks pass. Everyone else is dropped
 * and earns a fault.
 * @param {object} asc - the contract.
 * @param {string} h - the contract hash.
 * @param {Map<string, object>} seated - jury cards by id.
 * @param {object[]} accepted - accepted commitments.
 * @param {object[]} counted - reveals that matched their commitments.
 * @param {object[]} records - proof records received before the deadline.
 * @param {object[]} checks - verification results.
 * @returns {{proven: object[], faults: {harness: string, fault: string}[], proofRecords: object[], proofChecks: object[], dropped: {harness: string, fault: string, reason: string}[]}} the gate's result.
 */
export function gateProofs(asc, h, seated, accepted, counted, records = [], checks = []) {
  const need = asc.payment.jury.verifiersPerProof ?? 1
  const commitBy = new Map(accepted.map(c => [c.harness, c]))
  const proven = []
  const dropped = []
  const kept = []
  for (const r of counted) {
    const card = seated.get(r.harness)
    const mine = (records ?? []).filter(x => x?.harness === r.harness)
    const rec = mine.find(x => checkProofRecord(card, commitBy.get(r.harness), x, h) === null)
    if (!rec) {
      dropped.push({ harness: r.harness, fault: mine.length ? 'bad-proof' : 'no-proof', reason: mine.length ? checkProofRecord(card, commitBy.get(r.harness), mine[0], h) : 'no proof record before the deadline' })
      continue
    }
    const record = recordMessage(rec)
    record.signature = rec.signature
    kept.push(record)
    const v = proofVerified(rec, checks, need)
    if (v.ok) proven.push({ ...r, proofHash: rec.proofHash })
    else dropped.push({ harness: r.harness, fault: 'bad-proof', reason: v.passed + v.failed === 0 ? 'no verifier checked the proof' : `${v.passed} verifiers passed it and ${v.failed} failed it; ${need} must pass` })
  }
  const hashes = new Set(kept.map(k => `${k.harness}:${k.proofHash}`))
  const proofChecks = (checks ?? []).filter(k => hashes.has(`${k?.harness}:${k?.proofHash}`) && k.ascHash === h)
    .map(k => ({ ...checkMessage(k), signature: k.signature }))
    .sort((a, b) => (a.harness + a.verifier).localeCompare(b.harness + b.verifier))
  return { proven, dropped, faults: dropped.map(d => ({ harness: d.harness, fault: d.fault })), proofRecords: kept, proofChecks }
}

/**
 * Whether a ruling is final. A ruling that needs no proofs is final when
 * sealed. An L2 ruling is final only when every counted vote carries a proof
 * record whose checks pass.
 * @param {object} asc - the contract.
 * @param {object} ruling - the ruling.
 * @returns {{final: boolean, problems: string[]}} the result.
 */
export function finality(asc, ruling) {
  if (!needsProofs(asc)) return { final: true, problems: [] }
  const need = asc.payment.jury.verifiersPerProof ?? 1
  const records = ruling?.round?.proofRecords ?? []
  const checks = ruling?.round?.proofChecks ?? []
  const problems = []
  for (const v of ruling?.votes ?? []) {
    const rec = records.find(r => r.harness === v.harness && r.proofHash === v.proofHash)
    if (!rec) { problems.push(`${v.harness} is counted without a proof record`); continue }
    if (!proofVerified(rec, checks, need).ok) problems.push(`${v.harness} is counted, but its proof has not verified`)
  }
  return { final: problems.length === 0, problems }
}

/**
 * Faults in a ruling's round, each with the bond it is recorded against.
 * Slashing is a separate step; this is the record it reads.
 * @param {object} ruling - the ruling.
 * @returns {{harness: string, fault: string, bond: number, ascHash: string}[]} the faults.
 */
export function bondFaults(ruling) {
  const cards = new Map((ruling?.round?.jury ?? []).map(c => [c.id, c]))
  return (ruling?.round?.faults ?? []).map(f => ({ harness: f.harness, fault: f.fault, bond: Number(cards.get(f.harness)?.bond ?? 0), ascHash: ruling.ascHash }))
}

/**
 * The hash of an off-chain proof bundle, as a proof record carries it.
 * @param {unknown} bundle - the bundle.
 * @returns {string} SHA-256 hex over its canonical JSON.
 */
export function proofBundleHash(bundle) {
  return sha256(canonical(bundle))
}
