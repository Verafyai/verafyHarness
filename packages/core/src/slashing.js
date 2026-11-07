/**
 * Slashing (VIP-0005): running a harness means posting a bond, and a recorded
 * fault takes part of it. Faults are found by the protocol itself (a ruling's
 * `round.faults`, a block's withheld beacon reveal, a runtime mismatch) or
 * proven by a challenge. A published schedule, pinned by hash in each
 * contract's jury rules, turns each fault into a penalty, and `slashDiff`
 * turns penalties into bond diffs that conserve totals. Slashed funds go to
 * whoever proved the fault and to the network pool. Nothing is burned or minted.
 *
 * Every rate in DEFAULT_SLASHING is illustrative until Rex sets it.
 * @module @verafyharness/core/slashing
 */
import { sha256 } from './hash.js'
import { rulingId } from './network.js'
import { conserves } from './runtime.js'

export const SLASHING_KIND = 'verafy.slashing/1'
export const SLASH_RECORD_KIND = 'verafy.slash/1'
/** Every fault a schedule prices. */
export const FAULTS = ['no-commit', 'no-reveal', 'bad-reveal', 'double-commit', 'no-proof', 'bad-proof', 'runtime-mismatch', 'no-beacon-reveal', 'false-evidence']

/**
 * The default schedule. All illustrative.
 *
 * Two kinds of fault, priced differently on purpose:
 *   - provable misbehavior (`rates`): a share of the bond. Signed evidence shows
 *     the harness did it, so the penalty can be large.
 *   - liveness (`fixed`): honest machines go offline, so a harness may miss up
 *     to `graceRate` of its seats in a `window` for free. Past that, each miss
 *     costs a fixed amount in the contract's currency, doubling (`escalate`)
 *     for each other miss in the last `streak` blocks and capped at
 *     `livenessCap` of the bond. A bond-share penalty for every missed seat
 *     would cost an honest harness many times its fees (packages/economics
 *     `stake` shows it); a streak of withheld reveals, which is how a juror
 *     would sink rulings it saw going the wrong way, still gets expensive fast.
 */
export const DEFAULT_SLASHING = Object.freeze({
  kind: SLASHING_KIND,
  label: 'illustrative',
  rates: Object.freeze({
    'bad-reveal': 0.25, // a signed reveal that does not open its own commitment
    'double-commit': 1, // equivocation: two signed commitments for one contract
    'bad-proof': 0.5, // a claim that the named model ran when it did not
    'runtime-mismatch': 0.25,
    'no-beacon-reveal': 0.1,
    'false-evidence': 1, // proven only by a challenge that names the harness
  }),
  fixed: Object.freeze({
    'no-commit': 0.05,
    'no-reveal': 0.5, // committing then withholding is how a juror sinks a ruling it saw going the wrong way
    'no-proof': 0.5,
  }),
  escalate: 2,
  livenessCap: 0.05,
  /** Share of a harness's seats in `window` blocks it may miss for free. Without a seat count, one miss per window is free. */
  graceRate: Object.freeze({ 'no-commit': 0.02, 'no-reveal': 0.002 }),
  window: 1000,
  /** Misses within this many blocks of each other count as a streak and escalate. */
  streak: 10,
  /** Share of a slash paid to the party that proved the fault; the rest goes to `pool`. */
  reporterShare: 0.5,
  pool: 'pool:slashed',
})

/** The schedule's hash, for `payment.jury.slashing`. */
export function slashingHash(schedule = DEFAULT_SLASHING) {
  return sha256(schedule)
}

/**
 * Check a schedule.
 * @param {object} s - a schedule.
 * @returns {string[]} problems.
 */
export function validateSlashing(s) {
  const p = []
  if (s?.kind !== SLASHING_KIND) p.push(`kind must be "${SLASHING_KIND}"`)
  for (const [f, r] of Object.entries(s?.rates ?? {})) {
    if (!FAULTS.includes(f)) p.push(`unknown fault "${f}"`)
    if (!(typeof r === 'number' && r >= 0 && r <= 1)) p.push(`rates.${f} must be a share of the bond, 0 to 1`)
  }
  for (const [f, a] of Object.entries(s?.fixed ?? {})) {
    if (!FAULTS.includes(f)) p.push(`unknown fault "${f}"`)
    if (f in (s.rates ?? {})) p.push(`${f} is priced twice, in rates and fixed`)
    if (!(typeof a === 'number' && a >= 0)) p.push(`fixed.${f} must be an amount, 0 or more`)
  }
  for (const f of FAULTS) if (!(f in (s?.rates ?? {})) && !(f in (s?.fixed ?? {}))) p.push(`${f} has no price`)
  if (s?.fixed && !(s.escalate >= 1)) p.push('escalate must be at least 1')
  if (s?.fixed && !(s.livenessCap > 0 && s.livenessCap <= 1)) p.push('livenessCap must be a share of the bond')
  if (!(s?.reporterShare >= 0 && s.reporterShare <= 1)) p.push('reporterShare must be 0 to 1')
  if (typeof s?.pool !== 'string' || !s.pool) p.push('pool must be an account')
  return p
}

/** The bond account of a harness, and of an operator (VIP-0003). */
export const bondAccount = id => `bond:${id}`
export const operatorBondAccount = key => `bond:operator:${key}`

/**
 * The penalties for a list of faults.
 * @param {{harness: string, fault: string, ruling?: string, height?: number, reporter?: string, evidence?: unknown}[]} faults - recorded faults.
 * @param {object} [schedule] - the slashing schedule.
 * @param {{bonds?: Record<string, number> | Map<string, number>, history?: {harness: string, fault: string, height: number}[], height?: number}} [options] -
 *   `bonds`: each harness's posted bond (a card's `bond` when absent); `history`: earlier faults;
 *   `seats`: seats each harness held in the window, so grace is a share of them.
 * @returns {{kind: string, harness: string, fault: string, rate: number, amount: number, forgiven: boolean, ruling?: string, reporter?: string}[]} the penalties, in input order.
 */
export function penalties(faults, schedule = DEFAULT_SLASHING, { bonds = {}, history = [], height, seats = {} } = {}) {
  const bondOf = id => Number(bonds instanceof Map ? bonds.get(id) : bonds[id]) || 0
  const seen = history.slice()
  return faults.map(f => {
    if (!FAULTS.includes(f.fault)) throw new Error(`unknown fault "${f.fault}"`)
    const at = f.height ?? height ?? 0
    const same = x => x.harness === f.harness && x.fault === f.fault
    const prior = seen.filter(x => same(x) && at - (x.height ?? 0) < schedule.window).length
    const streak = seen.filter(x => same(x) && at - (x.height ?? 0) < (schedule.streak ?? schedule.window)).length
    seen.push({ harness: f.harness, fault: f.fault, height: at })
    const liveness = f.fault in (schedule.fixed ?? {})
    const held = Number(seats instanceof Map ? seats.get(f.harness) : seats[f.harness]) || 0
    const grace = liveness ? (held ? Math.floor(held * (schedule.graceRate?.[f.fault] ?? 0)) : (schedule.graceRate?.[f.fault] ? 1 : 0)) : 0
    const forgiven = liveness && prior < grace
    const bond = bondOf(f.harness)
    let rate = 0, amount = 0
    if (!forgiven && liveness) {
      // Liveness past the grace: a fixed amount that doubles with each other miss in the streak, capped at a share of the bond.
      amount = round(Math.min(schedule.fixed[f.fault] * (schedule.escalate ?? 1) ** streak, bond * (schedule.livenessCap ?? 1)))
      rate = bond ? round(amount / bond) : 0
    } else if (!forgiven) {
      rate = schedule.rates[f.fault] ?? 0
      amount = round(bond * rate)
    }
    return { kind: SLASH_RECORD_KIND, harness: f.harness, fault: f.fault, rate, amount, forgiven, ...(f.ruling ? { ruling: f.ruling } : {}), ...(f.reporter ? { reporter: f.reporter } : {}), ...(f.evidence ? { evidenceHash: sha256(f.evidence) } : {}) }
  })
}

/**
 * The faults a sealed ruling records, each tagged with the ruling's id.
 * @param {object} ruling - a sealed ruling.
 * @returns {{harness: string, fault: string, ruling: string, evidence?: unknown}[]} the faults.
 */
export function rulingFaults(ruling) {
  const id = rulingId(ruling)
  return (ruling?.round?.faults ?? []).map(f => ({ ...f, ruling: id }))
}

/**
 * The penalties a ruling's faults carry, with each juror's bond read from the
 * jury cards it was drawn with.
 * @param {object} ruling - a sealed ruling.
 * @param {object} [schedule] - the slashing schedule.
 * @param {{history?: object[], height?: number}} [options] - earlier faults and the block height.
 * @returns {object[]} the penalties.
 */
export function slashRuling(ruling, schedule = DEFAULT_SLASHING, options = {}) {
  const bonds = Object.fromEntries((ruling?.round?.jury ?? []).map(c => [c.id, Number(c.bond) || 0]))
  return penalties(rulingFaults(ruling), schedule, { ...options, bonds })
}

/**
 * Turn penalties into a bond diff. A penalty larger than the harness's bond
 * takes the rest from its operator's bond (VIP-0003) when it has one; whatever
 * neither covers is recorded as `unpaid`, never minted. Each slash pays
 * `reporterShare` to the party that proved it (when one did) and the rest to the pool.
 * @param {object[]} list - from `penalties`.
 * @param {{balances?: Record<string, number>, operators?: Record<string, string>, schedule?: object}} [options] -
 *   `balances`: current bond balances by account (a penalty is capped at what is there);
 *   `operators`: harness id to operator key.
 * @returns {{diff: {account: string, delta: number}[], unpaid: {harness: string, amount: number}[]}} the diff and any shortfall.
 */
export function slashDiff(list, { balances, operators = {}, schedule = DEFAULT_SLASHING } = {}) {
  const left = new Map(Object.entries(balances ?? {}))
  const take = (acct, want) => {
    if (!balances) return want
    const have = Number(left.get(acct) ?? 0)
    const got = Math.min(have, want)
    left.set(acct, round(have - got))
    return round(got)
  }
  const diff = []
  const unpaid = []
  for (const s of list) {
    if (!(s.amount > 0)) continue
    let got = take(bondAccount(s.harness), s.amount)
    if (got) diff.push({ account: bondAccount(s.harness), delta: -got })
    const op = operators[s.harness]
    if (got < s.amount && op) {
      const more = take(operatorBondAccount(op), round(s.amount - got))
      if (more) { diff.push({ account: operatorBondAccount(op), delta: -more }); got = round(got + more) }
    }
    if (got < s.amount) unpaid.push({ harness: s.harness, amount: round(s.amount - got) })
    if (!got) continue
    const toReporter = s.reporter ? round(got * schedule.reporterShare) : 0
    if (toReporter) diff.push({ account: s.reporter, delta: toReporter })
    diff.push({ account: schedule.pool, delta: round(got - toReporter) })
  }
  if (!conserves(diff)) throw new Error('slash diff does not conserve totals')
  return { diff, unpaid }
}

/**
 * What a harness has at stake on one seat: the most one ruling's faults can
 * take, which is the largest rate in the schedule times its bond.
 * @param {number} bond - the harness's bond.
 * @param {object} [schedule] - the slashing schedule.
 * @returns {{bond: number, worstFault: string, atStake: number}} the exposure.
 */
export function exposure(bond, schedule = DEFAULT_SLASHING) {
  const [worstFault, rate] = Object.entries(schedule.rates ?? {}).sort((a, b) => b[1] - a[1])[0] ?? ['none', 0]
  return { bond, worstFault, atStake: round(bond * rate) }
}

function round(x) {
  return Math.round(x * 1e6) / 1e6
}
