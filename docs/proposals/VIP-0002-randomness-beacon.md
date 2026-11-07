---
vip: '0002'
title: Randomness beacon for jury seeds
status: Built
created: 2026-11-07
requirement: CONS-002
---

## Summary

Seed every jury draw from a randomness beacon that the block sealer can't steer, instead of from the raw parent block hash.

## Motivation

Today the seed is the parent block's hash (`drawJuryFor(asc, pool, parent.hash)`). Whoever seals that block chooses what goes into it: which rulings, their order, the timestamp. A sealer can try many candidate blocks and publish the one whose hash seats a jury it likes. This is called grinding. With a large pool it's cheap: for a jury of 5 drawn from 50 harnesses, a sealer who controls 5 harnesses needs, on average, many candidate blocks per seat it wants to win. Each candidate is just one hash, so trying millions costs nothing. (That attack cost is modeled, not measured.)

## Proposal

**As built (v0.0.3-alpha, `packages/core/src/beacon.js`): a hash chain fixed in advance.** An earlier draft had each sealer commit a fresh secret every block. That lets a sealer choose the secret after seeing which contracts arrived, which is grinding by another route. The built design removes the choice:

1. **Anchor:** each sealer registers `anchor = H^n(secret)`, the last link of a hash chain, when it joins.
2. **Reveal:** each block it seals reveals the next link back toward the secret. Anyone checks `H(reveal) == previous link` (`verifyBeacon`). The reveals were fixed at registration, before any contract existed.
3. **Mix:** `value[h] = sha256(value[h-1] || reveal[h])`, from a fixed genesis value. The value does not depend on the block's contents.
4. **Lookahead:** a contract admitted while the tip is at height a is drawn with `value[a + 1]` (L = 1). The block carries its own beacon entry in the signed header, so every ruling's seed is checkable.
5. **Withholding is a fault.** A sealer that skips a reveal mixes in a fixed marker instead, and is recorded as `no-beacon-reveal`, slashed at 10% of its bond (illustrative). That is the only remaining bias: one bit per withheld reveal.

`Beacon` is an interface, so a stronger source can replace it later:

```js
interface Beacon { valueAt(height): string; verify(height, value, evidence): boolean }
```

Candidates for later: drand (League of Entropy, threshold BLS, publicly verifiable, no last-revealer bias; needs a BLS verifier, which breaks the zero-dependency rule for core unless it's a separate package), or a VRF per harness.

## Alternatives

- **VRF self-selection** (each harness evaluates a VRF on the seed and sits if its output is below a threshold, as in Algorand). Strong, but jury size becomes random, and the family rule is hard to enforce without a second pass.
- **Ed25519 signatures as a VRF.** Rejected: Ed25519 verification doesn't force a deterministic nonce, so a harness can produce many valid signatures over one message and pick the one it likes.
- **Solana's slot hashes.** Fine for settlement on Solana, but the Solana leader can grind them too, and the harness network shouldn't depend on Solana to run.

## Decisions for Rex

- Lookahead `L` and the beacon withholding penalty.
- Whether drand is worth an optional dependency.

## Security

Remaining bias: one bit per withheld reveal, at the cost of a slash. Grinding the block hash no longer helps, because the hash isn't the seed.

## Tracking

Requirement CONS-002. GitHub issue: [#27](https://github.com/Verafyai/verafyHarness/issues/27).
