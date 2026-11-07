---
vip: '0004'
title: 'Draw weighting: equal seats or weighted by bond'
status: Decision needed
created: 2026-11-07
requirement: CONS-004
---

## Summary

Decide whether a larger bond raises a harness's odds of being drawn. Today it doesn't: bond is only a floor (`maxValuePerVote`), and every eligible harness has the same chance.

## The options

| | Equal seats (today) | Weighted by bond |
|---|---|---|
| Odds | Same for every eligible harness | Proportional to bond, capped |
| Favors | Many small, independent operators | Operators with capital |
| Sybil pressure | Splitting into many small harnesses gains seats (VIP-0003 limits it) | Splitting gains nothing; total bond is what counts |
| Capture risk | Low: money doesn't buy seats directly | Higher: a large holder sits on more juries |
| Precedent | Courts' jury duty, Kleros by number | Proof-of-stake validator selection |

## Proposal

Ship both behind a jury rule, `weighting: 'equal' | 'bond'`, with `equal` the default. Bond weighting uses weighted sampling without replacement: rank by `-ln(u) / weight`, with `u` from the seed. It's deterministic, and it keeps the same lab and operator rules. Bond weight is capped (illustrative: no harness counts for more than 4 times the floor), so one large bond can't dominate.

A contract chooses its weighting; the network chooses which weightings it accepts.

## Decisions for Rex

- The network default, and whether `bond` is allowed at all.
- The weight cap if it is.

## Tracking

Requirement CONS-004. GitHub issue: see the index in [README.md](README.md).
