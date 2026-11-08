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
| **DAO constitution** | A DAO treasury | Caps per proposal and per quarter; the constitution pinned by hash; one jury question per article; when in doubt, no |
| **Super grant** | A foundation's grant budget | Pays only entitlements the ledger shows: base grants on admission, tranches after a cleared response and a met outcome, the rest back to the foundation after the end |
| **Hackathon** | A prize pool | Pays only the council's final ranking, once; nothing before the window closes; unwon prizes back to the initiator |
| **Agentic contract** | The escrow for a deal between two agents | Pays out once, only to the two parties, only the exact payouts of one remedy, only with a settlement proof the signer checks itself; no config changes |

## Covenant Launch

Today's meme coin launch hides the creator's supply across many wallets, then sells it into buyers. Covenant Launch does the reverse:

- The creator's share, say 80%, sits in one visible Squads wallet.
- The wallet's covenant says how much may be released, when, and to whom. For example: nothing for 30 days, then 5% a month, only to the published market maker and exchange addresses.
- The Judiciary Signer refuses anything else, including a transfer that's "only one lamport" over schedule.
- Anyone can read the covenant and its hash before they buy, and check that the signer on chain carries the same hash.

The covenant doesn't promise a price, and it doesn't cover wallets the creator controls outside it. Spotting connected wallets at launch is a separate jury question, for launchpad integrations.

## Agentic contract

Two agents make a deal: agent B writes a report, agent A pays 2 SOL. They sign one set of terms that lists every possible outcome and its exact payout (COMPLETE pays B everything, PARTIAL splits it, REFUND returns it to A). A's 2 SOL sits in a Squads wallet that is two of three: agent A, agent B, and a judiciary signer with this policy.

- Both agents together can release by mutual consent.
- One agent with the signer can take only one remedy's payouts, and only with a **settlement proof**: the signed terms, the signed event log and, after a dispute, the dispute contract and the sealed jury ruling. The signer replays the log, rebuilds the dispute contract and checks the jury's commits and reveals itself. It trusts nothing it is handed.
- One key alone moves nothing.

Most deals settle with no jury: the buyer accepts, or the review window passes in silence, or a deadline passes with no delivery. A dispute goes to a jury that picks one of the signed remedies. The agents' own statements reach the jury as untrusted claims.

```js
const policy = policyFromTemplate('agentic-contract', { contract })
checkAgenticEscrow(multisig, { signer, policy, contract })   // two of three, nothing else can vote
checkRules(policy, effectsOf(tx), { now, agentic: proof })    // the payout matches a proven settlement
```

Run `node scripts/agentic-demo.mjs` for both paths. Code: `packages/core/src/agentic.js`. Design: [VIP-0029](proposals/VIP-0029-agentic-contracts.md).

## Super grant and hackathon

Both are program escrows: a Squads wallet with the funder and a judiciary signer. The case carries a program proof (`{program, log, rulings, pay}`). The signer replays the signed log, rebuilds every jury contract from it, verifies each sealed round, and pays exactly the named entitlements, none twice. Design: [VIP-0030](proposals/VIP-0030-super-grants.md), [VIP-0031](proposals/VIP-0031-hackathon-grants.md). Run `node scripts/grant-demo.mjs` and `node scripts/hackathon-demo.mjs`.

## DAO constitution

`policyFromTemplate('dao-constitution', { name, articles, quarterlyCap, perTransaction })`. The articles are pinned by hash in the policy id, so changing one makes a new signer. Design: [VIP-0032](proposals/VIP-0032-dao-constitution.md).

## Always refused, whatever the policy says

- Anything the signer can't read: address lookup tables, unknown instructions.
- Handing over or closing the wallet's token accounts.
- Removing the judiciary signer, or lowering the threshold so the humans can pass alone.
- Shortening the time lock below the policy's minimum.
- Adding a Squads spending limit, which spends without any vote.

## A policy never changes

A policy is pinned by its hash. A new policy is a new signer, added by a config change that the current signer must approve.

Code: `packages/core/src/policy.js`. Design: [VIP-0011](../docs/proposals/VIP-0011-policies.md).
