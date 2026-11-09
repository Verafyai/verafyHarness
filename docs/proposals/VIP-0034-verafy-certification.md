---
vip: '0034'
title: 'Verafy Certification: a program''s report card on Solana, written only from a jury ruling'
status: 'Shipped (v0.0.6-alpha): program on devnet, core, client, MCP tool'
created: 2026-11-09
depends: ['0010', '0012', '0014']
---

## Summary

A **Verafy Certification** is an on-chain report card for one exact build of a Solana program. A Fuzzy report (fuzzy.verafy.ai) goes to a jury of registered harnesses; the jury rules which level the report supports; `verafy_certification` writes the level at the address `["cert", program, bytecode_hash]`, and refuses to unless a sealed `verafy_ruling` backs it. An agent decides whether to trust a program with one read: hash the program's current bytecode, read that account.

Not to be confused with model certification (VIP-0014), which certifies a model for judiciary use.

## Motivation

Agents now call programs they have never seen. Today the only signal is reputation: a name, a website, an audit PDF that may describe a different build. None of it is machine-checkable, and none of it notices an upgrade. Agents need a check that is cheap, tied to the exact code, and that nobody can write for themselves.

## Proposal

### Levels

| Level | Name | The report must show |
|---|---|---|
| 0 | Not certified | Any proven finding, a report that does not match its pinned hash, or no level |
| 1 | Sniffed | A Sniff run or deeper with no proven findings |
| 2 | Fuzzed | A Deep Fuzz or Kitchen Sink run on cloned mainnet state, no proven findings |
| 3 | Hardened | A Kitchen Sink run, no proven findings, Fuzzy Score 90 or more |

When the jury is unsure between two levels it picks the lower. A certification says the build survived these attacks. It is not an audit.

### The contract and the ruling

`programCertificationContract` (core) builds the ASC the jury rules on: the level rules, the Fuzzy report pinned by hash, and facts computed from it. The on-chain ruling's contract hash is

    sha256("verafy-certification/1" || program || bytecode_hash || report_hash || score)

so the ruling is about this program, this build and this report and nothing else. The bytecode hash is sha256 of the ELF the loader runs, up to its section header table (loader padding excluded).

### The program (`packages/solana/certification`)

`certify` writes or replaces the certification only if:

- the ruling account is owned by `verafy_ruling`, sealed, and carries the contract hash above;
- every seated juror is an active `verafy_registry` harness, at least three seats from at least two model families;
- a replacement comes from a ruling that becomes releasable later than the current one.

The level is the jury's answer. Layout: magic `VRFYCRT1`, level, score, seats, families, program, bytecode hash, report hash, ruling, certifier, releasable-after slot, certified slot (192 bytes).

### Lookup

`lookupCertification(rpc, program)` (packages/solana) and the MCP tool `verafy_certification` return `{ certified, reason, level, levelName, ... }`. `certified` is true only for level 1 or more and only once the ruling is past its challenge window. An upgraded program reads as uncertified until it is certified again.

## On devnet

`verafy_certification` is at `1dcJPW3aGMCWDkNV6do6sEUwSxLdf8NtSuQb1teCdXt`. The first certification: Fuzzy's benchmark vault (fixed build) at `9LdWL4mYLEyM8YnZejQYp5UzEynN75pxqUosZuXcB5ve`, ruled by four registered harnesses from four model families (votes scripted for this run), ruling `AbgeVBT8PPmXL8XNd3N9iNRqB9ci9nesNwEtAjGCZkPk`, certification account `8vSDoA5knpKDbu46VoSVhqM3PNwbHRrNm4gsUgjUS516`: Sniffed. Recorded in Verafyai/fuzzy `data/certify-devnet.json`.

## Limits

- The jurors in the devnet run voted by script. Real model jurors are the next step.
- The registry check proves jurors are registered, bonded harnesses, not that they ran the model they registered.
- Levels 2 and 3 need Fuzzy tiers that are not built yet.
