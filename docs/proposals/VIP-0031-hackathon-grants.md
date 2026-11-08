---
vip: '0031'
title: 'Hackathon grants: a prize pool graded by a Verafy council'
status: 'Shipped (v0.0.5-alpha): core, policy, MCP tool and demo; not yet on devnet'
created: 2026-11-08
requirement: SIGN-009
depends: ['0010', '0011', '0030']
---

## Summary

A **hackathon grant** lets a foundation or anyone else post a prize pool and evaluation criteria and open a hackathon. Developers submit GitHub repositories, each pinned to a commit. When the period ends, a Verafy council grades every submission against the criteria, the ranking is computed by code, and the escrow pays exactly that ranking.

Code: `packages/core/src/hackathon.js`, the `hackathon` template and the `program-payout` rule, tests in `packages/core/test/hackathon.test.js`, `scripts/hackathon-demo.mjs`, and the read-only MCP tool `verafy_hackathon_results`.

## Motivation

Hackathon judging is the weak point of every hackathon Rex has run. Judges get a few minutes per project, read the demo rather than the code, and are often sponsors with a stake in the outcome. Prize payouts then depend on the organizer doing what it said. Developers have no way to check either.

A hackathon grant fixes both ends: the criteria and prize table are signed before anyone submits, the code is graded at the commit that was submitted, by models from different families that can't see each other's votes, and the payout is whatever that grading gives.

## Proposal

### The program (`verafy.hackathon/1`)

| Field | What it holds |
|---|---|
| `initiator` | Name, signing key, refund wallet |
| `challenge` | What to build, and rules (a broken rule scores 0) |
| `criteria` | Each with an id, text and a whole-number weight |
| `money` | Asset and `pool` |
| `prizes` | `shares` in parts per million, adding up to the pool, not growing with place; `minScore`, the least a winner must score |
| `window` | `opensAt`, `closesAt` |
| `council` | Jury size, model families, bar, fee |
| `maxSubmissions` | Up to 500 |

### Submissions

A `submit` event is signed by the team's own key and carries the team name, payout wallet, the repository as `https://github.com/<owner>/<name>`, a full 40-character commit SHA, and a description. The replay refuses a non-GitHub URL, a branch name instead of a commit, a submission outside the window, and a repository another team already submitted. A team may resubmit before the close; the new commit replaces the old one and the team keeps its first submission time for tie breaks.

### The council

After the close, each live submission becomes an Actually Smart Contract with a **graded** answer on a 0 to 10 scale: the challenge, the weighted criteria, the repository at the pinned commit as `repo` context, facts from the log, and the team's description labeled as untrusted. Graded agreement counts a vote one step away as half, so a council that says 7, 7, 8 agrees on 7.

### Results and the escrow

`hackathonResults` ranks by score, then earlier first submission, then log order. Places at or above `minScore` win their share; whatever nobody won, plus rounding, returns to the initiator. Results are final only after the close and when every live submission has a verified ruling at or above the bar.

The prize escrow's judiciary signer runs the `hackathon` policy: it rebuilds every judging contract from the log, verifies each sealed round, checks the results are final, and pays exactly the named prizes once. Second and third place can't be swapped; nothing pays before the close.

## Alternatives

- **One ASC ranking every submission.** Ranking dozens of repositories in one prompt is slower and less consistent than grading each on its own scale.
- **Per-criterion questions.** More precise, but criteria times submissions juries. The weighted rubric in one graded question is the default; per-criterion grading is a later option.

## Not done

- Not on devnet.
- The council reads the repository through a snapshot of the commit; the snapshot service is not built, so today the demo's council is scripted.
- No team identity beyond a key: one person can submit as several teams. Eligibility checks (GitHub account age, a signed commit) are a later option.

## Decisions only Rex can make

1. The default scale (0 to 10) and whether initiators can change it.
2. Whether sponsors may sit on the council alongside model jurors.

## Tracking

Requirement SIGN-009.
