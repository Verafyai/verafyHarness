import claims from '../../../public/thesis/claims.json'

import { canonical, sha256Hex } from './canonical'
import type { Summary } from './score'
import { allUnits } from './units'

/**
 * The automatic due diligence scan: ten checks an investor would otherwise do by hand, run against public
 * sources. No AI is involved and nothing costs credits. Each check reports what it looked at, so a result can
 * be reproduced by opening the same URL.
 */

export type CheckStatus = 'pass' | 'warn' | 'fail'

export type CheckResult = {
  id: string
  area: string
  title: string
  status: CheckStatus
  detail: string
  evidence: { label: string; url: string }[]
}

export type DiligenceReport = { version: string; scannedAt: string; counts: Record<CheckStatus, number>; checks: CheckResult[] }

export const DILIGENCE_VERSION = 'verafy-diligence/1'

/** What the scan needs from the outside world. The route passes real fetchers; tests pass fakes. */
export type DiligenceDeps = {
  status: (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<number>
  json: (url: string) => Promise<unknown>
  text: (url: string) => Promise<string>
  report: () => Promise<Summary | null>
  now: () => Date
}

const PRODUCTS = [
  ['verafy.ai', 'https://www.verafy.ai'],
  ['Swarm Explorer', 'https://swarm.verafy.ai'],
  ['Verafy Explorer', 'https://explorer.verafy.ai'],
  ['Verafy Devnet', 'https://devnet.verafy.ai'],
  ['Actually Smart Contracts', 'https://asc.verafy.ai'],
] as const

const HARNESS_REPO = 'https://api.github.com/repos/Verafyai/verafyHarness'
const HARNESS_URL = 'https://github.com/Verafyai/verafyHarness'
const SIMD_URL = 'https://github.com/solana-foundation/solana-improvement-documents/discussions/724'
const SWARM_GATE = 'https://swarm.verafy.ai/api/question-gate'
const NPM = ['@verafy/sdk', '@verafy/mcp'] as const

/** 2xx and 3xx count as up. 401, 403, 405 and 429 mean the page exists but turned away an automated request. */
export function reachability(code: number): 'up' | 'blocked' | 'down' {
  if (code >= 200 && code < 400) return 'up'
  if ([401, 403, 405, 429].includes(code)) return 'blocked'
  return 'down'
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function result(id: string, area: string, title: string, status: CheckStatus, detail: string, evidence: CheckResult['evidence'] = []): CheckResult {
  return { id, area, title, status, detail, evidence }
}

const daysBetween = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / 86_400_000)

/** Every http source cited anywhere in claims.json, deduplicated. */
export function citedUrls(): string[] {
  const urls = new Set<string>()
  for (const c of claims.claims) for (const s of c.sources) if (s.startsWith('http')) urls.add(s)
  for (const c of claims.competitors) if (c.source.startsWith('http')) urls.add(c.source)
  for (const a of claims.research.areas) for (const it of a.items) urls.add(it.url)
  return [...urls]
}

/** The checks that need no network: the claims file is internally consistent and every claim is checkable. */
export function integrityCheck(): CheckResult {
  const units = allUnits()
  const ids = new Set(units.map((u) => u.id))
  const dupes = units.length - ids.size
  const dangling = claims.thesis_chain.flatMap((s) => s.rests_on.filter((r) => !ids.has(r)).map((r) => `${s.id} rests on ${r}`))
  const unlabeled = claims.claims.filter((c) => !c.label || !c.how_to_check).map((c) => c.id)
  const sourced = claims.claims.filter((c) => c.sources.some((s) => s.startsWith('http'))).length
  const hash = sha256Hex(canonical(claims))
  const problems = [
    ...(dupes ? [`${dupes} duplicate claims`] : []),
    ...dangling,
    ...(unlabeled.length ? [`no label or check: ${unlabeled.join(', ')}`] : []),
  ]
  return result(
    'D09',
    'Data integrity',
    'The claims file is consistent and every claim says how to check it',
    problems.length ? 'fail' : 'pass',
    problems.length
      ? problems.join('; ')
      : `${units.length} claims, each once; every step rests on a claim that exists; ${sourced} of ${claims.claims.length} claims link a source. claims.json sha256 ${hash.slice(0, 16)}.`,
    [{ label: 'claims.json', url: 'https://www.verafy.ai/thesis/claims.json' }],
  )
}

export async function runDiligence(deps: DiligenceDeps): Promise<DiligenceReport> {
  const now = deps.now()

  const productCodes = await Promise.all(PRODUCTS.map(([, url]) => safe(() => deps.status(url), 0)))
  const productsUp = productCodes.filter((c) => reachability(c) === 'up').length
  const d01 = result(
    'D01',
    'Product',
    'The products named in the pitch are live',
    productsUp === PRODUCTS.length ? 'pass' : productsUp >= PRODUCTS.length - 1 ? 'warn' : 'fail',
    PRODUCTS.map(([name], i) => `${name} ${reachability(productCodes[i] ?? 0)}`).join(', '),
    PRODUCTS.map(([label, url]) => ({ label, url })),
  )

  const gateCode = await safe(
    () =>
      deps.status(SWARM_GATE, {
        method: 'POST',
        body: JSON.stringify({ text: 'Is water wet?', mode: 'fact-check' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    0,
  )
  const d02 = result(
    'D02',
    'Infrastructure',
    'The jury service answers',
    gateCode === 200 ? 'pass' : 'fail',
    gateCode === 200
      ? "Swarm Explorer's question check answered a test question."
      : `Swarm Explorer's question check returned ${gateCode || 'no response'}. Jury runs fail until its model provider key works.`,
    [{ label: 'Swarm Explorer', url: 'https://swarm.verafy.ai' }],
  )

  // The GitHub API is rate limited per IP; the commit feed and the raw license file are the fallbacks.
  const repo = (await safe(() => deps.json(HARNESS_REPO), null)) as { pushed_at?: string; license?: { spdx_id?: string } | null; private?: boolean } | null
  let pushed = repo?.pushed_at ? new Date(repo.pushed_at) : null
  if (!pushed) {
    const feed = await safe(() => deps.text(`${HARNESS_URL}/commits/main.atom`), '')
    const updated = /<updated>([^<]+)<\/updated>/.exec(feed)?.[1]
    if (updated && !Number.isNaN(Date.parse(updated))) pushed = new Date(updated)
  }
  const age = pushed ? daysBetween(now, pushed) : null
  const d03 = result(
    'D03',
    'Engineering',
    'The core code is public and actively worked on',
    age === null ? 'fail' : age <= 14 ? 'pass' : age <= 60 ? 'warn' : 'fail',
    age === null ? 'Could not read the Verafy Harness repository.' : `Verafy Harness last pushed ${age === 0 ? 'today' : `${age} days ago`}.`,
    [{ label: 'Verafy Harness on GitHub', url: HARNESS_URL }],
  )

  let spdx = repo?.license?.spdx_id ?? null
  if (!spdx) {
    const license = await safe(() => deps.text('https://raw.githubusercontent.com/Verafyai/verafyHarness/main/LICENSE'), '')
    spdx = /MIT License/i.test(license) ? 'MIT' : /Apache License/i.test(license) ? 'Apache-2.0' : null
  }
  const d04 = result(
    'D04',
    'IP and licensing',
    'The code carries an open-source license',
    spdx && spdx !== 'NOASSERTION' ? 'pass' : 'warn',
    spdx && spdx !== 'NOASSERTION' ? `Verafy Harness is licensed ${spdx}.` : 'No license detected on the repository.',
    [{ label: 'License', url: `${HARNESS_URL}/blob/main/LICENSE` }],
  )

  const downloads = await Promise.all(
    NPM.map((pkg) => safe(async () => Number(((await deps.json(`https://api.npmjs.org/downloads/point/last-month/${pkg}`)) as { downloads?: number }).downloads ?? NaN), NaN)),
  )
  const known = downloads.filter((n) => Number.isFinite(n))
  const total = known.reduce((a, b) => a + b, 0)
  const d05 = result(
    'D05',
    'Adoption',
    'Developers install the SDK and MCP server',
    !known.length ? 'fail' : total > 0 ? 'pass' : 'warn',
    known.length
      ? `${NPM.map((p, i) => `${p} ${Number.isFinite(downloads[i]) ? downloads[i] : 'unknown'}`).join(', ')} npm downloads in the last 30 days. Downloads count installs, including CI, not users.`
      : 'Could not read npm download counts.',
    NPM.map((p) => ({ label: p, url: `https://www.npmjs.com/package/${p}` })),
  )

  const simdCode = await safe(() => deps.status(SIMD_URL), 0)
  const d06 = result(
    'D06',
    'Ecosystem',
    'The Solana standard proposal exists in public',
    reachability(simdCode) === 'up' ? 'pass' : reachability(simdCode) === 'blocked' ? 'warn' : 'fail',
    reachability(simdCode) === 'down'
      ? 'SIMD discussion #724 did not load.'
      : 'SIMD discussion #724 is open on the Solana Foundation repository. A draft discussion is not acceptance.',
    [{ label: 'SIMD discussion #724', url: SIMD_URL }],
  )

  const founderCode = await safe(() => deps.status('https://rexstjohn.com'), 0)
  const d07 = result(
    'D07',
    'Team',
    "The founder's track record is published",
    reachability(founderCode) === 'up' ? 'pass' : 'warn',
    reachability(founderCode) === 'up' ? 'The founder site, with his record of work, is online.' : 'The founder site did not load.',
    [{ label: 'rexstjohn.com', url: 'https://rexstjohn.com' }],
  )

  const urls = citedUrls()
  const codes = await Promise.all(urls.map((u) => safe(() => deps.status(u), 0)))
  const down = urls.filter((_, i) => reachability(codes[i] ?? 0) === 'down')
  const blocked = urls.filter((_, i) => reachability(codes[i] ?? 0) === 'blocked').length
  const d08 = result(
    'D08',
    'Evidence',
    'The sources behind the claims still load',
    down.length === 0 ? 'pass' : down.length <= Math.ceil(urls.length * 0.1) ? 'warn' : 'fail',
    `${urls.length - down.length} of ${urls.length} cited sources load${blocked ? ` (${blocked} turned away an automated request but exist)` : ''}.${down.length ? ` Not loading: ${down.slice(0, 5).join(', ')}${down.length > 5 ? ` and ${down.length - 5} more` : ''}.` : ''}`,
    down.slice(0, 5).map((u) => ({ label: u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 50), url: u })),
  )

  const d09 = integrityCheck()

  const summary = await safe(() => deps.report(), null)
  const last = summary?.lastScan ? new Date(summary.lastScan) : null
  const reportAge = last ? daysBetween(now, last) : null
  const d10 = result(
    'D10',
    'Verification',
    'An independent jury has checked the claims recently',
    reportAge === null ? 'fail' : reportAge <= 30 ? (summary?.latest?.stampTx ? 'pass' : 'warn') : 'warn',
    reportAge === null
      ? 'No jury run has been stored yet.'
      : `Last jury run ${reportAge === 0 ? 'today' : `${reportAge} days ago`}, ${summary?.checked} of ${summary?.total} claims. ${summary?.latest?.stampTx ? 'Stamped on Solana.' : 'Not stamped on Solana yet.'}`,
    [{ label: 'Claims ledger', url: 'https://www.verafy.ai/thesis/claims#summary' }],
  )

  const checks = [d01, d02, d03, d04, d05, d06, d07, d08, d09, d10]
  const counts = { pass: 0, warn: 0, fail: 0 } as Record<CheckStatus, number>
  for (const c of checks) counts[c.status] += 1
  return { version: DILIGENCE_VERSION, scannedAt: now.toISOString(), counts, checks }
}
