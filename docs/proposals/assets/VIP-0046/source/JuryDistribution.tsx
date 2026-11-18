'use client'

import React, { useEffect, useState } from 'react'

import { modelColorHex, modelIcon, shortModelName } from '@/products/thesis/model-color'

import { REPORT_REFRESH } from './runner'

/** The five labs on the board, in Swarm Explorer's colors and with its model icons. */
export const LABS = [
  { id: 'openai', name: 'GPT', lab: 'OpenAI', model: 'openai/gpt' },
  { id: 'anthropic', name: 'Claude', lab: 'Anthropic', model: 'anthropic/claude-opus-5.5' },
  { id: 'google', name: 'Gemini', lab: 'Google', model: 'google/gemini-4-argon' },
  { id: 'xai', name: 'Grok', lab: 'xAI', model: 'x-ai/grok-4.7' },
  { id: 'deepseek', name: 'DeepSeek', lab: 'DeepSeek', model: 'deepseek/deepseek-v4-pro' },
] as const

export function labColor(model: string): string {
  return modelColorHex(model)
}

export type JurorVote = { model: string; vote: string; score: number; rationale?: string }
export type ClaimRuling = {
  claimId: string
  verdict: string
  score: number
  interval90: [number, number]
  timestamp: string
  answers: JurorVote[]
}

function Logo({ model, size = 26 }: { model: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={modelIcon(model)} alt="" crossOrigin="anonymous" width={size} height={size} className="shrink-0 rounded-md object-contain" style={{ width: size, height: size }} />
  )
}

/** The jury legend: each lab's icon and color, with the not-endorsed line. */
export function JuryLegend() {
  return (
    <div>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-5">
        {LABS.map((l) => (
          <li key={l.id} className="flex items-center gap-2 rounded-[10px] border border-[#232c36] bg-[#121922] p-2">
            <Logo model={l.model} />
            <span className="inline-block h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: labColor(l.model), boxShadow: '0 0 0 2px #121922' }} />
            <span className="min-w-0">
              <span className="block text-[13px] text-[#c9d2dc]">{l.name}</span>
              <span className="block text-[11px] text-[#9aa6b2]">not endorsed by {l.lab}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-sm text-[#9aa6b2]">
        These labs do not endorse Verafy. Their names and icons identify the models we run as jurors through public APIs.
      </p>
    </div>
  )
}

const clampLeft = (percent: number, size: number) => `clamp(${size / 2}px, ${percent}%, calc(100% - ${size / 2}px))`

/**
 * A ruling drawn exactly like a Swarm Explorer answer card: the jury percentage and verdict, a pill with how
 * many models responded and the range, the slider (track, 90% band, 50% tick, one colored dot per juror and the
 * median marker), and a grid of juror chips with each model's icon, color and score.
 */
export function Distribution({
  ruling,
  large = false,
  labels = { high: 'Holds', low: 'Does not hold' },
}: {
  ruling: ClaimRuling | null
  large?: boolean
  labels?: { high: string; low: string }
}) {
  if (!ruling) {
    return (
      <div className="mt-3">
        <div className="relative h-[22px]">
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#1d2630]" />
        </div>
        <p className="m-0 mt-1 text-sm text-[#9aa6b2]">Awaiting the jury. Run or recheck to put five models on this claim.</p>
      </div>
    )
  }
  const voters = ruling.answers.filter((a) => a.vote !== 'abstain')
  const asked = Math.max(5, ruling.answers.length)
  const verdict = ruling.verdict === 'valid' ? labels.high : ruling.verdict === 'unsupported' ? labels.low : 'Split'
  const [low, high] = ruling.interval90
  const anchor = ruling.score < 12 ? 'translate-x-0' : ruling.score > 88 ? '-translate-x-full' : '-translate-x-1/2'
  return (
    <div className="mt-3">
      <div className="flex items-center gap-4">
        <p className={`m-0 font-extrabold leading-[0.9] tracking-[-0.03em] text-white tabular-nums ${large ? 'text-[64px]' : 'text-[44px]'}`}>
          {ruling.score}%
        </p>
        <div>
          <p className={`m-0 font-semibold leading-tight text-white ${large ? 'text-xl' : 'text-[15px]'}`}>{verdict}</p>
          <p className="m-0 mt-0.5 text-[12.5px] leading-snug text-[#a3aeb9]">chance it holds, jury median</p>
        </div>
      </div>
      <p className="m-0 mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[#232c36] px-3 py-1 text-[12.5px] text-[#c9d2dc]">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#5fe0c8]" aria-hidden="true" />
        <span>
          {voters.length} of {asked} responded, range {low} to {high}%
        </span>
      </p>

      <div className="mt-4" role="img" aria-label={`Jury median ${ruling.score} percent; ${voters.map((p) => `${p.model} ${p.score}`).join(', ')}`}>
        <div className="relative h-6">
          <span className={`absolute bottom-0.5 whitespace-nowrap text-[11px] font-semibold leading-none text-[#5fe0c8] tabular-nums ${anchor}`} style={{ left: `${ruling.score}%` }}>
            median {ruling.score}%
          </span>
        </div>
        <div className="relative h-[22px]">
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#1d2630]" />
          <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ left: `${low}%`, width: `${Math.max(high - low, 0)}%`, background: 'rgba(95, 224, 200, 0.16)' }} />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-px -translate-y-1/2 bg-[#3a4652]" />
          {voters.map((p) => (
            <span
              key={p.model}
              title={`${shortModelName(p.model)} ${p.score}%`}
              className="absolute top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: clampLeft(p.score, 9), background: labColor(p.model), boxShadow: '0 0 0 2px #0e141b' }}
            />
          ))}
          <span className="absolute top-1/2 z-[1] h-[22px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5fe0c8]" style={{ left: `clamp(2.5px, ${ruling.score}%, calc(100% - 2.5px))` }} />
        </div>
        <div className="mt-1 flex justify-between gap-2 text-[10.5px] leading-tight tracking-[0.08em] text-[#5d6875]">
          <span>0% NO</span>
          <span className="text-center">50%</span>
          <span className="text-right">YES 100%</span>
        </div>
      </div>

      <div className={`mt-4 grid gap-2 ${large ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {ruling.answers.map((p) => (
          <div
            key={p.model}
            title={p.model}
            className={`flex min-w-0 items-center gap-2 rounded-[10px] border border-[#232c36] bg-[#121922] p-2 ${p.vote === 'abstain' ? 'opacity-60' : ''}`}
          >
            <Logo model={p.model} />
            <span className="inline-block h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: labColor(p.model), boxShadow: '0 0 0 2px #121922' }} aria-hidden="true" />
            <span className="min-w-0 truncate text-[13px] leading-tight text-[#c9d2dc]">{shortModelName(p.model)}</span>
            <span className="ml-auto shrink-0 text-[13px] font-bold text-white tabular-nums">{p.vote === 'abstain' ? 'n/a' : `${p.score}%`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

let cache: Promise<Record<string, ClaimRuling>> | null = null
let cacheKey = ''

function loadAll(ids: string[], force = false): Promise<Record<string, ClaimRuling>> {
  const key = ids.join(',')
  if (!cache || force || key !== cacheKey) {
    cacheKey = key
    cache = fetch(`/api/thesis/report?claims=${key}`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ latest?: Record<string, ClaimRuling> }>)
      .then((d) => d.latest ?? {})
      .catch(() => ({}))
  }
  return cache
}

/** The distribution for one claim, from one shared fetch of every claim's latest ruling. */
export function ClaimDistribution({ id, all }: { id: string; all: string[] }) {
  const [ruling, setRuling] = useState<ClaimRuling | null>(null)
  useEffect(() => {
    let live = true
    const pull = (force: boolean) =>
      loadAll(all, force).then((m) => {
        if (live) setRuling(m[id] ?? null)
      })
    void pull(false)
    const onRefresh = () => void pull(true)
    window.addEventListener(REPORT_REFRESH, onRefresh)
    return () => {
      live = false
      window.removeEventListener(REPORT_REFRESH, onRefresh)
    }
  }, [id, all])
  return <Distribution ruling={ruling} />
}

