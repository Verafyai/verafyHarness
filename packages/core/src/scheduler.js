/**
 * The jury scheduler (VIP-0001): the one place that decides who sits on a
 * jury, when each step is due, and what happens when a juror does not show.
 *
 *   seed       the beacon value at admission + lookahead (VIP-0002), never a raw block hash
 *   draw       the contract's jury rules: size, model families, bond floor,
 *              exclusions, seats per operator (VIP-0003), weighting (VIP-0004)
 *   alternates the next harnesses in draw order, fixed at draw time
 *   deadlines  in blocks, so every node agrees on whether one passed
 *   replace    commit phase only: a seat that missed `commitBy` takes an alternate
 *   audits     single-harness rulings are always audited (VIP-0008)
 *
 * Pure and deterministic: every node computes the same schedule from the same
 * inputs, and a ruling's round records the schedule so `verifyRuling` can
 * recompute it. Every default in NETWORK_POLICY is illustrative until Rex sets it.
 * @module @verafyharness/core/scheduler
 */
import { ascHash } from './asc.js'
import { drawJuryFor, replaceSeats } from './network.js'
import { drawAuditors, sampleForAudit } from './challenge.js'
import { minFamiliesOf } from './family.js'

export const SCHEDULE_KIND = 'verafy.schedule/1'

/** The network's scheduling policy. Illustrative. */
export const NETWORK_POLICY = Object.freeze({
  label: 'illustrative',
  lookahead: 1,
  commitBlocks: 2,
  revealBlocks: 2,
  alternates: 3,
  weightings: Object.freeze(['equal', 'bond']),
  /** VIP-0007: the shortest window a contract may set when it holds payouts. */
  minChallengeWindow: 0,
  /** VIP-0008: a jury of one is allowed only with at least this window, and is always audited. */
  singleHarness: Object.freeze({ allowed: true, minChallengeWindow: 60, auditRate: 1 }),
  /** The share of other rulings audited. */
  auditRate: 0.05,
})

/**
 * Check a contract against the network's policy before it is admitted.
 * @param {object} asc - the contract.
 * @param {object} [policy] - the network policy.
 * @returns {string[]} problems; empty when the contract may be scheduled.
 */
export function checkPolicy(asc, policy = NETWORK_POLICY) {
  const p = []
  const j = asc.payment.jury
  const w = asc.payment.challengeWindow ?? 0
  if (!policy.weightings.includes(j.weighting ?? 'equal')) p.push(`this network does not allow "${j.weighting}" weighting`)
  if (w > 0 && w < policy.minChallengeWindow) p.push(`challengeWindow ${w} is below the network minimum of ${policy.minChallengeWindow} blocks`)
  if (j.size === 1) {
    if (!policy.singleHarness.allowed) p.push('this network does not allow a jury of one')
    else if (w < policy.singleHarness.minChallengeWindow) p.push(`a jury of one needs a challenge window of at least ${policy.singleHarness.minChallengeWindow} blocks (VIP-0008); this contract has ${w}`)
  }
  return p
}

/**
 * Schedule a jury.
 * @param {object} asc - the contract.
 * @param {object[]} pool - eligible harness cards (or harnesses).
 * @param {{seed: string, height: number, policy?: object}} at - the seed (from the beacon) and the height the jury opens at.
 * @returns {{schedule: object, jury: object[], alternates: object[]}} the schedule record, and the harness objects.
 */
export function scheduleJury(asc, pool, { seed, height, policy = NETWORK_POLICY }) {
  const problems = checkPolicy(asc, policy)
  if (problems.length) throw new Error(`contract cannot be scheduled: ${problems.join('; ')}`)
  const jury = drawJuryFor(asc, pool, seed, { alternates: policy.alternates })
  const alternates = jury.alternates ?? []
  const commitBy = height + policy.commitBlocks
  const schedule = {
    kind: SCHEDULE_KIND,
    ascHash: ascHash(asc),
    seed,
    height,
    jury: jury.map(h => h.id),
    alternates: policy.alternates,
    alternateIds: alternates.map(h => h.id),
    commitBy,
    revealBy: commitBy + policy.revealBlocks,
    replaced: [],
  }
  return { schedule, jury: [...jury], alternates }
}

/**
 * Fill seats that missed the commit deadline from the alternates. Seats that
 * committed are never replaced.
 * @param {object} asc - the contract.
 * @param {{schedule: object, jury: object[], alternates: object[]}} s - from `scheduleJury`.
 * @param {string[]} missing - seats with no valid commitment by `commitBy`.
 * @param {{height: number, policy?: object}} at - the height replacements are drawn at; they get a fresh commit window.
 * @returns {{schedule: object, jury: object[], alternates: object[], added: object[]}} the updated schedule and the new jurors.
 */
export function replaceNoShows(asc, s, missing, { height, policy = NETWORK_POLICY }) {
  const { jury, replaced } = replaceSeats(s.jury, s.alternates, missing, asc.payment.jury)
  const usedIds = new Set(replaced.map(r => r.by))
  const added = jury.filter(h => usedIds.has(h.id))
  const commitBy = height + policy.commitBlocks
  const schedule = { ...s.schedule, jury: jury.map(h => h.id), replaced: [...s.schedule.replaced, ...replaced], commitBy, revealBy: commitBy + policy.revealBlocks }
  return { schedule, jury, alternates: s.alternates.filter(h => !usedIds.has(h.id)), added }
}

/**
 * The round record of a schedule: what `verifyRuling` needs to recompute it.
 * @param {object} schedule - the schedule.
 * @returns {object} the record.
 */
export function scheduleRecord(schedule) {
  return { height: schedule.height, commitBy: schedule.commitBy, revealBy: schedule.revealBy, alternates: schedule.alternates, replaced: schedule.replaced }
}

/**
 * Whether a deadline has passed.
 * @param {object} schedule - the schedule.
 * @param {'commit' | 'reveal'} phase - which deadline.
 * @param {number} height - the current height.
 * @returns {boolean} whether it passed.
 */
export function pastDeadline(schedule, phase, height) {
  return height > (phase === 'commit' ? schedule.commitBy : schedule.revealBy)
}

/**
 * Auditors and the audit sample, seeded from the beacon.
 * @param {object[]} rulings - sealed rulings with their contracts, `{asc, ruling}`.
 * @param {string} seed - a beacon value after the rulings were sealed.
 * @param {object} [policy] - the network policy.
 * @returns {object[]} the entries to audit. A jury of one is always in the sample.
 */
export function auditSample(rulings, seed, policy = NETWORK_POLICY) {
  const single = rulings.filter(r => r.asc.payment.jury.size === 1)
  const rest = rulings.filter(r => r.asc.payment.jury.size !== 1)
  const picked = new Set(sampleForAudit(rest.map(r => r.ruling), seed, policy.auditRate))
  return [...single, ...rest.filter(r => picked.has(r.ruling))]
}

export { drawAuditors }

/**
 * A scheduler bound to one policy, for nodes and the testnet coordinator.
 */
export class JuryScheduler {
  /** @param {{policy?: object}} [options] */
  constructor({ policy = NETWORK_POLICY } = {}) { this.policy = policy }
  check(asc) { return checkPolicy(asc, this.policy) }
  draw(asc, pool, { seed, height }) { return scheduleJury(asc, pool, { seed, height, policy: this.policy }) }
  replace(asc, s, missing, { height }) { return replaceNoShows(asc, s, missing, { height, policy: this.policy }) }
  sample(rulings, seed) { return auditSample(rulings, seed, this.policy) }
  /** The fewest model families a jury of this contract can span. */
  families(asc) { return minFamiliesOf(asc.payment.jury) }
}
