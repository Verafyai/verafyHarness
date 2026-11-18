/**
 * The revenue model behind the market projection on /thesis. Pure functions, shared by the page and the tests.
 * Every default is labeled: sourced inputs come from claims.json; everything else is an assumption to move.
 */

export type Label = 'sourced' | 'vendor-reported' | 'assumption'

export type Inputs = {
  /** Teams on Solana multisigs in 2026. Squads: 450+ teams. */
  teams2026: number
  teamGrowth: number
  /** Share of those teams paying Verafy in 2030; adoption ramps up evenly from 2027. */
  adoption2030: number
  monthlyFee: number
  /** Value held in Solana multisigs in 2026. Squads: over $10B. */
  secured2026: number
  securedGrowth: number
  /** Share of held value that moves out each month. */
  movedPerMonth: number
  /** Fee on value Verafy checks, in basis points. */
  valueFeeBps: number
  /** Agentic commerce spend. Juniper: $8B in 2026, $1.5T in 2030 (vendor-reported forecast). */
  agentSpend2026: number
  agentSpend2030: number
  onChainShare: number
  /** Share of on-chain agent spend that needs a judgment check. */
  judgmentShare: number
  /** Share of those checks Verafy wins by 2030; ramps up evenly from 2027. */
  verafyShare2030: number
  agentFeeBps: number
}

export const DEFAULTS: Inputs = {
  teams2026: 450,
  teamGrowth: 0.3,
  adoption2030: 0.1,
  monthlyFee: 1500,
  secured2026: 10e9,
  securedGrowth: 0.3,
  movedPerMonth: 0.1,
  valueFeeBps: 1,
  agentSpend2026: 8e9,
  agentSpend2030: 1.5e12,
  onChainShare: 0.05,
  judgmentShare: 0.01,
  verafyShare2030: 0.2,
  agentFeeBps: 2,
}

export const LABELS: Record<keyof Inputs, Label> = {
  teams2026: 'sourced',
  teamGrowth: 'assumption',
  adoption2030: 'assumption',
  monthlyFee: 'assumption',
  secured2026: 'sourced',
  securedGrowth: 'assumption',
  movedPerMonth: 'assumption',
  valueFeeBps: 'assumption',
  agentSpend2026: 'vendor-reported',
  agentSpend2030: 'vendor-reported',
  onChainShare: 'assumption',
  judgmentShare: 'assumption',
  verafyShare2030: 'assumption',
  agentFeeBps: 'assumption',
}

export const YEARS = [2027, 2028, 2029, 2030] as const

export type YearRow = { year: number; subscriptions: number; valueFees: number; agentFees: number; total: number }

export type Projection = {
  years: YearRow[]
  /** What each line would earn in 2030 if Verafy won every buyer: the revenue pool. */
  pool2030: { subscriptions: number; valueFees: number; agentFees: number; total: number }
  revenue2030: number
  share2030: number
}

const ramp = (year: number) => Math.min(1, Math.max(0, (year - 2026) / 4))

/** Geometric path between the 2026 and 2030 agentic commerce figures. */
export function agentSpend(i: Inputs, year: number): number {
  const t = (year - 2026) / 4
  return i.agentSpend2026 * Math.pow(i.agentSpend2030 / i.agentSpend2026, t)
}

export function project(i: Inputs): Projection {
  const years = YEARS.map((year) => {
    const grow = (g: number) => Math.pow(1 + g, year - 2026)
    const teams = i.teams2026 * grow(i.teamGrowth)
    const adoption = i.adoption2030 * ramp(year)
    const subscriptions = teams * adoption * i.monthlyFee * 12
    const movedPerYear = i.secured2026 * grow(i.securedGrowth) * i.movedPerMonth * 12
    const valueFees = movedPerYear * adoption * (i.valueFeeBps / 10_000)
    const checkable = agentSpend(i, year) * i.onChainShare * i.judgmentShare
    const agentFees = checkable * i.verafyShare2030 * ramp(year) * (i.agentFeeBps / 10_000)
    return { year, subscriptions, valueFees, agentFees, total: subscriptions + valueFees + agentFees }
  })
  const g4 = (g: number) => Math.pow(1 + g, 4)
  const pool = {
    subscriptions: i.teams2026 * g4(i.teamGrowth) * i.monthlyFee * 12,
    valueFees: i.secured2026 * g4(i.securedGrowth) * i.movedPerMonth * 12 * (i.valueFeeBps / 10_000),
    agentFees: i.agentSpend2030 * i.onChainShare * i.judgmentShare * (i.agentFeeBps / 10_000),
    total: 0,
  }
  pool.total = pool.subscriptions + pool.valueFees + pool.agentFees
  const revenue2030 = years[years.length - 1]!.total
  return { years, pool2030: pool, revenue2030, share2030: pool.total ? revenue2030 / pool.total : 0 }
}

/** $2.7M, $340K, $30K: two significant figures, no false precision. */
export function money(n: number): string {
  if (!Number.isFinite(n)) return 'n/a'
  const a = Math.abs(n)
  const fmt = (v: number) => Number(v.toPrecision(2)).toLocaleString('en-US')
  if (a >= 1e9) return `$${fmt(n / 1e9)}B`
  if (a >= 1e6) return `$${fmt(n / 1e6)}M`
  if (a >= 1e3) return `$${fmt(n / 1e3)}K`
  return `$${fmt(n)}`
}
