/**
 * Proof packing end to end (PACK-011): atomize, check fidelity, route, pack,
 * prove, read, assemble. One call takes a block's contracts and returns each
 * contract's outcome with the proof records behind it.
 *
 *   1. Atomize: draft an atom plan for each contract (any model), validate it,
 *      and check every cited pin is real. A plan is reused when `plans` gives one.
 *   2. Fidelity: an unproven panel spanning families rules each plan FAITHFUL,
 *      NOT_FAITHFUL or UNCLEAR. Below the bar, the contract is not packed: it
 *      goes back to a whole-contract jury (`fallback`), never guessed.
 *   3. Route (optional): the router answers the atoms it may, only for
 *      contracts below L2; at L2 every atom goes to the proven lane.
 *   4. Pack: dedupe atoms across contracts and fill each prover window.
 *   5. Prove: one prover proves each packed request (prove once while one
 *      model is provable); every proof is verified before its answers count.
 *   6. Read and assemble: strict reply reading; a request with any bad slot
 *      fails whole, and its contracts fall back.
 *
 * @module @verafyharness/pack/pipeline
 */
import { ascHash, deliberate, sha256 } from '../../core/src/index.js'
import { atomize, fidelityQuestion } from './atomize.js'
import { validatePlan, planHash, decide } from './plan.js'
import { atomKey } from './atom.js'
import { pack, readReply, HEADER, roughTokens } from './packer.js'

/**
 * Ask the fidelity panel about one plan.
 * @returns {Promise<{faithful: boolean, votes: object[], agree: number, families: number}>}
 */
export async function checkFidelity(contract, plan, panel, { bar = 0.8, minFamilies = 3 } = {}) {
  const q = fidelityQuestion(contract, plan)
  const asc = {
    kind: 'verafy.asc/1',
    id: `fidelity:${contract.id}`,
    title: `Fidelity of the atom plan for ${contract.id}`,
    instructions: 'You check an atom plan against the contract it replaces. Use only the pinned context. Answer FAITHFUL only if the plan reaches the same outcome as the contract question on every reading of the evidence, and every fact is copied faithfully from its pin.',
    context: contract.context,
    question: { prompt: q.prompt, answer: { type: 'verdict', options: q.options } },
  }
  const votes = await Promise.all(panel.map(async j => {
    try { const v = await deliberate(asc, j.provider, j.model, { family: j.family }); return { family: j.family, answer: v.answer } } catch (err) { return { family: j.family, answer: null, error: err.message } }
  }))
  const yes = votes.filter(v => v.answer === 'FAITHFUL')
  const families = new Set(yes.map(v => v.family)).size
  const agree = yes.length / (panel.length || 1)
  return { faithful: agree >= bar && families >= Math.min(minFamilies, new Set(panel.map(j => j.family)).size), votes, agree, families }
}

/**
 * Run a block of contracts through the packed, proven path.
 * @param {object[]} contracts - verafy.asc/1 contracts.
 * @param {object} o
 * @param {{provider: object, model: string}} [o.atomizer] - drafts plans (not needed when `plans` covers every contract).
 * @param {Record<string, object>} [o.plans] - plans already drafted, by contract id.
 * @param {{family: string, provider: object, model: string}[]} o.panel - the fidelity panel; must span families.
 * @param {object} o.prover - a Prover from @verafyharness/prove.
 * @param {object} o.verifier - a Verifier; every proof is checked before it counts.
 * @param {object} [o.router] - a Router from @verafyharness/route, for contracts below L2.
 * @param {string} [o.seed] - block hash; fixes slot order and audits.
 * @param {number} [o.contextTokens] - prover window (1,024 for FlashProve, vendor-reported).
 * @param {Function} [o.countTokens] - tokenizer.
 * @param {{bar?: number, minFamilies?: number}} [o.fidelity] - panel bar.
 * @returns {Promise<{results: Record<string, object>, requests: object[], stats: object, fallback: string[]}>}
 */
export async function packedBlock(contracts, { atomizer, plans = {}, panel, prover, verifier, router = null, seed = '', contextTokens = 1024, countTokens = roughTokens, fidelity = {} } = {}) {
  if (!panel?.length) throw new Error('a fidelity panel is required: no plan is used unchecked')
  if (!prover || !verifier) throw new Error('a prover and a verifier are required')
  const results = {}
  const fallback = []
  const items = []
  const fail = (c, stage, reason) => { results[c.id] = { packed: false, stage, reason }; fallback.push(c.id) }

  // 1 and 2: plans, then fidelity.
  for (const c of contracts) {
    let plan = plans[c.id] ?? null
    let errors = []
    if (!plan) {
      if (!atomizer) { fail(c, 'atomize', 'no plan and no atomizer'); continue }
      const a = await atomize(c, atomizer.provider, { model: atomizer.model, contextTokens, countTokens })
      plan = a.plan; errors = a.errors
    } else errors = validatePlan(plan, c)
    if (errors.length) { fail(c, 'atomize', errors.join('; ')); continue }
    const f = await checkFidelity(c, plan, panel, fidelity)
    if (!f.faithful) { results[c.id] = { packed: false, stage: 'fidelity', reason: `panel agreement ${Math.round(f.agree * 100)}% across ${f.families} families`, fidelity: f }; fallback.push(c.id); continue }
    items.push({ id: c.id, plan, contract: c, planHash: planHash(plan), fidelity: f })
  }

  // 3: route. L2 contracts keep every atom in the proven lane.
  let answers = {}
  let toProve = items.map(({ id, plan }) => ({ id, plan }))
  const routed = []
  if (router) {
    const below = items.filter(i => (i.contract.payment?.jury?.assurance ?? i.contract.assurance ?? 'L0') !== 'L2')
    const l2 = items.filter(i => !below.includes(i))
    const { routeBlock } = await import('../../route/src/router.js')
    const r = await routeBlock(below.map(({ id, plan }) => ({ id, plan })), router, seed)
    answers = r.answers
    routed.push(...r.results)
    toProve = [...r.proven, ...l2.map(({ id, plan }) => ({ id, plan }))]
  }

  // 4: pack.
  let packed = { requests: [], index: {}, stats: { contracts: 0, atoms: 0, uniqueAtoms: 0, deduped: 0, requests: 0, fill: 0 } }
  if (toProve.length) packed = pack(toProve, { contextTokens, seed, countTokens })

  // 5: prove, then verify every proof before its answers count.
  const commitment = await prover.commitment()
  const requests = packed.requests.map(q => ({ id: q.id, input: { system: HEADER, user: q.prompt.slice(HEADER.length).trim() }, prompt: q.prompt, slots: q.slots }))
  const proved = requests.length ? await prover.prove(requests.map(({ id, input }) => ({ id, input }))) : []
  const badRequests = new Set()
  const proofs = {}
  for (const q of requests) {
    const p = proved.find(x => x.id === q.id)
    if (!p) { badRequests.add(q.id); continue }
    const ok = await verifier.verify(p.proofRef, commitment, q.input, p.answer)
    if (!ok) { badRequests.add(q.id); proofs[q.id] = { proofHash: p.proofHash, verified: false }; continue }
    // 6: read strictly; one bad slot fails the whole request.
    try { Object.assign(answers, readReply({ slots: q.slots }, p.answer)); proofs[q.id] = { proofHash: p.proofHash, verified: true, slots: q.slots.length } } catch (err) { badRequests.add(q.id); proofs[q.id] = { proofHash: p.proofHash, verified: true, error: err.message } }
  }

  // Assemble each contract from its atoms; any atom from a failed request sends it back.
  for (const it of items) {
    const ans = {}
    let missing = null
    const used = new Set()
    for (const atom of it.plan.atoms) {
      const key = atomKey(atom)
      const where = packed.index[key]
      if (where && badRequests.has(where.request)) { missing = `request ${where.request.slice(0, 12)} failed`; break }
      if (!(key in answers)) { missing = `no answer for ${atom.id}`; break }
      ans[atom.id] = answers[key]
      if (where) used.add(where.request)
    }
    if (missing) { results[it.id] = { packed: false, stage: 'prove', reason: missing }; fallback.push(it.id); continue }
    const d = decide(it.plan, ans)
    results[it.id] = {
      packed: true,
      ascHash: ascHash(it.contract),
      outcome: d.outcome,
      params: d.params,
      ...(d.unknown ? { unknown: d.unknown } : {}),
      planHash: it.planHash,
      fidelity: { agree: it.fidelity.agree, families: it.fidelity.families },
      answers: ans,
      proofs: [...used].map(id => ({ request: id, ...proofs[id] })),
      routed: routed.filter(r => r.contract === it.id && r.lane !== 'proven').map(r => ({ atom: r.atom, settledBy: r.settledBy })),
    }
  }

  const stats = { ...packed.stats, contractsIn: contracts.length, packedContracts: Object.values(results).filter(r => r.packed).length, fallback: fallback.length, proofs: proved.length, failedRequests: badRequests.size, commitment }
  return { results, requests: requests.map(q => ({ id: q.id, slots: q.slots.length, proof: proofs[q.id] ?? null })), stats, fallback, record: sha256({ seed, results, stats }) }
}
