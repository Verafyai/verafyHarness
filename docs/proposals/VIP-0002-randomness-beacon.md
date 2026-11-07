---
vip: '0002'
title: Randomness beacon for jury seeds
status: Idea
created: 2026-11-07
requirement: CONS-002
---

## Summary

Seed every jury draw from a randomness beacon that the block sealer can't steer, instead of from the raw parent block hash.

## Motivation

Today the seed is the parent block's hash (`drawJuryFor(asc, pool, parent.hash)`). Whoever seals that block chooses what goes into it: which rulings, their order, the timestamp. A sealer can try many candidate blocks and publish the one whose hash seats a jury it likes. This is called grinding. With a large pool it's cheap: for a jury of 5 drawn from 50 harnesses, a sealer who controls 5 harnesses needs, on average, many candidate blocks per seat it wants to win. Each candidate is just one hash, so trying millions costs nothing. (That attack cost is modeled, not measured.)

## Proposal

A commit and reveal beacon with lookahead, in the style of Ethereum's RANDAO, in `packages/core/src/beacon.js`:

1. **Commit:** each block's sealer includes `beaconCommit = sha256(r)` for a fresh random 32-byte `r` it keeps secret.
2. **Reveal:** the sealer of the next block that sealer seals, or that same sealer in the next block, must reveal `r`. A reveal is checked against its commitment.
3. **Mix:** `beacon[h] = sha256(beacon[h-1] || r_revealed_at_h)`.
4. **Lookahead:** juries for contracts admitted at height `h` are drawn with `beacon[h + L]`. Illustrative default L = 2. Nobody knows that value when a contract is admitted, so nobody can time a submission to a known jury.
5. **Withholding is a fault.** A sealer that commits and doesn't reveal can bias the beacon by one bit, by choosing whether to reveal. That's the "last revealer" weakness of RANDAO. A missing reveal is a `no-beacon-reveal` fault, slashed under VIP-0005, at a penalty larger than any single jury is worth (bounded by `maxValuePerVote` across the block).

`Beacon` is an interface, so a stronger source can replace it later:

```js
interface Beacon { valueAt(height): string; verify(height, value, evidence): boolean }
```

Candidates for later: drand (League of Entropy, threshold BLS, publicly verifiable, no last-revealer bias; needs a BLS verifier, which breaks the zero-dependency rule for core unless it's a separate package), or a VRF per harness.

## Alternatives

- **VRF self-selection** (each harness evaluates a VRF on the seed and sits if its output is below a threshold, as in Algorand). Strong, but jury size becomes random, and the lab rule is hard to enforce without a second pass.
- **Ed25519 signatures as a VRF.** Rejected: Ed25519 verification doesn't force a deterministic nonce, so a harness can produce many valid signatures over one message and pick the one it likes.
- **Solana's slot hashes.** Fine for settlement on Solana, but the Solana leader can grind them too, and the harness network shouldn't depend on Solana to run.

## Decisions for Rex

- Lookahead `L` and the beacon withholding penalty.
- Whether drand is worth an optional dependency.

## Security

Remaining bias: one bit per withheld reveal, at the cost of a slash. Grinding the block hash no longer helps, because the hash isn't the seed.

## Tracking

Requirement CONS-002. GitHub issue: see the index in [README.md](README.md).
