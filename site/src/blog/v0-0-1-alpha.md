# Verafy Harness v0.0.1-alpha: the first spec, scored

*Release notes, November 6, 2026. Tag [`v0.0.1-alpha`](https://github.com/Verafyai/verafyHarness/releases/tag/v0.0.1-alpha).*

This is the first versioned release of Verafy Harness and the first versioned spec for Verafy Harness and Verafy Chain together. It is an alpha for a prototype: nothing here is a running network, and there is no token. What is new is that the whole design now lives in one spec with stable requirement IDs, and a scoring pass checks every claim in that spec against the code.

The short version: **@@OVERALL@@ of the spec is built, weighted by importance, across @@COUNT@@ requirements.** The core protocol is nearly done. Proving now runs end to end with a mock prover, but no real proof has been made yet. Governance and Solana settlement are mostly design.

@@SCORE_SVG@@

## What is in this release

### A versioned spec, with a scoring pass

The [specification](/spec) covers 17 areas, from the core protocol to the Banker to settling on Solana. Every requirement has an ID that never changes meaning (`ROUTE-003`, `BANK-006`), a weight, and a status: verified, built, partial, designed, planned or research.

`npm run score` checks each claim against the repo: a file that must exist, a function that must be exported, or a test that must be part of `npm test`. A claim whose check fails scores zero, and `npm test` fails until it is fixed or downgraded. The point is that the spec can't quietly drift from the code.

### Multi-model routing

New in `packages/route`. Every question starts at the cheapest tier that can answer it safely: a fast System 1 screen, then panels of small, mid-size and frontier models, each spanning model families. A unanimous panel stops; a split one moves up.

<img class="anim" src="/assets/difficulty-sorting.gif" alt="Animation: forty questions start at the cheapest tier; three go to the proven lane; of the rest, eleven stop at the screen, thirteen at small models, seven at mid-size models and six reach the frontier jury. Compared with sending everything to a frontier jury, about 4 times cheaper and 3 times faster on average, illustrative." width="1280" height="720" loading="lazy">

The guardrails matter more than the speed:

- **Shadow mode is the default.** The screen sizes juries and logs what it would have settled. It settles nothing until its cutoffs are calibrated.
- **Calibration is built in.** `calibrate()` finds, per question type, the lowest confidence where the screen's accuracy (a Wilson lower bound, not an average) matches the jury it replaces. Too few examples, no cutoff. `recheck()` withdraws a cutoff when live audits show accuracy falling.
- **The contract's floor is never lowered**, and L2 questions never take a screen's answer: a closed model can't carry a proof.
- **Audits**, drawn from the block hash, re-check a share of settled answers at the top tier.

A Jev adapter is included. TypeSafe's API isn't public, so it takes whatever client you have as a function. Jev's figures are its maker's own, not reproduced: 70 to 500 ms, about $0.0004 a decision, and 67.8% on its benchmark against 73 to 74% for frontier models. How much it can safely settle on our questions is unknown until a calibration run.

### Proof packing: routed, not yet wired in

Anthropic's FlashProve proves at most 1,024 tokens per request. `packages/pack` breaks contracts into small questions, merges the ones contracts share and packs them into each window; this release adds `routeBlock()`, so only questions in the proven lane reach the packer.

To be precise about status: the packer is a library with tests, run with mock models. Separately, `packages/prove` now proves L2 votes after the reveal and gates finality on verification, with mock, DeepProve and FlashProve adapters, but it proves whole prompts, not packed questions, and has only run against a stand-in prover. Joining atomize, route, pack and prove into one run (PACK-011) and a measured proof on real hardware (PROVE-006) are the next steps.

<img class="anim" src="/assets/proof-packing.gif" alt="Animation: six contracts become twelve small questions; a question shared by four contracts becomes one slot; nine unique questions pack into two 1,024-token requests proven once. The cost per decision falls from $0.1043 unpacked to $0.0059 atomized, modeled." width="1280" height="720" loading="lazy">

### Economics, extended

`packages/economics` gains `cascade()` for tiered routing and a reasoning-length input, and the [economics page](/economics) is rewritten around everything above. Headline numbers, all modeled from vendor-reported speeds and an H100 at $4.00 an hour:

| | Per decision |
|---|---|
| Unpacked, five jurors each proving | $0.1043 |
| Atomized, packed, proven once | $0.0059 |
| Plus a screen, at assumed settle rates | $0.0039 |

Once proofs are packed, the checks that a contract was broken down faithfully cost more than the proofs. That is where the next savings are.

### A simpler site

The site now has one menu, the version in the corner, and two new pages: the [specification](/spec) and these release notes.

## The architecture, as specified

@@ARCH_SVG@@

## What is built, area by area

@@AREA_TABLE@@

## What is next

The biggest gaps, by weight times what is missing:

@@GAPS@@

## Decisions waiting on Rex

- TinySVM as the default runtime, and integer micro-units in `runtime.js`.
- Renting a FlashProve machine, and accepting the Llama 4 license.
- The Banker's target token, treasury, chains, caps and sanctions screening; service mode stays off until a legal review.
- Prove-once for L2 while only one model is provable; packing defaults; which brief modes are allowed.
- Publishing the MCP server to npm and to agent catalogs.

## Try it

```sh
git clone https://github.com/Verafyai/verafyHarness.git
cd verafyHarness
npm test          # every package, plus the spec check
npm run demo      # five contracts, five rulings, five blocks, scripted answers
npm run score     # the scorecard
```

The full spec is at [/spec](/spec), the changelog at [docs/spec/CHANGELOG.md](https://github.com/Verafyai/verafyHarness/blob/main/docs/spec/CHANGELOG.md), and the requirements behind every number on this page at [docs/spec/requirements.json](https://github.com/Verafyai/verafyHarness/blob/main/docs/spec/requirements.json).
