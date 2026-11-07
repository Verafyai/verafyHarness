/**
 * A harnessed validator: one AI model wrapped with intake, a context loader,
 * guardrails, a signer, a contract runtime, a bond and a track record.
 * @module @verafyharness/core/harness
 */
import { ascHash, validate } from './asc.js'
import { loadContext, deliberate } from './juror.js'
import { createIdentity, importIdentity, loadIdentity, commit, signMessage } from './signer.js'
import { acceptsPayment } from './payments.js'
import { fundingCheck } from './sourcechain.js'
import { DECLINE_KIND } from './network.js'

export class Harness {
  /**
   * @param {{id: string, family: string, model: string, bond: number, provider: object, payments?: object, identity?: object | string, identityFile?: string}} options -
   *   the harness setup. `payments` is the harness's payment router config.
   *   `identity` keeps a key the caller already holds (an identity, KeyObject or
   *   PKCS#8 PEM); `identityFile` loads the key from a PEM file, creating it on
   *   first use. With neither, the harness makes a fresh key, as before.
   *   `sourceChain` (optional, off by default) is a light-client checker such as
   *   `@verafyharness/lightclient`'s `sourceChain()`; `admit` uses it to check
   *   funding on the source chain, and `pauses` records contracts it pauses.
   *   `modelCommitment` (L2 only) is the prover's commitment to the model's
   *   weights, published on the card; proofs are checked against it.
   *   `declines` (optional) is this harness's own ethics policy: a function of
   *   the contract that returns a reason to decline the seat, or null to sit.
   *   A decline on ethics grounds is never a fault (Constitution Article 3.4).
   */
  constructor({ id, family, lab, model, operator = null, bond, provider, payments, identity, identityFile, sourceChain = null, pauses = null, modelCommitment = null, declines = null }) {
    this.declines = declines
    this.sourceChain = sourceChain
    this.pauses = pauses
    this.id = id
    this.payments = payments
    /** The open-weight model family this harness runs (`lab` is the pre-0.0.3 name, read the same way). */
    this.family = family ?? lab
    this.lab = this.family
    this.legacyLab = family === undefined && lab !== undefined
    /** The operator key that runs this harness (VIP-0003), or null. */
    this.operator = operator
    this.model = model
    this.bond = bond
    this.provider = provider
    this.identity = identity ? importIdentity(identity) : identityFile ? loadIdentity(identityFile) : createIdentity()
    this.record = { votes: 0, audited: 0, faults: 0 }
    this.pending = new Map()
    this.modelCommitment = modelCommitment
    /** Revealed votes by contract hash, kept so an L2 harness can prove them after the reveal. */
    this.revealed = new Map()
  }

  /** The public description other harnesses and sealers see. */
  get card() {
    return { id: this.id, ...(this.legacyLab ? { lab: this.family } : { family: this.family }), model: this.model, bond: this.bond, publicKey: this.identity.publicKey, ...(this.modelCommitment ? { modelCommitment: this.modelCommitment } : {}), ...(this.operator ? { operator: this.operator.key ?? this.operator, ...(this.operator.signature ? { operatorSignature: this.operator.signature } : {}) } : {}) }
  }

  /**
   * Intake: refuse a contract that is malformed, unfunded, or larger than this
   * harness's bond allows it to decide.
   * @param {object} asc - the contract.
   * @returns {string[]} reasons to refuse; empty to accept.
   */
  intake(asc) {
    const problems = validate(asc)
    if (asc.payment?.maxValuePerVote && asc.payment.maxValuePerVote > this.bond) problems.push(`bond ${this.bond} is below the contract's ${asc.payment.maxValuePerVote} per vote`)
    if (asc.payment && !acceptsPayment(this.payments, asc.payment)) problems.push(`does not accept ${asc.payment.currency} on ${asc.payment.chain ?? 'any chain'}`)
    return problems
  }

  /**
   * Intake, then the funding check on the source chain, before a contract is
   * queued. Without a light client this is `intake` alone. A funding read
   * whose sources disagree pauses the contract (recorded in `pauses`) and
   * refuses it; it never proceeds on one source.
   * @param {object} asc - the contract.
   * @param {{require?: boolean}} [options] - refuse a contract with no `payment.source` when a light client is set.
   * @returns {Promise<{admitted: boolean, problems: string[], funding: object}>} the decision and the funding read.
   */
  async admit(asc, { require = false } = {}) {
    const problems = this.intake(asc)
    if (problems.length) return { admitted: false, problems, funding: { checked: false, reason: 'refused at intake' } }
    const funding = await fundingCheck(asc, { sourceChain: this.sourceChain, pauses: this.pauses, require })
    return { admitted: funding.ok, problems: funding.problems, funding }
  }

  /**
   * Commit phase: load and check context, deliberate, then publish only a commitment.
   * A harness whose own ethics policy (`declines`) refuses the contract returns a
   * signed decline instead, and never deliberates.
   * @param {object} asc - the contract.
   * @returns {Promise<{harness: string, commitment: string, attestation: object, signature: string}>} the commitment.
   */
  async commit(asc) {
    const reason = this.declines?.(asc)
    if (reason) return this.decline(asc, reason)
    const refused = this.intake(asc)
    if (refused.length) throw new Error(`${this.id} refused: ${refused.join('; ')}`)
    const loaded = loadContext(asc)
    if (!loaded.ok) throw new Error(`${this.id} context check failed: ${loaded.problems.join('; ')}`)
    const h = ascHash(asc)
    const vote = await deliberate(asc, this.provider, this.model, { family: this.family })
    const { commitment, salt } = commit(h, vote)
    this.pending.set(h, { vote, salt, commitment })
    const attestation = { harness: this.id, ...(this.legacyLab ? { lab: this.family } : { family: this.family }), model: this.model, ascHash: h, commitment }
    return { harness: this.id, commitment, attestation, signature: signMessage(this.identity.privateKey, attestation) }
  }

  /**
   * Decline a seat on ethics grounds (Article 3.4): a signed record in place of
   * a commitment. The seat is not counted, and it is never a fault.
   * @param {object} asc - the contract.
   * @param {string} reason - why this harness will not sit.
   * @returns {{kind: string, harness: string, ascHash: string, grounds: 'ethics', reason: string, signature: string}} the decline.
   */
  decline(asc, reason) {
    const message = { kind: DECLINE_KIND, harness: this.id, ascHash: ascHash(asc), grounds: 'ethics', reason: String(reason) }
    return { ...message, signature: signMessage(this.identity.privateKey, message) }
  }

  /**
   * Reveal phase: open the vote behind the commitment.
   * @param {string} h - the contract hash.
   * @returns {{harness: string, vote: object, salt: string, signature: string}} the reveal.
   */
  reveal(h) {
    const p = this.pending.get(h)
    if (!p) throw new Error(`${this.id} has nothing committed for ${h}`)
    this.pending.delete(h)
    this.revealed.set(h, { vote: p.vote, commitment: p.commitment })
    this.record.votes++
    const message = { harness: this.id, ascHash: h, vote: p.vote, salt: p.salt }
    return { ...message, signature: signMessage(this.identity.privateKey, message) }
  }

  /**
   * Sign a payload with this harness's key, such as a sealed block or a trigger.
   * @param {unknown} payload - the payload.
   * @returns {string} base64 signature.
   */
  sign(payload) {
    return signMessage(this.identity.privateKey, payload)
  }
}
