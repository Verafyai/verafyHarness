---
vip: '0030'
title: 'Super grants: venture-style funding paid out on verified outcomes'
status: 'Shipped (v0.0.5-alpha): core, policy, MCP tool and demo; not yet on devnet'
created: 2026-11-08
requirement: SIGN-008
depends: ['0010', '0011', '0029']
---

## Summary

A **super grant** fuses a grant with venture funding. A foundation issues a **Request for Ideas** and grants each admitted developer a set amount to answer it, on one condition: the developer runs its AI under the agent terms attached to the grant. Each grantee has a fixed window, two weeks by default, to come back with a response. A Verafy jury checks the response against the terms. A grantee that clears the terms can then unlock more funding by showing outcomes, such as revenue, a shipped integration or users, and a jury verifies each outcome before the escrow pays.

The money sits in a Squads escrow on Solana under a judiciary signer. The terms, the responses, the evidence and the rulings go through Verafy.

Code: `packages/core/src/grants.js`, the shared log and payout check in `packages/core/src/programlog.js`, the `super-grant` template and the `program-payout` rule in `packages/core/src/policy.js`, tests in `packages/core/test/grants.test.js`, `scripts/grant-demo.mjs`, and the read-only MCP tool `verafy_grant_ledger`.

## Motivation

Grants and venture funding fail in opposite ways.

- **Grants pay for promises.** A foundation picks proposals, pays up front, and finds out months later what was built. Most grant programs measure output by reading reports the grantees write themselves.
- **Venture funding pays for outcomes, but only for a few.** It needs a partner to believe in a team before there is evidence, and the check is large or nothing.

Foundations that want an ecosystem need something in between: small money to many builders fast, then more money to the ones that show results, without a committee reading every update. The hard part has always been checking results at scale. That is what a jury of models across families, reading pinned evidence, can do.

## Proposal

### The program (`verafy.super-grant/1`)

| Field | What it holds |
|---|---|
| `foundation` | Name, signing key, refund wallet |
| `request` | The Request for Ideas: a `summary` of the problem, the `terms` every response must meet (each with an id), `responseSeconds` and what a response contains |
| `agentTerms` | The terms the grantee runs its AI under, in plain words. Each application signs their hash. |
| `money` | Asset, `budget`, `baseGrant`, `maxGrantees`. The budget must cover every grantee earning every tranche. |
| `tranches` | Outcome tranches: an `outcome` name (Revenue, Integration), exactly what counts, what proves it, the `amount`, and how long after admission it can be claimed |
| `followOn` | Optional: `post-money-safe`, `revenue-share` or `right-of-first-refusal`, with its terms in text. Recorded and signed, not enforced on chain. |
| `window` | `applyUntil` and `endsAt` |
| `review` | Jury size, model families, bar, fee |

### The log

Signed, hash-chained events: `open` (the foundation funds the escrow with the whole budget), `apply` (a grantee introduces its key, wallet and idea and accepts the agent terms by hash), `admit` (the foundation, up to `maxGrantees`), `respond` (inside the window, evidence pinned by hash, final), `claim` (one per tranche, inside its window), `withdraw`. The replay refuses anything out of order: a response from someone not admitted, a late response, a second response, a claim before a response, a forged signature.

### Two kinds of review

- **Response review.** One Actually Smart Contract per response: the Request for Ideas, the agent terms, facts from the log, the pinned evidence, and the grantee's own summary labeled as untrusted. Options: `CLEARED` (meets every term) or `NOT_CLEARED`.
- **Outcome review.** One per claim: the tranche's exact wording, what proves it, facts from the log, the pinned evidence, the grantee's statement as untrusted. Options: `MET` or `NOT_MET`. The instructions define revenue as money from customers who are not the grantee, its principals or the foundation, so round-tripped money doesn't count.

Both are built only from the program and the log, so anyone can rebuild them and check that a ruling is on the right question.

### The ledger and the escrow

`grantLedger` computes entitlements from the log and verified rulings:

| Entitlement | When |
|---|---|
| `base:<grantee>` | On admission |
| `tranche:<grantee>:<id>` | The response was CLEARED and the outcome was MET |
| `refund` | After `endsAt`, once no review or claim is undecided: the budget minus everything earned |

The escrow is a Squads wallet with the foundation and a judiciary signer under the `super-grant` policy. The `program-payout` rule takes a proof (`{program, log, rulings, pay}`) and the signer checks all of it itself: the signatures and the chain, each ruling's contract rebuilt from the log byte for byte, each sealed round verified, and the transfers equal to exactly the named entitlements, none paid before. A foundation can't claw back the budget early; a grantee can't be paid a tranche it didn't earn.

## Alternatives

- **Milestone grants judged by the foundation.** The common model. It puts the funder in the position of judging its own payouts, which is where most grant disputes come from.
- **Retroactive funding only.** Pays for outcomes but gives builders nothing to start with. The base grant is what gets people to try.
- **Fully on-chain metrics.** Revenue is often off chain (card payments). Evidence plus a jury covers both.

## Not done

- Not on devnet.
- Outcome evidence is whatever the grantee pins; a processor-signed export (for example a Stripe report with a verifiable signature) would make revenue claims much harder to fake. Forged evidence is the open risk.
- The follow-on instrument is recorded, not executed.
- Jury fees are set per case and not yet collected on chain.

## Decisions only Rex can make

1. The default response window (14 days in the template).
2. Whether follow-on terms are offered as a standard SAFE text.
3. Whether outcome claims can be resubmitted after NOT_MET (today a claim is final).

## Tracking

Requirement SIGN-008.
