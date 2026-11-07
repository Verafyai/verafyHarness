---
vip: '0007'
title: Hold payouts until the challenge window closes
status: Built
created: 2026-11-07
requirement: CONS-006
---

## Summary

A sealed ruling's payouts become claimable only after a challenge window closes with no open challenge on the ruling. Until then they're held in escrow.

## Motivation

Today a ruling pays at seal. `tally` builds the diff with `buildDiff` (`packages/core/src/runtime.js`), and the block applies it: the winning side, the jurors and the sealer are paid the moment the block is sealed. If a challenge later overturns the ruling, `reviewStatus` reports `overturned` and programs must treat it as no ruling, but the money has already moved. An overturn corrects the record, not the funds.

This is the piece that makes the harness comparable to an optimistic L2. An L2's sequencer is trusted only because withdrawals wait out a fraud-proof window. A ruling should wait out a challenge window the same way.

## Proposal

1. **Two-phase diffs.** At seal, a passing ruling's diff moves the escrow to `escrow:<id>:held` with the intended payouts recorded beside it. Totals still conserve. A below-bar ruling is unchanged: it carries its escrow to escalation.
2. **Window,** in blocks: `challengeWindow` in the contract's payment section, with a network minimum. Illustrative default: 1 hour of blocks.
3. **Release:** after the window, any node can include a `release` for the ruling. It applies the recorded payouts if `reviewStatus` is `none` or `affirmed`, and there's no open challenge.
4. **Open challenge:** an `error` or `false-evidence` challenge opened inside the window freezes release until it resolves. On `overturn`, the held escrow pays out per the challenge ruling's outcome instead.
5. **Faster payouts for small or proven rulings:** a contract can set `challengeWindow: 0`, but only if its `maxValuePerVote` is under a network limit or every counted vote has a verified proof and the ruling has an audit. Speed is the contract author's trade, and it's visible in the contract.
6. **Solana:** the `verafy_ruling` account gains a `releasable_after_slot`. Programs that act on a ruling read it, and treat a ruling before that slot as not yet final.

The existing `finality(asc, ruling)` in `packages/core/src/proving.js` becomes the place both conditions are checked: proofs verified, and the window closed.

## Costs

Money waits. For a market that settles in seconds, a one-hour window is the price of being able to undo a wrong ruling. That's the same trade as a 7-day L2 withdrawal, at a much shorter window, because a challenge jury rules in minutes, not days.

## Decisions for Rex

- The default window, the network minimum, and the limit under which a contract may skip it.

## Tracking

Requirement CONS-006. GitHub issue: [#32](https://github.com/Verafyai/verafyHarness/issues/32).
