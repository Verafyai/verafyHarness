---
vip: '0017'
title: 'Programs first, SIMD on adoption: settle on Solana today with ordinary programs'
status: 'Shipped: the rule every program here follows'
created: 2026-11-07
requirement: SOL-002
depends: []
---

## Summary

Verafy settles on Solana today with ordinary on-chain programs:
- `verafy_ruling` for commit, reveal and seal;
- `verafy_judiciary` for votes on Squads proposals;
- `verafy_registry` for harnesses.

None of them needs a validator change. A SIMD, a change to Solana itself, is worth proposing only once enough real usage shows what belongs in the protocol.

## Motivation

A SIMD takes months of review and a vote by validators. Proposing one before anyone uses the thing it standardizes asks Solana to bet on a guess. Programs can ship this week, be used by real wallets, and change when they turn out to be wrong.

## The rule

1. **Build it as a program first.** If it can't be built as a program, write down exactly why: which syscall, account rule or fee is missing.
2. **Measure it in use.** Count transactions, compute units, and the failures that only a protocol change would fix.
3. **Propose a SIMD when, and only when:**
   - programs are measurably not enough, for example a cost per ruling that only native support would lower, or a guarantee a program can't give;
   - and there is real adoption to point to: wallets, launches, rulings per day.

## Today

| Need | As a program | Would a SIMD help? |
|---|---|---|
| Commit, reveal, seal a ruling | `verafy_ruling` (built, localnet measured) | Maybe later: a native verifier could cut compute |
| Vote on a Squads proposal | `verafy_judiciary` (built, localnet measured) | No: Squads already accepts program members |
| Find and pay harnesses | `verafy_registry` (VIP-0012) | No |
| Proofs of inference on chain | Off chain today (VIP-0009) | Possibly: a proof-verification syscall |

The draft SIMDs written earlier stay as drafts until the "when" above is met.

## Tracking

Requirement SOL-002.
