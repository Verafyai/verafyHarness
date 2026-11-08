---
vip: '0022'
title: 'Harnesses in real enclaves, with reproducible images'
status: Idea
created: 2026-11-07
requirement: NET-005
depends: ['0013']
---

## Summary

Build a reproducible harness VM image. Run it on an AMD SEV-SNP confidential VM, publish its launch measurement in `config/attested-builds.json`, pin AMD's root certificates, and register the harness with its attestation hash. Then add GPU attestation (NVIDIA confidential computing) for models served on a GPU.

## Motivation

Attestation verification is built (VIP-0013), but no harness has run inside an enclave, and there is no reproducible VM image whose measurement could be published.

## Done when

An attested harness sits on a jury with `attested: true`, verified against a published measurement.

## Tracking

Requirement NET-005. Written as the next proposal after v0.0.4-alpha.
