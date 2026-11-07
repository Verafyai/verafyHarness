---
vap: '0012'
title: 'Policy-checked signing for large transfers'
app: 'Phantom'
status: Idea
created: 2026-11-07
vips: ['0010', '0011']
---

## Summary

A user sets personal rules, such as "never more than X to a new address in a day". A transfer that breaks them is reviewed by a jury before the wallet signs it.

## The problem today

Wallet users lose funds to drainers and mistakes on single large transfers.

## What the jury decides

- Whether a flagged transfer matches the user's stated rules and intent.

## Why it pays

- Saves money: for users.
- Keeps customers: a reason to stay with the wallet that prevented the loss.

These are described, not estimated: the pilot is how they get measured.

## What we measure

- Transfers stopped
- Users who keep it on

## Shape

Needs a smart account or a signer the wallet controls. A design question for the wallet team.

## Done when

One thousand users with policy-checked signing on.

Then this VAP moves to Live, and to Closed when the result is published.
