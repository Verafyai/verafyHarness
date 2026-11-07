/**
 * Held payouts and challenge bonds (VIP-0007, VIP-0006).
 *
 * A contract with `payment.challengeWindow` seals its ruling with every credit
 * parked in `escrow:<id>:held`. After the window closes with no open
 * challenge, `releaseHeld` pays the intended payouts. If a challenge overturns
 * the ruling inside the window, the held escrow pays out as if the contract
 * had ruled the challenge's answer: jurors who voted that answer are paid
 * their share, the share of jurors who voted the overturned answer is forfeited
 * to the challenger, and the exit for the new answer runs instead.
 *
 * Whoever opens a challenge locks a bond (`challengeBond`). It is returned on
 * overturn or supersede, and forfeited on affirm: half to the jurors who were
 * wrongly challenged, half to the network pool. All rates here are illustrative.
 * @module @verafyharness/core/hold
 */
import { BELOW_BAR } from './asc.js'
import { rulingId } from './network.js'
import { reviewStatus, sameOutcome } from './challenge.js'
import { heldAccount, escrowAccount, conserves, accountFor } from './runtime.js'
import { DEFAULT_SLASHING } from './slashing.js'

/** Illustrative until Rex sets them. */
export const HOLD_DEFAULTS = Object.freeze({ challengeBondFactor: 1.5, challengeBondFloor: 1, label: 'illustrative' })

/**
 * Whether a held ruling can be released, and to what.
 * @param {object} asc - the contract.
 * @param {object} ruling - the sealed ruling, with `held`.
 * @param {{sealedAt: number, height: number, reviews?: object[], open?: string[], challenger?: string}} at -
 *   `sealedAt`: the height of the block that sealed the ruling; `height`: now;
 *   `reviews`: the review log; `open`: ids of rulings with a challenge still open;
 *   `challenger`: the account that brought an overturning challenge (its reward).
 * @returns {{status: 'not-held' | 'waiting' | 'frozen' | 'release' | 'redirect', until?: number, diff?: {account: string, delta: number}[], reason?: string}} the decision.
 */
export function releaseHeld(asc, ruling, { sealedAt, height, reviews = [], open = [], challenger } = {}) {
  const h = ruling.held
  if (!h) return { status: 'not-held' }
  const id = rulingId(ruling)
  const until = sealedAt + h.window
  const status = reviewStatus(id, reviews)
  const debitHeld = { account: h.account, delta: -h.amount }
  if (status === 'overturned') return { status: 'redirect', diff: redirect(asc, ruling, reviews.filter(r => r.ruling === id && r.result === 'overturn').at(-1), challenger), reason: 'overturned by a challenge' }
  if (open.includes(id)) return { status: 'frozen', until, reason: 'a challenge is open' }
  if (height < until) return { status: 'waiting', until }
  const diff = [debitHeld, ...h.payouts]
  if (!conserves(diff)) throw new Error('release does not conserve totals')
  return { status: 'release', until, diff, triggers: h.triggers ?? [], reason: status === 'superseded' ? 'superseded: the ruling was right under the rules of its time' : status === 'affirmed' ? 'affirmed by a challenge' : 'challenge window closed' }
}

function redirect(asc, ruling, review, challenger) {
  const h = ruling.held
  const exit = asc.exits.find(e => e.outcome === review.answer && e.outcome !== BELOW_BAR)
  if (!exit) throw new Error(`no exit for the overturning answer "${review.answer}"`)
  const pay = asc.payment
  const votes = ruling.votes ?? []
  const each = votes.length ? round(round(pay.escrow * pay.split.jurors) / votes.length) : 0
  const right = votes.filter(v => sameOutcome(asc.question, v.answer, review.answer))
  const forfeited = round(each * (votes.length - right.length))
  const diff = [{ account: h.account, delta: -h.amount }]
  for (const v of right) diff.push({ account: `harness:${v.harness}`, delta: each })
  if (forfeited) diff.push({ account: challenger ?? DEFAULT_SLASHING.pool, delta: forfeited })
  diff.push({ account: 'pool:auditors', delta: round(pay.escrow * pay.split.auditors) })
  diff.push({ account: 'pool:storage', delta: round(pay.escrow * pay.split.storage) })
  const sealerShare = round(pay.escrow - round(each * votes.length) - round(pay.escrow * pay.split.auditors) - round(pay.escrow * pay.split.storage))
  diff.push({ account: accountFor(ruling.round?.sealer ?? 'node:unknown'), delta: sealerShare })
  // The overturned exit's own payment was parked too; it goes where the new exit says instead.
  const parkedEffect = round(h.amount - pay.escrow)
  if (parkedEffect > 0) {
    if (exit.effect.type === 'pay' && exit.effect.amount) {
      diff.push({ account: exit.effect.to, delta: exit.effect.amount })
      if (Math.abs(parkedEffect - exit.effect.amount) > 1e-9) diff.push({ account: ruling.effect?.from ?? escrowAccount(asc), delta: round(parkedEffect - exit.effect.amount) })
    } else diff.push({ account: ruling.effect?.from ?? escrowAccount(asc), delta: parkedEffect })
  } else if (exit.effect.type === 'pay' && exit.effect.amount) {
    diff.push({ account: exit.effect.from, delta: -exit.effect.amount }, { account: exit.effect.to, delta: exit.effect.amount })
  }
  if (!conserves(diff)) throw new Error('redirect does not conserve totals')
  return diff
}

/**
 * The bond a challenge must lock: at least the floor, and `factor` times the
 * challenge jury's escrow, so a frivolous challenge costs more than the jury it summons.
 * @param {object} challengeAsc - the challenge contract.
 * @param {{factor?: number, floor?: number}} [options] - illustrative defaults from HOLD_DEFAULTS.
 * @returns {number} the bond.
 */
export function challengeBondFor(challengeAsc, { factor = HOLD_DEFAULTS.challengeBondFactor, floor = HOLD_DEFAULTS.challengeBondFloor } = {}) {
  return round(Math.max(floor, factor * challengeAsc.payment.escrow))
}

/** The account a challenge bond is locked in. */
export const challengeBondAccount = challengeAsc => `bond:challenge:${challengeAsc.id}`

/**
 * Lock a challenge bond when the challenge opens.
 * @param {object} challengeAsc - the challenge contract.
 * @param {string} from - the challenger's account.
 * @param {number} [amount] - defaults to `challengeBondFor`.
 * @returns {{account: string, delta: number}[]} the diff.
 */
export function lockChallengeBond(challengeAsc, from, amount = challengeBondFor(challengeAsc)) {
  if (!(amount >= challengeBondFor(challengeAsc))) throw new Error(`a challenge bond is at least ${challengeBondFor(challengeAsc)}`)
  return [{ account: from, delta: -amount }, { account: challengeBondAccount(challengeAsc), delta: amount }]
}

/**
 * Settle a challenge bond from the review the challenge produced.
 * @param {object} challengeAsc - the challenge contract.
 * @param {object} review - from `resolveChallenge`.
 * @param {object} original - the challenged ruling (its jurors share a forfeited bond).
 * @param {{from: string, amount: number}} bond - who locked it, and how much.
 * @returns {{result: string, diff: {account: string, delta: number}[]}} the diff.
 */
export function settleChallengeBond(challengeAsc, review, original, { from, amount }) {
  const acct = challengeBondAccount(challengeAsc)
  const diff = [{ account: acct, delta: -amount }]
  if (review.result === 'affirm') {
    const jurors = (original.votes ?? []).filter(v => sameOutcome(challengeAsc.question, v.answer, original.answer))
    const toJurors = jurors.length ? round(amount / 2) : 0
    const each = jurors.length ? round(toJurors / jurors.length) : 0
    for (const v of jurors) diff.push({ account: `harness:${v.harness}`, delta: each })
    diff.push({ account: DEFAULT_SLASHING.pool, delta: round(amount - each * jurors.length) })
  } else diff.push({ account: from, delta: amount })
  if (!conserves(diff)) throw new Error('bond settlement does not conserve totals')
  return { result: review.result, diff }
}

function round(x) {
  return Math.round(x * 1e6) / 1e6
}
