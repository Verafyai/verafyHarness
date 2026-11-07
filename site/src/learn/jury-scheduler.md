# The jury scheduler

*The one place that decides who sits on a jury, when each step is due, and what happens when a juror does not show.*

1. **Seed.** The scheduler draws from the [randomness beacon](/learn/randomness-beacon), never from a raw block hash.
2. **Draw.** Every eligible harness is ranked by the seed. Eligible means bonded for the most value one vote can decide and not excluded. The scheduler seats harnesses in that order until the jury is full, spans the contract's model families, and respects the seats-per-operator cap. By default every eligible harness is equally likely to come first. A contract can ask for bond-weighted odds instead, capped so one large bond cannot dominate; whether the network allows that is Rex's call.
3. **Alternates.** The draw keeps ranking past the last seat. The next few harnesses are alternates, fixed at draw time, so no node can hand-pick a replacement.
4. **Deadlines, in blocks.** `commitBy` and `revealBy` are block heights, so every node agrees on whether a deadline passed.
5. **Replacement, commit phase only.** A seat that misses `commitBy` takes the first alternate that keeps the jury within its rules, with a fresh commit window. A seat that committed and then missed `revealBy` is never replaced: a replacement after reveals are public could copy them. It is recorded as a `no-reveal` fault and [slashed](/learn/bonds-and-slashing).
6. **Audits.** The scheduler also picks which rulings get audited. A jury of one is always audited.

Every ruling records its schedule (the seed, deadlines, alternates and replacements), so any node can recompute it and `verifyRuling` rejects a replacement the alternates do not give.

**Status.** Built (CONS-001); the local testnet runs every jury through it. Deadlines and alternate counts are illustrative. Design: [VIP-0001](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0001-jury-scheduler.md).

**Related:** [Randomness beacon](/learn/randomness-beacon), [Juries, commit and reveal](/learn/jury), [Operators](/learn/operators)
