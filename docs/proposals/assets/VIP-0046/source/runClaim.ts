import { THESIS } from './identity'
import { buildClaimReport, parseJurors, type ClaimReport, type StoredReport } from './score'
import { QUESTION_MAX, questionFor, unitById } from './units'

/** What one claim run needs from the outside world. The route passes the real ones; tests pass fakes. */
export type ClaimRunDeps = {
  spend: (amount: number, idempotencyKey: string) => Promise<{ ok: true } | { ok: false; balance: number }>
  refund: (idempotencyKey: string) => Promise<void>
  broadcast: (queryText: string) => Promise<{ status: number; body: unknown }>
  save: (claimId: string, build: (version: number) => ClaimReport) => Promise<StoredReport>
  now: () => Date
}

export type ClaimRunResult =
  | { status: 200; body: { ok: true; report: StoredReport; charged: number } }
  | { status: 400 | 402 | 409 | 502 | 503; body: { ok: false; error: string; message: string; stop: boolean; refunded: boolean; balance?: number } }

function fail(
  status: 400 | 402 | 409 | 502 | 503,
  error: string,
  message: string,
  opts: { stop?: boolean; refunded?: boolean; balance?: number } = {},
): ClaimRunResult {
  return { status, body: { ok: false, error, message, stop: opts.stop ?? false, refunded: opts.refunded ?? false, balance: opts.balance } }
}

/** Swarm's own error code, when it sent one. */
function upstreamCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  for (const v of [b.code, b.error, (b.error as Record<string, unknown> | undefined)?.code]) {
    if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * Runs the jury on one claim. Charges THESIS.claimCost credits up front and refunds them on any failure,
 * so a visitor only pays for a claim that produced a stored report. A 503 question_check_failed from Swarm
 * tells the caller to stop the batch.
 */
export async function runOneClaim(
  claimId: unknown,
  idempotencyKey: string,
  deps: ClaimRunDeps,
  questionOverride?: string,
): Promise<ClaimRunResult> {
  if (typeof claimId !== 'string') return fail(400, 'invalid_claim', 'Send one claimId.')
  const unit = unitById(claimId)
  if (!unit) return fail(400, 'unknown_claim', `No claim ${claimId}.`)
  if (unit.unfinished) return fail(409, 'claim_unfinished', `${claimId} is unfinished and is not run.`)
  const question = questionOverride ?? questionFor(unit)
  if (question.length > QUESTION_MAX) return fail(400, 'question_too_long', `Questions must be ${QUESTION_MAX} characters or fewer.`)

  const spend = await deps.spend(THESIS.claimCost, idempotencyKey)
  if (!spend.ok)
    return fail(402, 'insufficient_credits', `You have ${spend.balance} credits and each claim costs ${THESIS.claimCost}. Nothing was charged. Buy credits to run the check.`, {
      balance: spend.balance,
      stop: true,
    })

  const refundAnd = async (r: ClaimRunResult): Promise<ClaimRunResult> => {
    try {
      await deps.refund(idempotencyKey)
      if (!r.body.ok) r.body.refunded = true
    } catch {
      // The spend stays on the ledger with its key, so a later refund call can still return it.
    }
    return r
  }

  let upstream: { status: number; body: unknown }
  try {
    upstream = await deps.broadcast(question)
  } catch {
    return refundAnd(fail(502, 'upstream_unreachable', 'Swarm Explorer could not be reached. Your credits were returned.'))
  }
  const code = upstreamCode(upstream.body)
  if (upstream.status === 503 && code === 'question_check_failed') {
    return refundAnd(fail(503, 'question_check_failed', 'Swarm declined the question. The run stopped and your credits were returned.', { stop: true }))
  }
  if ((upstream.status === 402 || upstream.status === 403) && /insufficient credits/i.test(code ?? '')) {
    return refundAnd(
      fail(503, 'upstream_credits', "Verafy's own jury account is out of credits. The run stopped and your credits were returned.", { stop: true }),
    )
  }
  if (upstream.status === 429) {
    return refundAnd(fail(503, 'rate_limited', 'Swarm Explorer is limiting requests right now. The run stopped and your credits were returned; try again in a few minutes.', { stop: true }))
  }
  if (upstream.status < 200 || upstream.status >= 300) {
    const b = (upstream.body ?? {}) as { asked?: unknown; answered?: unknown }
    const counts =
      typeof b.asked === 'number' && typeof b.answered === 'number' ? ` Only ${b.answered} of ${b.asked} models answered in time.` : ''
    return refundAnd(fail(502, code ?? `upstream_${upstream.status}`, `Swarm Explorer returned ${upstream.status}.${counts} Your credits were returned.`))
  }
  const answers = parseJurors(upstream.body)
  if (!answers.some((a) => a.vote !== 'abstain')) {
    return refundAnd(fail(502, 'no_jurors', 'No juror answered. Your credits were returned.'))
  }

  try {
    const report = await deps.save(unit.id, (version) =>
      buildClaimReport({ unit, question, answers, version, spec: THESIS.specVersion, now: deps.now() }),
    )
    return { status: 200, body: { ok: true, report, charged: THESIS.claimCost } }
  } catch {
    return refundAnd(fail(502, 'store_failed', 'The report could not be stored. Your credits were returned.'))
  }
}
