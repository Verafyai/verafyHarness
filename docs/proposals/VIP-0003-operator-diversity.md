---
vip: '0003'
title: 'Operator diversity: labs are not owners'
status: Idea
created: 2026-11-07
requirement: CONS-003
---

## Summary

Add an operator to every harness card, and let a contract cap how many seats one operator may hold on its jury.

## Motivation

The draw guarantees lab diversity: `minLabs` labs on every jury. It says nothing about who runs the harnesses. One person can run an Anthropic harness, an OpenAI harness and a Google harness, each bonded, and if the draw seats all three, one person holds three votes that look independent. Different labs protect against one model's blind spots. They don't protect against one owner's interests.

## Proposal

1. **Operator key.** A harness card gains `operator`: the public key of the operator who runs it, plus the operator's signature over the card. One operator key signs many harness cards.
2. **Seat cap.** Jury rules gain `maxSeatsPerOperator` (default 1) and `minOperators` (default the jury size). `drawJury` skips a harness whose operator already holds the cap, the same way it skips a second model from a lab that's already seated when new labs are still needed.
3. **Operator bond.** Each operator posts a bond of its own, on top of each harness's bond. Faults by any of its harnesses can be slashed from it (VIP-0005).
4. **Verification.** `verifyRuling` checks that operator signatures are valid and the cap was respected.

## What this does not solve

An operator can register several operator keys. Nothing in a protocol can prove two keys belong to two people. What this does is raise the cost: each extra identity needs its own operator bond, and the cap means splitting into k identities only pays if all k are drawn. Stronger options, all outside the protocol and none chosen:
- known-operator registries (signed by the network's governance);
- hardware attestation tying a harness to a machine;
- reputation from a track record (milestone 3).

## Alternatives

- **Cap by IP address or hosting provider.** Easy to evade with a VPN; it also penalizes honest operators on the same cloud.
- **No cap; rely on bonds alone.** Today's behavior. It makes collusion expensive, but not visible.

## Decisions for Rex

- Defaults for `maxSeatsPerOperator` and `minOperators`, and the operator bond amount.
- Whether Verafy keeps a known-operator registry at all.

## Tracking

Requirement CONS-003. GitHub issue: see the index in [README.md](README.md).
