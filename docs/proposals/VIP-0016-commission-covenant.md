---
vip: '0016'
title: 'Commission covenant: a validator bonds its promise not to raise fees on stakers'
status: Idea
created: 2026-11-07
requirement: SIGN-005
depends: ['0011']
---

## Summary

A Solana validator posts a bond and commits not to raise its commission for a stated period. If it does, the bond pays the stakers it affected. Stakers and stake pools can see the covenant before they delegate.

## Where it belongs

- **The core check belongs in code.** A validator's inflation commission is stored in its vote account on chain, so "did it change?" has an exact answer. A plain program can watch the vote account and pay out from the bond automatically, with no jury needed. Marinade already runs validator bonds along these lines; check them before building.
- **The jury is for what code can't see:**
  - MEV and tip commission, which is set off the vote account;
  - promises made in words ("no increase before June");
  - whether a change was announced with the promised notice.

  Those go to a jury under a `commission-covenant` policy, on the validator's bond wallet.

## Proposal (outline)

1. **The bond program** (code only). The validator deposits a bond and names a vote account, a maximum commission and an end date. Anyone can submit the vote account showing a higher commission before the end date. The program pays stakers pro rata from the bond. Stake data comes from an oracle or a snapshot, which needs its own design.
2. **The policy template** (jury). It covers MEV commission and stated promises, with evidence from the validator's published terms and its on-chain history.

## Decisions for Rex

- Whether to build it, or to partner with an existing validator bond program.

## Tracking

Requirement SIGN-005. Not scheduled.
