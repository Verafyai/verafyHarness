// No Node imports: the page bundles this for the browser.
/** Splits a juror rationale written as INVEST: ... CONCERNS: ... AGAINST: ... into its three parts. */
export function splitRationale(text: string): { invest: string; concerns: string; against: string } {
  const grab = (label: string) => {
    const m = new RegExp(`${label}\\s*:?\\s*([\\s\\S]*?)(?=\\b(?:INVEST|CONCERNS|AGAINST)\\b\\s*[:\\-]|$)`, 'i').exec(text)
    return m?.[1]?.trim().replace(/^[\-:\s]+/, '') ?? ''
  }
  return { invest: grab('INVEST'), concerns: grab('CONCERNS'), against: grab('AGAINST') }
}
