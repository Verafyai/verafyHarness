/**
 * Actually Smart Contracts: the four-part request every harness rules on.
 *
 *   context   links, text and policies, each pinned by SHA-256
 *   question  what must be decided, and the form of the answer
 *   payment   escrow, jury rules and the bar the jury must clear, and
 *             optionally when it may seal (`minBatch`, `maxWaitSeconds`)
 *   exits     the only things the contract can do with an answer
 *
 * @module @verafyharness/core/asc
 */
import { sha256 } from './hash.js'
import { validateExitProgram, paramsSchema } from './exitprogram.js'

export const ASC_KIND = 'verafy.asc/1'
/** The pre-rename contract kind. It still validates, and a contract that carries it keeps its hash. */
export const LEGACY_ASC_KIND = 'swarm.asc/0'
/** Every contract kind the validator accepts. */
export const ASC_KINDS = [ASC_KIND, LEGACY_ASC_KIND]
export const ANSWER_TYPES = ['verdict', 'forecast', 'graded']
export const CONTEXT_KINDS = ['link', 'text', 'policy', 'document', 'repo', 'ruling']
/** A challenge contract (`asc.review`): a new contract that reviews a sealed ruling. */
export const CHALLENGE_KIND = 'swarm.challenge/0'
/** An escalated contract (`asc.escalation`): funded by the escrow a below-bar ruling carried. */
export const ESCALATION_KIND = 'swarm.escalation/0'
/** Grounds a challenge may state, from the draft rulings SIMD (0 to 3). */
export const GROUNDS = ['new-evidence', 'false-evidence', 'error', 'changed-rules']
export const EFFECT_TYPES = ['pay', 'refund', 'hold', 'record', 'call', 'escalate']
/** The reserved exit taken when agreement is below the bar. */
export const BELOW_BAR = '*below-bar'

/**
 * Hash the bytes a context entry pins. Links and documents pin their snapshot text.
 * @param {{content: string}} entry - a context entry with its snapshot content.
 * @returns {string} SHA-256 hex.
 */
export function contextHash(entry) {
  return sha256(entry.content)
}

/**
 * Fill in `sha256` for every context entry that lacks one. Used when authoring.
 * A contract that still says `swarm.asc/0` is written as `verafy.asc/1`, which
 * gives it a new hash; a contract that is never re-pinned keeps its old one.
 * @param {object} asc - an Actually Smart Contract.
 * @returns {object} a copy with every context entry pinned.
 */
export function pin(asc) {
  const kind = asc.kind === LEGACY_ASC_KIND ? { kind: ASC_KIND } : {}
  return { ...asc, ...kind, context: asc.context.map(c => ({ ...c, sha256: c.sha256 ?? contextHash(c) })) }
}

/**
 * The contract's identity: a hash over everything except snapshot content, so the
 * hash is stable whether or not the content travels with it.
 * @param {object} asc - a pinned Actually Smart Contract.
 * @returns {string} SHA-256 hex.
 */
export function ascHash(asc) {
  const { context, ...rest } = asc
  return sha256({ ...rest, context: context.map(({ content, ...meta }) => meta) })
}

/**
 * Check an Actually Smart Contract and return every problem found.
 * @param {object} asc - the contract to validate.
 * @returns {string[]} human-readable problems; empty when valid.
 */
export function validate(asc) {
  const p = []
  if (!ASC_KINDS.includes(asc?.kind)) p.push(`kind must be "${ASC_KIND}" (or "${LEGACY_ASC_KIND}" for a contract written before the rename)`)
  if (!asc?.id) p.push('id is required')
  if (!Array.isArray(asc?.context) || asc.context.length === 0) p.push('context needs at least one entry')
  for (const [i, c] of (asc?.context ?? []).entries()) {
    if (!CONTEXT_KINDS.includes(c.kind)) p.push(`context[${i}].kind must be one of ${CONTEXT_KINDS.join(', ')}`)
    if (typeof c.content !== 'string' && !c.sha256) p.push(`context[${i}] needs content or sha256`)
  }
  const q = asc?.question
  if (!q?.prompt) p.push('question.prompt is required')
  if (!ANSWER_TYPES.includes(q?.answer?.type)) p.push(`question.answer.type must be one of ${ANSWER_TYPES.join(', ')}`)
  if ((q?.answer?.type === 'verdict' || q?.answer?.type === 'graded') && !(q.answer.options?.length >= 2)) p.push('question.answer.options needs at least two options')
  const pay = asc?.payment
  if (!(pay?.escrow > 0)) p.push('payment.escrow must be positive')
  if (!(pay?.bar > 0 && pay.bar <= 1)) p.push('payment.bar must be in (0, 1]')
  const j = pay?.jury
  if (!(j?.size >= 1)) p.push('payment.jury.size must be at least 1')
  const minF = j?.minFamilies ?? j?.minLabs
  if (j?.minFamilies !== undefined && j?.minLabs !== undefined) p.push('payment.jury has minFamilies and its old name minLabs; keep one')
  if (!(minF >= 1 && minF <= j.size)) p.push('payment.jury.minFamilies must be between 1 and jury.size')
  if (pay?.source !== undefined) {
    const s = pay.source
    if (typeof s !== 'object' || s === null) p.push('payment.source must be an object')
    else if (!(typeof s.account === 'string' && s.account) && !(typeof s.address === 'string' && s.address)) p.push('payment.source needs the escrow account (Solana) or address (EVM)')
  }
  const split = pay?.split ?? {}
  const total = ['jurors', 'auditors', 'storage', 'sealer'].reduce((s, k) => s + (split[k] ?? 0), 0)
  if (Math.abs(total - 1) > 1e-9) p.push('payment.split must sum to 1')
  if (!Array.isArray(asc?.exits) || asc.exits.length === 0) p.push('exits needs at least one entry')
  for (const [i, e] of (asc?.exits ?? []).entries()) {
    if (!EFFECT_TYPES.includes(e.effect?.type)) p.push(`exits[${i}].effect.type must be one of ${EFFECT_TYPES.join(', ')}`)
    for (const x of validateExitProgram(e, i)) p.push(x)
  }
  const declared = {}
  for (const e of asc?.exits ?? []) for (const [k, s] of Object.entries(e.exitProgram?.params ?? {})) {
    if (k in declared && JSON.stringify(declared[k]) !== JSON.stringify(s)) p.push(`params.${k} is declared differently by two exits`)
    declared[k] ??= s
  }
  if (Object.keys(paramsSchema(asc)).length && q?.answer?.type === 'forecast') p.push('exit programs with params need a verdict or graded question')
  if (q?.answer?.type !== 'forecast') {
    const outcomes = new Set((asc?.exits ?? []).map(e => e.outcome))
    for (const o of q?.answer?.options ?? []) if (!outcomes.has(o)) p.push(`no exit for option "${o}"`)
  }
  if (!(asc?.exits ?? []).some(e => e.outcome === BELOW_BAR)) p.push(`an exit for "${BELOW_BAR}" is required`)
  // Batching (optional; absent fields leave a contract's hash unchanged).
  // minBatch: never seal in a block with fewer contracts. maxWaitSeconds: seal no later than this after queueing.
  if (pay?.minBatch !== undefined && !(Number.isInteger(pay.minBatch) && pay.minBatch >= 1)) p.push('payment.minBatch must be a whole number of contracts, at least 1')
  // VIP-0007: payouts wait this many blocks for challenges. VIP-0008: a jury of one needs a window.
  if (pay?.challengeWindow !== undefined && !(Number.isInteger(pay.challengeWindow) && pay.challengeWindow >= 0)) p.push('payment.challengeWindow must be a whole number of blocks, 0 or more')
  if (j?.maxSeatsPerOperator !== undefined && !(Number.isInteger(j.maxSeatsPerOperator) && j.maxSeatsPerOperator >= 1)) p.push('payment.jury.maxSeatsPerOperator must be a whole number, at least 1')
  if (j?.minOperators !== undefined && !(Number.isInteger(j.minOperators) && j.minOperators >= 1 && j.minOperators <= j.size)) p.push('payment.jury.minOperators must be between 1 and jury.size')
  if (j?.weighting !== undefined && !['equal', 'bond'].includes(j.weighting)) p.push('payment.jury.weighting must be "equal" or "bond"')
  if (j?.slashing !== undefined && !/^[0-9a-f]{64}$/.test(j.slashing)) p.push('payment.jury.slashing must be the slashing schedule hash')
  if (pay?.maxWaitSeconds !== undefined && !(typeof pay.maxWaitSeconds === 'number' && pay.maxWaitSeconds > 0)) p.push('payment.maxWaitSeconds must be a positive number of seconds')
  for (const k of ['excludeFamilies', 'excludeLabs', 'excludeHarnesses']) {
    if (j?.[k] !== undefined && !(Array.isArray(j[k]) && j[k].every(x => typeof x === 'string'))) p.push(`payment.jury.${k} must be a list of names`)
  }
  const hex = /^[0-9a-f]{64}$/
  if (asc?.review !== undefined) {
    const r = asc.review
    if (r?.kind !== CHALLENGE_KIND) p.push(`review.kind must be "${CHALLENGE_KIND}"`)
    if (!hex.test(r?.ruling ?? '')) p.push('review.ruling must be the challenged ruling id')
    if (!hex.test(r?.ascHash ?? '')) p.push('review.ascHash must be the challenged contract hash')
    if (!GROUNDS.includes(r?.grounds)) p.push(`review.grounds must be one of ${GROUNDS.join(', ')}`)
  }
  if (asc?.escalation !== undefined) {
    const e = asc.escalation
    if (e?.kind !== ESCALATION_KIND) p.push(`escalation.kind must be "${ESCALATION_KIND}"`)
    if (!hex.test(e?.from ?? '')) p.push('escalation.from must be the below-bar ruling id')
    if (typeof e?.account !== 'string' || !e.account.startsWith('escrow:')) p.push('escalation.account must be the escrow account the parent carried into')
    if (!(Math.abs((e?.carried ?? NaN) - (pay?.escrow ?? NaN)) < 1e-9)) p.push('an escalated contract is funded by exactly the escrow carried to it')
  }
  if (asc?.review !== undefined && asc?.escalation !== undefined) p.push('a contract is a challenge or an escalation, not both')
  return p
}
