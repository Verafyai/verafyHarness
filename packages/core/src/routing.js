/**
 * The routing agent's inference router. A contract can require an assurance
 * level for the AI that rules on it, up to a zero-knowledge proof of inference.
 * The router picks, from the routes a harness has configured, the cheapest one
 * that meets that requirement, and refuses when none does.
 *
 * Assurance levels follow the draft SIMDs:
 *   L0   signature only: proves which harness voted, not which model ran
 *   L1   L0 plus commit-reveal and model-family diversity (any route qualifies; diversity is the jury's job)
 *   L1+  re-executable by auditors: open weights, temperature 0, pinned runtime, or a hardware attestation
 *   L2   a proof of inference per vote, verified off chain
 *   L3   a proof verified on chain (reserved)
 *
 * @module @verafyharness/core/routing
 */

export const ASSURANCE = ['L0', 'L1', 'L1+', 'L2', 'L3']

/**
 * Route kinds that can carry a proof of inference: a model this harness runs
 * under a local prover adapter (`open-weights` or `local-prover`), or a proving
 * service paid through the API router (`proving-service`). A hosted model API
 * never can: the harness cannot prove what ran on someone else's machine.
 */
export const PROVING_KINDS = ['open-weights', 'local-prover', 'proving-service']

/**
 * The highest level a route can reach. L2 needs `proofs` and a proving kind;
 * a hosted API that claims proofs is still L1.
 * @param {{kind: 'hosted' | 'open-weights' | 'local-prover' | 'proving-service', attestation?: boolean, proofs?: boolean}} route - one inference route.
 * @returns {string} an assurance level.
 */
export function routeAssurance(route) {
  if (route.proofs && PROVING_KINDS.includes(route.kind)) return 'L2'
  if (route.kind === 'open-weights' || route.attestation) return 'L1+'
  return 'L1'
}

/**
 * Whether one assurance level meets another.
 * @param {string} have - the level available.
 * @param {string} need - the level required.
 * @returns {boolean} true when `have` is at or above `need`.
 */
export function meets(have, need) {
  return ASSURANCE.indexOf(have) >= ASSURANCE.indexOf(need ?? 'L0')
}

/**
 * Pick the inference route for a contract.
 * @param {object} asc - the contract; `payment.jury.assurance` is the required level, default L0.
 * @param {{id: string, family: string, model: string, kind: string, usdPerVote?: number, proofs?: boolean, attestation?: boolean}[]} routes - routes this harness can use.
 * @returns {{route: object, assurance: string}} the cheapest qualifying route.
 */
export function routeInference(asc, routes) {
  const need = asc.payment?.jury?.assurance ?? 'L0'
  const ok = routes
    .map(route => ({ route, assurance: routeAssurance(route) }))
    .filter(r => meets(r.assurance, need))
    .sort((a, b) => (a.route.usdPerVote ?? Infinity) - (b.route.usdPerVote ?? Infinity))
  if (!ok.length) {
    const best = routes.map(routeAssurance).sort((a, b) => ASSURANCE.indexOf(b) - ASSURANCE.indexOf(a))[0] ?? 'none'
    throw new Error(`no inference route meets ${need}; the best this harness offers is ${best}`)
  }
  return ok[0]
}

/**
 * The payment wallet the routing agent manages. Earnings from rulings land in
 * it; the router pays the harness's own costs (AI calls, hosting, storage) out
 * of it, only to allowlisted payees, within monthly caps, never below the bond
 * reserve, and with every movement logged. This is a ledger model of the
 * wallet; signing real transactions is the job of a chain-specific router.
 */
export class PaymentWallet {
  /**
   * @param {{payees: {id: string, asset: string, monthlyCap: number}[], bondReserve?: Record<string, number>, approvalAbove?: number}} rules - the operator's spending rules.
   */
  constructor({ payees = [], bondReserve = {}, approvalAbove = Infinity } = {}) {
    this.balances = {}
    this.payees = new Map(payees.map(p => [p.id, p]))
    this.bondReserve = bondReserve
    this.approvalAbove = approvalAbove
    this.spent = {}
    this.log = []
  }

  /**
   * Record income, such as a juror share.
   * @param {string} asset - the asset received, such as USDC.
   * @param {number} amount - how much.
   * @param {string} source - what paid it, such as a contract hash.
   */
  receive(asset, amount, source) {
    this.balances[asset] = (this.balances[asset] ?? 0) + amount
    this.log.push({ type: 'receive', asset, amount, source })
  }

  /**
   * Pay a supplier. Refuses unknown payees, the wrong asset, anything over the
   * payee's monthly cap or the approval threshold, and anything that would dip
   * into the bond reserve.
   * @param {string} payee - an allowlisted payee id.
   * @param {number} amount - how much, in the payee's asset.
   * @param {string} purpose - what it pays for, such as "inference" or "hosting".
   * @param {{month?: string, approved?: boolean}} [options] - billing month and operator approval.
   * @returns {{payee: string, asset: string, amount: number, purpose: string}} the payment.
   */
  pay(payee, amount, purpose, { month = new Date().toISOString().slice(0, 7), approved = false } = {}) {
    const p = this.payees.get(payee)
    if (!p) throw new Error(`payee "${payee}" is not on the allowlist`)
    if (amount > this.approvalAbove && !approved) throw new Error(`${amount} ${p.asset} to ${payee} needs operator approval`)
    const key = `${payee}:${month}`
    if ((this.spent[key] ?? 0) + amount > p.monthlyCap) throw new Error(`${payee} would exceed its monthly cap of ${p.monthlyCap} ${p.asset}`)
    const free = (this.balances[p.asset] ?? 0) - (this.bondReserve[p.asset] ?? 0)
    if (amount > free) throw new Error(`not enough ${p.asset} above the bond reserve to pay ${payee}`)
    this.balances[p.asset] -= amount
    this.spent[key] = (this.spent[key] ?? 0) + amount
    const entry = { type: 'pay', payee, asset: p.asset, amount, purpose }
    this.log.push(entry)
    return entry
  }
}
