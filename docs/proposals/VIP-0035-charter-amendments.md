---
vip: '0035'
title: 'Charter amendments: rules that change only when a Verafy jury approves'
status: 'Shipped (v0.0.6-alpha): core; first charter is Fuzzy''s'
created: 2026-11-09
depends: ['0032', '0034']
---

## Summary

A **charter** is a versioned rulebook with protected articles. Anyone may propose an **amendment** (add, replace or remove articles). A Verafy jury reads the charter, the amendment and the charter as amended, and answers ADOPT only if every protected article still holds in letter and in effect. An adopted amendment becomes a new charter version. It never changes a score or certification already issued.

The first charter is Fuzzy's (Verafyai/fuzzy `governance/charter.json`): what counts as proof, how the score is built, what each certification level requires.

## Why

Certification only means something if its rules can't be quietly loosened. A DAO vote would let whoever holds the most tokens redefine "secure". A jury ruling against protected articles lets the rules evolve (prices, new attack classes, new tiers) while the core promises hold.

## Proposal

- `verafy.charter/1`: `name`, `version`, `articles` (each `id`, `text`, optional `protected`), `review` (jury size, families, bar, fee).
- `verafy.charter-amendment/1`: names the current charter's hash, a `title`, a `rationale` (treated as untrusted), and `changes`.
- `charterAmendmentContract(charter, amendment)` builds the ASC: protected articles quoted as the test, ADOPT or REJECT, below-bar escalates to a larger jury. When unsure, REJECT.
- `applyCharterAmendment` produces the next version. An amendment must name the current version's hash, so two amendments can't race.

Code: `packages/core/src/charters.js`, tests in `packages/core/test/charters.test.js`.
