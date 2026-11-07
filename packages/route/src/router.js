/**
 * The multi-model router: start every question at the cheapest tier that can
 * answer it safely, and move up only when needed.
 *
 *   tier 0  a fast screen (System 1, such as Jev): typed answer and probability
 *   tier 1+ panels of jurors from several families, smallest models first
 *   proven  the L2 lane: set by the contract, never by difficulty
 *
 * Plain code, no model decides where a question goes. Three signals do:
 *   1. the screen's probability (only above a calibrated cutoff, see calibrate.js)
 *   2. disagreement: a split panel moves up a tier; a unanimous one stops
 *   3. the question: its stakes, its type and the contract's floor
 *
 * Guardrails:
 *   - shadow mode (the default): the screen only sizes juries and logs what it
 *     would have settled. It settles nothing until cutoffs are calibrated and
 *     an operator turns settling on.
 *   - the contract's floor: no question starts below the tier or jury size the
 *     contract requires; the screen can only add scrutiny above it.
 *   - L2 never uses the screen's answer: a closed model can't carry a proof.
 *   - random audits, drawn from the block hash, send a share of settled
 *     answers to the top tier anyway, to measure calibration on live traffic.
 * @module @verafyharness/route/router
 */
import { sha256 } from '../../core/src/index.js'
import { atomKey } from '../../pack/src/atom.js'

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Question type for cutoffs: an atom's declared kind, else its answer type. */
export const atomType = atom => atom.kind ?? atom.answer?.type ?? 'unknown'

/**
 * Deterministic audit draw: a share of keys, picked by the block hash, so
 * nobody knows in advance which answers will be checked.
 * @param {string} seed - the block or batch hash.
 * @param {string} key - the atom key.
 * @param {number} rate - share audited, 0 to 1.
 * @returns {boolean} whether this atom is audited.
 */
export function audited(seed, key, rate) {
  if (!(rate > 0)) return false
  return parseInt(sha256(`audit:${seed}:${key}`).slice(0, 8), 16) / 0xffffffff < rate
}

export class Router {
  /**
   * @param {object} cfg
   * @param {object} [cfg.screen] - a screen ({ name, usd, ms, decide }), optional.
   * @param {Array<{id: string, jurors: Array<{family: string, usd?: number, ms?: number, decide: Function}>, usd?: number}>} cfg.tiers - panels, cheapest first.
   * @param {Record<string, {cutoff: number|null}>} [cfg.cutoffs] - from calibrate(); missing type means never settle on the screen.
   * @param {'shadow'|'live'} [cfg.mode='shadow'] - shadow logs what the screen would settle; live lets it settle.
   * @param {number} [cfg.auditRate=0.05] - share of screen-settled and low-tier answers re-checked at the top tier.
   * @param {Array<{minP: number, startTier: number}>} [cfg.sizing] - where to start a question from the screen's probability.
   */
  constructor({ screen = null, tiers, cutoffs = {}, mode = 'shadow', auditRate = 0.05, sizing = [{ minP: 0.95, startTier: 0 }, { minP: 0.8, startTier: 1 }] }) {
    if (!Array.isArray(tiers) || !tiers.length) throw new Error('the router needs at least one panel tier')
    for (const t of tiers) {
      const families = new Set(t.jurors.map(j => j.family))
      if (families.size < Math.min(2, t.jurors.length)) throw new Error(`tier ${t.id} must span families`)
    }
    this.screen = screen
    this.tiers = tiers
    this.cutoffs = cutoffs
    this.mode = mode
    this.auditRate = auditRate
    this.sizing = sizing
    this.log = []
  }

  /**
   * Route one atom.
   * @param {object} atom - a packed-style atom ({ q, answer, facts }).
   * @param {object} [ctx]
   * @param {string} [ctx.assurance='L1'] - the contract's level: L0, L1, L1+ or L2.
   * @param {boolean} [ctx.allowScreen=false] - the contract lets a screen settle this question.
   * @param {number} [ctx.stakesUsd=0] - value riding on this question.
   * @param {number} [ctx.maxLossUsd=0] - the most the contract accepts losing to a wrong screen answer.
   * @param {number} [ctx.floorTier=0] - the lowest panel tier the contract allows.
   * @param {string} [ctx.seed=''] - block or batch hash, for audits.
   * @returns {Promise<object>} { lane, answer, settledBy, path, audited, costUsd, ms, shadow }.
   */
  async route(atom, { assurance = 'L1', allowScreen = false, stakesUsd = 0, maxLossUsd = 0, floorTier = 0, seed = '' } = {}) {
    const key = atomKey(atom)
    const type = atomType(atom)
    const out = { key, type, lane: 'jury', answer: null, settledBy: null, path: [], audited: false, costUsd: 0, ms: 0, shadow: null }
    const isAudited = audited(seed, key, this.auditRate)

    // Tier 0: the screen. Its probability sizes the jury even when it settles nothing.
    let screened = null
    if (this.screen) {
      screened = await this.screen.decide(atom)
      out.costUsd += this.screen.usd ?? 0
      out.ms += this.screen.ms ?? 0
      const cutoff = this.cutoffs[type]?.cutoff ?? null
      const confident = cutoff != null && screened.answer != null && screened.p >= cutoff
      const lossOk = (1 - (screened.p || 0)) * stakesUsd <= maxLossUsd
      const eligible = confident && lossOk && allowScreen && assurance === 'L0'
      const reason = assurance !== 'L0' ? `assurance ${assurance} needs a jury` : !allowScreen ? 'contract does not allow a screen' : cutoff == null ? `no calibrated cutoff for ${type}` : !confident ? `p ${screened.p} below cutoff ${cutoff}` : !lossOk ? 'stakes too high for the screen' : 'eligible'
      out.path.push({ tier: 'screen', answer: screened.answer, p: screened.p, eligible, reason })
      if (eligible) {
        if (this.mode === 'shadow') out.shadow = { wouldSettle: screened.answer, p: screened.p }
        else if (!isAudited) {
          out.answer = screened.answer
          out.settledBy = 'screen'
          this.log.push(out)
          return out
        }
      }
    }

    // L2: the proven lane. The screen may have sized it, but never answers it.
    if (assurance === 'L2') {
      out.lane = 'proven'
      out.path.push({ tier: 'proven', reason: 'the contract requires proof' })
      this.log.push(out)
      return out
    }

    // Where to start: the contract's floor, raised (never lowered) by the screen.
    let start = floorTier
    if (screened && screened.answer != null) {
      const rule = this.sizing.find(s => screened.p >= s.minP)
      start = Math.max(floorTier, rule ? rule.startTier : this.tiers.length - 1)
    } else if (this.screen) start = Math.max(floorTier, this.tiers.length - 1)
    start = Math.min(start, this.tiers.length - 1)

    for (let t = start; t < this.tiers.length; t++) {
      const tier = this.tiers[t]
      const votes = await Promise.all(tier.jurors.map(async j => ({ family: j.family, ...(await j.decide(atom)) })))
      out.costUsd += tier.jurors.reduce((s, j) => s + (j.usd ?? 0), 0)
      out.ms += Math.max(...tier.jurors.map(j => j.ms ?? 0))
      const known = votes.filter(v => v.answer != null)
      const unanimous = known.length === votes.length && known.every(v => same(v.answer, known[0].answer))
      const last = t === this.tiers.length - 1
      out.path.push({ tier: tier.id, votes: votes.map(v => ({ family: v.family, answer: v.answer })), unanimous })
      if (unanimous) { out.answer = known[0].answer; out.settledBy = tier.id; break }
      if (last) {
        // Top tier, still split: the majority stands only if it clears the bar; else UNKNOWN goes to the contract's fallback.
        const counts = {}
        for (const v of known) counts[JSON.stringify(v.answer)] = (counts[JSON.stringify(v.answer)] ?? 0) + 1
        const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
        const bar = tier.bar ?? 0.8
        if (top && n / votes.length >= bar) { out.answer = JSON.parse(top); out.settledBy = tier.id }
        else { out.answer = null; out.settledBy = 'below-bar' }
      }
    }

    // Audit: a settled answer below the top tier is re-checked there, on a block-hash draw.
    if (isAudited && out.settledBy !== this.tiers.at(-1).id && out.settledBy !== 'below-bar') {
      const top = this.tiers.at(-1)
      const votes = await Promise.all(top.jurors.map(async j => ({ family: j.family, ...(await j.decide(atom)) })))
      out.costUsd += top.jurors.reduce((s, j) => s + (j.usd ?? 0), 0)
      const agree = votes.filter(v => same(v.answer, out.answer)).length / votes.length
      out.audited = { tier: top.id, agreement: agree, screen: screened ? { answer: screened.answer, p: screened.p, correct: same(screened.answer, out.answer) } : null }
    } else if (isAudited && screened) {
      out.audited = { tier: out.settledBy, screen: { answer: screened.answer, p: screened.p, correct: same(screened.answer, out.answer) } }
    }
    this.log.push(out)
    return out
  }

  /**
   * Screen results checked against a jury, ready for calibrate() and recheck().
   * Uses every routed atom where a panel answered and the screen gave an answer.
   * @returns {Array<{type: string, p: number, correct: boolean}>} labeled records.
   */
  screenRecords() {
    return this.log
      .filter(r => r.path[0]?.tier === 'screen' && r.path[0].answer != null && r.settledBy && r.settledBy !== 'screen' && r.settledBy !== 'below-bar')
      .map(r => ({ type: r.type, p: r.path[0].p, correct: same(r.path[0].answer, r.answer) }))
  }
}

/**
 * Route every atom of a block, then return what still needs a proof.
 * Atoms the screen or a panel settled are answered; atoms in the proven lane
 * go to the packer. Contracts pass their own context per atom.
 * @param {Array<{id: string, plan: object, ctx?: object}>} items - contracts with atom plans.
 * @param {Router} router - the router.
 * @param {string} seed - block hash.
 * @returns {Promise<{answers: Record<string, any>, proven: Array<{id: string, plan: object}>, results: object[]}>}
 *   answers by atom key, the plans whose atoms need proving (only those atoms), and every routing result.
 */
export async function routeBlock(items, router, seed = '') {
  const answers = {}
  const results = []
  const proven = []
  for (const { id, plan, ctx = {} } of items) {
    const need = []
    for (const atom of plan.atoms) {
      const key = atomKey(atom)
      if (key in answers) continue
      const r = await router.route(atom, { ...ctx, seed })
      results.push({ contract: id, atom: atom.id, ...r })
      if (r.lane === 'proven') need.push(atom)
      else answers[key] = r.answer
    }
    if (need.length) proven.push({ id, plan: { ...plan, atoms: need } })
  }
  return { answers, proven, results }
}
