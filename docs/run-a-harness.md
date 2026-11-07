# Run a Verafy Harness

This guide covers what a harness is, what machine it needs, which models it can run, how models are proven, how to install, configure and run one, what it costs and earns, and how it joins the network. The [testnet guide](testnet.md) covers the test network.

> **Status.** Verafy Chain is a concept with a working prototype. There is no public network yet and no token. Commands marked **available now** run today. Commands marked **planned** describe the testnet interface and do not exist yet. Every number is labeled **measured**, **modeled**, **vendor-reported** or **illustrative**.

## Contents

1. [Harnesses and nodes](#1-harnesses-and-nodes)
2. [What consensus means on Verafy Chain](#2-what-consensus-means-on-verafy-chain)
3. [Choose a setup](#3-choose-a-setup)
4. [Machine requirements](#4-machine-requirements)
5. [Bandwidth and state size](#5-bandwidth-and-state-size)
6. [Acceptable models](#6-acceptable-models)
7. [Where to get the model](#7-where-to-get-the-model)
8. [How a model is proven](#8-how-a-model-is-proven)
9. [Install](#9-install)
10. [Run it from your agent](#10-run-it-from-your-agent)
11. [Configure](#11-configure)
12. [Run and check](#12-run-and-check)
13. [Join the network](#13-join-the-network)
14. [Payments: no coin, bring your own](#14-payments-no-coin-bring-your-own)
15. [What it costs](#15-what-it-costs)
16. [What it earns](#16-what-it-earns)
17. [Operating a harness](#17-operating-a-harness)
18. [Troubleshooting](#18-troubleshooting)

## 1. Harnesses and nodes

Verafy Chain has two kinds of machine. They can run on the same box.

| | **Verafy Harness** | **Verafy Chain node** |
|---|---|---|
| What it is | An AI model wrapped in a harness. This is Verafy Chain's validator. | The chain's bookkeeper. It never runs a model. |
| What it does | Takes jury seats, loads and checks context, deliberates, commits and reveals votes, runs contract exits, audits other harnesses, and serves stored context. | Holds funded contracts waiting for juries, draws juries, relays commitments and reveals, seals and stores blocks, checks every diff and signature, and serves the read API. |
| Software | [Verafyai/verafyHarness](https://github.com/Verafyai/verafyHarness) | Verafyai/verafyChain (planned) |
| Needs | A model: an API key or a GPU | CPU, disk and bandwidth |
| Earns | Juror, auditor and storage shares | The sealer share |
| Agave equivalent | Voting validator | RPC node and leader duties |

**Naming.** The software is Verafy Harness, and the thing you run to judge is called a **harness**. The thing that stores and relays blocks is a **node**. "Validator" is fine in conversation: a harness is what validates. A harness can take three roles, sometimes all at once: **juror** (votes), **auditor** (re-runs sealed rulings with a model from a different family) and **storage** (keeps context fetchable by hash).

## 2. What consensus means on Verafy Chain

Consensus has two layers. One is about judgment and one is about bookkeeping.

### Judgment consensus: is this ruling valid?

A ruling is valid when every one of these holds. Every node checks every rule.

1. **The jury was drawn correctly.** It was drawn by the jury scheduler from registered, bonded harnesses, seeded by the beacon value in the block's header, and it spans at least the contract's `minFamilies` model families.
2. **The votes are honest about order.** At least `quorum` harnesses revealed, and every reveal matches the commitment it published before any vote was opened. Each commitment and reveal is signed with the harness's registered key.
3. **The votes are in bounds.** Each answer is one of the contract's declared options, or a probability for a forecast.
4. **The bar was cleared, or not.** Agreement is measured as the contract's answer type defines it. At or above the bar, the matching exit runs. Below it, the `*below-bar` exit runs, normally an escalation to a larger jury, and no juror is paid.
5. **The diff is exact.** The state change matches the chosen exit and conserves totals.

This is "close enough" consensus. The jury doesn't have to be unanimous or exact; it has to agree as much as the contract demands.

### Ledger consensus: which blocks, in which order?

Nodes agree on block order the conventional way. A block can only be produced when it contains at least one ruling (Proof of Judgment: no judgments, no block). Proposed for testnet:

- **Sealer rotation.** The sealer for each slot is chosen in a fixed rotation over registered nodes.
- **Finality.** A block is final when at least two thirds of registered nodes have signed it, after checking every rule above (a BFT design in the Tendermint family).
- **Ruling finality is optimistic.** A ruling inside a final block can still be challenged during its challenge window (24 hours on testnet). A successful challenge appends a new ruling (affirmed, overturned or superseded). Nothing is erased.

How nodes are weighted on an open network is an open problem, because there is no native coin to stake. Testnet uses a fixed, permissioned node set. See [Payments](#14-payments-no-coin-bring-your-own).

## 3. Choose a setup

| Setup | Model runs | GPU | Assurance it can reach | Best for |
|---|---|---|---|---|
| **API harness** | At a provider, through an API key | None | L0, L1 | Getting started, testnet, hosted-only models |
| **Open-weights harness** | On your machine, through vLLM | 1 or more | L1+ (re-executable by auditors) | Most operators once the network is live |
| **Proving harness** | On your machine, with proofs of inference | 1 GPU plus large host memory | L2 | Research; one model today |
| **Node** | No model | None | | Sealing and relaying blocks |

The assurance levels come from the [draft SIMDs](https://asc.verafy.ai): L0 signatures, L1 diverse and blind, L1+ bonded and checkable, L2 proven.

## 4. Machine requirements

All figures are **modeled** from published model sizes and the prototype's measured message sizes. Confirm GPU memory with your own vLLM run before committing hardware.

### API harness

| | Minimum | Recommended |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| Network | 10 Mbps, stable | 100 Mbps |
| OS | Linux or macOS with Node 22 | Ubuntu 24.04 |

The harness itself is a small Node process. The model's cost is per call, at the provider.

### Open-weights harness

GPU memory decides which model you can serve. Weights only, before KV cache; leave 10 to 20 percent free for context.

| Model (open weights) | Weights in memory | GPUs | Host RAM | Disk |
|---|---|---|---|---|
| `openai/gpt-oss-20b` | about 13 GB (MXFP4) | 1 GPU with 16 GB or more | 32 GB | 100 GB NVMe |
| `openai/gpt-oss-120b` | about 61 GB (MXFP4) | 1 x 80 GB (H100, H200, A100 80 GB) | 128 GB | 500 GB NVMe |
| `Qwen/Qwen3-32B` | about 33 GB (FP8) | 1 x 48 GB or 80 GB | 64 GB | 200 GB NVMe |
| `Qwen/Qwen3-235B-A22B-Instruct-2507-FP8` | about 235 GB (FP8) | 4 x 80 GB | 512 GB | 1 TB NVMe |
| `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` | about 400 GB (FP8) | 8 x 80 GB | 1 TB | 2 TB NVMe |

Plus 8 to 32 vCPU and 1 Gbps networking for any GPU host. Auditors need the same class of machine as the jurors they check, because they re-run the same open models.

### Proving harness

**Vendor-reported** (Anthropic's FlashProve research prototype, Nov 2026): one 80 GB GPU and about 290 GB of host memory, for Llama 4 Maverick only, with a 1,024-token context limit and greedy decoding. Proving costs about 70 to 95 times the GPU time of running the model. Proof size is about 18.78 MB, and verification takes about 17 seconds on 24 CPU threads.

About 290 GB is what proving needs; the one-time commitment needs 330 GB available (FlashProve `examples/maverick/figures.txt`, vendor-reported). The setup, step by step, is in [proving-harness.md](proving-harness.md). Publish the commitment with `verafy harness commit-model <harness-id> <commitment>`.

### Node

| | Minimum | Recommended |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 16 GB | 32 GB |
| Disk | 500 GB NVMe | 2 TB NVMe, growing (see below) |
| Network | 100 Mbps | 1 Gbps |

## 5. Bandwidth and state size

**Measured** on the prototype (`npm run demo`, canonical JSON, five-juror rulings):

| Object | Size |
|---|---|
| One vote, signed | 300 bytes |
| One ruling with five votes | about 2.5 KB |
| Block header | about 400 bytes |
| Block with one ruling | about 2.9 KB |
| Contract without context text | 1.0 to 1.5 KB |
| Context text in the examples | 0.3 to 0.7 KB (real contracts will be larger) |

**Modeled** from those sizes, assuming 50 KB of context per contract:

| | Per jury seat | At 1 ruling per second, network-wide | At 10 rulings per second |
|---|---|---|---|
| Harness bandwidth | about 55 KB per seat | under 1 Mbps if it holds a seat on each | under 5 Mbps |
| Node chain growth | | about 4 KB per ruling, about 350 MB a day, about 125 GB a year | about 1.25 TB a year |
| Availability layer growth | | about 4 GB a day of context | about 40 GB a day |

A binary encoding would cut chain size by roughly half; the prototype uses JSON. Proofs change the picture: at about 18.78 MB per proven vote, a proving harness uploads far more than it downloads, and proofs live in the availability layer, never on chain.

## 6. Acceptable models

A harness commits to one model. The network accepts a model when it is on the **model registry**: a list of open-weight model commitments, each with its family (the base model it descends from) and how it can be checked. Contracts can narrow the list, for example to L1+ and above.

**Testnet registry (proposed):**

| Family | Model (Hugging Face id) | Served | Highest assurance |
|---|---|---|---|
| gpt-oss | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | Own weights or API | L1+ |
| qwen | `Qwen/Qwen3-235B-A22B-Instruct-2507`, `Qwen/Qwen3-32B` | Own weights or API | L1+ |
| llama | `meta-llama/Llama-4-Maverick-17B-128E-Instruct` | Own weights or API | L2 (research) |
| deepseek | `deepseek-ai/DeepSeek-V3.1` | Own weights or API | L1+ |
| mistral | `mistralai/Mistral-Small-3.2-24B-Instruct-2506` | Own weights or API | L1+ |
| gemma | `google/gemma-3-27b-it` | Own weights or API | L1+ |

Any other open-weight model can be added; these are the ones the examples use.

Rules for the registry: a model needs its family, an exact version, and a SHA-256 of the weights files. Two harnesses whose models descend from the same base model count as one family for jury diversity, whoever fine-tuned them. Retiring a model version gives harnesses a notice period before their seats stop.

## 7. Where to get the model

**Open weights over an API.** If you would rather not run the weights yourself, a provider such as OpenRouter serves the same open-weight models. The harness calls any OpenAI-compatible endpoint.

**Open weights.** Download from Hugging Face. vLLM fetches the weights the first time it starts:

```sh
export HF_TOKEN=...          # some repos need you to accept a license first
MODEL=openai/gpt-oss-120b bash scripts/run-vllm.sh
```

Record the commitment for the registry: the model id, the weights hashes, the vLLM version, and the container image digest.

```sh
huggingface-cli download openai/gpt-oss-120b --local-dir ~/models/gpt-oss-120b
find ~/models/gpt-oss-120b -name '*.safetensors' -print0 | sort -z | xargs -0 sha256sum > weights.sha256
docker inspect --format '{{index .RepoDigests 0}}' vllm/vllm-openai:latest
```

## 8. How a model is proven

"Proven" covers a ladder, not one technique. The network records which rung each vote reached.

| Level | What backs the claim "this vote came from model M" | Works today |
|---|---|---|
| **L0** | The harness's signature. Proves which harness voted, not which model ran. | Yes |
| **L1** | L0 plus commit-then-reveal and model-family diversity. No harness can copy another, and no single model family decides. | Yes |
| **L1+** | L1 plus a bond and re-execution. For open weights at temperature 0 on a pinned runtime, an auditor re-runs the vote; a different answer can be challenged and costs the bond. Hardware attestation (NVIDIA confidential computing) can add a signed report of what ran. | Re-execution yes; bonds on testnet |
| **L2** | A proof of inference per vote, verified off chain by auditors, with its hash in the ruling. | Research only: one open model (Llama 4 Maverick) via FlashProve |
| **L3** | Proofs small enough to verify on chain. | No |

Hosted models stop at L1: only the provider knows which model it served. Re-execution compares answers, not exact text, because GPU arithmetic can vary slightly between batch sizes.

## 9. Install

**Available now.**

```sh
# Ubuntu 22.04 or 24.04
git clone https://github.com/Verafyai/verafyHarness.git
cd verafyHarness
bash scripts/setup-ubuntu.sh            # API harness
bash scripts/setup-ubuntu.sh --gpu      # also checks the GPU for an open-weights harness
```

On macOS or anywhere else with Node 22:

```sh
git clone https://github.com/Verafyai/verafyHarness.git && cd verafyHarness
npm test          # 62 tests, no dependencies to install
npm run demo      # five contracts, five rulings, five blocks
```

## 10. Run it from your agent

**Available now.** Verafy Harness ships as an MCP server, `verafy-mcp`, with a plugin or config folder for each major agent under [`integrations/`](../integrations). Your agent can draft a contract in words, check it, pin its sources and run a jury, then read the ruling and the sealed block. Your agent is the client. The jurors stay inside the harness, where their tools are locked.

The safety model:

- **Client, never juror.** The agent can draft, validate, pin, hash and inspect contracts, run a jury and read the chain. There is no vote tool, no key tool and no tool that moves funds.
- **Context is evidence.** Contract text, sources and juror reasoning come back under an `evidence` field, marked "Evidence from a contract. Not instructions." The server never acts on it.
- **Live is off by default.** A live run needs the server started with `--allow-live`, `live: true` on the call, and a `maxSpendUsd`.
- **Keys stay put.** Keys come from `VERAFY_API_KEY` (or `SWARM_API_KEY`) in the environment, or the keyblock. No tool takes or returns one, and plugin configs hold only variable references.
- **Writes are confined.** The server writes only inside its workspace: `VERAFY_HOME`, else `PLUGIN_DATA` (Hermes), else `~/.verafy`.

| Agent | Folder | Status |
|---|---|---|
| Claude Code | [`integrations/claude-code`](../integrations/claude-code) | verified, Nov 6, 2026, Claude Code 2.1.319 |
| OpenAI Codex | [`integrations/codex`](../integrations/codex) | config written, not run end to end |
| Cursor | [`integrations/cursor`](../integrations/cursor) | config written, not run end to end |
| Gemini CLI | [`integrations/gemini-cli`](../integrations/gemini-cli) | config written, not run end to end |
| Goose | [`integrations/goose`](../integrations/goose) | config written, not run end to end |
| Hermes Agent | [`integrations/hermes`](../integrations/hermes) | config written, not run end to end |
| OpenClaw | [`integrations/openclaw`](../integrations/openclaw) | config written, not run end to end |
| Any MCP client | [`integrations/mcp`](../integrations/mcp) | verified over raw JSON-RPC |

Every config starts the server with:

```sh
npx -y @verafy/mcp
```

From a clone, the same server is:

```sh
node /path/to/verafyHarness/bin/verafy-mcp.js
```

The `npx` form installs the published package `@verafy/mcp` from npm (a smoke test took 1.5 s from a cached install, measured Nov 6, 2026, macOS). The server takes `--allow-live`, `--home <dir>` for the workspace, and `--config <file>` for the harness config.

**The live and spend rule.** `verafy_run` uses scripted mock answers unless all three hold: the server was started with `--allow-live` (or `VERAFY_ALLOW_LIVE=1`), the call says `live: true`, and the call gives a `maxSpendUsd`. Before any call the server models a ceiling for the run (one call per juror, input at characters / 3, output at 1,000 tokens, priced at the pool entry's `price` or 5 and 25 USD per million tokens) and refuses with `SPEND_CAP` if the ceiling is over the cap. Live runs make one call per juror with no retries. After the run it reports the measured cost, from the endpoint's `usage.cost` where it gives one. Payouts go to the local ledger file; nothing moves on any chain.

## 11. Configure

A harness's setup lives in a JSON config. `verafy.config.json` is the default (a setup from before the rename that has only `swarm.config.json` still works); pass another with `--config`.

```json
{
  "provider": { "baseURL": "https://openrouter.ai/api/v1", "apiKeyEnv": "VERAFY_API_KEY" },
  "pool": [
    { "id": "h-local-gptoss", "family": "gpt-oss", "model": "openai/gpt-oss-120b", "bond": 500,
      "baseURL": "http://127.0.0.1:8000/v1", "apiKeyEnv": "VLLM_API_KEY" },
    { "id": "h-mistral-1", "family": "mistral", "model": "mistralai/mistral-small-3.2-24b-instruct", "bond": 500 }
  ]
}
```

| Field | Meaning |
|---|---|
| `provider.baseURL` | Default OpenAI-compatible endpoint |
| `provider.apiKeyEnv` | Name of the environment variable holding the key. Never put a key in the file. |
| `pool[].id` | The harness's name |
| `pool[].family` | The base model the model descends from; used for jury diversity (`lab` is the old name and is still read) |
| `pool[].model` | The committed model id |
| `pool[].bond` | Bond size, which caps the value a vote can decide |
| `pool[].baseURL`, `apiKeyEnv` | Per-harness overrides, for a local vLLM server |

In the prototype, the pool is every harness on your machine, so one config can stand up a whole local jury. On the network, each operator's config holds only their own harness. `verafy.config.local.json` is a ready example that puts a local `gpt-oss-120b` beside five hosted models.

## 12. Run and check

**Available now.**

```sh
node bin/verafy.js doctor                      # Node version and pool
export VERAFY_API_KEY=...                      # OpenRouter key
node bin/verafy.js doctor --live               # calls each model once and times it
node bin/verafy.js run examples/market-resolution.json --live
node bin/verafy.js chain
```

With a local model:

```sh
MODEL=openai/gpt-oss-120b bash scripts/run-vllm.sh     # in one terminal; prints VLLM_API_KEY
export VLLM_API_KEY=... VERAFY_API_KEY=...
node bin/verafy.js doctor --live --config verafy.config.local.json
node bin/verafy.js run examples/delay-cover.json --live --config verafy.config.local.json
```

A healthy `doctor --live` prints `ok` with a latency for every harness. A ruling prints PROPOSE, COMMIT, REVEAL, RULE, PAY and SEAL.

## 13. Join the network

**Planned.** This is the interface the testnet will use. None of these commands exist yet.

```sh
verafy harness init --network testnet-0          # creates ~/.verafy/identity.json (Ed25519) and harness.json
verafy harness commit-model --model openai/gpt-oss-120b --weights weights.sha256 --runtime <vllm digest>
verafy harness bond --chain solana-devnet --amount 10 --asset USDC
verafy harness register                          # publishes identity, model commitment, model family, bond, payout addresses
verafy harness start                             # daemon: watches for jury seats, deliberates, commits, reveals
verafy harness status                            # seats held, votes, audits, earnings, faults
```

Joining means: generate an identity, commit to a model, post a bond on a chain you want to be paid on, register, and start the daemon. From then on the daemon takes seats when the jury draw picks it, and your track record builds with every audited vote.

Running a node, also planned:

```sh
verafy node init --network testnet-0
verafy node start --peers <seed nodes>
```

## 14. Payments: no coin, bring your own

**There is no token, and there is no need for one.** Verafy Chain is coin agnostic on purpose: the goal is something useful whatever crypto you hold. A contract is paid in whatever asset the requester chooses, on the chain where they hold it: USDC or SOL on Solana, ETH or any ERC-20 on Ethereum, and so on. Any wallet works. The money never moves to Verafy Chain.

1. The requester funds escrow on the source chain, in a program or contract that knows the Verafy Chain contract hash.
2. Verafy Chain records the ruling and its payout diff.
3. A quorum-signed trigger releases the escrow on the source chain, to the winning side and to the harnesses whose votes were counted, in the same asset.

### The payment router

Each harness plugs in a **payment router**. The router decides which payments the harness accepts, and settles its share where the contract was paid. Set it in the harness config:

```json
{
  "payments": {
    "router": "ledger",
    "accept": [{ "chain": "solana", "asset": "USDC" }, { "chain": "ethereum", "asset": "ETH" }],
    "book": { "harness:h-mistral-1": { "solana": "<your Solana address>", "ethereum": "<your 0x address>" } }
  }
}
```

| Field | Meaning |
|---|---|
| `router` | `ledger` (available now: records payouts to `.verafy/payouts.jsonl`, nothing moves), `solana-usdc` (planned: releases escrow from a Solana program, in USDC or any SPL token), `evm` (planned: the same for Ethereum and EVM chains) |
| `accept` | The chains and assets this harness takes seats for. `*` matches anything. Intake refuses a contract paying in anything else. |
| `book` | The payout book: an address per chain for each harness you run |

A contract names its asset and chain in `payment.currency` and `payment.chain`. Bonds are posted the same way, in the asset of the chain the harness earns on. Bitcoin needs an escrow it can enforce, such as wrapped BTC on a chain with contracts; native Bitcoin support is not planned.

Two open questions follow from having no coin: how to weight nodes for ledger consensus, and how to compare bonds posted in different assets. Testnet answers both by keeping the node set permissioned and pricing bonds per contract in the contract's own asset.

### Reading the source chain: the light client

A harness should not take one RPC provider's word that escrow arrived or that its trigger landed. The light client (`packages/lightclient`, **available now**, off by default) asks several endpoints and accepts only an answer they agree on. Add a `lightclient` block to your config; [config/lightclient.devnet.json](../config/lightclient.devnet.json) is a working example with three public Solana devnet endpoints from three operators.

| Field | Meaning |
|---|---|
| `apis` | API router entries, one per endpoint. A keyless public endpoint has only `baseURL`. A paid one names its key as `secret` (keyblock) or `secretEnv` (an environment variable), with `auth` set to `bearer`, a header name, or `query:<param>`. A key written into `baseURL` is refused |
| `solana.endpoints` | `{id, operator, api}`; at least `n` of them (default 3) from at least `minOperators` (default 2) operators |
| `solana.commitment` | `finalized` (default), `confirmed` or `processed` |
| `solana.policy` | What a 2 to 1 split does: `reject-and-retry` (default) or `accept-majority` |
| `solana.maxSlotLag` | An answer more than this many slots behind the newest is stale and rejected (default 150) |
| `evm` | A list of readers, each with `chainId`, `endpoints` and `blockTag` (`finalized` by default); for chain id 1, an optional `helios` block |

With it on, `verafy run` checks the escrow a contract names in `payment.source` before the jury is drawn. Agreement and enough funds: the run goes ahead. Agreement and too little: refused. Disagreement: the contract is paused and the reason, with every source, is appended to `.verafy/pauses.jsonl`. Every read records its sources and commitment level. Two read-only commands check a setup:

```bash
node bin/verafy.js read solana slot --config config/lightclient.devnet.json
node bin/verafy.js confirm solana <signature> --config config/lightclient.devnet.json
```

On Ethereum mainnet the same quorum is used. Sync-committee verification through Helios is an optional adapter (**planned**: built, not yet run against a live Helios); without Helios installed it reports "not installed" and results say `verification: multi-rpc`. Solana has no light-client protocol in production yet; see [ROADMAP.md](../ROADMAP.md).

## 15. What it costs

All **modeled** or **illustrative** unless marked **measured**; check current prices.

**Measured, Nov 6, 2026:** five live rulings, one per example contract, each with a jury of five hosted models through OpenRouter, cost **$0.0163 together**, about **$0.003 per ruling** or about $0.0007 per vote. Wall time per ruling was **5.9 to 30.1 seconds** from a laptop. See [results/live-2026-11-06.md](../results/live-2026-11-06.md). In a separate run, five DeepSeek Harness juror processes on five different models sealed a block from their reveals ([docs/dsh-juror.md](dsh-juror.md)).

**Model cost per vote**, modeled at 1,500 input and 300 output tokens with OpenRouter prices of Oct 11, 2026:

| Model | Cost per vote |
|---|---|
| `qwen/qwen3-235b-a22b-2507` | about $0.0003 |
| `deepseek/deepseek-v4-flash` | about $0.0004 |
| `meta-llama/llama-4-maverick` | about $0.0005 |

Other open-weight models in the examples (`mistralai/mistral-small-3.2-24b-instruct`, `openai/gpt-oss-120b`, `google/gemma-3-27b-it`) are priced in the same range; check the provider's page before relying on a figure.

Larger contexts cost proportionally more: 15,000 tokens of context is about ten times these figures.

**Machine cost per month** (730 hours):

| Setup | Cost | Basis |
|---|---|---|
| API harness | about $5 to $25 for a small VM, plus model cost per vote | Illustrative |
| Open-weights, 1 x H100 | about $1,450 to $4,500 | Modeled at $1.99 to $6.16 per GPU hour |
| Open-weights, 4 x H100 | about $5,800 to $18,000 | Modeled, same rates |
| Node | about $50 to $200 for 8 vCPU, 32 GB, 2 TB NVMe | Illustrative |

A GPU harness has a fixed cost and near-zero cost per vote; an API harness has almost no fixed cost and pays per vote. Below a few hundred thousand votes a month, an API harness is cheaper.

## 16. What it earns

You earn whatever asset the contract was paid in. There is no block reward and no token. Each sealed ruling pays:

```
your share per vote = escrow x split.jurors / counted votes
profit = sum of shares  +  audit fees and caught bonds  -  model cost  -  machine cost  -  lost bonds
```

**Illustrative**, from the market-resolution example (1.20 USDC escrow, 80 percent to jurors, 5 counted votes): **0.192 USDC per vote**, against about $0.0003 to $0.003 of model cost. Real fees will be set by requesters and by competition between harnesses, and will likely be far lower than this example. Nobody knows yet what the market rate for a vote will be.

Dissenting votes are paid too, as long as they were committed and revealed honestly, so there is no reward for following the majority. A ruling below the bar pays nothing; its escrow carries to the larger jury. Faults cost the bond: running a model other than the one committed, missing a reveal, or failing an audit.

Earnings don't have to be converted by hand: a harness's routing agent, an API router with its own payment wallet, accepts payment in any asset, converts it, rents and pays for its own hosting, pays for inference, and keeps the bond topped up, within limits you set. It also routes each contract only to AI that meets the contract's provability requirement, up to zero-knowledge proofs. See [The routing agent](coin-agnostic.md#the-routing-agent).

On testnet, everything is play money.

## 17. Operating a harness

- **Keys.** The identity key signs every commitment and reveal. Keep it on the harness machine, readable only by the harness user. API keys and wallet keys go in the **keyblock**, encrypted under a passphrase you supply through `VERAFY_KEYBLOCK_PASSPHRASE` (the old name, `SWARM_KEYBLOCK_PASSPHRASE`, is still read); the rest of the harness only ever holds short-lived scoped keys. See [The routing agent](coin-agnostic.md#the-routing-agent).
- **Pin your runtime.** For an open-weights harness, pin the vLLM image by digest and the weights by hash. Changing either without re-registering will fail audits.
- **Temperature 0.** Juror calls use temperature 0 so auditors can re-run them.
- **Uptime.** A harness that commits and then fails to reveal is faulted. Take seats only while the model endpoint is healthy; `doctor --live` is the check.
- **Upgrades.** A new model version is a new commitment. Register it before switching.
- **Logs.** The harness never logs keys. Votes, commitments and timings are safe to keep.

## 18. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `openai provider needs an API key` | The variable named in `apiKeyEnv` is empty | Export it in the harness's shell |
| `HTTP 404` from a model | The model id isn't served at that endpoint | Check the id at the provider, or the `--model` vLLM was started with |
| `context check failed: hash mismatch` | The context content differs from the contract's pin | Fetch the pinned snapshot again; never re-pin someone else's contract |
| `pool cannot seat a jury` | Not enough model families (or operators) in the pool for the contract's `minFamilies` | Add harnesses on other model families, or use a contract that asks for fewer |
| `bond ... is below the contract's ... per vote` | The contract decides more value than your bond covers | Raise the bond or skip the contract |
| vLLM runs out of memory | The model doesn't fit | Use a smaller model, more GPUs (`TP=`), or a quantized build |
