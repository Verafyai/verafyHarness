# Verafy Improvement Proposals

A Verafy Improvement Proposal (VIP) is a design document for a change to how harnesses reach consensus, settle or get paid. It follows the shape of a Solana SIMD: what is wrong today, with links to the code, what to build, the alternatives, and the decisions only Rex can make.

A proposal is not a promise. Each one is tracked in three places:
- the proposal file here, the design;
- a requirement in [docs/spec/requirements.json](../spec/requirements.json), the score;
- a GitHub issue with the `proposal` label, the discussion and the pull requests that build it.

[ROADMAP.md](../../ROADMAP.md) lists them under milestone 4b.

## Status

| Status | Meaning |
|---|---|
| Idea | Written down; not agreed. |
| Decision needed | Can't be built until Rex picks an option. |
| Accepted | Agreed; ready to build. |
| Building | A pull request is open. |
| Built | Merged, with tests. |
| Withdrawn | Not doing it; the file stays, with the reason. |

## Index

| VIP | Title | Status | Requirement |
|---|---|---|---|
| [0001](VIP-0001-jury-scheduler.md) | Jury scheduler: one unit owns the seed, the draw, deadlines and replacements | Idea | CONS-001 |
| [0002](VIP-0002-randomness-beacon.md) | Randomness beacon for jury seeds | Idea | CONS-002 |
| [0003](VIP-0003-operator-diversity.md) | Operator diversity: labs are not owners | Idea | CONS-003 |
| [0004](VIP-0004-draw-weighting.md) | Draw weighting: equal seats or weighted by bond | Decision needed | CONS-004 |
| [0005](VIP-0005-fault-slashing.md) | Slashing on recorded faults | Idea | CONS-005 |
| [0006](VIP-0006-challenge-bonds.md) | Challenge bonds | Idea | JURY-006 |
| [0007](VIP-0007-payout-hold.md) | Hold payouts until the challenge window closes | Idea | CONS-006 |
| [0008](VIP-0008-single-harness-mode.md) | Single-harness mode: a jury of one, with a challenge window | Decision needed | CONS-007 |
| [0009](VIP-0009-prover-placement.md) | Prover placement: each harness proves, or shared provers do | Decision needed | CONS-008 |

## How they fit together

```
               VIP-0002 beacon
                     |
                     v
 pool -----> VIP-0001 scheduler -----> jury -----> commit / reveal -----> ruling
   ^          (VIP-0003 operators,      |          (deadlines,              |
   |           VIP-0004 weighting)      |           replacements)           v
   |                                    |                          VIP-0007 hold
   |                                    v                                   |
   |                          VIP-0009 provers                              v
   |                                                     audit / challenge (VIP-0006)
   |                                                                        |
   +------------------------ VIP-0005 slashing <----------- faults, overturns
```

VIP-0008 is a mode of the whole pipeline: a jury of one, made safe by VIP-0007's hold and a challenge to a full jury.

## Writing one

Copy the shape of an existing VIP. Name the code it changes, by path. Label every number as measured, modeled or illustrative. Put anything Rex has to decide under "Decisions for Rex", never in the proposal as settled.
