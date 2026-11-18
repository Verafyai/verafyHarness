'use client'

/** Client side of a jury run: one request per claim, in order, then one finalize. */

export type ClaimOutcome = {
  claimId: string
  ok: boolean
  status: number
  error?: string
  message?: string
  verdict?: string
  score?: number
  interval90?: [number, number]
}

export type RunOutcome = {
  runId: string | null
  outcomes: ClaimOutcome[]
  stopped: { claimId: string; reason: string } | null
  stamp: { status: string; tx: string | null; cluster: string | null } | null
  merkleRoot: string | null
}

function newKey(claimId: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `thesis:${claimId.replace(/[^A-Za-z0-9]/g, '')}_${rand.slice(0, 32)}`
}

export const REPORT_REFRESH = 'thesis-report:refresh'

/**
 * Runs the given claims one at a time. Stops at the first response that says to stop (a 503
 * question_check_failed from Swarm, no credits, or a server that cannot run juries), then finalizes
 * whatever claims succeeded so the run gets its Merkle root and stamp.
 */
/** How many claims are in flight at once. Each takes about 30 seconds at Swarm. */
export const CONCURRENCY = 6

type Body = {
  ok?: boolean
  runId?: string
  error?: string
  message?: string
  stop?: boolean
  report?: { verdict: string; score: number; interval90: [number, number] }
}

export async function runClaims(
  ids: string[],
  onProgress: (o: ClaimOutcome, done: number) => void,
  onStart?: (claimId: string) => void,
): Promise<RunOutcome> {
  let runId: string | null = null
  const outcomes: ClaimOutcome[] = []
  // Make sure this browser has a visitor id (and its free credits) before the first paid call.
  await fetch('/api/credits/balance', { credentials: 'include', cache: 'no-store' }).catch(() => undefined)
  let stopped: RunOutcome['stopped'] = null

  const one = async (claimId: string): Promise<void> => {
    if (stopped) return
    onStart?.(claimId)
    let o: ClaimOutcome
    let stop = false
    try {
      const res = await fetch('/api/thesis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ claimId, runId: runId ?? undefined, idempotencyKey: newKey(claimId) }),
      })
      const body = (await res.json().catch(() => ({}))) as Body
      if (body.runId && !runId) runId = body.runId
      o = {
        claimId,
        ok: Boolean(body.ok),
        status: res.status,
        error: body.error,
        message: body.message,
        verdict: body.report?.verdict,
        score: body.report?.score,
        interval90: body.report?.interval90,
      }
      stop = Boolean(body.stop)
      if (res.status === 402) window.dispatchEvent(new CustomEvent('verafy-credits:open', { detail: { outOfCredits: true } }))
    } catch {
      o = { claimId, ok: false, status: 0, error: 'unreachable', message: 'The jury could not be reached.' }
    }
    outcomes.push(o)
    onProgress(o, outcomes.length)
    window.dispatchEvent(new Event('verafy-credits:refresh'))
    if (outcomes.length % 5 === 0) window.dispatchEvent(new Event(REPORT_REFRESH))
    if (stop && !stopped) stopped = { claimId, reason: o.message || o.error || 'stopped' }
  }

  // The final question (V01) waits for every claim; the first claim opens the run, then the rest run in parallel.
  const claims = ids.filter((id) => id !== 'V01')
  const last = ids.filter((id) => id === 'V01')
  if (claims.length) await one(claims[0]!)
  const queue = claims.slice(1)
  const worker = async () => {
    while (queue.length && !stopped) await one(queue.shift()!)
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
  for (const id of last) {
    window.dispatchEvent(new Event(REPORT_REFRESH))
    await one(id)
  }

  let stamp: RunOutcome['stamp'] = null
  let merkleRoot: string | null = null
  if (runId && outcomes.some((o) => o.ok)) {
    try {
      const res = await fetch('/api/thesis/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ runId }),
      })
      if (res.ok) {
        const body = (await res.json()) as { merkleRoot: string; stamp: RunOutcome['stamp'] }
        stamp = body.stamp
        merkleRoot = body.merkleRoot
      }
    } catch {
      // The reports are stored; the run can be finalized again later.
    }
  }
  window.dispatchEvent(new Event(REPORT_REFRESH))
  return { runId, outcomes, stopped, stamp, merkleRoot }
}
