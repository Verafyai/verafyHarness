---
vip: '0009'
title: 'Prover placement: each harness proves, or shared provers do'
status: Decision needed
created: 2026-11-07
requirement: CONS-008
---

## Summary

Decide who runs the GPU work of proving inference at L2: every harness for its own answers, or shared prover nodes that serve every harness.

## Motivation

The economics model (`packages/economics`) pools all proving for a block on one GPU server: 125 packed requests, about $1.29 of proving per 1,000 contracts, about 26 minutes on 1 H100 or about 7 minutes of round trip on 6 (all modeled, not measured). The code supports both placements: a local prover, or a `provers` entry in the API router metered per proof (`packages/prove`). But the network has never said which one it expects, and the choice changes who needs GPUs, how fast a block finalizes, and what a proof means.

The total GPU work is about the same either way. Who holds the GPUs decides the time.

## The options

| | Each harness proves | Shared prover nodes |
|---|---|---|
| Who needs GPUs | Every harness running an L2 route | Only provers |
| Packing | Only within one harness's own answers, so it saves less | Across every harness in a block, so it saves the most |
| Latency | Bounded by the slowest harness's GPU | Scales with how many provers the network has |
| Trust | The harness proves its own claim | A prover proves another party's claim; it must not see a juror's answer before reveal |
| Operator cost | High barrier to running a harness | Harnesses stay cheap; provers are a separate business |

A shared prover sees the request and the reply, so it must only receive them after reveal. That ordering is already true: proving runs after commit and reveal (PROVE timing, `packages/core/src/proving.js`). A prover that withholds a proof becomes a `no-proof` fault against the harness that hired it, so a harness should be able to hire more than one.

## Proposal

Allow both. Recommend shared provers for packed L2 blocks, and keep local proving for operators who want to prove their own answers. Add `prover` to the proof record (who produced the proof), so faults and fees reach the right party.

## Decisions for Rex

- The recommended default.
- Whether provers bond and get slashed like harnesses (VIP-0005).
- Renting the first FlashProve machine (still pending, see milestone 6).

## Tracking

Requirement CONS-008. GitHub issue: [#34](https://github.com/Verafyai/verafyHarness/issues/34).
