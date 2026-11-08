---
vip: '0024'
title: 'Registry-drawn juries for judiciary signers'
status: Idea
created: 2026-11-07
requirement: SIGN-008
depends: ['0001', '0002', '0010', '0012']
---

## Summary

Let a signer name rules instead of keys: models, families, attestation, minimum bond. Each case's jury is then drawn from the registry by the beacon, and the program checks the draw against the registry accounts and the beacon value.

## Motivation

A judiciary signer names its jury's keys at attach time. Changing the jury means attaching a new signer.

## Done when

A signer attached with rules rather than keys approves a case decided by a drawn jury, on devnet.

## Tracking

Requirement SIGN-008. Written as the next proposal after v0.0.4-alpha.
