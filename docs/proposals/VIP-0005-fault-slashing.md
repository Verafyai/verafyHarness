---
vip: '0005'
title: Slashing on recorded faults
status: Idea
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

1. **A schedule**, `verafy.slashing/1`, published by the network and pinned by hash in each contract's jury rules:

| Fault | Penalty (illustrative) | Why |
|---|---|---|
| `no-commit` | 0 the first time in a window; then 1% of bond | Outages happen; repeated ones shouldn't be free |
| `no-reveal` | 5% of bond | Committing and then withholding is how a juror would try to sink a ruling it saw going the wrong way |
| `bad-reveal` (doesn't match its commitment) | 25% | Provable misbehavior |
| `no-proof`, `bad-proof` | 10%, 50% | A bad proof is a claim that the named model ran when it didn't |
| `double-commit` (two commitments for one contract) | 100% | Equivocation |
| `no-beacon-reveal` (VIP-0002) | Fixed, above one block's jury value | Beacon bias |
| `runtime-mismatch` (SETTLE-003) | 25% | A harness reported a settlement the runtimes don't agree with |

2. **Overturns aren't automatic slashes.** A juror that voted the side a challenge later overturned isn't proven dishonest; models are wrong without being corrupt. It forfeits its fee for that ruling (it hasn't been paid yet, under VIP-0007). Only an overturn on `false-evidence` grounds that names the harness as the source of the forged material is slashable, and only through its own challenge.
3. **Where it runs:** a `slash(rulings, schedule)` function in core produces bond diffs. They go through the same conservation check as every other diff. Slashed funds split between the challenger who proved the fault (if any) and a network pool. They're never burned, and nothing is minted.
4. **Operator reach:** if the harness bond can't cover a penalty, the rest comes from its operator bond (VIP-0003).
5. **Appeal:** a slash can itself be challenged on `error` grounds, so a node bug can't silently drain an honest harness.

## Decisions for Rex

- The penalty numbers. Every number in the table is illustrative.
- The split between challenger and pool.

## Tracking

Requirement CONS-005, together with CHAIN-005 (bonds and slashing on the chain). GitHub issue: see the index in [README.md](README.md).
