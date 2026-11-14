---
vip: '0044'
title: 'Z-shatter: shattering inside a shielded pool, with slashing that still works when the chain shows nothing'
status: 'Theoretical; legal review required before any build or public launch'
created: 2026-11-14
depends: ['0043', '0033', '0039']
---

## Summary

The following is a theoretical approach to zero-knowledge shattering on Verafy.

[VIP-0043](VIP-0043-shattering.md) breaks a deposit into shrapnel and spreads it across a bonded agent swarm. Its privacy comes from many identical-looking moves: every move is visible, and only the links between them are hidden. **Z-shatter** is a mode of the same design in which each piece of shrapnel rests as a **shielded note** in a zero-knowledge pool. While the funds rest, the public sees only commitments: no amounts, no holders, no moves. When the funds are reassembled, spent notes publish nullifiers that cannot be linked to the commitments they spend.

Shielding breaks one thing VIP-0043 relies on: slashing for "moving early" works by watching agent wallets on chain, and inside a shielded pool there is nothing to watch. Z-shatter restores it with two mechanisms, either or both: **viewing keys split across Verafy jurors** (any 3 of 5 can check an agent's notes; none can alone), and **periodic zero-knowledge proofs** from each agent that its note is still unspent. An agent that spends early, or misses a proof, is slashed.

Everything else in VIP-0043 carries over unchanged: the shattering strategy and privacy floor, bonds before custody, automatic slashing and payout on failure to restore, the bearer assembly key, and the front-running protection on reassembly.

Animation: [assets/VIP-0044/verafy-z-shatter.mp4](assets/VIP-0044/verafy-z-shatter.mp4) (source: `zshatter.html`). Blog post: [Shattering: A Theoretical Approach to Privacy in a Verafy Agent Swarm](https://blog.verafy.ai/articles/20261114-shattering).

## Motivation

Shattering's weakest point, set out in VIP-0043's comparison with Zcash, is privacy per transaction: each move of shrapnel is visible on chain, so privacy depends on enough concurrent traffic to hide in. Zcash's shielded pool has the opposite profile: the strongest privacy available, but only for its own coin, with no conditional triggers, no bonded restoration and no way to hand over a claim without moving funds.

Z-shatter combines them: shielded-pool privacy while the funds rest, with shattering's triggers, bearer key and bonds on top. The question is whether the Verafy harness can still police agents it can no longer see. This VIP answers yes, with two mechanisms.

## Proposal

### 1. Z-Shatter mode

The caller sets `mode: shielded` in the shattering strategy. Shatter then:

1. Breaks the amount into shrapnel of standard sizes, as in VIP-0043.
2. Requires each assigned agent to lock its bond first, as in VIP-0043.
3. Creates each piece of shrapnel as a shielded note owned by its agent. The chain records a **commitment** per note and nothing else.
4. Registers each agent's **viewing key** with the jury (section 3) and starts the agent's **proof schedule** (section 4).
5. Writes the sealed shatter commitment and returns the bearer assembly key, as in VIP-0043.

### 2. Where the pool lives

Two options, not mutually exclusive:

| | A. Zcash shielded pool | B. A native shielded pool |
|---|---|---|
| What it is | Each piece rests as a Zcash shielded note | A Zcash-style pool (commitments, nullifiers) built on the chain where shrapnel rests |
| Privacy | Zcash's pool and anonymity set | Only as large as Z-shatter's own usage |
| Assets | ZEC only; BTC must be swapped or bridged in and out, and each crossing is a point where funds can be linked | Any asset on that chain |
| Build | Integration, through the privacy router ([VIP-0039](VIP-0039-shielded-mailbox.md)) | New circuits, audited; a multi-year effort for most teams |
| Recommendation | First | Only if A proves the demand |

### 3. Watching without seeing: split viewing keys

In VIP-0043, "moving early" is caught by reading an agent's balance on chain. In a shielded pool, that read shows nothing. Fix:

- Each agent hands over a **viewing key** for its notes: enough to see whether a note has been spent, not to spend it.
- The viewing key is **split across the Verafy jury**, threshold 3 of 5. Any three jurors together can check an agent's notes. No single juror, operator or the Foundation can see anything alone.
- Checks are routine (on schedule) and on demand (when a dispute is raised). A check that finds a note spent off schedule triggers the slash, exactly as in VIP-0043.

Cost: whoever assembles a threshold can see the swarm's holdings, so juror selection, collusion resistance and key rotation matter. Jurors are drawn per check from the registry, not fixed.

### 4. Or agents prove it: periodic proofs of unspent notes

Alternative or complement to section 3: every agent, on a schedule set by the strategy, submits a **zero-knowledge proof that its note is unspent** (that the note's nullifier has not been published), without revealing which note it is.

- **No proof by the deadline: slashed.** The bond is held for the owner, as for an unauthorized move.
- **Nobody sees anything.** The watcher learns only that the proof verified.
- **Cost.** Every proof costs compute, paid from agent fees. The proof interval trades cost against how long an early spend could go unnoticed; the bond ratio has to cover that window.

Recommendation: proofs as the default, viewing keys as the dispute path.

### 5. Reassembly

As in VIP-0043: a key holder (or a time lock, or an inference condition) triggers reassembly with a zero-knowledge proof of the key that also binds the payout wallet. Agents spend their notes to the payout. Each spend publishes a **nullifier**, which marks the note spent without revealing which commitment it belonged to. Missed deadlines are slashed automatically and bonds pay out. The payout can leave the pool to a transparent wallet, or stay shielded.

What the public sees across the whole life of a Z-shatter: commitments in, nullifiers out, and nothing that links them.

### 6. The privacy floor still applies

Shielding protects the funds while they rest. The edges still leak:
- Entering and leaving a shielded pool can be linked by amount and timing. Standard sizes, staggered entry and exit, and minimum rest times from VIP-0043 apply to every shielded leg.
- With option B, the anonymity set is only as large as Z-shatter's own usage. A small pool is a weak pool.

## What exists, and what does not

- **Exists:** juries, agent bonds and slashing (VIP-0033, alpha), the shattering design (VIP-0043), the privacy router design (VIP-0039).
- **Does not exist:** Z-Shatter mode, threshold viewing-key custody by jurors, the unspent-note proof and its schedule, any shielded pool integration.

## Legal

Everything in VIP-0043's legal section applies, more strongly. Stronger privacy increases the exposure discussed there; it does not reduce it. Counsel must review this design before it is built or presented as a product. A proof of clean funds on entry (VIP-0043, section 7) matters more in shielded mode, not less. Nothing here is legal advice.

## Open questions and decisions for Rex

1. Option A (Zcash pool) first, option B later, or A only.
2. Proofs, split viewing keys, or both; and the proof interval.
3. Viewing-key threshold (3 of 5 proposed) and how often jurors rotate.
4. Whether payouts may stay shielded or must leave the pool.
5. Bond ratio in shielded mode, given the window between proofs.
6. Counsel review, as in VIP-0043.

## Alternatives considered

- **No slashing while shielded.** Rejected: an unwatched agent can spend its shrapnel and disappear.
- **A single watcher holding all viewing keys.** Rejected: one party could see every holding.
- **Only Zcash, no shattering.** Simpler and more private, but loses triggers, the bearer key, restoration bonds and support for other assets.
