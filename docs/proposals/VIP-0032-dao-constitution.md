---
vip: '0032'
title: 'DAO constitution: a treasury that executes only what the constitution allows'
status: 'Shipped (v0.0.5-alpha): policy template and tests; uses the judiciary signer as built'
created: 2026-11-08
requirement: SIGN-010
depends: ['0010', '0011']
---

## Summary

A DAO can pass a constitution but has no one to enforce it. The `dao-constitution` policy template puts the DAO's treasury behind a judiciary signer that executes a passed proposal only if no article of the constitution is broken. The hard limits are code; each article is a question the jury answers on every proposal.

Code: the `dao-constitution` template in `packages/core/src/policy.js`, tests in `packages/core/test/constitution.test.js`. The sample constitution comes from SIMD sample 02 on asc.verafy.ai.

## Motivation

DAO governance checks votes, not content. A proposal that passes executes, whatever it does. The failures are familiar: calldata that does more than the text says, a payment to a council member's company buried in paragraph six, a spending cap broken across several small proposals, a constitution amended by a thin quorum.

## Proposal

`policyFromTemplate('dao-constitution', { name, articles, quarterlyCap, perTransaction, asset })` gives:

| Part | What |
|---|---|
| `constitution` | The articles, pinned by hash. The policy id carries the hash, so changing an article makes a new policy and a new signer. |
| Hard rules | Token and system programs only; at most `perTransaction` per proposal; at most `quarterlyCap` in any 91 days, counted across proposals; config changes go to the jury |
| Judgment | First: does the transaction do exactly what the proposal text says? Then one question per article: does this proposal break it? |
| Default | When the jury can't tell whether an article is broken, the answer is no |

The proposal text and forum thread reach the jury as untrusted material, never as instructions, like every other case the signer builds.

## Not done

- Amendments: the template treats the constitution as fixed. Amending it means a new policy and a signer swap approved by the current signer.

## Tracking

Requirement SIGN-010.
