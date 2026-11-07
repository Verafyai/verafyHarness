# Bonds and slashing

*Running a harness means posting a bond that can be taken for misbehavior.*

Every harness posts a bond. It sets the most value one of its votes may decide (`payment.maxValuePerVote`), and it is what the network takes when the harness breaks the rules. Faults are found by the protocol itself, not by anyone's opinion: every ruling records them, with signed evidence where the fault can be proven.

**Two kinds of fault, priced differently.**

| Fault | What happened | Price (illustrative) |
|---|---|---|
| `double-commit` | Two signed, different commitments for one contract | 100% of the bond |
| `bad-proof` | A proof that does not verify: a claim the named model ran when it did not | 50% |
| `bad-reveal` | A signed reveal that does not open its own commitment | 25% |
| `runtime-mismatch` | A settlement the runtimes do not agree with | 25% |
| `no-beacon-reveal` | A sealer withheld its beacon reveal | 10% |
| `false-evidence` | Proven by a challenge that names the harness | 100% |
| `no-commit` | Missed a seat | 0.05, after a free 2% of seats |
| `no-reveal` | Committed, then never revealed | 0.5, after a free 0.2% of seats |
| `no-proof` | No proof by the deadline | 0.5 |

Provable misbehavior costs a share of the bond, because signed evidence shows the harness did it. Missed seats cost a fixed amount instead: honest machines go offline, and a share of the bond for every missed seat would cost an honest harness far more than its fees. Missed seats in a streak double in price each time, up to 5% of the bond per fault, because a juror that withholds reveals to sink rulings it sees going the wrong way would miss them in a streak.

**Where slashed money goes.** Half to whoever proved the fault, when someone did, and the rest to the network pool. Nothing is burned and nothing is minted. A penalty larger than the harness's bond reaches its [operator's](/learn/operators) bond; anything left is recorded as unpaid. Every slash rides in the block that applies it, under a signed root.

**What it costs to be honest.** Modeled with the defaults: a $500 bond at an 8% cost of capital costs about $0.23 per 1,000-contract block across every seat, and an honest harness that misses 1% of its seats loses nothing to slashing. One bad reveal costs $125, about 92,000 seat fees. All modeled and illustrative; see the [economics](/economics).

**Appeals.** A slash can be challenged on `error` grounds, so a node bug cannot quietly drain an honest harness.

**Status.** Built (CONS-005): the schedule, the bond diffs, and slashing on the local testnet (`verafy testnet up --misbehave h-llama-1:no-reveal`). Every rate is illustrative until Rex sets it. Design: [VIP-0005](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0005-fault-slashing.md).

**Related:** [The challenge window](/learn/challenge-window), [Operators](/learn/operators), [Launching a harness](/learn/launching-a-harness)
