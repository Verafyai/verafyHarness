'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { verdictBars } from '@/products/thesis/rationale'
import { VERDICT_ID, VERDICT_UNIT } from '@/products/thesis/units'

import { pacific } from './Dashboard'
import { Distribution, labColor, type ClaimRuling } from './JuryDistribution'
import { REPORT_REFRESH, runClaims } from './runner'
import { Snapshot, SnapshotSource } from './Snapshot'

const BARS = [
  { key: 'invest', title: 'Why invest', color: '#5fe0c8' },
  { key: 'concerns', title: 'Hesitations and objections', color: '#e0b45f' },
  { key: 'against', title: 'Why it might not make sense', color: '#f28b82' },
] as const

/**
 * The final question, after the claims: would a skilled pre-seed investor invest at the stated terms? Shown large,
 * with each juror's reasoning split into why invest, hesitations, and why not.
 */
export function FinalVerdict({ hideWhenEmpty = false, readOnly = false }: { hideWhenEmpty?: boolean; readOnly?: boolean }) {
  const [r, setR] = useState<ClaimRuling | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    fetch(`/api/thesis/report?claims=${VERDICT_ID}`, { cache: 'no-store' })
      .then((res) => res.json() as Promise<{ latest?: Record<string, ClaimRuling> }>)
      .then((d) => setR(d.latest?.[VERDICT_ID] ?? null))
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(REPORT_REFRESH, load)
    return () => window.removeEventListener(REPORT_REFRESH, load)
  }, [load])

  if (hideWhenEmpty && (!loaded || !r)) return null

  const parts = (r?.answers ?? []).map((a) => ({ model: a.model, ...verdictBars(a.vote, a.rationale ?? '') }))
  const yes = r?.answers.filter((a) => a.vote === 'yes').length ?? 0

  return (
    <div data-snapshot className="border border-[#3f8f80] bg-[#0a1017] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-base font-semibold text-[#5fe0c8]">The final question</p>
        {r ? <Snapshot name="final-question" /> : null}
      </div>
      <h2 className="mt-2 text-2xl font-bold leading-snug text-white md:text-3xl">{VERDICT_UNIT.text}</h2>
      {r ? (
        <>
          <Distribution ruling={r} large labels={{ high: 'Would invest', low: 'Would not invest' }} />
          <p className="m-0 mt-2 text-base text-[#e6edf3]">
            {yes} of {r.answers.filter((a) => a.vote !== 'abstain').length} jurors who answered would invest. Ruled {pacific(r.timestamp)}, after the jury checked the claims.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {BARS.map((b) => (
              <div key={b.key} className="border-t-4 bg-[#0e141b] p-4" style={{ borderColor: b.color }}>
                <p className="m-0 text-lg font-semibold" style={{ color: b.color }}>
                  {b.title}
                </p>
                <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
                  {parts.flatMap((p) =>
                    p[b.key].map((line, n) => (
                      <li key={`${p.model}-${n}`} className="flex gap-2 text-base leading-snug text-[#e6edf3]">
                        <span className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: labColor(p.model) }} title={p.model} />
                        <span>{line}</span>
                      </li>
                    )),
                  )}
                  {parts.every((p) => !p[b.key].length) ? <li className="text-base text-[#9aa6b2]">No juror raised one.</li> : null}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="m-0 mt-3 text-base text-[#e6edf3]">
          The jury answers this after it checks every claim. A full run asks it automatically.
        </p>
      )}
      {r ? <SnapshotSource anchor="final" /> : null}
      {readOnly ? null : (
        <div data-snapshot-skip className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={running}
            data-track="thesis_final_question"
            onClick={async () => {
              setRunning(true)
              setNote('')
              const out = await runClaims([VERDICT_ID], () => undefined)
              const o = out.outcomes[0]
              if (o && !o.ok) setNote(o.message || o.error || 'The jury could not rule.')
              setRunning(false)
              load()
            }}
            className="inline-flex min-h-11 items-center rounded-md border border-[#3f8f80] px-5 text-base text-[#5fe0c8] hover:bg-[#0e141b] disabled:opacity-60"
          >
            {running ? 'The jury is ruling...' : r ? 'Ask again (5 credits)' : 'Ask the jury now (5 credits)'}
          </button>
          {note ? <span className="text-base text-[#e0b45f]">{note}</span> : null}
        </div>
      )}
    </div>
  )
}
