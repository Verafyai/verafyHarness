# Verafy Harness v0.0.4-alpha: the Judiciary Signer

*Release notes, November 7, 2026. Tag [`v0.0.4-alpha`](https://github.com/Verafyai/verafyHarness/releases/tag/v0.0.4-alpha).*

Multisigs made it hard for one stolen key to empty a wallet. They never stopped the signers themselves. A token team can still vote together to sell into its own buyers, and a treasury can still pay its own members. This release adds a member that reads what the wallet is for and refuses what betrays it. It's a jury of AI models, and it holds no key. It's still an alpha for a prototype: nothing here is a running network, there's no token, and every number not marked measured is illustrative.

**@@OVERALL@@ of the spec is built, weighted by importance, across @@COUNT@@ requirements**, with seven new requirements in two new areas.

@@SCORE_SVG@@

## The Judiciary Signer

`verafy_judiciary` is a Solana program that sits in a Squads multisig as a voter. It approves or rejects a proposal only on a sealed ruling, and the ruling must:

- come from the jury named when the signer was attached;
- be bound to the exact bytes of that Squads transaction;
- have cleared the signer's bar;
- have outlived its challenge window.

Set the threshold so the humans can't pass anything without it, and the wallet's policy is enforced on chain. An optional escape hatch approves a case that has waited a long, public delay with no ruling, so a dead jury can't trap funds. A rejected case can never escape. [The Judiciary Signer](/signer).

**Measured on a local validator against the real Squads v4 program, dumped from mainnet: 30 of 30 checks.** The checks cover:

- humans alone can't pass a proposal;
- a wrong jury, a wrong case and a ruling inside its window are refused;
- an approved transfer executes from the vault;
- a rejection blocks the escape hatch;
- the escape hatch waits its delay;
- the jury is paid once;
- harnesses register and are discovered;
- the encoder writes a policy on chain and reads it back;
- a commission covenant pays out when broken, and returns its bond when kept.

Not deployed to devnet yet.

## Policies and Covenant Launch

A policy has rules that code checks, intent and judgment the jury reads, and a minimum time lock. Templates:

- **Covenant Launch:** a token creator's supply in one wallet, released only on a published schedule to published addresses.
- **Treasury.**
- **Upgrade authority.**

Some things are refused whatever the policy says: removing the signer, lowering the threshold so the humans can pass alone, adding a Squads spending limit, and anything the signer can't read. [Policies](/policies).

## Who judges

A signer chooses one to three models. Open-weight models can be chosen freely. A closed model, such as a version of Claude, needs a certification: measured results on a pinned attack suite (injections in memos and token names, mislabeled payments, amounts one unit over a cap), above the bar. No closed model has been measured yet. [Model certification](/learn/model-certification).

## Find a harness, pay a harness

`verafy_registry` holds one account per harness: its key, model, endpoint, price and bond. One RPC call lists them all; `verafy discover` prints them. A Judiciary Signer case carries a fee that is split among the jurors who voted. [The harness registry](/learn/harness-registry).

## Hardware attestation, started

A harness can present an AMD SEV-SNP report that binds its key and its build. Verification is built and tested with a test certificate chain. No harness has run in a real enclave yet. [Hardware attestation](/learn/hardware-attestation).

## Every VIP shipped

Every proposal from VIP-0001 to VIP-0019 ships in this release, and anything still open is named in its status:
- **Bias profiles** (VIP-0018) measure how each model leans and probe it at random, disguised as real cases.
- **The encoder** (VIP-0019) puts a policy's full text on chain through IQ Labs Code-In or the Memo program, checked against its hash.
- **The commission covenant** (VIP-0016) is a program: a validator's bond pays out if its commission goes over its promise.
- **Asset transfer records** (VIP-0015) cover listings, delivery photos with a one-time code, a jury ruling, and signed records formatted for the buyer's country.
- **Older VIPs.** Operator signatures are checked (VIP-0003), and proof records name their prover (VIP-0009). Equal weighting and single-harness mode ship as defaults (VIP-0004, VIP-0008).

Still open:
- a devnet deploy;
- a harness running in a real enclave;
- closed models certified and profiled with real API keys.

## Programs first, pilots next

Everything here is an ordinary Solana program, with no SIMD. The [roadmap](/roadmap) has three stages: build on programs, prove it with 10 to 50 pilots, then show the demand and propose a SIMD. The [pilot list](/pilots) names the Solana apps that earn the most and the jury projects that would make or save them money, each written up as a Verafy App Pilot.

Every change: [CHANGELOG](https://github.com/Verafyai/verafyHarness/blob/main/docs/spec/CHANGELOG.md). Designs: [VIP-0010 to VIP-0017](https://github.com/Verafyai/verafyHarness/tree/main/docs/proposals).
