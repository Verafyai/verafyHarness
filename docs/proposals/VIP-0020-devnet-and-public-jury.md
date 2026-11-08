---
vip: '0020'
title: 'Devnet deployment and a public jury'
status: Idea
created: 2026-11-07
requirement: NET-003
depends: ['0010', '0012', '0016', '0017']
---

## Summary

Deploy all four to Solana devnet with fresh program keys. Run Verafy's own harnesses as a public jury registered in the registry. Rerun the 30 localnet checks against devnet and publish the results, with compute units per instruction.

## Motivation

The four programs (`verafy_ruling`, `verafy_judiciary`, `verafy_registry`, `verafy_covenant`) run on a local validator only.

## Done when

All four programs are on devnet, the checks pass there, and an outside wallet attaches a Judiciary Signer without help.

## Tracking

Requirement NET-003. Written as the next proposal after v0.0.4-alpha.
