import claims from '../../../public/thesis/claims.json'

/** The three tiers of the thesis, in the order the page and the dashboard show them. */
export type Tier = 'claims' | 'follows' | 'proven'
export type Category = 'economics' | 'business'

export const TIER_TITLES: Record<Tier, string> = {
  claims: 'Claims',
  follows: 'What follows',
  proven: 'What must be proven',
}

/** One thing the jury can rule on: a claim from the list, or a step of the thesis chain. */
export type Unit = {
  id: string
  tier: Tier
  text: string
  categories: Category[]
  unfinished: boolean
}

/** Swarm rejects questions longer than this. */
export const QUESTION_MAX = 300

const KIND_TIER: Record<string, Tier> = { premise: 'claims', inference: 'follows', hypothesis: 'proven' }

type RawStep = { id: string; kind: string; tier?: string; statement: string; categories?: string[]; unfinished?: boolean }
type RawClaim = { id: string; claim: string; tier?: string; categories?: string[] }

function tierOf(raw: string | undefined, fallback: Tier): Tier {
  return raw === 'claims' || raw === 'follows' || raw === 'proven' ? raw : fallback
}

function cats(list: string[] | undefined): Category[] {
  return (list ?? []).filter((c): c is Category => c === 'economics' || c === 'business')
}

/** Every unit, including unfinished ones, in the order the page's sections present them. */
export function allUnits(): Unit[] {
  const steps = (claims.thesis_chain as RawStep[]).map((s) => ({
    id: s.id,
    tier: tierOf(s.tier, KIND_TIER[s.kind] ?? 'claims'),
    text: s.statement,
    categories: cats(s.categories),
    unfinished: Boolean(s.unfinished),
  }))
  const list = (claims.claims as RawClaim[]).map((c) => ({
    id: c.id,
    tier: tierOf(c.tier, 'claims'),
    text: c.claim,
    categories: cats(c.categories),
    unfinished: false,
  }))
  const byId = new Map([...steps, ...list].map((u) => [u.id, u]))
  const ordered = (claims.sections as { items: string[] }[]).flatMap((sec) => sec.items).map((id) => byId.get(id))
  return ordered.filter((u): u is Unit => Boolean(u))
}

/** The page's sections in pitch order, each with its units. */
export function sections(): { id: string; title: string; question: string; answer: string; units: Unit[] }[] {
  const byId = new Map(allUnits().map((u) => [u.id, u]))
  return (claims.sections as { id: string; title: string; question: string; answer: string; items: string[] }[]).map((sec) => ({
    id: sec.id,
    title: sec.title,
    question: sec.question,
    answer: sec.answer,
    units: sec.items.map((id) => byId.get(id)).filter((u): u is Unit => Boolean(u)),
  }))
}

/** The units a jury runs and the dashboard scores. Unfinished claims are excluded from both. */
export function runnableUnits(): Unit[] {
  return allUnits().filter((u) => !u.unfinished)
}

/**
 * V01, the final question: would a skilled pre-seed investor invest at the stated terms? It runs after the
 * claims, its question carries the jury's results, and it is never part of the claim scores.
 */
export const VERDICT_ID = 'V01'
export const VERDICT_TERMS = '$1.5M post-money SAFE at a $12M cap'

export const VERDICT_UNIT: Unit = {
  id: VERDICT_ID,
  tier: 'proven',
  // Shown on the page without the round's numbers; the question sent to the jury carries them (verdictQuestion).
  text: 'Would a skilled pre-seed investor, after weighing every claim, the market, competition, the founder and the economics, invest in Verafy at its pre-seed terms?',
  categories: [],
  unfinished: false,
}

/** The final question, carrying the jury's results so far. Kept under QUESTION_MAX. */
export function verdictQuestion(results: { valid: number; checked: number; weakest: number | null }): string {
  const found = results.checked
    ? `the AI jury found ${results.valid} of ${results.checked} claims hold${results.weakest === null ? '' : `, weakest key claim ${results.weakest}/100`}`
    : 'its claims are published with sources'
  const q = `Verafy (verafy.ai/thesis), an AI co-signer for Solana treasuries: ${found}. Would a skilled pre-seed investor invest at a ${VERDICT_TERMS}? Rationale: INVEST:, CONCERNS:, AGAINST:, one sentence each.`
  return q.length <= QUESTION_MAX ? q : q.replace(' (verafy.ai/thesis)', '').slice(0, QUESTION_MAX)
}

export function unitById(id: string): Unit | undefined {
  if (id === VERDICT_ID) return VERDICT_UNIT
  return allUnits().find((u) => u.id === id)
}

function asOf(): string {
  const d = new Date(`${claims.as_of}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/**
 * The jury question for one unit, never longer than QUESTION_MAX characters. The claim is quoted so jurors judge
 * the claim, not the instruction around it. Claims to be proven are asked as a forecast.
 */
export function questionFor(unit: Unit): string {
  const head = unit.tier === 'proven' ? 'Is this claim likely to prove true? "' : `As of ${asOf()}, is this claim true? "`
  const long = unit.tier === 'proven' ? '" Vote yes only if the evidence and reasoning support it.' : '" Vote yes only if current public evidence supports it.'
  const tail = head.length + unit.text.length + long.length <= QUESTION_MAX ? long : '" Answer yes or no.'
  const room = QUESTION_MAX - head.length - tail.length
  const body = unit.text.length > room ? `${unit.text.slice(0, room - 3).trimEnd()}...` : unit.text
  return `${head}${body}${tail}`.slice(0, QUESTION_MAX)
}
