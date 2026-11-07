# The challenge window and challenge bonds

*Payouts wait until a ruling can no longer be overturned cheaply, so an overturn moves money, not just the record.*

**Held payouts.** A contract with `payment.challengeWindow` seals its ruling with every payout parked in a held account. The jurors, the sealer, the pools and the winning side are recorded beside it, but not yet paid. When the window closes with no open challenge, the held payouts are released in a later block. A call on another chain waits too.

**An overturn inside the window.** If a challenge overturns the ruling before the window closes, the held escrow pays out as if the contract had ruled the challenge's answer. Jurors who voted that answer are paid; the share of jurors who voted the overturned answer goes to the challenger. Being wrong is not slashed: models are wrong without being corrupt. Forged evidence is, through its own challenge.

**Challenge bonds.** Whoever opens a challenge locks a bond, illustratively 1.5 times the challenge jury's escrow, so a frivolous challenge costs more than the jury it summons. It comes back on overturn or supersede. On affirm it is forfeited, half to the jurors who were wrongly challenged and half to the network pool.

**The trade.** Money waits. That is the same trade an optimistic L2 makes with its seven-day withdrawal, at a much shorter window, because a challenge jury rules in minutes. A contract can skip the window, but a [jury of one](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0008-single-harness-mode.md) cannot.

**On Solana.** verafy_ruling 0.0.3 records a `releasable_after_slot` when it seals. A program that pays on a ruling reads it and waits.

**Status.** Built (CONS-006, JURY-006 in core). The window lengths and bond factor are illustrative. Design: [VIP-0007](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0007-payout-hold.md), [VIP-0006](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0006-challenge-bonds.md).

**Related:** [Audits and challenges](/learn/audits-and-challenges), [Bonds and slashing](/learn/bonds-and-slashing)
