---
vip: '0033'
title: 'Agent bonds: an operator bonds its agent''s behavior, and a jury slashes violations'
status: 'Shipped (v0.0.5-alpha): core, policy and demo; not yet on devnet'
created: 2026-11-08
requirement: SIGN-011
depends: ['0010', '0011', '0016', '0030']
---

## Summary

An **agent bond** is a behavior contract for an AI agent. The agent's operator posts a bond under a written covenant: what the agent is for, what it must never do, and what each violation costs. Anyone who sees a violation (a user, a counterparty, another agent watching the platform) files a report with evidence and a small reporter bond. A Verafy jury rules on each report. A violation is slashed from the bond as the covenant prices it, to whoever the covenant names; a report that doesn't hold costs the reporter its bond. After the term, the rest of the bond returns to the operator.

It is validator slashing, applied to agents, with a jury where a validator network would have a cryptographic fault proof. Agents can slash agents: a report is a signed event anyone can make, and the reporter can be paid.

Code: `packages/core/src/agentbond.js`, the `agent-bond` template and the `program-payout` rule, tests in `packages/core/test/agentbond.test.js`, `scripts/agentbond-demo.mjs`.

## Motivation

People are told to trust an agent because of who runs it. That's a reputation claim with nothing behind it. A validator can be slashed for misbehaving because the network can prove the fault; most agent misbehavior (asking a user for a seed phrase, overstepping a refund limit, impersonating a person) can't be proven by code, only judged from evidence.

The commission covenant (VIP-0016) already bonds a validator's promises that code can't check. Agent bonds generalize it: any operator can put money behind its agent's conduct, and anyone can check the price of breaking each rule before they deal with the agent.

## Proposal

### The covenant (`verafy.agent-bond/1`)

| Field | What it holds |
|---|---|
| `operator` | Name, key, wallet (where the remaining bond and failed reporter bonds go) |
| `agent` | Name, the agent's own key, and its `scope`: what it is for and may do |
| `articles` | Each rule with an id, the text, what evidence proves a violation, and the `slash` it costs. No single slash exceeds the bond. |
| `money` | Asset, `bond`, `reporterBond` |
| `slashTo` | `harmed` (the report names the harmed party's wallet), `reporter` (a bounty), or `beneficiary` (a named wallet) |
| `term` | `startsAt`, `endsAt`, `reportGraceSeconds` after the term for in-term conduct, `answerSeconds` for the operator to answer |
| `review` | Jury size, model families, bar, fee |

### The log and the ruling

Signed events: `bond`, `report`, `answer`. A report introduces the reporter's key, names one article, the time of the conduct, an incident id, the reporter's wallet (and the harmed party's, when slashes go there), pins the evidence, and carries the reporter bond. The replay refuses reports before the bond is posted, for conduct outside the term, after the grace period, without evidence, for an unknown article, or twice for the same incident and article.

Each report becomes an Actually Smart Contract: the covenant, facts from the log, the reporter's and the operator's evidence, and both sides' statements labeled as untrusted claims by interested parties. Options: `VIOLATED` or `CLEAN`. Conduct outside the agent's scope that the covenant doesn't forbid is not a violation.

### The ledger and the escrow

| Ruling | Paid |
|---|---|
| VIOLATED | The article's slash (cut to what's left of the bond) to the harmed party, the reporter or the beneficiary; the reporter bond back to the reporter |
| CLEAN | The reporter bond to the operator |
| After the term, nothing undecided | The rest of the bond to the operator |

The escrow's judiciary signer runs the `agent-bond` policy: it rebuilds each violation contract from the log, verifies each sealed round, and pays only those entitlements, once. The operator can't pull its bond mid-term; nobody is slashed without a verified ruling.

## Alternatives

- **Reputation scores.** Cheap and easy to game, and they cost a misbehaving agent nothing today.
- **Slashing on reports alone.** Lets anyone drain a bond. The jury and the reporter bond are what stop griefing.
- **Insurance.** Pays the harmed party but leaves the operator nothing at stake per violation. A bond priced per article does both.

## Not done

- Not on devnet.
- Evidence is only as good as its source: an agent-signed transcript is strong, a screenshot is weak. Requiring agents to sign their outputs (the agent's key is in the covenant) is the next step.
- The bond doesn't top up: once slashed to zero, the agent is unbonded until the operator posts a new covenant.

## Decisions only Rex can make

1. The default reporter bond (0.1 SOL in the demo).
2. Whether slashes to `reporter` should be capped, so bounty hunting doesn't outpay harm.

## Tracking

Requirement SIGN-011.
