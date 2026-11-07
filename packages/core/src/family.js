/**
 * Model families: the unit of jury diversity. A harness runs any open-weight
 * model; its family is the base model that model descends from (the root of the
 * `base_model` chain on its Hugging Face card), so a fine-tune counts as the
 * family it was tuned from. A jury spans `minFamilies` families because models
 * built on the same base tend to share its blind spots.
 *
 * Older cards and contracts name this `lab`, `minLabs` and `excludeLabs`. They
 * are read as families, and keep their field names when re-emitted, so their
 * hashes and signatures are unchanged.
 * @module @verafyharness/core/family
 */

/** A harness, card, vote or attestation's family (the legacy `lab` field when that is all it has). */
export const familyOf = x => x?.family ?? x?.lab

/** The family field, under the name the record already uses: `{family}` for new records, `{lab}` for old ones. */
export const familyField = x => (x?.family !== undefined || x?.lab === undefined ? { family: x?.family } : { lab: x.lab })

/** How many families a jury must span. */
export const minFamiliesOf = rules => rules?.minFamilies ?? rules?.minLabs

/** Families a jury excludes. */
export const excludedFamilies = rules => [...(rules?.excludeFamilies ?? []), ...(rules?.excludeLabs ?? [])]

/** Whether a set of jury rules uses the legacy names. */
export const legacyRules = rules => rules?.minFamilies === undefined && rules?.minLabs !== undefined

/**
 * The jury-rule fields for a family count and exclusions, under the names the
 * rules already use.
 * @param {object} rules - existing jury rules.
 * @param {number} min - families to span.
 * @param {string[]} exclude - families to exclude.
 * @returns {object} `{minFamilies, excludeFamilies}` or `{minLabs, excludeLabs}`.
 */
export function familyRules(rules, min, exclude) {
  return legacyRules(rules) ? { minLabs: min, excludeLabs: exclude } : { minFamilies: min, excludeFamilies: exclude }
}
