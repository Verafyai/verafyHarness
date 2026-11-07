/**
 * L2 for a harness: answer through a prover (commit), then prove what was
 * revealed (after the reveal, before the proof deadline). And L2 for a
 * verifier: check a proof bundle against the contract and the revealed vote.
 *
 *   const provider = l2Provider(prover)                 // the harness's provider: plain inference, no proof
 *   const harness = new Harness({ ..., provider, modelCommitment: await prover.commitment() })
 *   // commit and reveal as usual; proving never blocks the commit
 *   const [{ record, bundle }] = await proveVotes(harness, provider, prover, [asc])
 *   // upload `bundle` (off chain), send `record` (hashes only) before the deadline
 *
 * The proof bundle (`verafy.proof-bundle/1`) is held off chain, in the
 * availability layer. The proof record carries only its hash.
 * @module @verafyharness/prove/juror
 */
import { ascHash, buildPrompt, parseVote, proofRecord, proofBundleHash, canonical, sha256 } from '../../core/src/index.js'
import { planInference, proveInBatches, DEFAULT_CONTEXT_TOKENS, DEFAULT_PROVER_BATCH } from './plan.js'
import { assertProver, assertVerifier } from './interface.js'

export const BUNDLE_KIND = 'verafy.proof-bundle/1'

/**
 * A provider (core's `complete` shape) that answers through a prover's `infer`,
 * splitting long prompts by the plan, and remembers each plan so the same
 * requests can be proven after the reveal.
 * @param {object} prover - a Prover with `infer`.
 * @param {{contextTokens?: number}} [options] - the prover's context limit.
 * @returns {{complete: (req: object) => Promise<string>, plans: Map<string, object>}} the provider.
 */
export function l2Provider(prover, { contextTokens = DEFAULT_CONTEXT_TOKENS } = {}) {
  assertProver(prover, { infer: true })
  const plans = new Map()
  return {
    plans,
    contextTokens,
    async complete(req) {
      const meta = { ascId: req.ascId, family: req.family }
      const plan = planInference({ system: req.system, user: req.user }, { contextTokens })
      const steps = []
      if (plan.single) {
        const [r] = await prover.infer([{ id: 'single', input: plan.single, meta }])
        steps.push({ role: 'single', input: plan.single, answer: r.answer })
      } else {
        const rs = await prover.infer(plan.map.map((input, i) => ({ id: `map-${i + 1}`, input, meta })))
        plan.map.forEach((input, i) => steps.push({ role: 'map', input, answer: rs[i].answer }))
        const input = plan.reduceInput(rs.map(r => r.answer))
        const [r] = await prover.infer([{ id: 'reduce', input, meta }])
        steps.push({ role: 'reduce', input, answer: r.answer })
      }
      plans.set(promptKey(req), { composition: plan.composition, contextTokens, steps, meta })
      return steps[steps.length - 1].answer
    },
  }
}

const promptKey = req => sha256(canonical({ system: req.system, user: req.user }))

/**
 * Prove the revealed votes for some contracts, every request of every contract
 * in prover batches of at most `proverBatch`. A vote whose proven output is not
 * what the harness committed cannot be proven, and gets no record (it will
 * earn a no-proof fault). With a `verifier`, the harness checks every proof
 * before it attaches it, as it must when the proofs come from a proving
 * service it does not trust (Part D4).
 * @param {object} harness - core's Harness, with `modelCommitment`; its reveal kept the vote.
 * @param {object} provider - the `l2Provider` the harness answered with.
 * @param {object} prover - the Prover.
 * @param {object[]} ascs - contracts this harness revealed on.
 * @param {{proverBatch?: number, verifier?: object, proofRef?: (proofHash: string) => string}} [options] -
 *   `proofRef` names where the bundle will be held (default `sha256:<hash>`, content addressed).
 * @returns {Promise<{ascHash: string, record?: object, bundle?: string, error?: string}[]>} one per contract.
 */
export async function proveVotes(harness, provider, prover, ascs, { proverBatch = DEFAULT_PROVER_BATCH, verifier, proofRef = h => `sha256:${h}` } = {}) {
  assertProver(prover)
  if (verifier) assertVerifier(verifier)
  const commitment = await prover.commitment()
  const jobs = []
  const requests = []
  for (const asc of ascs) {
    const h = ascHash(asc)
    const revealed = harness.revealed.get(h)
    const plan = provider.plans.get(promptKey(buildPrompt(asc)))
    if (!revealed || !plan) { jobs.push({ h, error: !revealed ? 'nothing revealed for this contract' : 'no inference plan for this contract' }); continue }
    const job = { h, asc, revealed, plan, ids: [] }
    plan.steps.forEach((s, i) => {
      const id = `${h.slice(0, 16)}:${i}`
      job.ids.push(id)
      requests.push({ id, input: s.input, meta: plan.meta })
    })
    jobs.push(job)
  }
  const results = new Map()
  if (requests.length) (await proveInBatches(prover, requests, proverBatch)).forEach((r, i) => results.set(requests[i].id, r))
  const out = []
  for (const job of jobs) {
    if (job.error) { out.push({ ascHash: job.h, error: job.error }); continue }
    const steps = job.plan.steps.map((s, i) => ({ ...s, proved: results.get(job.ids[i]) }))
    const differs = steps.find(s => s.proved.answer !== s.answer)
    if (differs) { out.push({ ascHash: job.h, error: `the proven ${differs.role} output differs from what was committed` }); continue }
    if (verifier) {
      let bad = null
      for (const s of steps) if (!await verifier.verify(s.proved.proofRef, commitment, s.input, s.answer)) { bad = s; break }
      if (bad) { out.push({ ascHash: job.h, error: `the ${bad.role} proof does not verify; not attached` }); continue }
    }
    const bundle = {
      kind: BUNDLE_KIND,
      modelCommitment: harness.modelCommitment,
      composition: job.plan.composition,
      contextTokens: job.plan.contextTokens,
      steps: steps.map(s => ({ role: s.role, input: s.input, answer: s.answer, proofRef: s.proved.proofRef, proofHash: s.proved.proofHash })),
    }
    const text = canonical(bundle)
    const proofHash = proofBundleHash(bundle)
    const record = proofRecord(harness, {
      harness: harness.id, ascHash: job.h, commitment: job.revealed.commitment, modelCommitment: harness.modelCommitment, proofHash, proofRef: proofRef(proofHash),
      ...(bundle.composition ? { chunkProofHashes: bundle.steps.map(s => s.proofHash), composition: bundle.composition } : {}),
    })
    out.push({ ascHash: job.h, record, bundle: text })
  }
  return out
}

/**
 * Verify one proof bundle for a counted vote. Re-plans the split from the
 * contract, checks every step's input, checks the reduce input is the map
 * outputs in order, runs the Verifier on every proof under the record's model
 * commitment, and checks that the final output parses to exactly the revealed vote.
 * @param {object} verifier - a Verifier.
 * @param {object} asc - the contract, with context.
 * @param {object} record - the proof record.
 * @param {string} bundleText - the bundle as held off chain.
 * @param {object} vote - the revealed vote.
 * @returns {Promise<{ok: boolean, reason?: string}>} the result.
 */
export async function verifyBundle(verifier, asc, record, bundleText, vote) {
  assertVerifier(verifier)
  const no = reason => ({ ok: false, reason })
  if (typeof bundleText !== 'string') return no('the proof bundle is not available')
  if (sha256(bundleText) !== record.proofHash) return no('the bundle does not match the proof hash')
  let b
  try { b = JSON.parse(bundleText) } catch { return no('the bundle is not JSON') }
  if (b.kind !== BUNDLE_KIND) return no(`a bundle is "${BUNDLE_KIND}"`)
  if (b.modelCommitment !== record.modelCommitment) return no('the bundle is for another model commitment')
  if ((b.composition ?? null) !== (record.composition ?? null)) return no('the bundle and the record declare different compositions')
  if (b.composition && canonical(b.steps.map(s => s.proofHash)) !== canonical(record.chunkProofHashes)) return no('the chunk proof hashes do not match the bundle')
  let plan
  try { plan = planInference(buildPrompt(asc), { contextTokens: b.contextTokens }) } catch (err) { return no(err.message) }
  const steps = b.steps ?? []
  if (plan.single) {
    if (steps.length !== 1 || steps[0].role !== 'single' || canonical(steps[0].input) !== canonical(plan.single)) return no('the proven input is not this contract\'s prompt')
  } else {
    if (b.composition !== plan.composition) return no('a contract this long must declare map-reduce/1')
    const maps = steps.slice(0, -1)
    const reduce = steps[steps.length - 1]
    if (maps.length !== plan.map.length || !maps.every((s, i) => s.role === 'map' && canonical(s.input) === canonical(plan.map[i]))) return no('the map inputs are not this contract\'s chunks')
    let expected
    try { expected = plan.reduceInput(maps.map(s => s.answer)) } catch (err) { return no(err.message) }
    if (reduce?.role !== 'reduce' || canonical(reduce.input) !== canonical(expected)) return no('the reduce input is not the map outputs in order')
  }
  for (const s of steps) {
    let ok = false
    try { ok = await verifier.verify(s.proofRef, record.modelCommitment, s.input, s.answer) } catch { ok = false }
    if (!ok) return no(`the ${s.role} proof does not verify under the model commitment`)
  }
  let parsed
  try { parsed = parseVote(asc, steps[steps.length - 1].answer) } catch (err) { return no(`the proven output is not a vote: ${err.message}`) }
  const { proofHash, ...revealed } = vote ?? {}
  if (canonical(parsed) !== canonical(revealed)) return no('the proven output is not the revealed vote')
  return { ok: true }
}
