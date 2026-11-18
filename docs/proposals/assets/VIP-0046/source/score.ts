import { canonical, sha256Hex } from './canonical'
import { runnableUnits, TIER_TITLES, type Category, type Tier, type Unit } from './units'

/** One juror's answer, as Swarm returns it. `model` is Swarm's own model name, unchanged. */
export type JurorAnswer = {
  model: string
  provider: string | null
  vote: 'yes' | 'no' | 'abstain'
  confidence: number | null
  rationale: string
  /** 0 to 100: confidence the claim holds. */
  score: number
}

export type Verdict = 'valid' | 'contested' | 'unsupported'

/** The stamped per-claim report. Its canonical JSON is hashed into a Merkle leaf. */
export type ClaimReport = {
  spec: string
  version: number
  claimId: string
  tier: Tier
  categories: Category[]
  question: string
  answers: JurorAnswer[]
  score: number
  interval90: [number, number]
  verdict: Verdict
  timestamp: string
}

function voteOf(raw: unknown): JurorAnswer['vote'] {
  if (raw === true) return 'yes'
  if (raw === false) return 'no'
  const v = String(raw ?? '').trim().toLowerCase()
  if (['yes', 'true', 'y', 'agree', 'supported', 'valid'].includes(v)) return 'yes'
  if (['no', 'false', 'n', 'disagree', 'unsupported', 'invalid'].includes(v)) return 'no'
  return 'abstain'
}

function confidenceOf(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return null
  const c = n > 1 ? n / 100 : n
  return Math.min(1, Math.max(0, c))
}

/**
 * A juror's score for the claim: its confidence when it votes yes, one minus its confidence when it votes no,
 * and 50 when it abstains or gives no confidence.
 */
export function jurorScore(vote: JurorAnswer['vote'], confidence: number | null): number {
  if (vote === 'abstain' || confidence === null) return 50
  return Math.round((vote === 'yes' ? confidence : 1 - confidence) * 100)
}

/** Pulls the juror answers out of a Swarm broadcast response. Accepts both response shapes the API has used. */
export function parseJurors(body: unknown): JurorAnswer[] {
  const b = (body ?? {}) as Record<string, unknown>
  const cd = (b.confidenceData ?? {}) as Record<string, unknown>
  const list = Array.isArray(cd.validatorResponses) && cd.validatorResponses.length
    ? (cd.validatorResponses as Record<string, unknown>[])
    : Array.isArray(b.responses)
      ? (b.responses as Record<string, unknown>[])
      : []
  return list
    .map((r) => {
      const model = String(r.modelName ?? r.model ?? r.validatorName ?? r.profileName ?? '').trim()
      const vote = voteOf(r.vote)
      const confidence = confidenceOf(r.confidence)
      return {
        model,
        provider: typeof r.provider === 'string' ? r.provider : null,
        vote,
        confidence,
        rationale: typeof r.rationale === 'string' ? r.rationale.slice(0, 2000) : '',
        score: jurorScore(vote, confidence),
      }
    })
    .filter((a) => a.model && a.vote !== 'abstain')
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * Same rule as scripts/thesis/combine.mjs: the score is the median juror score and the 90% interval runs from
 * the lowest to the highest juror score. The verdict is the majority vote; a tie is contested.
 */
export function combine(answers: JurorAnswer[]): { score: number; interval90: [number, number]; verdict: Verdict } {
  if (!answers.length) throw new Error('no_jurors')
  const scores = answers.map((a) => a.score)
  const yes = answers.filter((a) => a.vote === 'yes').length
  const no = answers.filter((a) => a.vote === 'no').length
  const verdict: Verdict = yes > no ? 'valid' : no > yes ? 'unsupported' : 'contested'
  return { score: Math.round(median(scores)), interval90: [Math.min(...scores), Math.max(...scores)], verdict }
}

export function buildClaimReport(input: {
  unit: Unit
  question: string
  answers: JurorAnswer[]
  version: number
  spec: string
  now: Date
}): ClaimReport {
  const c = combine(input.answers)
  return {
    spec: input.spec,
    version: input.version,
    claimId: input.unit.id,
    tier: input.unit.tier,
    categories: input.unit.categories,
    question: input.question,
    answers: input.answers,
    score: c.score,
    interval90: c.interval90,
    verdict: c.verdict,
    timestamp: input.now.toISOString(),
  }
}

/** A stored report, with what the run and stamp added after it was written. */
export type StoredReport = ClaimReport & {
  sha256: string
  runId: string
  merkleRoot: string | null
  stampTx: string | null
  stampCluster: string | null
}

/** The latest version of each claim. Older versions are kept in storage; this only picks which one counts. */
export function latestPerClaim(reports: StoredReport[]): StoredReport[] {
  const best = new Map<string, StoredReport>()
  for (const r of reports) {
    const cur = best.get(r.claimId)
    if (!cur || r.version > cur.version) best.set(r.claimId, r)
  }
  return [...best.values()]
}

export type AreaScore = { score: number; interval90: [number, number]; checked: number; total: number } | null

export type Summary = {
  scanned: boolean
  lastScan: string | null
  total: number
  checked: number
  counts: Record<Verdict, number>
  /** The weakest "must be proven" claim: the overall score is its score, not an average. */
  headline: { claimId: string; text: string; score: number; interval90: [number, number]; verdict: Verdict } | null
  economics: AreaScore
  business: AreaScore
  tiers: { tier: Tier; title: string; checked: number; total: number; score: number | null; counts: Record<Verdict, number> }[]
  models: string[]
  /** sha256 of the unified report: the canonical list of (claim, version, report sha256) it is built from. */
  sha256: string | null
  latest: { runId: string; merkleRoot: string | null; stampTx: string | null; stampCluster: string | null } | null
}

function zero(): Record<Verdict, number> {
  return { valid: 0, contested: 0, unsupported: 0 }
}

function area(reports: StoredReport[], units: Unit[], cat: Category): AreaScore {
  const pool = units.filter((u) => u.categories.includes(cat))
  const done = reports.filter((r) => r.categories.includes(cat))
  if (!done.length) return null
  const avg = (xs: number[]) => Math.round(xs.reduce((n, x) => n + x, 0) / xs.length)
  return {
    score: avg(done.map((r) => r.score)),
    interval90: [avg(done.map((r) => r.interval90[0])), avg(done.map((r) => r.interval90[1]))],
    checked: done.length,
    total: pool.length,
  }
}

/** The dashboard, from every stored report. With no reports it is the empty state: nothing scanned, 0 checked. */
export function summarize(all: StoredReport[], units: Unit[] = runnableUnits()): Summary {
  const ids = new Set(units.map((u) => u.id))
  const reports = latestPerClaim(all).filter((r) => ids.has(r.claimId))
  const counts = zero()
  for (const r of reports) counts[r.verdict] += 1
  const tiers = (Object.keys(TIER_TITLES) as Tier[]).map((tier) => {
    const done = reports.filter((r) => r.tier === tier)
    const c = zero()
    for (const r of done) c[r.verdict] += 1
    return {
      tier,
      title: TIER_TITLES[tier],
      checked: done.length,
      total: units.filter((u) => u.tier === tier).length,
      score: done.length ? Math.round(done.reduce((n, r) => n + r.score, 0) / done.length) : null,
      counts: c,
    }
  })
  const proven = reports
    .filter((r) => r.tier === 'proven')
    .sort((a, b) => a.score - b.score || a.interval90[0] - b.interval90[0] || a.claimId.localeCompare(b.claimId))
  const weakest = proven[0]
  const newest = [...reports].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  const models = [...new Set(reports.flatMap((r) => r.answers.map((a) => a.model)))].sort()
  return {
    scanned: reports.length > 0,
    lastScan: newest?.timestamp ?? null,
    total: units.length,
    checked: reports.length,
    counts,
    headline: weakest
      ? {
          claimId: weakest.claimId,
          text: units.find((u) => u.id === weakest.claimId)?.text ?? weakest.claimId,
          score: weakest.score,
          interval90: weakest.interval90,
          verdict: weakest.verdict,
        }
      : null,
    economics: area(reports, units, 'economics'),
    business: area(reports, units, 'business'),
    tiers,
    models,
    sha256: reports.length
      ? sha256Hex(canonical([...reports].sort((a, b) => a.claimId.localeCompare(b.claimId)).map((r) => [r.claimId, r.version, r.sha256])))
      : null,
    latest: newest ? { runId: newest.runId, merkleRoot: newest.merkleRoot, stampTx: newest.stampTx, stampCluster: newest.stampCluster } : null,
  }
}
