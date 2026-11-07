/**
 * The contract runtime every harness carries. It picks the exit for a ruling,
 * turns it into an exact state diff, splits the escrow, and checks that the diff
 * conserves totals. Every harness runs the same function, so every harness can
 * check every other harness's diff.
 * @module @verafyharness/core/runtime
 */
import { BELOW_BAR } from './asc.js'

/**
 * Choose the exit for a ruling.
 * @param {object} asc - the contract.
 * @param {{answer: unknown, agreement: number}} result - the measured ruling.
 * @returns {{exit: object, passed: boolean}} the exit to run and whether the bar was cleared.
 */
export function chooseExit(asc, result) {
  const passed = result.agreement >= asc.payment.bar
  if (!passed) return { exit: asc.exits.find(e => e.outcome === BELOW_BAR), passed }
  if (asc.question.answer.type === 'forecast') {
    return { exit: asc.exits.find(e => e.outcome === '*forecast') ?? asc.exits.find(e => e.outcome !== BELOW_BAR), passed }
  }
  const exit = asc.exits.find(e => e.outcome === result.answer)
  if (!exit) throw new Error(`no exit for outcome "${result.answer}"`)
  return { exit, passed }
}

/**
 * The ledger account a sealer is paid into. A harness id (the old form) is paid
 * as `harness:<id>`; a full account such as `node:node-1` is used as given; an
 * object names its kind, `{id: 'node-1', kind: 'node'}`, or its `account`.
 * @param {string | {id?: string, kind?: string, account?: string}} sealer - the sealer.
 * @returns {string} the account.
 */
export function accountFor(sealer) {
  if (typeof sealer === 'string') return sealer.includes(':') ? sealer : `harness:${sealer}`
  if (sealer?.account) return sealer.account
  if (sealer?.id) return `${sealer.kind ?? 'harness'}:${sealer.id}`
  throw new Error('a sealer needs an id or an account')
}

/**
 * The account a contract's escrow is held in. An escalated contract is funded
 * by the escrow its below-bar parent carried, so it draws from that account.
 * @param {object} asc - the contract.
 * @returns {string} the escrow account.
 */
export function escrowAccount(asc) {
  return asc.escalation?.account ?? `escrow:${asc.id}`
}

/**
 * The account a below-bar ruling carries its escrow into, for the escalated jury.
 * @param {object} asc - the contract.
 * @returns {string} the carry account.
 */
export function carryAccount(asc) {
  return `escrow:${asc.id}:escalation`
}

/**
 * Build the state diff for a ruling: the exit's effect plus the escrow payout.
 * Jurors are paid per counted vote. A ruling below the bar pays nothing yet; its
 * escrow carries over to the escalated jury.
 * @param {object} asc - the contract.
 * @param {object} exit - the chosen exit.
 * @param {boolean} passed - whether the bar was cleared.
 * @param {string[]} counted - harness ids whose votes were counted.
 * @param {string | {id?: string, kind?: string, account?: string}} sealer - the sealer: a harness id, an account, or a card (see `accountFor`).
 * @returns {{account: string, delta: number}[]} the diff.
 */
export function buildDiff(asc, exit, passed, counted, sealer) {
  const pay = asc.payment
  const diff = []
  const pool = escrowAccount(asc)
  if (!passed) {
    diff.push({ account: pool, delta: -pay.escrow }, { account: carryAccount(asc), delta: pay.escrow })
    return diff
  }
  const jurorShare = round(pay.escrow * pay.split.jurors)
  const each = counted.length ? round(jurorShare / counted.length) : 0
  for (const id of counted) diff.push({ account: `harness:${id}`, delta: each })
  const paidJurors = round(each * counted.length)
  diff.push({ account: 'pool:auditors', delta: round(pay.escrow * pay.split.auditors) })
  diff.push({ account: 'pool:storage', delta: round(pay.escrow * pay.split.storage) })
  const sealerShare = round(pay.escrow - paidJurors - round(pay.escrow * pay.split.auditors) - round(pay.escrow * pay.split.storage))
  diff.push({ account: accountFor(sealer), delta: sealerShare })
  diff.push({ account: pool, delta: -pay.escrow })
  if (exit.effect.type === 'pay' && exit.effect.amount) {
    diff.push({ account: exit.effect.from, delta: -exit.effect.amount }, { account: exit.effect.to, delta: exit.effect.amount })
  }
  return diff
}

/** The account a ruling's payouts wait in through the challenge window (VIP-0007). */
export function heldAccount(asc) {
  return `escrow:${asc.id}:held`
}

/** Whether a contract holds its payouts through a challenge window. */
export function holdsPayouts(asc) {
  return (asc.payment?.challengeWindow ?? 0) > 0
}

/**
 * The held form of a passing ruling's diff (VIP-0007): every debit stays as
 * it is, and every credit waits in the held account until the challenge window
 * closes. The intended payouts are kept beside it, and `releaseHeld` applies
 * them, or the challenge outcome, later. Totals still conserve.
 * @param {object} asc - the contract.
 * @param {{account: string, delta: number}[]} diff - the intended diff, from `buildDiff`.
 * @returns {{diff: object[], held: {account: string, amount: number, window: number, payouts: object[]}}} the diff to seal now, and the hold.
 */
export function holdDiff(asc, diff) {
  const credits = diff.filter(d => d.delta > 0)
  const amount = round(credits.reduce((s, d) => s + d.delta, 0))
  const account = heldAccount(asc)
  return { diff: [...diff.filter(d => d.delta <= 0), { account, delta: amount }], held: { account, amount, window: asc.payment.challengeWindow, payouts: credits } }
}

/**
 * The pay rules, as a check any node can run on a ruling's diff without
 * rebuilding it:
 *
 *   the diff conserves totals
 *   above the bar, every counted vote is paid once, the same positive amount,
 *     dissent included, and no other juror or node account is paid except the sealer
 *   below the bar, nobody is paid (no juror, no sealer), and the whole escrow
 *     moves to the carry account for the escalated jury
 *
 * @param {object} asc - the contract.
 * @param {{passed: boolean, votes: {harness: string}[], diff: {account: string, delta: number}[], round?: {sealer?: string}}} ruling - the ruling.
 * @param {string | object} [sealer] - the sealer account; defaults to the one the ruling's round names.
 * @returns {string[]} problems; empty when the pay rules hold.
 */
export function checkPay(asc, ruling, sealer = ruling.round?.sealer) {
  const p = []
  if (ruling.held) {
    // A held ruling seals its debits and parks every credit; the pay rules apply to the payouts it will release.
    const h = ruling.held
    if (!holdsPayouts(asc)) p.push('a contract with no challenge window does not hold payouts')
    if (!ruling.passed) p.push('only a passing ruling holds payouts')
    const sealed = Array.isArray(ruling.diff) ? ruling.diff : []
    if (!conserves(sealed)) p.push('diff does not conserve totals')
    const credits = sealed.filter(d => d.delta > 0)
    if (credits.length !== 1 || credits[0].account !== heldAccount(asc) || Math.abs(credits[0].delta - h.amount) > 1e-9) p.push('a held ruling credits only its held account, with the whole payout')
    if (Math.abs(h.payouts.reduce((s, d) => s + d.delta, 0) - h.amount) > 1e-9) p.push('held payouts do not add up to the held amount')
    const intended = [...sealed.filter(d => d.delta <= 0), ...h.payouts]
    for (const x of checkPay(asc, { ...ruling, held: undefined, diff: intended }, sealer)) p.push(`held payouts: ${x}`)
    return p
  }
  const diff = Array.isArray(ruling.diff) ? ruling.diff : []
  if (!conserves(diff)) p.push('diff does not conserve totals')
  const pool = escrowAccount(asc)
  const escrow = asc.payment.escrow
  const debit = diff.filter(d => d.account === pool).reduce((s, d) => s + d.delta, 0)
  if (Math.abs(debit + escrow) > 1e-9) p.push(`the diff must release the whole escrow (${escrow}) from ${pool}`)
  const paidParty = d => /^(harness|node):/.test(d.account) && d.delta > 0
  const sealerAcct = sealer === undefined ? null : accountFor(sealer)
  if (ruling.passed) {
    const counted = ruling.votes.map(v => `harness:${v.harness}`)
    const amounts = []
    for (const acct of counted) {
      let entries = diff.filter(d => d.account === acct)
      // A sealer that also sat on the jury has a second entry for its sealer share, written last.
      if (acct === sealerAcct) entries = entries.slice(0, -1)
      if (entries.length !== 1 || !(entries[0].delta > 0)) p.push(`counted vote by ${acct.slice(8)} is not paid exactly once`)
      else amounts.push(entries[0].delta)
    }
    if (new Set(amounts).size > 1) p.push('counted votes are not paid equally')
    const allowed = new Set([...counted, ...(sealerAcct ? [sealerAcct] : [])])
    for (const d of diff.filter(paidParty)) if (!allowed.has(d.account)) p.push(`${d.account} is paid but its vote was not counted`)
  } else {
    if (diff.some(paidParty)) p.push('a ruling below the bar never pays jurors or the sealer')
    const carry = diff.filter(d => d.account === carryAccount(asc)).reduce((s, d) => s + d.delta, 0)
    if (Math.abs(carry - escrow) > 1e-9) p.push('a ruling below the bar must carry its whole escrow to the escalated jury')
  }
  return p
}

/**
 * Check that a diff conserves totals.
 * @param {{delta: number}[]} diff - the diff.
 * @returns {boolean} whether the deltas sum to zero.
 */
export function conserves(diff) {
  return Math.abs(diff.reduce((s, d) => s + d.delta, 0)) < 1e-9
}

/**
 * The effects to run outside the ledger, such as a call on another chain. Calls
 * are only emitted for a ruling that cleared the bar, and must be signed by the
 * quorum before any chain accepts them.
 * @param {object} exit - the chosen exit.
 * @param {boolean} passed - whether the bar was cleared.
 * @returns {object[]} triggers for the outbox.
 */
export function triggers(exit, passed) {
  if (!passed) return exit.effect.type === 'escalate' ? [{ type: 'escalate', jurySize: exit.effect.jurySize }] : []
  return exit.effect.type === 'call' ? [{ type: 'call', chain: exit.effect.chain, target: exit.effect.target, args: exit.effect.args ?? [] }] : []
}

function round(x) {
  return Math.round(x * 1e6) / 1e6
}
