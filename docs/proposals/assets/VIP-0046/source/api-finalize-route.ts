import { NextResponse, type NextRequest } from 'next/server'

import { visitorFromRequest } from '@/credits/http'
import { memoFor, payerFromEnv, STAMP_CLUSTER, stampMemo } from '@/products/thesis/solana'
import { finalizeRun, recordStamp } from '@/products/thesis/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Closes a run: POST { runId }. Builds one Merkle root over the run's per-claim reports, stores each report's
 * proof, then stamps the root on Solana devnet with THESIS_SOLANA_PAYER. Without a payer the run is
 * "pending stamp". Free: the claims were already paid for.
 */
export async function POST(req: NextRequest) {
  const visitorId = visitorFromRequest(req)
  if (!visitorId) return NextResponse.json({ error: 'no_visitor' }, { status: 401 })
  let runId: unknown
  try {
    runId = ((await req.json()) as { runId?: unknown }).runId
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  if (typeof runId !== 'string' || !UUID_RE.test(runId)) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  let run
  try {
    run = await finalizeRun(runId, visitorId)
  } catch {
    return NextResponse.json({ error: 'store_unavailable' }, { status: 503 })
  }
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const payer = payerFromEnv()
  let stamp: { status: 'stamped' | 'pending'; tx?: string; cluster?: string; error?: string } = {
    status: 'pending',
    error: 'THESIS_SOLANA_PAYER is not set',
  }
  if (payer) {
    try {
      const tx = await stampMemo(memoFor(run.merkleRoot, run.runId), payer)
      stamp = { status: 'stamped', tx, cluster: STAMP_CLUSTER }
    } catch (error) {
      stamp = { status: 'pending', error: error instanceof Error ? error.message : 'stamp_failed' }
    }
  }
  try {
    await recordStamp(run.runId, stamp)
  } catch {
    // The root and proofs are stored; the stamp outcome can be recorded on a later finalize.
  }
  return NextResponse.json({
    runId: run.runId,
    merkleRoot: run.merkleRoot,
    leaves: run.leaves,
    stamp: { status: stamp.status, tx: stamp.tx ?? null, cluster: stamp.cluster ?? null },
  })
}
