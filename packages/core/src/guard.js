/**
 * The guard in front of every juror: no juror reads a naked prompt.
 *
 * Prompt Guard (https://github.com/Verafyai/prompt-guard, vendored in
 * ./vendor/prompt-guard.js) compiles untrusted evidence into quoted statements
 * and directives before a juror sees it. This module decides which context
 * entries are untrusted and pins guard records onto a contract.
 * @module @verafyharness/core/guard
 */
import { compile } from './vendor/prompt-guard.js'

export * from './vendor/prompt-guard.js'

/** Context kinds that can carry text from outside the contract's author, and so are guarded unless the entry is marked `trusted` (facts computed by code). */
export const GUARDED_KINDS = ['text', 'link', 'document', 'repo']

/** Whether the guard compiles this context entry. A contract opts out with `guard: false`. */
export const isGuarded = (asc, c) => asc?.guard !== false && GUARDED_KINDS.includes(c.kind) && c.trusted !== true && typeof c.content === 'string'

/**
 * Pin a guard record on every untrusted context entry that has content and no
 * record yet. Returns a copy.
 * @param {object} asc - the contract, with snapshot content attached.
 * @returns {object} the contract with `guard` records on its untrusted entries.
 */
export function guardContract(asc) {
  if (asc?.guard === false) return asc
  return { ...asc, context: asc.context.map(c => (isGuarded(asc, c) && !c.guard ? { ...c, guard: compile(c.content) } : c)) }
}
