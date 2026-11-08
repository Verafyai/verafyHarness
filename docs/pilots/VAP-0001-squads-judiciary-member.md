---
vap: '0001'
title: 'Judiciary Signer as a member type in the Squads app'
app: 'Squads'
status: Idea
created: 2026-11-07
vips: ['0010', '0011', '0014']
---

## Summary

Add "Judiciary Signer" as a member type in Squads: choose a policy template, choose up to three models, attach, and Squads shows the policy and its hash beside the multisig. The setup check runs before the member is added.

## The problem today

Squads holds most Solana team and DAO treasuries. Its members, thresholds and time locks stop an outsider; nothing stops the signers themselves from moving funds against the wallet's stated purpose.

## What the jury decides

- Every proposal on the wallet: APPROVE or REJECT against the policy.

## Why it pays

- Makes money: a premium tier for treasuries and launches, for Squads and for Verafy.
- Customer satisfaction: "who can drain this wallet" has a published answer.

These are described, not estimated: the pilot is how they get measured.

## What we measure

- Wallets with a signer attached
- Rulings per week, and time from proposal to ruling
- Disputed rulings and their outcome

## Shape

Devnet first, with the three programs deployed. Verafy builds the integration with the Squads team; Squads owns the interface.

## Done when

Ten production wallets with a signer attached through the Squads app, with their rulings published.

Then this VAP moves to Live, and to Closed when the result is published.
