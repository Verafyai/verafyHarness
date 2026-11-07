---
vip: '0001'
title: 'Jury scheduler: one unit owns the seed, the draw, deadlines and replacements'
status: Idea
created: 2026-11-07
requirement: CONS-001
depends: ['0002', '0003', '0004']
---

## Summary

Add a jury scheduler to core: the one place that decides who sits on a jury, when each step is due, and what happens when a juror doesn't show. Today those jobs are spread across a pure draw function and whatever code calls it.

## Motivation

What exists (`packages/core/src/network.js`):
- `drawJury(pool, rules, seed)` filters by bond floor and exclusions, ranks harnesses by `sha256(seed + id)`, and seats them until the jury is full and spans `minLabs` labs. It throws when the pool can't meet the rules.
- `drawAuditors` and `sampleForAudit` (`packages/core/src/challenge.js`) pick auditors and rulings the same way.
- Every caller passes the raw parent block hash as the seed: `bin/verafy.js`, the testnet coordinator (`packages/deploy/src/testnet.js`) and the MCP server.

What's missing:
1. **No deadlines.** Neither the coordinator nor the daemon has a commit or reveal deadline. A juror that commits and goes silent is only marked `no-reveal` when the caller decides to stop waiting, and each caller decides differently.
2. **A stuck seal on Solana.** `verafy_ruling` refuses `seal` until every seat has revealed (error 104), and has no timeout, so one silent juror blocks a Solana ruling forever.
3. **No replacements.** A no-show shrinks the jury. With enough no-shows the ruling falls below quorum and goes below the bar, even when honest harnesses were free to sit.
4. **Seed policy is the caller's problem.** See VIP-0002.

## Proposal

A `JuryScheduler` in `packages/core/src/scheduler.js`, pure and deterministic, so every node computes the same schedule from the same inputs:

```js
const s = new JuryScheduler({ beacon, rules })   // rules: deadlines, caps, weighting
s.draw(asc, pool, height)        // -> { seed, jury, alternates, deadlines }
s.replace(schedule, faults)      // -> the next alternates, for seats that missed commit
s.auditors(ruling, pool, height) // -> auditors, seeded from a later beacon value
s.sample(rulings, height, rate)  // -> rulings to audit
```

- **Seed:** `beacon.valueAt(height)`, never a raw block hash (VIP-0002).
- **Draw:** the existing `drawJury` rules, plus the operator cap (VIP-0003) and the weighting mode (VIP-0004). Equal seats stay the default.
- **Alternates:** the draw keeps ranking past the last seat and returns the next `k` eligible harnesses, which still satisfy the lab and operator rules.
- **Deadlines, in blocks, not wall time,** so every node agrees on whether a deadline passed: `commitBy = height + c`, `revealBy = commitBy + r`. Illustrative defaults: c = 2, r = 2.
- **Replacement, commit phase only:** a seat that misses `commitBy` is filled from the alternates, with a fresh commit window. A seat that commits and then misses `revealBy` is not replaced: replacing it after other reveals are public would let the replacement copy them. It's recorded as `no-reveal`, and the ruling is measured without it.
- **Solana:** `verafy_ruling` gets a `reveal_deadline_slot` set at `open`. After it passes, `seal` counts only the revealed seats and marks the rest `no-reveal`. That's a program change, so a new program version.

Every ruling's `round` records the scheduler inputs (beacon height and value, rules, alternates used), so `verifyRuling` can recompute the whole schedule.

## Alternatives

- **Keep the draw in callers and just document a convention.** Rejected: three callers already pass the seed three slightly different ways.
- **Wall-clock deadlines.** Simpler, but two nodes with skewed clocks disagree on who missed a deadline. Block heights avoid that.

## Decisions for Rex

- Deadline lengths `c` and `r`, and the number of alternates. All illustrative until set.

## Security

- Replacement after a reveal is forbidden; that's what stops copying.
- Alternates are fixed at draw time, so a node can't hand-pick a replacement.

## Tracking

Requirement CONS-001. GitHub issue: see the index in [README.md](README.md).
