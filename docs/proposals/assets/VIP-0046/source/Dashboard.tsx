'use client'

import React, { useEffect, useState } from 'react'

import type { Summary, Verdict } from '@/products/thesis/score'

import { REPORT_REFRESH } from './runner'

type Run = {
  runId: string
  finalizedAt: string
  merkleRoot: string
  stampStatus: string
  stampTx: string | null
  stampCluster: string | null
  claims: number
}
type ReportResponse = { configured: boolean; summary: Summary; runs: Run[]; error?: string }

const TEAL = '#5fe0c8'
const DEEP = '#3f8f80'
const AMBER = '#e0b45f'
const RED = '#f28b82'
const LINE = '#232c36'
const MUTED = '#9aa6b2'

const VERDICT_COLOR: Record<Verdict, string> = { valid: TEAL, contested: AMBER, unsupported: RED }
const VERDICT_LABEL: Record<Verdict, string> = { valid: 'valid', contested: 'contested', unsupported: 'unsupported' }

let cache: Promise<ReportResponse | null> | null = null

function load(force = false): Promise<ReportResponse | null> {
  if (!cache || force) {
    cache = fetch('/api/thesis/report', { cache: 'no-store' })
      .then((r) => r.json() as Promise<ReportResponse>)
      .catch(() => null)
  }
  return cache
}

/** The latest unified report, shared by the dashboard and the nav entry, refreshed after every run. */
function useReport(): { data: ReportResponse | null; loading: boolean } {
  const [data, setData] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    const pull = (force: boolean) =>
      load(force).then((d) => {
        if (!live) return
        setData(d)
        setLoading(false)
      })
    void pull(false)
    const onRefresh = () => void pull(true)
    window.addEventListener(REPORT_REFRESH, onRefresh)
    return () => {
      live = false
      window.removeEventListener(REPORT_REFRESH, onRefresh)
    }
  }, [])
  return { data, loading }
}

/** A date and time in Pacific time, with the zone named. */
export function pacific(iso: string, withTime = true): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' })
  if (!withTime) return date
  const time = d.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time} PT`
}

function explorerTx(tx: string, cluster: string | null): string {
  return `https://explorer.solana.com/tx/${tx}${cluster === 'mainnet-beta' ? '' : '?cluster=devnet'}`
}

function Ring({ s }: { s: Summary }) {
  const r = 52
  const c = 2 * Math.PI * r
  let offset = 0
  const parts = (['valid', 'contested', 'unsupported'] as Verdict[]).map((v) => {
    const len = s.total ? (s.counts[v] / s.total) * c : 0
    const seg = { v, len, offset }
    offset += len
    return seg
  })
  return (
    <svg viewBox="0 0 128 128" width="128" height="128" role="img" aria-label={`${s.checked} of ${s.total} claims checked`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke={LINE} strokeWidth="12" />
      {parts.map((p) =>
        p.len > 0 ? (
          <circle
            key={p.v}
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke={VERDICT_COLOR[p.v]}
            strokeWidth="12"
            strokeDasharray={`${p.len} ${c - p.len}`}
            strokeDashoffset={-p.offset}
            transform="rotate(-90 64 64)"
          />
        ) : null,
      )}
      <text x="64" y="62" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700" fontFamily="var(--font-geist-mono), monospace">
        {s.checked}
      </text>
      <text x="64" y="82" textAnchor="middle" fill={MUTED} fontSize="12" fontFamily="var(--font-geist-mono), monospace">
        of {s.total}
      </text>
    </svg>
  )
}

function Gauge({ score, interval }: { score: number | null; interval: [number, number] | null }) {
  const W = 220
  const cx = 110
  const cy = 110
  const r = 90
  const pt = (v: number) => {
    const a = Math.PI * (1 - v / 100)
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const
  }
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a)
    const [x2, y2] = pt(b)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }
  return (
    <svg viewBox={`0 0 ${W} 130`} width={W} height="130" role="img" aria-label={score === null ? 'Not scored' : `Score ${score}`}>
      <path d={arc(0, 100)} fill="none" stroke={LINE} strokeWidth="14" strokeLinecap="butt" />
      {interval ? <path d={arc(interval[0], Math.max(interval[1], interval[0] + 0.5))} fill="none" stroke={DEEP} strokeWidth="14" /> : null}
      {score !== null ? (
        (() => {
          const [x, y] = pt(score)
          const [ix, iy] = [cx + (r - 22) * Math.cos(Math.PI * (1 - score / 100)), cy - (r - 22) * Math.sin(Math.PI * (1 - score / 100))]
          return <line x1={ix} y1={iy} x2={x} y2={y} stroke={TEAL} strokeWidth="4" />
        })()
      ) : null}
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#fff" fontSize="34" fontWeight="700" fontFamily="var(--font-geist-mono), monospace">
        {score === null ? 'n/a' : score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={MUTED} fontSize="12" fontFamily="var(--font-geist-mono), monospace">
        {interval ? `90% interval ${interval[0]} to ${interval[1]}` : 'no interval yet'}
      </text>
    </svg>
  )
}

function Bar({ value, total, label, score }: { value: number; total: number; label: string; score: number | null }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-base">
        <span className="text-white">{label}</span>
        <span className="font-mono text-sm text-[#9aa6b2]">
          {value} of {total} checked{score === null ? '' : `, average ${score}`}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full bg-[#16202a]">
        <div className="h-2 bg-[#3f8f80]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function AreaTile({ title, area }: { title: string; area: Summary['economics'] }) {
  return (
    <div className="border border-[#232c36] p-4">
      <p className="m-0 text-base text-[#9aa6b2]">{title}</p>
      {area ? (
        <>
          <p className="m-0 mt-1 font-mono text-3xl font-bold text-white">{area.score}</p>
          <p className="m-0 mt-1 font-mono text-sm text-[#9aa6b2]">
            90% interval {area.interval90[0]} to {area.interval90[1]}. Average of {area.checked} of {area.total} tagged claims.
          </p>
        </>
      ) : (
        <>
          <p className="m-0 mt-1 font-mono text-3xl font-bold text-[#9aa6b2]">n/a</p>
          <p className="m-0 mt-1 text-sm text-[#9aa6b2]">No tagged claim checked yet.</p>
        </>
      )}
    </div>
  )
}

function verdictLine(s: Summary): { text: string; color: string } {
  if (!s.scanned) return { text: 'Not scanned yet', color: MUTED }
  if (!s.headline) return { text: 'Partly scanned. No "must be proven" claim has been checked, so there is no overall score yet.', color: AMBER }
  const h = s.headline
  const word = h.verdict === 'valid' ? 'holds' : h.verdict === 'contested' ? 'is contested' : 'is not supported'
  return { text: `The thesis ${word} on its weakest "must be proven" claim, ${h.claimId}.`, color: VERDICT_COLOR[h.verdict] }
}

/** The summary dashboard at the top of /thesis. Every number comes from stored jury reports; with none, it says so. */
export function SummaryDashboard() {
  const { data, loading } = useReport()
  if (loading) {
    return (
      <div className="border border-[#232c36] p-6">
        <p className="m-0 text-base text-[#9aa6b2]">Loading the latest jury report.</p>
      </div>
    )
  }
  const s = data?.summary
  if (!s) {
    return (
      <div className="border border-[#232c36] p-6">
        <p className="m-0 text-lg font-semibold text-white">Not scanned yet</p>
        <p className="m-0 mt-1 text-base text-[#9aa6b2]">The report could not be loaded. 0 claims checked.</p>
      </div>
    )
  }
  const v = verdictLine(s)
  const stamped = s.latest?.stampTx
  return (
    <div className="border border-[#232c36] bg-[#0a1017]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#232c36] p-5">
        <div className="min-w-0">
          <p className="m-0 text-base font-semibold text-[#5fe0c8]">Latest unified report</p>
          <p className="m-0 mt-1 text-xl font-semibold" style={{ color: v.color }}>
            {v.text}
          </p>
          <p className="m-0 mt-1 font-mono text-sm text-[#9aa6b2]">
            Last scanned: {s.lastScan ? pacific(s.lastScan) : 'never'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {s.scanned ? (
            stamped ? (
              <a
                href={`https://explorer.verafy.ai/thesis/${stamped}`}
                className="inline-flex items-center rounded border border-[#5fe0c8] px-3 py-1 font-mono text-sm text-[#5fe0c8]"
              >
                Stamped on Solana {s.latest?.stampCluster === 'mainnet-beta' ? '' : 'devnet'}
              </a>
            ) : (
              <StampNow />
            )
          ) : null}
        </div>
      </div>


      <div className="grid gap-px bg-[#232c36] md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-5 bg-[#0a1017] p-5">
          <Ring s={s} />
          <div>
            <p className="m-0 text-base text-[#9aa6b2]">Claims checked</p>
            <ul className="m-0 mt-2 list-none space-y-1 p-0 font-mono text-sm">
              {(['valid', 'contested', 'unsupported'] as Verdict[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5" style={{ background: VERDICT_COLOR[k] }} />
                  <span className="text-[#e6edf3]">
                    {s.counts[k]} {VERDICT_LABEL[k]}
                  </span>
                </li>
              ))}
              <li className="text-[#9aa6b2]">{s.total - s.checked} not checked</li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col items-start gap-5 bg-[#0a1017] p-5 sm:flex-row sm:items-center">
          <Gauge score={s.headline?.score ?? null} interval={s.headline?.interval90 ?? null} />
          <div className="w-full min-w-0 sm:flex-1">
            <p className="m-0 text-base text-[#9aa6b2]">Overall score</p>
            <p className="m-0 mt-1 text-base text-[#e6edf3]">
              {s.headline ? (
                <>
                  The score and interval of the weakest &ldquo;must be proven&rdquo; claim, not an average:{' '}
                  <a href={`#${s.headline.claimId}`} className="font-mono text-[#5fe0c8] underline">
                    {s.headline.claimId}
                  </a>
                  , {s.headline.text}
                </>
              ) : (
                'Set by the weakest "must be proven" claim once one is checked. Not an average.'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-[#232c36] p-5 md:grid-cols-2">
        <AreaTile title="Economics validity" area={s.economics} />
        <AreaTile title="Business model validity" area={s.business} />
      </div>

      <div className="space-y-3 border-t border-[#232c36] p-5">
        {s.tiers.map((t) => (
          <Bar key={t.tier} label={t.title} value={t.checked} total={t.total} score={t.score} />
        ))}
      </div>

      <dl className="m-0 space-y-2 border-t border-[#232c36] p-5 text-base">
        <div>
          <dt className="text-[#9aa6b2]">Jury models</dt>
          <dd className="m-0 mt-1 font-mono text-sm text-[#e6edf3]">{s.models.length ? s.models.join(', ') : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-[#9aa6b2]">Report sha256</dt>
          <dd className="m-0 mt-1 break-all font-mono text-sm text-[#e6edf3]">{s.sha256 ?? 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-[#9aa6b2]">Merkle root of the latest run</dt>
          <dd className="m-0 mt-1 break-all font-mono text-sm text-[#e6edf3]">{s.latest?.merkleRoot ?? 'None yet'}</dd>
        </div>
        {stamped ? (
          <div className="flex flex-wrap gap-4 pt-1">
            <a className="text-[#5fe0c8] underline" href={explorerTx(stamped, s.latest?.stampCluster ?? 'devnet')}>
              Solana Explorer
            </a>
            <a className="text-[#5fe0c8] underline" href={`https://explorer.verafy.ai/thesis/${stamped}`}>
              Verafy Explorer
            </a>
          </div>
        ) : null}
      </dl>

      {data?.runs?.length ? (
        <div className="border-t border-[#232c36] p-5">
          <p className="m-0 text-base text-[#9aa6b2]">Run history, newest first. Every version is kept.</p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0 font-mono text-sm">
            {data.runs.map((r) => (
              <li key={r.runId} className="flex flex-wrap gap-x-3 text-[#e6edf3]">
                <span>{pacific(r.finalizedAt)}</span>
                <span>{r.claims} claims</span>
                <span className="break-all text-[#9aa6b2]">root {r.merkleRoot.slice(0, 16)}</span>
                {r.stampTx ? (
                  <a className="text-[#5fe0c8] underline" href={explorerTx(r.stampTx, r.stampCluster)}>
                    stamped
                  </a>
                ) : (
                  <span className="text-[#e0b45f]">pending stamp</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** The Summary entry at the top of the left nav: compact score, checked count, last scan date. */
export function NavSummary() {
  const { data } = useReport()
  const s = data?.summary
  return (
    <a href="#summary" className="block border-l-2 border-[#5fe0c8] py-1.5 pl-4 hover:text-[#5fe0c8]">
      <span className="block text-base font-semibold text-white">Summary</span>
      <span className="block font-mono text-sm text-[#9aa6b2]">
        {!s || !s.scanned ? (
          <>Not scanned yet, 0 checked</>
        ) : (
          <>
            {s.headline ? `Score ${s.headline.score}` : 'No score yet'}, {s.checked} of {s.total} checked
            <br />
            {s.lastScan ? pacific(s.lastScan, false) : ''}
          </>
        )}
      </span>
    </a>
  )
}

/** "Pending stamp" with a button that stamps finalized runs on Solana devnet (free; the server holds the payer). */
function StampNow() {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  return (
    <span className="inline-flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        disabled={busy}
        data-track="thesis_stamp"
        onClick={async () => {
          setBusy(true)
          setNote('')
          try {
            const res = await fetch('/api/thesis/stamp', { method: 'POST' })
            const body = (await res.json()) as { message?: string; stamped?: { tx?: string; error?: string }[] }
            if (!res.ok) setNote(body.message ?? 'Could not stamp right now.')
            else if (!body.stamped?.length) setNote('Nothing is waiting for a stamp.')
            else if (body.stamped.some((x) => x.tx)) window.dispatchEvent(new Event(REPORT_REFRESH))
            else setNote(body.stamped[0]?.error ?? 'The stamp did not go through.')
          } catch {
            setNote('Could not stamp right now.')
          }
          setBusy(false)
        }}
        className="inline-flex items-center rounded border border-[#e0b45f] px-3 py-1 font-mono text-sm text-[#e0b45f] hover:bg-[#16202a] disabled:opacity-60"
      >
        {busy ? 'Stamping on Solana...' : 'Pending stamp: stamp it now'}
      </button>
      {note ? <span className="text-sm text-[#e0b45f]">{note}</span> : null}
    </span>
  )
}
