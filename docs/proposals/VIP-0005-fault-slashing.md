---
vip: '0005'
title: Slashing on recorded faults
status: Built
created: 2026-11-07
requirement: CONS-005
depends: ['0003', '0007']
---

## Summary

Turn the faults every ruling already records into bond penalties, using a published schedule, applied by the bond program.

## Motivation

Faults are recorded but cost nothing:
- `ruleFromRecords` lists `no-commit` and `no-reveal` in `round.faults` (`packages/core/src/network.js`);
- `gateProofs` adds `no-proof` and `bad-proof` (`packages/core/src/proving.js`);
- `bondFaults(ruling)` returns each fault with the bond it's recorded against, and its own comment says "Slashing is a separate step";
- the bond program has a `slash` operation (`packages/core/src/settle.js`, and the `bond` program in TinySVM).

Nothing connects them. A harness that never reveals today is logged and loses its fee for that ruling, nothing more.

## Proposal

1. **A schedule**, `verafy.slashing/1` (`DEFAULT_SLASHING` in `packages/core/src/slashing.js`), pinned by hash in each contract's jury rules (`payment.jury.slashing`). Two kinds of fault, priced differently, all illustrative:

| Fault | Price | Why |
|---|---|---|
| `double-commit` | 100% of bond | Equivocation, proven by two signed commitments kept as evidence |
| `false-evidence` | 100% | Proven only by a challenge that names the harness |
| `bad-proof` | 50% | A claim that the named model ran when it did not |
| `bad-reveal` | 25% | A signed reveal that does not open its own commitment, kept as evidence |
| `runtime-mismatch` | 25% | A settlement the runtimes don't agree with |
| `no-beacon-reveal` | 10% | Beacon bias (VIP-0002) |
| `no-commit` | 0.05 fixed, after a free 2% of seats | Outages happen |
| `no-reveal` | 0.5 fixed, after a free 0.2% of seats | Committing then withholding is how a juror sinks a ruling it saw going the wrong way |
| `no-proof` | 0.5 fixed | |

   Liveness faults double for each other miss in the last 10 blocks (a streak), capped at 5% of the bond per fault. **Why fixed amounts for liveness:** the first draft priced a missed seat at 1% of the bond. Modeled with `stake()` in packages/economics, an honest harness that misses 1% of its seats would then lose about 200 times its fees. Provable misbehavior keeps bond-share pricing; liveness gets a free allowance, a small fixed price, and escalation only in a streak.

2. **Overturns aren't automatic slashes.** A juror that voted the side a challenge later overturned isn't proven dishonest; models are wrong without being corrupt. It forfeits its fee for that ruling (it hasn't been paid yet, under VIP-0007). Only an overturn on `false-evidence` grounds that names the harness as the source of the forged material is slashable, and only through its own challenge.
3. **Where it runs:** a `slash(rulings, schedule)` function in core produces bond diffs. They go through the same conservation check as every other diff. Slashed funds split between the challenger who proved the fault (if any) and a network pool. They're never burned, and nothing is minted.
4. **Operator reach:** if the harness bond can't cover a penalty, the rest comes from its operator bond (VIP-0003).
5. **Appeal:** a slash can itself be challenged on `error` grounds, so a node bug can't silently drain an honest harness.

## Decisions for Rex

- The penalty numbers. Every number in the table is illustrative.
- The split between challenger and pool.

## Tracking

Requirement CONS-005, together with CHAIN-005 (bonds and slashing on the chain). GitHub issue: [#30](https://github.com/Verafyai/verafyHarness/issues/30).
