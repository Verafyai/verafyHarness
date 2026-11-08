---
vip: '0019'
title: 'Encoder: put policies and contracts on Solana in full, through IQ Labs until a SIMD exists'
status: 'Shipped (v0.0.4-alpha): memo backend measured on a local validator; IQ Labs backend ready, not run on devnet'
created: 2026-11-07
requirement: SOL-005
depends: ['0010', '0011', '0017']
---

## Summary

The chain stores hashes today. A judiciary signer's config holds its policy hash, and a ruling holds its contract hash. The text they point to lives off chain. An encoder writes the full text of a policy, contract, certification or bias profile onto Solana, so anyone can fetch it from the chain and check it against the hash.

Until Solana has a SIMD for data availability, the encoder uses IQ Labs' Code-In, which stores data inside ordinary Solana transactions. When a SIMD lands, the encoder switches backends and nothing else changes.

## Motivation

A hash proves a text is the one agreed. It doesn't make the text available. If the only copy of a Covenant Launch policy sits on Verafy's server, a buyer has to trust Verafy to show it. Then the covenant is a promise again.

Two ways to put text on Solana today:

- **Accounts.** Simple, but rent makes large text expensive.
- **IQ Labs' Code-In.** Data rides in transaction bodies, in chunks of 850 bytes, or 3,600 on the newer transaction format. Two small accounts link the chunks. IQ Labs reports network fees of about 0.0015 SOL per MB on the newer format, plus a protocol fee of roughly 0.001 to 0.005 SOL per upload. It calls Code-In "about 2,000 times cheaper" than accounts. Those are vendor-reported numbers, and have varied in its own posts.

## Proposal

### The encoder

`packages/solana/src/encoder.js`. One interface:

- `encodeObject(object, backend) -> {hash, backend, locator}`: canonical JSON, the same `sha256` the harness uses everywhere, then the backend writes the bytes.
- `decodeObject(locator, backend, hash) -> object`: fetch, recompute the hash, and refuse anything that doesn't match.

**Backends:**

| Backend | When |
|---|---|
| `iq-codein` | The default until a SIMD: IQ Labs' Solana SDK (`@iqlabs-official/solana-sdk`) |
| `memo` | No third-party program: chunks in Memo program instructions, each linked to the one before |
| `simd` | Once a data-availability SIMD is live: the native path |

### Content addressing makes the backend untrusted

Every reader checks the hash against the one already on chain: the policy hash in the signer config, or the contract hash in the ruling. A backend that loses or changes data can make the text unavailable. It can never make a false text pass.

### What gets encoded

- Policies, when a signer is attached.
- Case contracts, when a case is registered.
- Certifications and bias profiles, when they're published.

## Risks

- **IQ Labs is young.** By its listing, Code-In has no published outside audit, and its upgrade authority isn't clearly documented. Content addressing limits the damage to availability. Keep a second copy, for example in an account or on Verafy's servers, until it's audited.
- **Fees are vendor-reported.** Measure them on devnet before quoting any.

## The SIMD path

This is VIP-0017 in practice: use what exists now, measure it, and propose a SIMD only when usage shows programs and third-party storage aren't enough.

## Decisions for Rex

- Whether to talk to IQ Labs about a partnership, or simply use the public SDK.
- Whether encoding is on by default for every signer, or a paid option.

## Tracking

Requirement SOL-005 (availability for off-chain references).
