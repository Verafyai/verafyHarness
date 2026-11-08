---
vip: '0008'
title: 'Single-harness mode: a jury of one, with a challenge window'
status: 'Shipped (v0.0.4-alpha): offered only with a challenge window and an automatic audit; Rex can withdraw it'
created: 2026-11-07
requirement: CONS-007
depends: ['0001', '0006', '0007']
---

## Summary

Let a contract choose a jury of one harness, made safe by a mandatory challenge window and a full jury on challenge. It's the harness counterpart of a single-sequencer L2: fast and cheap in the common case, correctable when it's wrong.

## Motivation

Base, Arbitrum and OP Mainnet each run one sequencer, operated by one company. That's a large part of why they're fast and cheap. They stay honest because the sequencer's results are posted to Ethereum and can be challenged with a fraud proof, and users can force-include transactions through Ethereum.

A single harness isn't the same thing. A sequencer only orders transactions; a harness decides an outcome. One model can be wrong without any rule being broken, and a proof of inference shows the named model ran, not that its answer is right. So a jury of one is only safe when someone else can check it and overturn it before money moves.

## Proposal

1. `payment.jury.size: 1` is allowed only with:
   - a `challengeWindow` at or above the network minimum (VIP-0007), never 0;
   - a challenge bond (VIP-0006) priced against a full jury, so a challenge is affordable;
   - L2 proofs if `maxValuePerVote` is above a network limit.
2. **Draw:** the scheduler (VIP-0001) draws the single seat as usual. `minFamilies` is 1.
3. **Automatic audit:** single-harness rulings are always in the audit sample, rate 1. One auditor from another model family re-runs the contract. If it disagrees, the auditor opens a challenge, which summons a full jury.
4. **Cost:** roughly one model call plus one audit call, against five calls for a five-seat jury. Not modeled yet. Add it to `packages/economics` before quoting a number.

## The honest comparison

| | Single-sequencer L2 | Single-harness mode |
|---|---|---|
| Fast and cheap because | One sequencer | One model |
| A bad operator can | Delay or censor | Rule wrongly |
| Caught by | Fraud proof against state posted to L1 | Audit by another model family, then a challenge jury |
| Funds wait | 7 days (optimistic withdrawal) | The challenge window |

## Decisions for Rex

- Whether to offer it at all. It's the cheapest mode, and the one most likely to be misread as "an AI decides alone".
- The value limit above which proofs are required.

## Tracking

Requirement CONS-007. GitHub issue: [#33](https://github.com/Verafyai/verafyHarness/issues/33).
