---
vip: '0006'
title: Challenge bonds
status: 'Shipped (v0.0.3-alpha)'
created: 2026-11-07
requirement: JURY-006
depends: ['0007']
---

## Summary

Whoever opens a challenge locks a bond. It's returned if the ruling is overturned or superseded, and forfeited if the ruling is affirmed. This is already in the draft rulings SIMD and the spec (JURY-006, planned). This VIP fixes the details.

## Motivation

`challengeContract` and `resolveChallenge` work (`packages/core/src/challenge.js`), but opening a challenge costs nothing. Without a cost, anyone can challenge every ruling they lose, and each challenge seats a jury at least as large as the original that shares no model family or harness with it. That's a cheap way to make honest rulings expensive and slow.

## Proposal

1. **Amount:** `challengeBond = max(floor, k × original jury cost)`. Illustrative: k = 1.5, so a frivolous challenge costs more than the jury it summons.
2. **Lock at open:** the challenge contract's escrow includes the bond, held by the escrow program, `hold` op (`packages/core/src/settle.js`).
3. **Outcomes,** from `resolveChallenge`:

| Result | Bond |
|---|---|
| `overturn` | Returned, plus a reward from the forfeited fees of the original jurors on the losing side (VIP-0005, item 2) |
| `supersede` (changed rules) | Returned, no reward: nobody was wrong |
| `affirm` | Forfeited: half to the original jurors who were wrongly challenged, half to the network pool |
| `stands` (the challenge jury fell below its bar) | Returned (as built; the challenge escrow already paid its jury) |

4. **Window:** challenges on `new-evidence` or `changed-rules` may open at any time. Challenges on `error` or `false-evidence` that should stop a payout must open inside the challenge window (VIP-0007).
5. **Audit-raised challenges:** an auditor whose report is flagged can open a challenge with a reduced bond, paid from `pool:auditors`. This rewards audits that find real problems.

## Decisions for Rex

- `k`, the floor, and the reward share on overturn.

## Tracking

Requirement JURY-006. GitHub issue: [#31](https://github.com/Verafyai/verafyHarness/issues/31).
