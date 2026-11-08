---
vip: '0011'
title: 'Policies, and Covenant Launch: rules a wallet cannot break'
status: 'Shipped (v0.0.4-alpha)'
created: 2026-11-07
requirement: SIGN-002
depends: ['0010']
---

## Summary

A policy is what a judiciary signer enforces. It has three parts:

- **Rules:** checks any computer runs on the decoded transaction and gets the same answer.
- **Intent:** a plain statement of what the wallet is for.
- **Judgment:** the questions only a jury can answer.

The harness ships a policy library. The first template is **Covenant Launch**: a token creator keeps most of the supply in one wallet that can only release it on a published schedule, to published addresses.

## Motivation

Today's meme coin launch goes like this:

1. The creator says they bought a small share.
2. They quietly spread the rest across many wallets.
3. Snipers buy in.
4. Insiders dump on everyone who came after.

Launchpads have added CAPTCHA launches, sniper fees and fee-change caps. None of them stops the creator's own supply from being sold.

Covenant Launch does the reverse. Put the supply in one visible wallet, say 80%, and lock it with a policy anyone can read before they buy. The supply isn't hidden; it's held to a covenant, and the covenant is enforced by the judiciary signer, not promised.

## Proposal

### The policy format (`verafy.policy/1`)

Code: `packages/core/src/policy.js`.

| Part | Checked by | Example |
|---|---|---|
| `rules` | Code, same answer everywhere | Only these programs; at most X per month; only to these addresses; release schedule |
| `intent` | The jury | "This wallet holds the creator's share and may only release it on schedule" |
| `judgment` | The jury | "Does this look like a dump on holders?" |
| `minTimeLockSeconds` | Setup check | Squads time lock at least this |

**Rule types:**

- `allow-programs` (required);
- `max-per-transaction`;
- `max-per-window`;
- `allow-recipients`;
- `release-schedule`;
- `config-changes`, either `deny` or `jury`.

**Always violations, whatever the rules say:**

- anything that can't be read: address lookup tables, unknown instructions;
- changing or closing token account authorities;
- removing the judiciary signer;
- lowering the threshold to where the humans can pass alone;
- shortening the time lock below the minimum;
- adding a spending limit.

A rule violation is final. The jury is told to reject, and an approval of a transaction that breaks a rule fails `verifyCaseRuling`, so anyone can challenge it.

**Immutability.** A policy is pinned by its hash and never edited. A new policy is a new signer, added by a config change the current signer approves.

### Templates

- **`covenant-launch`.**
  - Parameters: mint, locked amount, start, cliff, period, share per period, recipients.
  - Default: a 30-day cliff, then 5% per 30 days. Illustrative.
  - Programs: system, token, token-2022, associated token, memo, compute budget only.
  - The jury also judges "does this look like a dump".
- **`treasury`:** a monthly cap and a per-payment cap, approved payees, a stated purpose.
- **`upgrade-authority`:** holds a program upgrade authority, moves no funds, and has a 7-day minimum time lock.

### Showing it to buyers

A launch page, or any wallet, can show the covenant with:

- the policy text and its hash;
- the Squads multisig and its members;
- the signer's on-chain config, which carries the same policy hash;
- the schedule: released so far, and what can be released next.

All of it is checkable on chain. No badge needs to be trusted.

## What it doesn't cover

- **Creator wallets outside the covenant.** A creator can still buy more from fresh wallets at launch. Spotting connected wallets is a separate jury question. It belongs in launchpad integrations, not in this policy.
- **The price.** The covenant limits what the creator's wallet can sell. It doesn't promise a price.
- **Legal questions.** Whether a covenant, or a token, raises securities questions is for the issuer's lawyers.

## Decisions for Rex

- **The name.** "Covenant Launch" is the working name. Alternatives: "Sworn Supply", "Held Float".
- **Default schedule numbers**, and whether templates should refuse aggressive schedules, such as more than 20% a month.
- **Launchpad partners.** Which launchpads to approach first.

## Tracking

Requirement SIGN-002.
