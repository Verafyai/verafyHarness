---
vap: '0009'
title: 'Commission covenant'
app: 'A validator or a Sanctum LST'
status: Idea
created: 2026-11-07
vips: ['0016']
---

## Summary

A validator bonds a promise not to raise its commission. Code watches the vote account. A jury covers MEV commission and promises made in words.

## The problem today

Validators can raise commission on stakers after attracting stake.

## What the jury decides

- Whether an off-chain promise, such as MEV commission or notice, was broken.

## Why it pays

- Makes money: for validators who can show they won't raise fees on stakers.

These are described, not estimated: the pilot is how they get measured.

## What we measure

- Stake under covenant
- Payouts made

## Shape

The code half first, as VIP-0016 says. Then the jury half.

## Done when

One validator with stake under a covenant for a full epoch cycle.

Then this VAP moves to Live, and to Closed when the result is published.
