// No Node imports: the page bundles this for the browser.

export type Reasoning = { summary: string; supports: string[]; counters: string[] }

const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\n/g, ' ').replace(/\\\\/g, '\\').trim()

function stringsIn(arrayBody: string): string[] {
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(arrayBody))) out.push(unescape(m[1]!))
  return out
}

/**
 * A juror's rationale as Swarm returns it: usually JSON with `rationale` (the summary), `for` (points that
 * support the juror's vote) and `against` (points that cut the other way). Older or cut-off answers are not
 * valid JSON, so the fields are also read leniently. Plain text becomes the summary.
 */
export function parseReasoning(text: string): Reasoning {
  const t = (text ?? '').trim()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as { rationale?: unknown; for?: unknown; against?: unknown }
      const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [])
      return { summary: typeof j.rationale === 'string' ? j.rationale.trim() : '', supports: list(j.for), counters: list(j.against) }
    } catch {
      const field = (name: string) => new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(t)?.[1]
      const array = (name: string) => {
        const m = new RegExp(`"${name}"\\s*:\\s*\\[([^\\]]*)\\]?`).exec(t)
        return m ? stringsIn(m[1]!) : []
      }
      const summary = field('rationale')
      return { summary: summary ? unescape(summary) : '', supports: array('for'), counters: array('against') }
    }
  }
  return { summary: t, supports: [], counters: [] }
}

/**
 * The final question's three bars for one juror. For a juror who voted yes, the points supporting the vote are
 * reasons to invest; for a juror who voted no, they are reasons not to. The summary is the juror's hesitation
 * or objection in its own words.
 */
/** Splits "INVEST: ... CONCERNS: ... AGAINST: ..." out of a juror's summary. Text before the first marker is dropped. */
export function splitMarkers(text: string): { invest: string; concerns: string; against: string } | null {
  const re = /\b(INVEST|CONCERNS?|AGAINST)\s*:/gi
  const hits = [...text.matchAll(re)]
  if (!hits.length) return null
  const out = { invest: '', concerns: '', against: '' }
  hits.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < hits.length ? (hits[i + 1]!.index ?? text.length) : text.length
    const body = text.slice(start, end).trim()
    const key = m[1]!.toUpperCase().startsWith('CONCERN') ? 'concerns' : m[1]!.toUpperCase() === 'INVEST' ? 'invest' : 'against'
    if (body) out[key] = out[key] ? `${out[key]} ${body}` : body
  })
  return out
}

const TECHNICAL = /unable to validate|technical (issue|failure)/i

export function verdictBars(vote: string, rationale: string): { invest: string[]; concerns: string[]; against: string[] } {
  const r = parseReasoning(rationale)
  if (vote === 'abstain' && (!r.summary || TECHNICAL.test(r.summary)) && !r.supports.length && !r.counters.length) {
    return { invest: [], concerns: [], against: [] }
  }
  const yes = vote === 'yes'
  const marked = r.summary ? splitMarkers(r.summary) : null
  const invest = yes ? r.supports : r.counters
  const against = yes ? r.counters : r.supports
  if (marked) {
    return {
      invest: marked.invest ? [marked.invest, ...invest] : invest,
      concerns: marked.concerns ? [marked.concerns] : [],
      against: marked.against ? [marked.against, ...against] : against,
    }
  }
  return { invest, concerns: r.summary && !TECHNICAL.test(r.summary) ? [r.summary] : [], against }
}

/** Kept for answers written as INVEST: ... CONCERNS: ... AGAINST: ... (labels must be followed by a colon). */
export function splitRationale(text: string): { invest: string; concerns: string; against: string } {
  const grab = (label: string) => {
    const m = new RegExp(`\\b${label}\\s*:\\s*([\\s\\S]*?)(?=\\b(?:INVEST|CONCERNS|AGAINST)\\s*:|$)`, 'i').exec(text)
    return m?.[1]?.trim() ?? ''
  }
  return { invest: grab('INVEST'), concerns: grab('CONCERNS'), against: grab('AGAINST') }
}
