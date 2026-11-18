import { NextResponse, type NextRequest } from 'next/server'

import { clientIp, rateLimit } from '@/credits/rateLimit'
import { memoFor, payerFromEnv, STAMP_CLUSTER, stampMemo } from '@/products/thesis/solana'
import { pendingStampRuns, recordStamp } from '@/products/thesis/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Stamps finalized runs that are still "pending stamp" (up to five, newest first) on Solana devnet with
 * THESIS_SOLANA_PAYER. Free and idempotent: a stamped run is never stamped again. Anyone may call it, since
 * it only writes roots that are already public.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(`thesis-stamp:${clientIp(req.headers)}`, 6))) {
      return NextResponse.json({ error: 'rate_limited', message: 'Try again in a minute.' }, { status: 429 })
    }
  } catch {
    return NextResponse.json({ error: 'store_unavailable' }, { status: 503 })
  }
  const payer = payerFromEnv()
  if (!payer) {
    return NextResponse.json({ error: 'not_configured', message: 'THESIS_SOLANA_PAYER is not set, so nothing can be stamped yet.' }, { status: 503 })
  }
  let pending
  try {
    pending = await pendingStampRuns(5)
  } catch {
    return NextResponse.json({ error: 'store_unavailable' }, { status: 503 })
  }
  const stamped: { runId: string; merkleRoot: string; tx?: string; error?: string }[] = []
  for (const run of pending) {
    try {
      const tx = await stampMemo(memoFor(run.merkleRoot, run.runId), payer)
      await recordStamp(run.runId, { status: 'stamped', tx, cluster: STAMP_CLUSTER })
      stamped.push({ ...run, tx })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'stamp_failed'
      await recordStamp(run.runId, { status: 'pending', error: message }).catch(() => undefined)
      stamped.push({ ...run, error: message })
    }
  }
  return NextResponse.json({ cluster: STAMP_CLUSTER, stamped })
}
