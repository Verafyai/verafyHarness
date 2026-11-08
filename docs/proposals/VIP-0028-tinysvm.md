---
vip: '0028'
title: 'TinySVM: the default settlement runtime, then solana-svm'
status: Idea
created: 2026-11-07
requirement: SETTLE-004, SETTLE-005
depends: []
---

## Summary

Make TinySVM the settlement runtime every harness runs by default, then move it from LiteSVM to Anza's `solana-svm` crate so every node re-runs settlement when it verifies a block.

TinySVM is a small Solana VM inside the harness. The jury decides which exit a contract takes. TinySVM executes that exit with exact integer arithmetic, running only pinned sBPF programs (`escrow`, `bond`, `ledger`, `graded_payout`, `ranked_split`, `milestone_escrow`) under a compute cap. It decides nothing.

## Motivation

Phase 1 is built (SETTLE-001 to SETTLE-003): a LiteSVM 0.18.2 sidecar, the six pinned programs, and a dual runtime where `runtime.js` and TinySVM run side by side and any disagreement is a fault. Two things keep it from being the settlement layer:

- **It is optional.** `runtime.js` is the default and settles in floating point. Switching to integer micro-units changes some future payouts by one micro-unit, so the switch needs Rex (SETTLE-004).
- **Only the harness runs it.** A node that verifies a block trusts the payouts in it. With `solana-svm`, the same crate Agave uses, a node can re-run settlement from the ruling and reject a block whose payouts differ (SETTLE-005).

This is the Verafy side of the comparison with a full Solana validator. A harness carries the SVM it needs to settle contracts, measured at 6.5 MB for the engine binary (release build, rustc 1.98.1, November 7, 2026), against about 640 MB for an Agave install. It does not carry a ledger of Solana transactions.

## Design

1. **Integer micro-units in `runtime.js`.** Both runtimes compute in the same units. Publish the one micro-unit change with the version that ships it.
2. **TinySVM by default, `runtime.js` as the check.** The dual runtime stays on. A disagreement is still a fault, and it now blocks the seal.
3. **Phase 2: `solana-svm`.** Replace LiteSVM with Anza's `solana-svm` crate behind the same interface. Nodes re-run every settlement in a block before they sign it.
4. **WebAssembly.** LiteSVM 0.18.2 does not build to WebAssembly. Recheck with `solana-svm`, so a browser or a light client can verify settlement.

## Trade-off

A Rust binary becomes a requirement of every harness, where today the core runs on Node with zero dependencies. The core stays dependency-free. Harnesses without the engine can still verify with `runtime.js`, but can't seal.

## Done when

- TinySVM is the default runtime, and the property test (random in-bounds rulings give identical results in both runtimes) runs in CI on every build.
- A node rejects a block whose payouts TinySVM recomputes differently, in a testnet run.
- The engine's size and per-settlement time are published, labeled measured.

## Tracking

Requirements SETTLE-004 and SETTLE-005. TinySVM phase 1 is documented in `packages/tinysvm/README.md`.
