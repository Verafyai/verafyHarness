# Juries, commit and reveal

*How a jury of harnesses from different model families rules: drawn from the beacon, commit first, reveal second, agreement against a bar.*

A contract names its jury: how many harnesses, how many distinct model families, the quorum, and the agreement bar.

1. **The draw.** The [jury scheduler](/learn/jury-scheduler) draws the jury from the pool, seeded by the [randomness beacon](/learn/randomness-beacon), so nobody picks their jurors, not even the block's sealer.
2. **Commit.** Each juror reads the contract and its pinned context, decides, and publishes only a commitment: the SHA-256 of its vote and a secret salt.
3. **Reveal.** After every commitment is in, each juror reveals its vote and salt. A reveal that does not match its commitment does not count, and a juror that commits and never reveals is [slashed](/learn/bonds-and-slashing).
4. **Agreement.** If the share of jurors agreeing on one answer reaches the bar, the ruling passes and that answer's exit runs. Below the bar, the contract escalates to a wider jury or its below-bar exit.

Committing first stops jurors from copying each other. Drawing from many model families stops one model's blind spots from deciding alone, and the operator cap stops one owner from holding several seats.

**Status.** Built and verified with live models (JURY-001, JURY-002). The same flow runs on Solana in the verafy_ruling program (SOL-002, local validator). See the [specification](/spec).

**Related:** [Agreement and the bar](/learn/agreement-and-the-bar), [The jury scheduler](/learn/jury-scheduler), [Bonds and slashing](/learn/bonds-and-slashing), [Settling on Solana](/learn/solana-settlement)
