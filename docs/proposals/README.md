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
| [0001](VIP-0001-jury-scheduler.md) | Jury scheduler: one unit owns the seed, the draw, deadlines and replacements | Built | CONS-001 |
| [0002](VIP-0002-randomness-beacon.md) | Randomness beacon for jury seeds | Built | CONS-002 |
| [0003](VIP-0003-operator-diversity.md) | Operator diversity: model families are not owners | Building | CONS-003 |
| [0004](VIP-0004-draw-weighting.md) | Draw weighting: equal seats or weighted by bond | Built; default needs Rex | CONS-004 |
| [0005](VIP-0005-fault-slashing.md) | Slashing on recorded faults | Built | CONS-005 |
| [0006](VIP-0006-challenge-bonds.md) | Challenge bonds | Built | JURY-006 |
| [0007](VIP-0007-payout-hold.md) | Hold payouts until the challenge window closes | Built | CONS-006 |
| [0008](VIP-0008-single-harness-mode.md) | Single-harness mode: a jury of one, with a challenge window | Built; needs Rex | CONS-007 |
| [0009](VIP-0009-prover-placement.md) | Prover placement: each harness proves, or shared provers do | Decision needed | CONS-008 |
| [0010](VIP-0010-judiciary-signer.md) | Judiciary Signer: a multisig member that votes only as a jury rules | Built; decisions for Rex | SIGN-001 |
| [0011](VIP-0011-policies.md) | Policies, and Covenant Launch: rules a wallet cannot break | Built | SIGN-002 |
| [0012](VIP-0012-harness-registry.md) | Harness registry: find harnesses on chain, and pay them | Built | NET-001 |
| [0013](VIP-0013-hardware-attestation.md) | Hardware attestation: a known build inside an enclave | Building: verification built, no enclave run | NET-002 |
| [0014](VIP-0014-model-certification.md) | Model certification: measured attack results before a closed model may judge | Built; no model measured | SIGN-003 |
| [0015](VIP-0015-asset-transfer-records.md) | Asset transfer records: sell a physical thing, record that it changed hands | Idea | SIGN-004 |
| [0016](VIP-0016-commission-covenant.md) | Commission covenant: a validator bonds its promise on fees | Idea | SIGN-005 |
| [0017](VIP-0017-programs-first.md) | Programs first, SIMD on adoption | Accepted | SOL-002 |

Tracking issues: [#26 to #36](https://github.com/Verafyai/verafyHarness/issues?q=label%3Aproposal). VIPs 0001 to 0009 were built in v0.0.3-alpha and 0010 to 0017 written in v0.0.4-alpha, unless the status says otherwise; every number in them is illustrative until Rex sets it.

**Process.** Every feature starts as a VIP, is built against it, and is crossed off here when it lands. Applications built on top of the protocol are Verafy App Pilots, in [docs/pilots](../pilots/README.md).

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
