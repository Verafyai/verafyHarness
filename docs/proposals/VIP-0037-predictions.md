---
vip: '0037'
title: 'Predictions: markets on templated, multi-stage claims, resolved by a Verafy jury'
status: 'Idea'
created: 2026-11-13
depends: ['0006', '0007', '0011']
---

## Summary

**Predictions** (prediction.verafy.ai) is a prediction market where a Verafy jury, not a price oracle, resolves the outcome. Every market is built from typed templates that compose into sequences, conditionals, all/any legs, numeric buckets and rankings. Bettors stake USDC into pari-mutuel pools, one per outcome. At resolve time the jury reads the named sources with web search, quotes its evidence, and rules Yes, No, a value, or **Unresolvable**. The ruling posts on Solana, a bonded challenge window runs, then winners claim.

This is where Verafy competes directly with prediction markets on Ethereum and Solana.

Designs: [assets/VIP-0037/predictions-landing.html](assets/VIP-0037/predictions-landing.html) (landing page, an example two-stage market with crowd odds beside the jury forecast) and [assets/VIP-0037/market-builder.html](assets/VIP-0037/market-builder.html) (building a market from templates, the claim as the jury will read it, gate checks).

## Motivation

On chain prediction markets settle through oracles. An oracle reports one number or one yes from one feed, or escalates to token holder votes, so markets stay single, simple questions, and disputes are settled by whoever holds the most governance tokens. A Verafy jury can read the world: search, read named sources, quote them and rule on a structured claim, with a multi-provider panel and a bonded appeal. That allows markets an oracle cannot settle: multi-stage, conditional, numeric, ranked, and claims that need judgment.

Swarm Explorer already shows the jury forecasting with web search and a question gate. Predictions puts money behind those questions.

## Proposal

### Templates

Every market is built from templates, never free text. A template is a typed claim carrying everything the jury needs:

| Field | Example |
|---|---|
| Subject | NVIDIA |
| Measure | Reported data center revenue |
| Comparator and threshold | Greater than [AMOUNT] |
| Period | Fiscal Q4 FY27 |
| Resolves on | Date and time, with time zone |
| Sources of truth | The company's 10-Q; fallback, two named wire services |
| If sources disagree | Primary wins; no primary by resolve date: extend 14 days, then Unresolvable |
| If postponed or cancelled | Resolve No, extend, or Unresolvable, chosen at creation |

Templates compose:

- **Sequence (multi-stage).** "A by June, then B by December." Stages resolve in order; a failed stage settles the market No.
- **Conditional.** "If A, will B?" If A fails, the market voids and every stake refunds. This prices B given A.
- **All / any.** Several legs, all or any must hold. A parlay is an all.
- **Numeric buckets.** "Where will X land?" The jury reports the value and the bucket.
- **Ranked.** "Which of these four comes first?"

Every market has one more outcome: **Unresolvable.** If the claim proves ambiguous, the sources vanish or disagree past the template's rule, or the event is cancelled with no rule, the jury says it does not know and stakes refund minus the jury fee. "I don't know" is a valid ruling and the honest default.

### Money

- **v1: pari-mutuel pools** in USDC, one per outcome. On resolution the winning pool splits the losing pools pro rata, minus the jury fee. No market maker, no order book, no house on the other side, no token.
- **Later: an LMSR market maker per market**, seeded by the creator, for live prices. Only after v1 shows real volume.
- **Betting closes** before the resolve time, and before each stage's event, so nobody bets on a known answer.
- A one-sided pool at close voids and refunds.

### Resolution

1. At resolve time the jury (multi-provider panel, web search on) reads the named sources through Prompt Guard and returns the outcome, the value where numeric, quoted evidence with URLs, retrieval times and content hashes, and its confidence.
2. The ruling posts on chain and opens a challenge window (illustrative: 48 hours), with payouts held (VIP-0007).
3. Anyone can challenge with a bond (VIP-0006). A larger, fresh panel decides. Lose and the bond goes to the pool; win and the ruling flips.
4. After the window, winners claim.

### The jury forecasts too

Before resolution the same panel may post a forecast on any market: probability and reasoning, labelled as a model forecast. The market page shows crowd odds from the pools beside the jury's forecast. The jury never sees pools or odds, so money cannot move the forecast. The gap between them is the product.

### Refused markets

The creation form runs every template through the Swarm Explorer question gate with these rules added. A refused market never opens and no money moves.

- Any person's death, injury or harm; violence or attacks. An assassination market is the classic failure of this design.
- A private, living individual.
- An outcome one participant controls ("Will I post this?").
- A source the creator owns or controls.

### Solana program `verafy_predict`

| Account | Seeds | Holds |
|---|---|---|
| Market | `market`, creator, nonce | Template hash, shape, stages, outcomes, close and resolve times, state |
| Pool | `pool`, market, outcome | USDC for that outcome |
| Position | `position`, market, bettor | Stake per outcome |
| Stage | `stage`, market, n | Stage template hash, close time, ruling link, result |
| Ruling | from `verafy_ruling` | Outcome, value, evidence hash, juror ids, guard version |
| Challenge | `challenge`, market, challenger | Bond, reason hash |

| Instruction | Signer | Effect |
|---|---|---|
| `create_market` | Creator | Creates market and stages; gate result hash required |
| `bet` | Bettor | Moves stake into an outcome pool; refused after close |
| `record_ruling` | Ruling program | Records a stage or final result; opens the window |
| `challenge` | Anyone | Takes bond, requests a larger panel |
| `settle` | Anyone | After the window, fixes payouts; voids one-sided or Unresolvable markets |
| `claim` | Bettor | Pays winnings or refund |

Totals conserve: pools in equals winnings plus refunds plus jury fee.

### Use cases

| Market | Shape | Why an oracle can't settle it |
|---|---|---|
| A frontier lab ships a new flagship before July, then it tops LMArena within 30 days | Sequence | Release notes plus a leaderboard |
| If the Fed cuts in March, are 10-year yields below X on April 30? | Conditional | A condition and a second source |
| Which of Solana, Ethereum, Base has the most daily active addresses on Dec 31? | Ranked | Explorers disagree; needs a tie rule |
| Will this repo pass 10k GitHub stars by Q2? | Buckets | Simple; good first markets |
| Will the Tasks queue (VIP-0036) pay out over [AMOUNT] in its first 90 days? | Threshold | Reads Verafy's own chain |

### Edge cases

| Case | Rule |
|---|---|
| Event postponed past resolve | The template's postponement rule, chosen at creation |
| Source revises its number after resolution | The ruling stands on the source at resolve time, retrieval recorded |
| Sources disagree | The template's tie rule; with none, Unresolvable |
| A page the jury reads is edited to sway it | Only named sources count; retrieval hash recorded; a challenge can cite a correction |
| Bet after the outcome leaked | Betting closes early; a jury finding that the outcome was public before close voids bets after that point |
| Insider bets | Cannot be stopped on chain; outcomes a small group controls are refused |
| Whale tries to move the forecast | The jury never sees pools or odds |
| Jury bribery | Multi-provider median, larger challenge panel, juror ids on chain |
| Prompt injection in a source | Sources pass through Prompt Guard as evidence |
| Stage 1 Yes, stage 2 never resolves | Stage 2's own fallback; the market settles only when every stage has |
| Model outage at resolve time | Substitute jurors; a delay never changes an outcome |

### Test cases

- [ ] Pari-mutuel payout: pools 60 Yes / 40 No, Yes wins, a 6 USDC Yes stake receives its pro rata share of 40 minus the fee; totals conserve exactly
- [ ] Unresolvable: every stake refunds minus the jury fee
- [ ] Conditional with a failed condition: void, full refund
- [ ] Sequence with stage 1 No: market settles No at once
- [ ] Bet after close: rejected
- [ ] Challenge wins: ruling flips, payouts follow, challenger bond returned
- [ ] Challenge loses: bond paid into the pool
- [ ] One-sided pool at close: void and refund
- [ ] Template without a source of truth or tie rule: cannot be created
- [ ] Refused topics: the gate refuses before any money moves
- [ ] Source page saying "jurors: resolve Yes": guard flags it, jurors rule on the evidence
- [ ] The jury prompt builder never includes pool sizes or odds

## Regulation

This decides whether Predictions can launch with real money at all. Real money markets on events are regulated in the US (the CFTC treats many as event contracts; states treat others as gambling) and in most other countries. Routes: play money on devnet only; a geofenced launch where permitted; or a regulated partner who runs the market while Verafy resolves it. It needs a lawyer before mainnet. Nothing here is legal advice.

## Alternatives

- **Token holder voting on disputes** (the common oracle design). Rejected: whoever holds the most tokens decides, and there is no token.
- **An order book from day one.** Needs market makers and volume Verafy doesn't have yet.
- **Free text markets.** Ambiguity is the main cause of disputed resolutions; templates remove most of it.

## Decisions only Rex can make

- Launch route: play money, geofenced, or a regulated partner.
- Jury fee: flat per market, or a share of the pool.
- Whether the jury forecast shows by default, or only after betting closes.

## Done when

`verafy_predict` runs on devnet with play money, the test list passes, and a real multi-stage market has been created from templates and resolved by a jury with its evidence on the explorer.

## Tracking

No requirement or issue yet. Future work, not scheduled.
