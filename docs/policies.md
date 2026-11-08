# Policies

The rules a [Judiciary Signer](/signer) enforces on a wallet. Each policy has three parts:

| Part | Checked by |
|---|---|
| **Rules** | Code: every computer gets the same answer |
| **Intent** | The jury: what the wallet is for, in plain words |
| **Judgment** | The jury: the questions only it can answer |

A rule violation is final. The jury is told to reject, and an approval that breaks a rule fails verification, so anyone can challenge it.

## The templates

| Template | For | Hard rules |
|---|---|---|
| **Covenant Launch** | A token creator's share of supply | Release schedule (cliff, then a share per period); published recipients only; no programs beyond token transfers |
| **Treasury** | A DAO or team budget | Cap per payment and per 30 days; approved payees; a stated purpose the jury checks |
| **Upgrade authority** | A program's upgrade key | Moves no funds; config changes reviewed against the change log; 7-day minimum time lock |

## Covenant Launch

Today's meme coin launch hides the creator's supply across many wallets, then sells it into buyers. Covenant Launch does the reverse:

- The creator's share, say 80%, sits in one visible Squads wallet.
- The wallet's covenant says how much may be released, when, and to whom. For example: nothing for 30 days, then 5% a month, only to the published market maker and exchange addresses.
- The Judiciary Signer refuses anything else, including a transfer that's "only one lamport" over schedule.
- Anyone can read the covenant and its hash before they buy, and check that the signer on chain carries the same hash.

The covenant doesn't promise a price, and it doesn't cover wallets the creator controls outside it. Spotting connected wallets at launch is a separate jury question, for launchpad integrations.

## Always refused, whatever the policy says

- Anything the signer can't read: address lookup tables, unknown instructions.
- Handing over or closing the wallet's token accounts.
- Removing the judiciary signer, or lowering the threshold so the humans can pass alone.
- Shortening the time lock below the policy's minimum.
- Adding a Squads spending limit, which spends without any vote.

## A policy never changes

A policy is pinned by its hash. A new policy is a new signer, added by a config change that the current signer must approve.

Code: `packages/core/src/policy.js`. Design: [VIP-0011](../docs/proposals/VIP-0011-policies.md).
