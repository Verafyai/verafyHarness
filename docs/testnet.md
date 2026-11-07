# Verafy Chain testnet

Come test it. There is no offshore entity and no token behind this: it is just a project, and the fastest way to help is to run a jury and tell us what broke.

> **Status.** There is no public testnet yet. What runs today is a **local devnet**: a full jury on one machine. **Testnet 0** is the plan below. Everything on testnet is play money, and there is no token on testnet or after it.

## Local devnet (available now)

A complete Verafy Chain round on your own machine: a pool of harnesses, seeded jury draws across model families, commit and reveal, agreement against the bar, contract exits, payouts and linked blocks.

```sh
git clone https://github.com/Verafyai/verafyHarness.git && cd verafyHarness
npm run demo                                    # scripted answers, five blocks
export VERAFY_API_KEY=...                       # OpenRouter key
node bin/verafy.js run examples/market-resolution.json --live
node bin/verafy.js chain
```

Write your own contract by copying one in `examples/`, then `node bin/verafy.js pin <file>` and `node bin/verafy.js validate <file>`.

## Testnet 0 (planned)

### Goal

Ten or more independently run harnesses, on at least five different models, ruling on real-world questions and sealing blocks on a shared network for a week, with every number published.

### Shape

| | Testnet 0 |
|---|---|
| Nodes | 3 seed nodes run by Verafy; more by invitation |
| Harnesses | Invited operators: API harnesses and open-weights harnesses |
| Ledger consensus | Sealer rotation over the node set; a block is final at two thirds of node signatures |
| Judgment consensus | As in [the guide](run-a-harness.md#2-what-consensus-means-on-verafy-chain): seeded draws across model families, commit and reveal, the contract's bar |
| Payments | Solana devnet: devnet SOL and a devnet USDC mint. Ethereum Sepolia later. |
| Bonds | Play-money bonds on Solana devnet; faults slash them |
| Challenge window | 24 hours |
| Contracts | A daily feed run by Verafy: prediction market resolutions from public data, fact checks against pinned transcripts, forecasts that resolve later, and flight-delay style triggers |
| Model registry | The proposed testnet list in [section 6 of the guide](run-a-harness.md#6-acceptable-models) |

### Phases

| Phase | What happens | Starts when |
|---|---|---|
| 0. Local devnet | Anyone runs a full jury locally | Now |
| 1. Closed testnet | 3 seed nodes and about 10 invited harnesses seal blocks over the network | The Verafy Chain node can run three nodes that agree on block hashes |
| 2. Bonded testnet | Bonds, slashing, auditors and challenges switch on | Auditor and challenge flows pass on the closed testnet |
| 3. Solana devnet bridge | A devnet prediction market is funded, resolved by a jury, and settled by a quorum-signed call | The bridge program is deployed to devnet |
| 4. Open testnet | Anyone can register a harness on the registry's models | Phases 1 to 3 have run a week without a manual fix |

### How to join

1. Run the local devnet and a live ruling. Keep the `doctor --live` output.
2. Open an issue on [Verafyai/verafyHarness](https://github.com/Verafyai/verafyHarness/issues) titled `Testnet harness: <your handle>` with: setup type (API, open weights or node), model family and model, GPU if any, region, and your `doctor --live` output. Never paste keys.
3. When phase 1 opens, invited operators get the seed node addresses and the `testnet-0` registry. Then:

```sh
verafy harness init --network testnet-0
verafy harness commit-model --model <model> [--weights weights.sha256 --runtime <digest>]
verafy harness bond --chain solana-devnet --amount 10 --asset USDC
verafy harness register
verafy harness start
```

These commands are planned and do not exist yet.

### What gets published

Every day of the testnet: rulings sealed, rulings below the bar, escalations, challenges and their outcomes, audit disagreements, faults, median and 95th percentile time from request to seal, and model cost per ruling. All labeled **measured**.

### Setting it up (for the core team)

1. Ship the Verafy Chain node: mempool of funded contracts, jury coordination, sealer rotation, two-thirds finality, block store, read API.
2. Ship the harness daemon: `verafy harness init | register | start | status`, with a persistent identity.
3. Deploy the Solana devnet escrow and bridge program that accepts quorum-signed triggers.
4. Stand up 3 seed nodes in different regions, the availability layer, and the contract feed.
5. Run Verafy's own harnesses on at least five model families for a week before inviting anyone.
6. Open phase 1.
