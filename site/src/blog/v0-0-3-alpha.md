# Verafy Harness v0.0.3-alpha: stake, slashing and open-weight models

*Release notes, November 7, 2026. Tag [`v0.0.3-alpha`](https://github.com/Verafyai/verafyHarness/releases/tag/v0.0.3-alpha).*

Running a harness now means putting money at stake. Every harness posts a bond, every ruling records the faults its jurors commit, and a published schedule takes part of the bond for each one. Juries are drawn by a scheduler from a randomness beacon that no block sealer can steer, payouts can wait out a challenge window, and every juror runs an open-weight model. It is still an alpha for a prototype: nothing here is a running network, there is no token, and every price is illustrative.

**@@OVERALL@@ of the spec is built, weighted by importance, across @@COUNT@@ requirements**, up from 65% across 119.

@@SCORE_SVG@@

## Open-weight models, counted by family

A harness runs any open-weight model from Hugging Face, on its own machine or served by a provider that hosts the same weights. A jury must span several **model families**: the base model each model descends from. Two fine-tunes of one base model share its blind spots, so they count once. Contracts set `minFamilies`; contracts and harness cards written before this release say `minLabs` and `lab`, still validate, and keep their hashes. [Open-weight models and model families](/learn/model-families).

## Who sits: the jury scheduler and the beacon

Until now a jury was drawn from the parent block's hash. Whoever sealed that block could try many versions of it and publish the one whose hash seated the jurors they wanted.

- **The beacon.** Each sealer registers the end of a hash chain when it joins, and every block it seals reveals the next link. The reveals were fixed before any contract existed, so a sealer cannot choose one. Its only freedom is to withhold a reveal, which is slashed. [The randomness beacon](/learn/randomness-beacon).
- **The scheduler.** It seeds the draw from the beacon, seats harnesses until the jury spans its model families, and caps seats per operator. It also keeps the next few harnesses as alternates, fixed at draw time. Commit and reveal deadlines are block heights. A seat that misses the commit deadline takes an alternate. A seat that committed and then misses its reveal is never replaced, because a replacement could copy the reveals already public; it is recorded and slashed instead. Every ruling records its schedule, and verification recomputes it. [The jury scheduler](/learn/jury-scheduler).
- **Operators.** A model family stops one model's blind spots from deciding. An operator cap stops one owner from holding several seats across families. [Operators](/learn/operators).

## Bonds and slashing

| Fault | Price (illustrative) |
|---|---|
| Two signed, different commitments for one contract | the whole bond |
| A proof that does not verify | 50% of the bond |
| A signed reveal that does not open its own commitment | 25% |
| A missed commit | 0.05, after a free 2% of seats |
| A commit with no reveal | 0.5, after a free 0.2% of seats |

Missed seats double in price in a streak, up to 5% of the bond each. Slashed money goes half to whoever proved the fault and the rest to the network pool; nothing is burned or minted. [Bonds and slashing](/learn/bonds-and-slashing).

**What the numbers changed.** The first design priced every missed seat at 1% of the bond. The new stake model in packages/economics showed that an honest harness missing 1% of its seats would lose about 200 times its fees. Missed seats now cost a fixed amount past a free allowance, and only provable misbehavior is priced as a share of the bond. With the defaults, holding a $500 bond costs about $0.23 per 1,000-contract block across every seat, an honest harness inside the allowance loses nothing, and one bad reveal costs $125, about 92,000 seat fees. All modeled. [The economics](/economics#stake).

## Payouts that wait, and challenges that cost

A contract can set `payment.challengeWindow`. Its ruling then seals with every payout held. When the window closes, the payouts are released in a later block. If a challenge overturns the ruling inside the window, the held escrow pays out the other way, and the challenger takes the share of the jurors who voted the overturned answer. Whoever challenges locks a bond, returned on overturn and forfeited on affirm. A jury of one is allowed only with a window and an automatic audit. [The challenge window](/learn/challenge-window).

## On Solana

verafy_ruling 0.0.3 takes a reveal window and a challenge window at open. Before, one silent juror blocked a seal forever. Now, after the reveal deadline, the seal counts the seats that revealed. It also records the slot after which the ruling is releasable. **Measured on a local validator, Nov 7, 2026:** five seats committed, one withheld its reveal, and the program sealed NO with 4 of 5 after the deadline. Not on devnet.

## Watch it

```sh
node examples/slashing/walkthrough.mjs                      # a withheld reveal, a hold, a challenge
node examples/slashing/walkthrough.mjs --both               # plus a changed reveal that sinks the ruling
node bin/verafy.js testnet up --misbehave h-llama-1:no-reveal,h-qwen-1:no-commit
node bin/verafy.js testnet up --solana --misbehave h-gemma-1:no-reveal examples/market-resolution.json
```

## Tracked in the open

Every piece has a design proposal in [docs/proposals](https://github.com/Verafyai/verafyHarness/tree/main/docs/proposals) and a GitHub issue labeled [`proposal`](https://github.com/Verafyai/verafyHarness/issues?q=label%3Aproposal).

## The architecture, as specified

@@ARCH_SVG@@

## What is built, area by area

@@AREA_TABLE@@

## What is next

@@GAPS@@

## Open decisions

- Every slashing price and allowance, the challenge window and the challenge bond factor.
- Whether bond size may raise a harness's odds of being drawn, and whether to offer a jury of one.
- Seats-per-operator defaults and the operator bond; the beacon lookahead and whether to add drand.
- Where proving runs: each harness, or shared prover nodes.
