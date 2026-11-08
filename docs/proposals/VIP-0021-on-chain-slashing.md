---
vip: '0021'
title: 'Slash registry bonds on chain'
status: Idea
created: 2026-11-07
requirement: NET-004
depends: ['0005', '0012']
---

## Summary

A `slash` instruction in `verafy_registry` takes a share of a harness bond on fault evidence the program can check itself: two signed commitments for one seat (double commit), or a reveal that doesn't match its commitment in a `verafy_ruling` account. Slashed funds split between the reporter and a pool, as in the off-chain schedule.

## Motivation

Faults are recorded and priced (VIP-0005), and bonds sit on chain in the registry (VIP-0012), but nothing on chain takes a bond.

## Done when

A double commit and a bad reveal are slashed on devnet from evidence alone.

## Tracking

Requirement NET-004. Written as the next proposal after v0.0.4-alpha.
