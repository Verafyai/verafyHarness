/**
 * Policies (VIP-0011): the rules a judiciary signer enforces on a wallet.
 *
 * A policy has two halves. `rules` are checks any computer can run on the
 * decoded transaction and get the same answer: which programs it may call,
 * how much may leave and to whom, which config changes are never allowed.
 * `intent` and `judgment` are what code cannot decide; the jury reads them.
 * A rule violation is final: the jury is told to reject, and an approval of a
 * transaction that breaks a rule fails verification, so it can be challenged.
 *
 * Policies are pinned by SHA-256 over canonical JSON and never edited. A new
 * policy is a new signer, swapped in by a config change the old signer must
 * approve.
 * @module @verafyharness/core/policy
 */
import { sha256 } from './hash.js'
import { agenticPolicy, checkSettlementProof } from './agentic.js'

export const POLICY_KIND = 'verafy.policy/1'

/** Programs most policies allow. Base58 addresses. */
export const PROGRAMS = Object.freeze({
  system: '11111111111111111111111111111111',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  token2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  associatedToken: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  memo: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  computeBudget: 'ComputeBudget111111111111111111111111111111',
})

const SECONDS_PER_DAY = 86_400
export const RULE_TYPES = ['allow-programs', 'max-per-transaction', 'max-per-window', 'allow-recipients', 'release-schedule', 'config-changes', 'agentic-settlement']

/**
 * Check a policy and return every problem found.
 * @param {object} p - the policy.
 * @returns {string[]} problems; empty when valid.
 */
export function validatePolicy(p) {
  const out = []
  if (p?.kind !== POLICY_KIND) out.push(`kind must be "${POLICY_KIND}"`)
  if (!p?.id) out.push('id is required')
  if (typeof p?.intent !== 'string' || p.intent.trim().length < 20) out.push('intent must say, in plain words, what this wallet is for (20 characters or more)')
  if (!Array.isArray(p?.rules)) out.push('rules must be a list')
  if (p?.judgment !== undefined && !(Array.isArray(p.judgment) && p.judgment.every(q => typeof q === 'string' && q.trim()))) out.push('judgment must be a list of questions')
  if (!(Number.isInteger(p?.minTimeLockSeconds) && p.minTimeLockSeconds >= 0)) out.push('minTimeLockSeconds must be a whole number of seconds')
  for (const [i, r] of (p?.rules ?? []).entries()) {
    const at = `rules[${i}]`
    if (!RULE_TYPES.includes(r?.type)) { out.push(`${at}.type must be one of ${RULE_TYPES.join(', ')}`); continue }
    if (r.type === 'allow-programs' && !(Array.isArray(r.programs) && r.programs.length)) out.push(`${at}.programs must list at least one program`)
    if (['max-per-transaction', 'max-per-window', 'release-schedule'].includes(r.type)) {
      if (!r.asset) out.push(`${at}.asset must be "SOL" or a mint address`)
      if (r.type !== 'release-schedule' && !isAmount(r.amount)) out.push(`${at}.amount must be a whole number of base units, as a string`)
    }
    if (r.type === 'max-per-window' && !(r.windowDays > 0)) out.push(`${at}.windowDays must be positive`)
    if (r.type === 'allow-recipients' && !(Array.isArray(r.addresses) && r.addresses.length)) out.push(`${at}.addresses must list at least one address`)
    if (r.type === 'release-schedule') {
      if (!isAmount(r.locked)) out.push(`${at}.locked must be the locked amount in base units, as a string`)
      if (!(r.start > 0)) out.push(`${at}.start must be a unix time in seconds`)
      if (!(r.cliffDays >= 0)) out.push(`${at}.cliffDays must be 0 or more`)
      if (!(r.periodDays > 0)) out.push(`${at}.periodDays must be positive`)
      if (!(r.sharePerPeriod > 0 && r.sharePerPeriod <= 1)) out.push(`${at}.sharePerPeriod must be in (0, 1]`)
    }
    if (r.type === 'config-changes' && !['deny', 'jury'].includes(r.mode)) out.push(`${at}.mode must be "deny" or "jury"`)
    if (r.type === 'agentic-settlement') {
      if (!/^[0-9a-f]{64}$/.test(r.contract ?? '')) out.push(`${at}.contract must be the agentic contract hash`)
      if (!(r.payouts && Object.keys(r.payouts).length >= 2)) out.push(`${at}.payouts must list each remedy's payouts`)
      for (const [o, m] of Object.entries(r.payouts ?? {})) if (!Object.values(m).every(isAmount)) out.push(`${at}.payouts.${o} must be base-unit amounts, as strings`)
    }
  }
  if (!(p?.rules ?? []).some(r => r.type === 'allow-programs')) out.push('a policy must list the programs the wallet may call (allow-programs); anything else is refused')
  return out
}

const isAmount = x => typeof x === 'string' && /^[0-9]+$/.test(x)

/** The policy's identity. */
export const policyHash = p => sha256(p)

// ---- Effects: what a transaction does, read from its instructions -----------

const hexBytes = h => Buffer.from(h, 'hex')

/**
 * Read what a decoded Squads transaction would do: SOL and token transfers,
 * token approvals and authority changes, the programs it calls, and config
 * changes. Anything that cannot be read is listed in `unreadable`; rules
 * treat it as a violation, so nothing the jury cannot see gets through.
 * @param {object} action - a decoded Squads transaction (see the solana package).
 * @returns {{transfers: object[], programs: string[], configActions: object[], approvals: object[], authorityChanges: object[], unreadable: string[]}} the effects.
 */
export function effectsOf(action) {
  const fx = { transfers: [], programs: [], configActions: action.kind === 'config' ? action.actions ?? [] : [], approvals: [], authorityChanges: [], unreadable: [] }
  if (action.kind === 'config') return fx
  for (const l of action.lookups ?? []) fx.unreadable.push(`address lookup table ${l.accountKey}: its accounts cannot be checked`)
  for (const [i, ix] of (action.instructions ?? []).entries()) {
    if (!fx.programs.includes(ix.program)) fx.programs.push(ix.program)
    const d = hexBytes(ix.data)
    const a = ix.accounts
    if (ix.program === PROGRAMS.system) {
      const tag = d.length >= 4 ? d.readUInt32LE(0) : -1
      if (tag === 2 && d.length >= 12) fx.transfers.push({ instruction: i, asset: 'SOL', from: a[0], to: a[1], amount: d.readBigUInt64LE(4).toString() })
      else if (tag === 0 || tag === 3) fx.transfers.push({ instruction: i, asset: 'SOL', from: a[0], to: a[1], amount: d.length >= 12 ? d.readBigUInt64LE(4).toString() : '0', createsAccount: true })
      else if (tag !== 1 && tag !== 8) fx.unreadable.push(`instruction ${i}: system instruction ${tag}`)
    } else if (ix.program === PROGRAMS.token || ix.program === PROGRAMS.token2022) {
      const tag = d[0]
      if (tag === 3 && d.length >= 9) fx.transfers.push({ instruction: i, asset: 'token-account:' + a[0], from: a[0], to: a[1], amount: d.readBigUInt64LE(1).toString() })
      else if (tag === 12 && d.length >= 10) fx.transfers.push({ instruction: i, asset: a[1], from: a[0], to: a[2], amount: d.readBigUInt64LE(1).toString() })
      else if (tag === 4 || tag === 13) fx.approvals.push({ instruction: i, account: a[0], delegate: tag === 4 ? a[1] : a[2] })
      else if (tag === 6) fx.authorityChanges.push({ instruction: i, account: a[0] })
      else if (tag === 9) fx.authorityChanges.push({ instruction: i, account: a[0], close: true })
      else if (tag === 1 || tag === 16 || tag === 18) { /* initialize account: no value moves */ } else fx.unreadable.push(`instruction ${i}: token instruction ${tag}`)
    } else if (ix.program === PROGRAMS.memo || ix.program === PROGRAMS.computeBudget || ix.program === PROGRAMS.associatedToken) {
      // Memos are untrusted text; compute budget and ATA creation move no value.
    }
  }
  return fx
}

// ---- Rules ------------------------------------------------------------------

/**
 * Run a policy's rules on a transaction's effects.
 * @param {object} policy - the policy.
 * @param {object} fx - effects from `effectsOf`.
 * @param {{now: number, history?: {time: number, transfers: object[]}[], signer?: string, threshold?: number, voters?: number, mints?: Record<string, string>, settlement?: object}} ctx -
 *   `now` in unix seconds; `history` is what earlier approved cases moved (from the signer's case log);
 *   `signer` is the judiciary signer's address, so a config change that removes it is caught;
 *   `voters` is how many members other than the signer can vote, and `threshold` the current threshold;
 *   `mints` maps token accounts to their mint, so a plain `transfer` can be counted against a mint's limit;
 *   `agentic` is the settlement proof an agentic-contract escrow pays out on (VIP-0029), with
 *   `cards`, `pool` and `seed` to check a dispute ruling's jury against.
 * @returns {{ok: boolean, violations: string[], checked: string[]}} the report.
 */
export function checkRules(policy, fx, ctx) {
  const violations = [...fx.unreadable.map(u => `cannot read ${u}`)]
  const checked = []
  const assetOf = t => (t.asset.startsWith('token-account:') ? (ctx.mints?.[t.from] ?? t.asset) : t.asset)
  const moved = (asset, transfers) => transfers.filter(t => assetOf(t) === asset && !t.inbound).reduce((s, t) => s + BigInt(t.amount), 0n)
  for (const r of policy.rules) {
    checked.push(r.type)
    if (r.type === 'allow-programs') {
      for (const p of fx.programs) if (!r.programs.includes(p)) violations.push(`calls ${p}, which the policy does not allow`)
    } else if (r.type === 'max-per-transaction') {
      const m = moved(r.asset, fx.transfers)
      if (m > BigInt(r.amount)) violations.push(`moves ${m} of ${r.asset}; at most ${r.amount} per transaction`)
    } else if (r.type === 'max-per-window') {
      const since = ctx.now - r.windowDays * SECONDS_PER_DAY
      const before = moved(r.asset, (ctx.history ?? []).filter(h => h.time > since).flatMap(h => h.transfers))
      const m = before + moved(r.asset, fx.transfers)
      if (m > BigInt(r.amount)) violations.push(`moves ${m} of ${r.asset} in ${r.windowDays} days counting this one; at most ${r.amount}`)
    } else if (r.type === 'allow-recipients') {
      for (const t of fx.transfers) if (!r.addresses.includes(t.to)) violations.push(`sends to ${t.to}, which is not an allowed recipient`)
      for (const a of fx.approvals) if (!r.addresses.includes(a.delegate)) violations.push(`approves ${a.delegate} to spend, which is not an allowed recipient`)
    } else if (r.type === 'release-schedule') {
      const allowed = released(r, ctx.now)
      const total = moved(r.asset, (ctx.history ?? []).flatMap(h => h.transfers)) + moved(r.asset, fx.transfers)
      if (total > allowed) violations.push(`would have released ${total} of ${r.asset}; the schedule allows ${allowed} by now`)
    } else if (r.type === 'agentic-settlement') {
      for (const v of checkAgenticSettlement(r, fx, ctx)) violations.push(v)
    } else if (r.type === 'config-changes') {
      for (const c of fx.configActions) {
        if (r.mode === 'deny') violations.push(`config change ${c.type} is not allowed by this policy`)
        else for (const v of hardConfigViolations(c, policy, ctx)) violations.push(v)
      }
    }
  }
  for (const a of fx.authorityChanges) violations.push(`changes the authority of ${a.account}${a.close ? ' (closes it)' : ''}; a policy wallet never gives up its accounts`)
  if (fx.configActions.length && !policy.rules.some(r => r.type === 'config-changes')) violations.push('changes the wallet config, and the policy has no config-changes rule')
  return { ok: violations.length === 0, violations, checked }
}

/**
 * Config changes no jury may approve, because they would let the wallet escape
 * its policy: removing the judiciary signer, lowering the threshold to where
 * the humans no longer need it, shortening the time lock below the policy's
 * minimum, or adding a spending limit (which spends without a vote at all).
 */
function hardConfigViolations(c, policy, ctx) {
  const v = []
  if (c.type === 'remove-member' && c.key === ctx.signer) v.push('removes the judiciary signer; swap signers by adding the new one first, under its own policy')
  if (c.type === 'change-threshold' && ctx.voters !== undefined && c.threshold <= ctx.voters) v.push(`lowers the threshold to ${c.threshold}, which the human voters can reach without the judiciary signer`)
  if (c.type === 'set-time-lock' && c.timeLock < policy.minTimeLockSeconds) v.push(`sets the time lock to ${c.timeLock} s, below the policy minimum of ${policy.minTimeLockSeconds} s`)
  if (c.type === 'add-spending-limit') v.push('adds a spending limit, which spends without any vote; a policy wallet cannot have one')
  if (c.type === 'add-member' && (c.mask & 2) && ctx.threshold !== undefined && ctx.voters !== undefined && ctx.voters + 1 >= ctx.threshold) v.push('adds a voter that would let the humans reach the threshold without the judiciary signer')
  if (c.type === 'unknown') v.push(`unknown config action ${c.tag}`)
  return v
}

/**
 * How much of a release schedule may have left by `now`: nothing before the
 * cliff, then `sharePerPeriod` of the locked amount per full period.
 * @param {object} r - a release-schedule rule.
 * @param {number} now - unix seconds.
 * @returns {bigint} base units.
 */
export function released(r, now) {
  const cliff = r.start + r.cliffDays * SECONDS_PER_DAY
  if (now < cliff) return 0n
  const periods = BigInt(Math.floor((now - cliff) / (r.periodDays * SECONDS_PER_DAY)) + 1)
  const ppm = BigInt(Math.round(r.sharePerPeriod * 1_000_000))
  const out = (BigInt(r.locked) * ppm * periods) / 1_000_000n
  return out > BigInt(r.locked) ? BigInt(r.locked) : out
}

// ---- The policy library -----------------------------------------------------

/**
 * Policy templates. Each is a function of the parameters a wallet fills in,
 * so the same template always produces the same policy (and hash).
 */
export const POLICY_TEMPLATES = Object.freeze({
  /**
   * Covenant Launch: the creator keeps most of the supply in one wallet whose
   * only way out is a published release schedule, to published addresses.
   * Buyers can read the covenant before they buy, and the wallet cannot dump.
   */
  'covenant-launch': ({ mint, locked, start, cliffDays = 30, periodDays = 30, sharePerPeriod = 0.05, recipients, minTimeLockSeconds = 86_400, title }) => ({
    kind: POLICY_KIND,
    id: `covenant-launch:${mint}`,
    title: title ?? 'Covenant Launch',
    intent: `This wallet holds the creator's share of the token ${mint}. It may release that share only on the published schedule, only to the published addresses, and never in a way that dumps on holders: no selling into thin liquidity, no transfers to fresh wallets, no removing liquidity.`,
    rules: [
      { type: 'allow-programs', programs: [PROGRAMS.system, PROGRAMS.token, PROGRAMS.token2022, PROGRAMS.associatedToken, PROGRAMS.memo, PROGRAMS.computeBudget] },
      { type: 'release-schedule', asset: mint, locked: String(locked), start, cliffDays, periodDays, sharePerPeriod },
      { type: 'allow-recipients', addresses: recipients },
      { type: 'config-changes', mode: 'jury' },
    ],
    judgment: [
      'Does this release match the purpose stated in the proposal and the covenant, or does it look like a dump on holders?',
      'If it goes to an exchange or market maker, is it one of the published recipients and is the amount within the schedule?',
    ],
    minTimeLockSeconds,
  }),
  /** Treasury: spending under a monthly cap to approved payees, with judgment on purpose. */
  treasury: ({ asset = 'SOL', monthly, perTransaction, payees, purpose, minTimeLockSeconds = 86_400, title }) => ({
    kind: POLICY_KIND,
    id: `treasury:${asset}`,
    title: title ?? 'Treasury',
    intent: `This wallet is a treasury for: ${purpose}. It pays approved payees for that purpose, within a monthly budget.`,
    rules: [
      { type: 'allow-programs', programs: [PROGRAMS.system, PROGRAMS.token, PROGRAMS.token2022, PROGRAMS.associatedToken, PROGRAMS.memo, PROGRAMS.computeBudget] },
      { type: 'max-per-transaction', asset, amount: String(perTransaction) },
      { type: 'max-per-window', asset, amount: String(monthly), windowDays: 30 },
      { type: 'allow-recipients', addresses: payees },
      { type: 'config-changes', mode: 'jury' },
    ],
    judgment: ['Is this payment for the purpose the treasury exists for, as the proposal and its evidence describe?'],
    minTimeLockSeconds,
  }),
  /**
   * Commission covenant, the jury half (VIP-0016): the validator's bond sits in
   * a policy wallet and returns to the validator only if it kept the promises
   * code can't check (MEV commission, notice). The on-chain commission is
   * checked by the verafy_covenant program, not here.
   */
  'commission-covenant': ({ validator, beneficiary, bond, promises, minTimeLockSeconds = 86_400, title }) => ({
    kind: POLICY_KIND,
    id: `commission-covenant:${validator}`,
    title: title ?? 'Commission covenant',
    intent: `This wallet holds validator ${validator}'s bond for its promises to stakers: ${promises}. The bond returns to the validator only if every promise was kept; otherwise it goes to stakers.`,
    rules: [
      { type: 'allow-programs', programs: [PROGRAMS.system, PROGRAMS.memo, PROGRAMS.computeBudget] },
      { type: 'allow-recipients', addresses: [validator, beneficiary] },
      { type: 'max-per-transaction', asset: 'SOL', amount: String(bond) },
      { type: 'config-changes', mode: 'deny' },
    ],
    judgment: ['If the bond goes to the validator: did it keep every promise, judged from its published terms and on-chain history?', 'If the bond goes to stakers: does the evidence show a promise was broken?'],
    minTimeLockSeconds,
  }),
  /**
   * Agentic contract escrow (VIP-0029): holds the money two agents agreed on,
   * and pays it out once, as exactly one remedy's payouts, backed by a mutual
   * release, a default the signed log proves, or a sealed judiciary ruling.
   */
  'agentic-contract': params => agenticPolicy(params),
  /** Upgrade authority: the wallet may only hold a program's upgrade authority; config changes only. */
  'upgrade-authority': ({ minTimeLockSeconds = 604_800, title }) => ({
    kind: POLICY_KIND,
    id: 'upgrade-authority',
    title: title ?? 'Upgrade authority',
    intent: 'This wallet holds a program upgrade authority. It moves no funds. Upgrades are reviewed against the published audit and change log.',
    rules: [
      { type: 'allow-programs', programs: [PROGRAMS.computeBudget, PROGRAMS.memo] },
      { type: 'config-changes', mode: 'jury' },
    ],
    judgment: ['Does this change match the published change log and audit?'],
    minTimeLockSeconds,
  }),
})

/**
 * Build a policy from a template.
 * @param {string} name - a key of POLICY_TEMPLATES.
 * @param {object} params - the template's parameters.
 * @returns {object} the policy, validated.
 */
export function policyFromTemplate(name, params) {
  const t = POLICY_TEMPLATES[name]
  if (!t) throw new Error(`no policy template "${name}"; templates: ${Object.keys(POLICY_TEMPLATES).join(', ')}`)
  const p = t(params)
  const problems = validatePolicy(p)
  if (problems.length) throw new Error(`policy ${name}: ${problems.join('; ')}`)
  return p
}

/**
 * The deterministic check of an `agentic-settlement` rule: the transfers must be
 * exactly one remedy's payouts, that remedy must be the settlement's outcome,
 * and the signer checks the settlement proof itself (`checkSettlementProof`):
 * it replays the signed log and, for a ruling, rebuilds the dispute contract
 * and verifies the jury's sealed round. No flag in the case is trusted.
 * @param {object} rule - the rule.
 * @param {object} fx - effects from `effectsOf`.
 * @param {{now: number, agentic?: object, cards?: object[], pool?: object[], seed?: string, history?: object[]}} ctx - the case context.
 * @returns {string[]} violations.
 */
export function checkAgenticSettlement(rule, fx, ctx) {
  const v = []
  if ((ctx.history ?? []).some(h => (h.transfers ?? []).length)) v.push('the escrow has already paid out; an agentic contract settles once')
  const proof = ctx.agentic
  if (!proof) { if (fx.transfers.length) v.push('moves escrow without a settlement proof attached to the case'); return v }
  const chk = checkSettlementProof(proof, { now: ctx.now, contract: rule.contract, cards: ctx.cards, pool: ctx.pool, seed: ctx.seed })
  for (const p of chk.problems) v.push(`settlement proof: ${p}`)
  const outcome = proof.settlement?.outcome
  const want = rule.payouts[outcome]
  if (!want) { v.push(`no remedy ${outcome} in this contract`); return v }
  const got = {}
  for (const t of fx.transfers) got[t.to] = (got[t.to] ?? 0n) + BigInt(t.amount)
  for (const [to, amt] of Object.entries(want)) if ((got[to] ?? 0n) !== BigInt(amt)) v.push(`pays ${got[to] ?? 0n} to ${to}; the ${outcome} remedy pays ${amt}`)
  for (const to of Object.keys(got)) if (!(to in want)) v.push(`pays ${to}, who is not a party`)
  return v
}
