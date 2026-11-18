'use client'

import React, { useEffect, useState } from 'react'

import { THESIS } from '@/products/thesis/identity'
import { VERDICT_ID } from '@/products/thesis/units'

import { CONCURRENCY, runClaims, type ClaimOutcome, type RunOutcome } from './runner'

const VERDICT_TEXT: Record<string, string> = { valid: 'valid', contested: 'contested', unsupported: 'unsupported' }

function outcomeLine(o: ClaimOutcome): string {
  if (o.ok) return `${o.claimId}: ${VERDICT_TEXT[o.verdict ?? ''] ?? o.verdict}, score ${o.score}, 90% interval ${o.interval90?.[0]} to ${o.interval90?.[1]}`
  return `${o.claimId}: not checked (${o.message || o.error || `status ${o.status}`})`
}

/**
 * Runs the five-model jury through Swarm Explorer on every runnable claim, one claim at a time, for
 * THESIS.claimCost credits each. Failed claims are refunded. Stops at the first 503 question_check_failed.
 */
export function RunJury({ ids }: { ids: string[] }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [log, setLog] = useState<ClaimOutcome[]>([])
  const [active, setActive] = useState<string[]>([])
  const [result, setResult] = useState<RunOutcome | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const total = ids.length + 1
  const all = total * THESIS.claimCost

  useEffect(() => {
    if (state !== 'running') return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [state])

  useEffect(() => {
    if (state !== 'running') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  async function start() {
    setState('running')
    setLog([])
    setActive([])
    setResult(null)
    setStartedAt(Date.now())
    setNow(Date.now())
    const r = await runClaims(
      [...ids, VERDICT_ID],
      (o) => {
        setLog((prev) => [o, ...prev])
        setActive((prev) => prev.filter((x) => x !== o.claimId))
      },
      (id) => setActive((prev) => [...prev, id]),
    )
    setResult(r)
    setActive([])
    setState('done')
  }

  const okCount = log.filter((o) => o.ok).length
  const done = log.length
  const pct = Math.round((done / total) * 100)
  const elapsed = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0
  const left = done && state === 'running' ? Math.round(((elapsed / done) * (total - done)) / 60) : null
  const BTN2 =
    'inline-flex min-h-11 items-center justify-center rounded-md border border-[#232c36] px-5 text-base text-[#e6edf3] hover:border-[#5fe0c8] hover:text-[#5fe0c8]'
  return (
    <section id="run" aria-label="Run the jury" className="scroll-mt-24 border border-[#232c36] bg-[#0a1017] px-5 py-8 text-center md:px-8">
      <p className="m-0 text-base font-semibold text-[#5fe0c8]">Check it yourself</p>
      <h2 className="m-0 mt-2 text-2xl font-bold text-white">Ask the jury to rule on every claim</h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-[#9aa6b2]">
        The five board models rule on all {ids.length} claims, {CONCURRENCY} at a time, then answer the final investor question. Each
        claim costs {THESIS.claimCost} credits ({all} for the full run), and you pay only for rulings that come back.
      </p>
      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={start}
          disabled={state === 'running'}
          data-track="thesis_run"
          className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#5fe0c8] px-8 text-lg font-semibold text-[#05080d] hover:bg-[#8af0dc] disabled:opacity-60"
        >
          {state === 'running' ? `The jury is ruling: ${done} of ${total}` : 'Run the full check'}
        </button>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <a href="/thesis/report?print=1" target="_blank" rel="noopener" className={BTN2} data-track="thesis_pdf">
          Download PDF report
        </a>
        <CopyPrompt className={BTN2} />
        <a href="/thesis/VERIFY-THESIS.md" className={BTN2}>
          Read the spec
        </a>
        <a href="/thesis/claims.json" className={BTN2}>
          claims.json
        </a>
      </div>
      {state !== 'idle' ? (
        <div className="mx-auto mt-6 w-full max-w-2xl border border-[#232c36] bg-[#0e141b] p-4 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-2xl font-bold text-white">{pct}%</span>
            <span className="font-mono text-sm text-[#9aa6b2]">
              {done} of {total} done{left !== null ? `, about ${Math.max(1, left)} min left` : ''}
            </span>
          </div>
          <div className="mt-2 h-2 w-full bg-[#16202a]">
            <div className="h-2 bg-[#5fe0c8] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="m-0 mt-2 font-mono text-sm text-[#9aa6b2]">
            {okCount} ruled, {done - okCount} not ruled, {okCount * THESIS.claimCost} credits charged
          </p>
          {active.length ? (
            <p className="m-0 mt-1 font-mono text-sm text-[#5fe0c8]">Jury ruling now: {active.join(', ')}</p>
          ) : null}
          {state === 'running' ? (
            <p className="m-0 mt-1 text-sm text-[#e0b45f]">Keep this page open until the run finishes.</p>
          ) : null}
          <ol className="mt-2 max-h-64 list-none space-y-1 overflow-auto p-0 font-mono text-sm">
            {log.map((o) => (
              <li key={o.claimId} className={o.ok ? 'text-[#e6edf3]' : 'text-[#f28b82]'}>
                {outcomeLine(o)}
              </li>
            ))}
          </ol>
          {result?.stopped ? <p className="m-0 mt-2 text-base text-[#e0b45f]">Stopped at {result.stopped.claimId}: {result.stopped.reason}</p> : null}
          {result?.merkleRoot ? (
            <p className="m-0 mt-2 break-all font-mono text-sm text-[#9aa6b2]">
              Merkle root {result.merkleRoot}.{' '}
              {result.stamp?.tx ? (
                <a className="text-[#5fe0c8] underline" href={`https://explorer.verafy.ai/thesis/${result.stamp.tx}`}>
                  Stamped on Solana devnet: see it on Verafy Explorer
                </a>
              ) : (
                'Pending stamp.'
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** Reruns the jury on one claim for THESIS.claimCost credits. The old report is kept; this adds a version. */
export function RecheckClaim({ id }: { id: string }) {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const [line, setLine] = useState('')
  return (
    <span data-snapshot-skip className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={state === 'running'}
        data-track="thesis_recheck"
        onClick={async () => {
          setState('running')
          const r = await runClaims([id], () => undefined)
          const o = r.outcomes[0]
          setLine(o ? outcomeLine(o) : '')
          setState('done')
        }}
        className="inline-flex min-h-9 items-center rounded border border-[#3f8f80] px-3 text-sm text-[#5fe0c8] hover:bg-[#0e141b] disabled:opacity-60"
      >
        {state === 'running' ? 'Checking...' : `Recheck (${THESIS.claimCost} credits)`}
      </button>
      {line ? <span className="font-mono text-sm text-[#9aa6b2]">{line}</span> : null}
    </span>
  )
}

/** Copies the spec link and instructions so anyone can run it on their own model. */
export function CopyPrompt({ className }: { className?: string } = {}) {
  const [copied, setCopied] = useState(false)
  const text =
    'Read the spec at https://www.verafy.ai/thesis/VERIFY-THESIS.md and the claims at https://www.verafy.ai/thesis/claims.json. ' +
    'Run every task in the spec with web search on, and return the JSON output it defines followed by a plain-language summary.'
  return (
    <button
      type="button"
      data-track="thesis_copy_prompt"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch {
          setCopied(false)
        }
      }}
      className={className ?? 'inline-flex min-h-11 items-center rounded-md border border-[#3f8f80] px-5 text-base font-medium text-[#5fe0c8] hover:bg-[#0e141b]'}
    >
      {copied ? 'Copied. Paste it into any model.' : 'Copy the prompt for your own model'}
    </button>
  )
}
