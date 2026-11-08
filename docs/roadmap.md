# Roadmap

Three stages. Each one has to be done before the next is worth starting.

## Stage 1: Build it on Solana programs, with no SIMD

Verafy Harness settles on Solana with ordinary programs: `verafy_ruling`, `verafy_judiciary` and `verafy_registry`. None of them needs a change to Solana itself. Stage 1 bootstraps everything a v1 network needs on top of them:

| Piece | Status |
|---|---|
| The harness: intake, pinned evidence, signer, bond, runtime | Built |
| Juries across open-weight model families, commit and reveal, slashing | Built (v0.0.3-alpha) |
| Settlement program for rulings (`verafy_ruling`) | Built; measured on a local validator |
| Judiciary Signer for Squads wallets (`verafy_judiciary`) | Built; measured on a local validator against Squads from mainnet |
| Policies and Covenant Launch | Built in core |
| Harness registry, discovery and on-chain pay (`verafy_registry`) | Built; measured on a local validator |
| Model certification for closed models | Built; no closed model measured yet |
| Hardware attestation (AMD SEV-SNP) | Verification built; no harness running in an enclave yet |
| Launcher (`verafy up`, one-click cloud) | Built |
| Local testnet | Built |
| Devnet deployment of the three programs | Next |
| Internal infrastructure: Verafy's own harnesses, monitoring, a public jury | Next |

Done when: the three programs are on devnet, Verafy runs a public jury, and an outside wallet can attach a Judiciary Signer without help.

## Stage 2: Prove it with 10 to 50 pilots

Real wallets, real launches, real rulings. Verafy builds each pilot alongside the customer, then turns what it built into something the next customer gets for free:

- **Policies** generated from a wallet's purpose, with templates for launches, treasuries and upgrade keys.
- **Contracts and certifications**: case contracts, model certifications and covenants a launch page can show.
- **Scanners** that read a wallet or launch and say what a policy should cover.

Candidates and the case for each: [Pilots](/pilots).

Done when: at least 10 wallets have a Judiciary Signer attached in production, with their rulings, costs and disputes published.

## Stage 3: Show the demand, then scale to a SIMD and beyond

A SIMD asks Solana's validators to change the protocol. It's worth proposing only when programs are measurably not enough, and real usage shows what belongs in the protocol. Examples: a cost per ruling only native support would lower, or a proof check programs can't afford.

- Publish adoption: wallets, launches, rulings per day, value protected.
- Measure where programs fall short: compute units, fees, latency.
- Propose the SIMD that removes that limit, with the numbers.
- Beyond Solana: the same signer and rulings for other chains' multisigs, and [Verafy Chain](https://chain.verafy.ai).

Done when: a SIMD is proposed with production numbers behind it.

The rule behind the order: [VIP-0017, programs first, SIMD on adoption](../docs/proposals/VIP-0017-programs-first.md). Detailed milestones: [ROADMAP.md](../ROADMAP.md).
