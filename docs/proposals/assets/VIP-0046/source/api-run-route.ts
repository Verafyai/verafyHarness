import { NextResponse, type NextRequest } from 'next/server'

import { visitorFromRequest } from '@/credits/http'
import { clientIp, rateLimit } from '@/credits/rateLimit'
import { accountFromRequest } from '@/credits/session'
import { CreditsUnavailableError, refundCredits, spendCredits } from '@/credits/service'
import { THESIS } from '@/products/thesis/identity'
import { runOneClaim } from '@/products/thesis/runClaim'
import { summarize } from '@/products/thesis/score'
import { createRun, latestReports, runIsOpen, saveReport } from '@/products/thesis/store'
import { VERDICT_ID, verdictQuestion } from '@/products/thesis/units'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

const BROADCAST = 'https://api.verafy.ai/api/v1/public/broadcast-query'
/**
 * With SWARM_SITE_KEY (Swarm Explorer's VERAFY_APIS_KEY_SITE), runs call Swarm directly as Verafy's trusted
 * server, so the only credits spent are the visitor's own website credits. Without it, runs go through
 * api.verafy.ai and also draw on VERAFY_API_KEY's API credits.
 */
const SWARM_DIRECT = 'https://swarm.verafy.ai/api/broadcast-query'

/**
 * The board: one current model from each lab, by Swarm Explorer validator id. GPT-6.1 Terra Pro, Claude Opus 5.5,
 * Gemini 4 Argon, Grok 4.7 and DeepSeek V4 Pro.
 */
const JURY_VALIDATORS = [
  '5c95fdce-18d2-468d-9fd6-6b882a13477b',
  '1eaee990-f0ec-4c23-9abe-ea39cd0ce1ef',
  '0580b313-e014-4f91-b085-d059e21bb862',
  'cadf0f3c-25e4-49b9-820d-f3390f227d97',
  '8cc0f86c-4133-44e6-8fdd-d4e48017825a',
]
const KEY_RE = /^thesis:[A-Za-z0-9_-]{8,80}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status })
}

/**
 * Runs the jury on one claim: POST { claimId, runId?, idempotencyKey }. Without a runId it opens a new run.
 * Charges THESIS.claimCost credits and refunds them on any failure. The page calls this once per claim, in
 * order, then POST /api/thesis/finalize builds the run's Merkle root and stamps it.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.VERAFY_API_KEY
  const siteKey = process.env.SWARM_SITE_KEY
  if (!apiKey && !siteKey) return json({ ok: false, error: 'not_configured', message: 'Jury runs are not configured on this server yet.', stop: true }, 503)

  const visitorId = visitorFromRequest(req)
  if (!visitorId) return json({ ok: false, error: 'no_visitor', message: 'Load your credits balance first.', stop: true }, 401)

  let body: { claimId?: unknown; runId?: unknown; idempotencyKey?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return json({ ok: false, error: 'invalid_body', stop: true }, 400)
  }
  if (typeof body.idempotencyKey !== 'string' || !KEY_RE.test(body.idempotencyKey)) {
    return json({ ok: false, error: 'invalid_body', message: 'Missing idempotencyKey.', stop: true }, 400)
  }
  const idempotencyKey = body.idempotencyKey

  try {
    if (!(await rateLimit(`thesis-claim:${clientIp(req.headers)}:${visitorId}`, 90))) {
      return json({ ok: false, error: 'rate_limited', message: 'Too many claims in a minute. Wait and run again.', stop: true }, 429)
    }
  } catch {
    return json({ ok: false, error: 'credits_unavailable', stop: true }, 503)
  }

  let runId: string
  try {
    if (typeof body.runId === 'string' && UUID_RE.test(body.runId)) {
      if (!(await runIsOpen(body.runId, visitorId))) return json({ ok: false, error: 'run_closed', stop: true }, 409)
      runId = body.runId
    } else {
      runId = await createRun(visitorId)
    }
  } catch {
    return json({ ok: false, error: 'store_unavailable', message: 'Reports cannot be stored right now. Nothing was charged.', stop: true }, 503)
  }

  const session = await accountFromRequest(req).catch(() => null)
  // The final question carries the jury's results so far.
  let questionOverride: string | undefined
  if (body.claimId === VERDICT_ID) {
    const sum = summarize(await latestReports().catch(() => []))
    questionOverride = verdictQuestion({ valid: sum.counts.valid, checked: sum.checked, weakest: sum.headline?.score ?? null })
  }
  try {
    const result = await runOneClaim(body.claimId, idempotencyKey, {
      spend: async (amount, key) => {
        const s = await spendCredits({
          visitorId,
          amount,
          reason: `Verafy Thesis jury: ${String(body.claimId).slice(0, 12)}`,
          idempotencyKey: key,
          source: 'thesis',
          sessionAccountId: session?.id,
        })
        return s.ok ? { ok: true } : { ok: false, balance: s.balance }
      },
      refund: async (key) => {
        await refundCredits({ visitorId, idempotencyKey: key, reason: 'Verafy Thesis jury refund', sessionAccountId: session?.id })
      },
      broadcast: async (queryText) => {
        const payload = JSON.stringify({
          queryText,
          queryMode: 'fact-check',
          queriesRequested: THESIS.juryModels,
          selectedLLMIds: JURY_VALIDATORS,
          questionGate: 'off',
        })
        const res = siteKey
          ? await fetch(SWARM_DIRECT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key-public': siteKey },
              body: payload,
              signal: AbortSignal.timeout(160_000),
            })
          : await fetch(BROADCAST, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey as string },
              body: payload,
              signal: AbortSignal.timeout(160_000),
            })
        const text = await res.text()
        let parsed: unknown = null
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = { error: 'invalid_response' }
        }
        return { status: res.status, body: parsed }
      },
      save: (claimId, build) => saveReport(runId, claimId, build),
      now: () => new Date(),
    }, questionOverride)
    return json({ ...result.body, runId }, result.status)
  } catch (error) {
    if (error instanceof CreditsUnavailableError) return json({ ok: false, error: 'credits_unavailable', stop: true, runId }, 503)
    return json({ ok: false, error: 'credits_unavailable', stop: true, runId }, 503)
  }
}
