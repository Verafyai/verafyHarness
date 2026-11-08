---
vip: '0010'
title: 'Judiciary signer: a multisig member that votes only as a jury rules'
status: 'Shipped (v0.0.4-alpha); on devnet since 2026-11-08, 30 of 30 checks'
created: 2026-11-07
requirement: SIGN-001
depends: ['0001', '0007', '0008', '0011', '0017']
---

## Summary

A judiciary signer is a member of a Squads multisig that no person holds a key for. It votes on a proposal only when a sealed jury ruling says to, and the ruling must:

- be bound to the exact transaction bytes;
- come from exactly the jury named when the signer was attached;
- clear the signer's bar;
- have outlived its challenge window.

The wallet's owners attach a policy (VIP-0011) and choose up to three models. From then on, nothing moves unless the humans and the policy both agree.

## Motivation

Multisigs protect a treasury from one stolen key. They don't protect it from its own signers: a team can vote together to drain a token's supply, change the rules, or pay itself. "Trust us" is the whole of a meme coin launch today, and most launches end in insiders dumping on buyers.

Squads already has the deterministic parts: thresholds, time locks, per-member permissions. What it lacks is a member that reads the stated purpose of the wallet and refuses transactions that betray it. An AI can read the purpose. But an AI that holds a key is just whoever runs it. The signer must be a program, and the decision must come from a jury whose ruling the program can check.

## Proposal

### On chain: `verafy_judiciary`

Path: `packages/solana/judiciary`.

- **`attach`** fixes, forever, for one signer:
  - the multisig;
  - the policy hash and the models hash;
  - the ruling program;
  - the jury's keys (1 to 8);
  - the bar;
  - the challenge window and the escape delay, both in slots.

  A jury of one must have a challenge window, as in VIP-0008. An escape delay must be longer than the challenge window.
- **The member.** Squads sees the signer as a program address, `["authority", config]`. No private key exists for it, so it can't sign outside this program.
- **`register`** opens a case for one proposal. It creates the case account `["case", config, proposal]`, one per proposal, and records `sha256` of the Squads transaction account. Every ruling on that case must carry this contract hash:
  `case hash = sha256("verafy-judiciary/1" || config || proposal || sha256(transaction account))`
- **`decide`** reads a `verafy_ruling` ruling account. It checks that:
  - the ruling is owned by the signer's ruling program and sealed;
  - every seat is a named juror, and the seat count is the signer's;
  - its bar is at least the signer's;
  - its contract hash is the case hash;
  - the transaction is unchanged since registration;
  - its challenge window is at least the signer's and has passed.

  If all hold, it calls Squads `proposal_approve` for answer 0 or `proposal_reject` for answer 1, signing as the member. A decided case is final.
- **`escape`**: if the signer was attached with an escape delay and a case has waited that long with no decision, the signer approves. A dead jury can't trap funds forever. A rejected case can never escape.

### Off chain: `packages/core/src/judiciary.js`

- **Signer setup**: policy, models and jury. Validation, hashes, and the attach arguments.
- **Setup check.** `checkSquadsSetup` refuses a multisig where any of these hold:
  - the humans alone can reach the threshold;
  - a config authority can change members without a vote;
  - the time lock is below the policy's minimum;
  - spending limits exist, which let funds leave without any vote.
- **The case contract**: an Actually Smart Contract built from the policy, the decoded transaction, the rule report and the case history. Its id is the case hash. It has two options, APPROVE and REJECT.
- **Untrusted text.** Memos, proposal descriptions and token names are untrusted evidence: the jury judges decoded instructions and balance changes, never what the text claims.
- **Verification.** `verifyCaseRuling` fails any APPROVE on a transaction that breaks a policy rule. That gives the "error" ground for a challenge (VIP-0006).

### Models

- **Choice.** The wallet owners choose 1 to 3 models, either open-weight or certified (VIP-0014).
- **Single-harness mode.** A jury of one, such as one Claude harness run by Verafy, is labeled trusted and needs a challenge window (VIP-0008).
- **Full jury.** The public "judiciary" is a jury of open-weight models from different families, whose inferences can be proven.

## What it can't do

- **It can't make a bad policy good.** "Reasonable expenses" will produce disputed rulings. Policies should be mostly rules (VIP-0011).
- **It can't stop the humans removing it if the setup lets them.** That's why `checkSquadsSetup` exists, and why removing the signer is a hard rule violation.
- **The jury is a fixed list until the registry (VIP-0012) exists.** Changing the jury means attaching a new signer, which the old signer must approve.

## Measured

- **Local validator, real program.** `packages/solana/scripts/judiciary-localnet.mjs` runs against Squads v4 dumped from mainnet. It checks 16 cases: humans alone can't pass, a wrong jury or wrong case is refused, the challenge window holds, approve executes the transfer, reject blocks escape, and escape waits its delay. Result: 16/16, in `results/judiciary-localnet-v0.0.4.json`.
- **Not measured yet:** devnet deployment, compute units per decision.

## Decisions for Rex

- **Default escape delay.** The tests use 40 slots. A real wallet wants weeks. 30 days is about 6.5 million slots at 400 ms, modeled.
- **Escape at all?** Whether Verafy should offer an escape hatch, or leave it as an option per wallet.
- **Default jury.** Single harness (yours) plus a challenge window, or three operators from day one.

## Tracking

Requirement SIGN-001.
