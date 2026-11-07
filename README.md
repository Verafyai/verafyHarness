<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
  <img src="docs/assets/banner.png" alt="verafyHarness: harnessed AI validators for Actually Smart Contracts. No token." width="100%">
</picture>

# Verafy Harness

**Harnessed AI validators for Actually Smart Contracts.** The validator for [Verafy Chain](https://chain.verafy.ai), built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). MIT licensed. No token.

**Project site: [harness.verafy.ai](https://harness.verafy.ai)** · [Concept site](https://chain.verafy.ai) · [Run a harness](docs/run-a-harness.md) · [Testnet](docs/testnet.md) · [Coin Agnostic](docs/coin-agnostic.md) · [The essay](docs/blog/bringing-inference-programs-to-solana.md) · [The three draft SIMDs](docs/simds) · [SIMD discussion #724](https://github.com/solana-foundation/solana-improvement-documents/discussions/724) · [Roadmap](ROADMAP.md)

> **Status.** A working prototype, not a running network. Nothing here has been audited. What is real today: a full jury on one machine, live rulings by five different models, and juror mode inside DeepSeek Harness. See [what has been measured](#what-runs-today).

<p align="center">
  <img src="docs/assets/verafy-chain.gif" alt="Animation: intentions written in words go to five harnessed validators from different model families, who commit and reveal votes; agreement is measured against the contract's bar, and the ruling seals a new block." width="100%">
</p>

## Why this exists

Smart contracts can only enforce what someone can write as math. Most of what people actually want enforced isn't math: a policy, a promise, a claim, a condition about the world. Today those decisions leave the chain and come back as somebody's word.

AI models can now read and weigh almost anything, and there is early research on proving which model produced an answer. Verafy Harness puts the two together: a contract written in words, ruled on by a jury of open-weight models from different families, with every vote committed, revealed, signed and open to challenge.

Three choices shape the project:

- **No token.** There is no coin and no need for one. Contracts are paid in whatever asset the requester holds, on whatever chain they hold it, and the harnesses are paid in the same asset. Coin agnostic is the point: it should be useful regardless of the crypto.
- **No venture capital.** This is being built without outside money so the idea has to stand on its own.
- **Copy it.** Everything is MIT licensed. If it works, other people will copy it, and they are welcome to. The goal is a prototype that is useful.
- **Just a project.** There is no UAE entity. There is no BVI company hidden somewhere. It's literally just a project. [Come test it](docs/testnet.md). We are having fun again.

## What it is

Verafy Harness does two things.

1. **It brings natural language into smart contracts.** An Actually Smart Contract is a compressed intention: what should happen, under what conditions, judged against which sources, paid for how, and what it may do with the answer. It goes to a jury of AI models that renders an outcome, instead of being limited to what can be written as code.
2. **It redefines what a validator is.** A validator is an AI model wrapped in a harness. The model brings judgment. The harness does everything else a validator does: intake, context loading and hash checks, sandboxed tools, guardrails, commit-then-reveal signing, a bond, a contract runtime, a payment router, and an outbox that posts votes and calls contracts on other chains. Anyone can run one. Together they form an oracle network built from harnesses.

<p align="center">
  <img src="docs/assets/site-top.png" alt="The Verafy Chain concept site: contracts written in words, validators with judgment" width="100%">
</p>

## Contents

- [What runs today](#what-runs-today)
- [Quick start](#quick-start)
- [Use it from your agent](#use-it-from-your-agent)
- [Run a harness](#run-a-harness)
- [Anatomy of an Actually Smart Contract](#anatomy-of-an-actually-smart-contract)
- [The harnessed validator](#the-harnessed-validator)
- [How a ruling works](#how-a-ruling-works)
- [Consensus](#consensus)
- [Close enough: agreement and the bar](#close-enough-agreement-and-the-bar)
- [Proof of Judgment](#proof-of-judgment)
- [No coin: payments and the payment router](#no-coin-payments-and-the-payment-router)
- [Who pays, who earns](#who-pays-who-earns)
- [Where the words live](#where-the-words-live)
- [Swapping the AI](#swapping-the-ai)
- [Running inside DeepSeek Harness](#running-inside-deepseek-harness)
- [Networks of harnesses](#networks-of-harnesses)
- [Performance and state size](#performance-and-state-size)
- [Security](#security)
- [Open problems](#open-problems)
- [Verafy Harness and Verafy Chain](#verafy-harness-and-verafy-chain)
- [Read more](#read-more)
- [Repository layout](#repository-layout)
- [License and credits](#license-and-credits)

## What runs today

| | Status | Evidence |
|---|---|---|
| A full jury on one machine: contracts, pinned context, commit and reveal, agreement against the bar, exits, payouts, linked blocks | Works | `npm test` (167 tests), `npm run demo` |
| Live rulings by five different models through OpenRouter | **Measured** Nov 6, 2026: five contracts, 5.9 to 30.1 s each, $0.0163 in total | [results/live-2026-11-06.md](results/live-2026-11-06.md) |
| Juror mode inside DeepSeek Harness: five DSH processes on five different models, block sealed from their reveals | **Measured** Nov 6, 2026: all five voted NO, 100% against an 80% bar; 24 of 24 other tools denied | [docs/dsh-juror.md](docs/dsh-juror.md) |
| Payment router: accept lists, a local payout ledger | Works; on-chain routers planned | `verafy.config.json`, `.verafy/payouts.jsonl` |
| Routing agent: keyblock, banker, API router, payment wallet | Works with test venues and test APIs; real venues and on-chain signing planned | `npm test`, `packages/core/test/core.test.js` |
| Auditors, challenges and escalation in core: an auditor from another model family re-checks a sealed ruling; a challenge appends affirm, overturn or supersede and never edits the ruling; a below-bar ruling's escrow funds a wider jury from other model families | Works with scripted models; not yet run live or on a network | `packages/core/src/challenge.js`, `packages/core/test/m3.test.js` |
| Retry for rate-limited models: each harness backs off on 429, 5xx and network errors, then is dropped if it still fails | Works with fake providers; not yet measured live | `packages/core/src/providers.js` |
| Light client: reads the source chain across 3 RPC endpoints from 2 or more operators at `finalized`; disagreement is unknown and pauses the contract; intake checks escrow, the outbox confirms triggers landed | Works with mocked RPCs; **measured** read-only on Solana devnet Nov 6, 2026 (3 endpoints, 3 operators). Ethereum sync-committee verification (Helios) is an optional adapter, not yet run | `packages/lightclient`, `config/lightclient.devnet.json` |
| Proof packing: an atomizer that drafts atom plans with a model, exact composition rules, dedupe across contracts, first-fit packing into 1,024-token requests, strict reply reading | Works with mock models; prove-once and the fidelity panel on devnet are planned | `packages/pack`, `packages/pack/test/pack.test.js` |
| Economics of proven blocks and proof packing: cost per proof, per block and per decision, batch size, who earns what | Modeled, with every source labeled; packing itself is designed, not built | `packages/economics`, [harness.verafy.ai/economics](https://harness.verafy.ai/economics) |
| TinySVM phase 1: exact settlement next to the AI. LiteSVM 0.18.2 as a sidecar running sBPF programs (escrow, bond, ledger, and exit programs for graded insurance, ranked prizes and milestone escrow); an optional `exitProgram` per exit with bounded params; runtime.js and TinySVM side by side, disagreement a fault | Works locally with scripted juries; runtime.js stays the default, and TinySVM needs Rex to become it | `packages/tinysvm`, `packages/core/test/exitprogram.test.js`, `packages/tinysvm/test/tinysvm.test.js` |
| Research demo (Part H): svmLLM as an optional third settlement runtime. The five integer programs, hand-written in svmLLM's reduced sBPF, run on hand-built transformer weights and agree with runtime.js and TinySVM (faults 0 over 1,500 random calls, measured Nov 6, 2026); one settlement proved with the mock prover only | Demo. The jury pay rule is not covered (doubles). No real proof; the success criterion, a settlement proof cheaper than the judgment proof, is untested | `packages/tinysvm/src/svmllm.js`, `packages/tinysvm/scripts/svmllm-proof.mjs`, `packages/tinysvm/README.md` |
| Proving (L2) end to end with a mock prover: commit, reveal, then a proof hash per counted vote before a proof deadline; a missing or failed proof drops the vote, re-measures agreement against the bar (escalating below it) and records a fault against the bond; proving never blocks the commit. Prover and Verifier interfaces with mock, DeepProve and FlashProve adapters (subprocess or HTTP), map-then-reduce splitting of long contracts, prover batches, proving as a service through the API router | Works with the mock prover, which is not a proof of inference. The DeepProve and FlashProve adapters are tested against a stand-in binary only; no real proof has been made or verified here | `packages/prove`, `packages/core/src/proving.js`, `packages/prove/test/prove.test.js` |
| A network of harnesses, bonds and slashing, testnet | Planned | [ROADMAP.md](ROADMAP.md), [docs/testnet.md](docs/testnet.md) |

## Quick start

Needs Node 22 or later. The core has no dependencies.

```sh
git clone https://github.com/Verafyai/verafyHarness.git
cd verafyHarness
npm test          # 198 tests, plus the spec check
npm run demo      # five contracts, five rulings, five blocks, scripted answers
npm run testnet   # a whole testnet on this machine: a daemon per model family, juries over HTTP, sealed blocks
```

<p align="center">
  <img src="docs/assets/demo-terminal.png" alt="Terminal output of one ruling: propose, commit, reveal, rule, pay and seal" width="760">
</p>

With real models through any OpenAI-compatible endpoint (OpenRouter by default):

```sh
export VERAFY_API_KEY=...       # never commit it
node bin/verafy.js doctor --live
node bin/verafy.js run examples/market-resolution.json --live
```

Run a harness anywhere (v0.0.2-alpha):

```sh
curl -fsSL https://raw.githubusercontent.com/Verafyai/verafyHarness/main/install.sh | sh
verafy up                    # pick a target and a model; local, Docker, DigitalOcean, Hetzner or any cloud
verafy up --ui               # the same, as a page on 127.0.0.1
verafy harness serve         # the daemon itself, configured by VERAFY_* variables
verafy testnet up --solana   # local testnet, settling each ruling on a local Solana validator
verafy packed examples/market-resolution.json examples/packed/cloture.json --plans examples/packed/plans.json
```

See [harness.verafy.ai/launch](https://harness.verafy.ai/launch) and [harness.verafy.ai/learn](https://harness.verafy.ai/learn).

Other commands: `verafy doctor [--live]`, `verafy validate <file>`, `verafy pin <file>` (writes SHA-256 pins for every context entry), `verafy seal <file> <juror-dir...>` (seals a block from reveals that separate harness processes wrote, such as DSH jurors), `verafy chain`, and `--json` for machine output. Installed as a package, the command is `verafy`.

**Renamed from `swarm`.** The CLI was `swarm`; `swarm` still works as an alias and prints a one-line notice. Older setups keep working: `swarm.config.json` is read when `verafy.config.json` is missing, `.swarm/chain.json` is read while `.verafy/` is empty, `SWARM_API_KEY` and `SWARM_KEYBLOCK_PASSPHRASE` are read when the `VERAFY_` names are unset, contracts of kind `swarm.asc/0` still validate and keep their hashes, and triggers of kind `swarm.trigger/0` still verify. New contracts are `verafy.asc/1` and new triggers are signed as `verafy.trigger/1`.

## Use it from your agent

Verafy Harness ships as an MCP server, `verafy-mcp` ([`packages/mcp`](packages/mcp)), with a plugin or config folder for each major agent. Your agent can draft a contract, validate it, pin its sources, run a jury in mock mode, and read the ruling and the sealed block. Your agent is the client and never votes; there is no vote, key or funds tool. Live calls are off until the server is started with `--allow-live` and a call sets `live: true` and a `maxSpendUsd`.

| Agent | Folder | Status |
|---|---|---|
| Claude Code | [`integrations/claude-code`](integrations/claude-code) | verified, Nov 6, 2026, Claude Code 2.1.319 |
| OpenAI Codex | [`integrations/codex`](integrations/codex) | config written, not run end to end |
| Cursor | [`integrations/cursor`](integrations/cursor) | config written, not run end to end |
| Gemini CLI | [`integrations/gemini-cli`](integrations/gemini-cli) | config written, not run end to end |
| Goose | [`integrations/goose`](integrations/goose) | config written, not run end to end |
| Hermes Agent | [`integrations/hermes`](integrations/hermes) | config written, not run end to end |
| OpenClaw | [`integrations/openclaw`](integrations/openclaw) | config written, not run end to end |
| Any MCP client | [`integrations/mcp`](integrations/mcp) | verified with MCP Inspector 2.14.0 |

In Claude Code: `/plugin marketplace add Verafyai/verafyHarness`, then `/plugin install verafy-harness@verafyHarness`. Every config starts the server with `npx -y @verafy/mcp`; from a clone it is `node bin/verafy-mcp.js`. The safety model and the spend rule are in [the guide](docs/run-a-harness.md#10-run-it-from-your-agent).

## Run a harness

The full guide is **[docs/run-a-harness.md](docs/run-a-harness.md)**, also on the site as [Run a harness](https://harness.verafy.ai/run). It covers harnesses and nodes, consensus, machine requirements for API, open-weights and proving harnesses, bandwidth and state size, acceptable models, where to get them, how a model is proven, install, configure, run, joining the network, payments, costs and earnings. The testnet plan is in **[docs/testnet.md](docs/testnet.md)**.

| Setup | Machine | Model |
|---|---|---|
| API harness | 2 vCPU, 4 GB RAM, 20 GB SSD, no GPU | Hosted, through an API key |
| Open-weights harness | 1 x 80 GB GPU, 128 GB RAM for `gpt-oss-120b`; larger models need 4 to 8 GPUs | On your machine, through vLLM (`scripts/run-vllm.sh`) |
| Proving harness | 1 x 80 GB GPU and about 290 GB host memory (vendor-reported) | Llama 4 Maverick only, research |
| Node | 8 vCPU, 32 GB RAM, 2 TB NVMe | None |

```sh
bash scripts/setup-ubuntu.sh            # Node 22, clone, test, demo
bash scripts/setup-ubuntu.sh --gpu      # plus GPU checks
MODEL=openai/gpt-oss-120b bash scripts/run-vllm.sh
node bin/verafy.js doctor --live --config verafy.config.local.json
```

<p align="center">
  <img src="docs/assets/run-a-harness.png" alt="The Run a harness guide on the concept site" width="100%">
</p>

## Anatomy of an Actually Smart Contract

<p align="center">
  <img src="docs/assets/anatomy.png" alt="Anatomy of an Actually Smart Contract: context, question, payment and exits, pinned and sent to five harnesses, ruled NO at 94% against an 80% bar, NO exit fires" width="100%">
</p>

Every Actually Smart Contract has four parts. The schema is [`schemas/asc.schema.json`](schemas/asc.schema.json); the examples are in [`examples/`](examples).

| Part | What it holds | Example |
|---|---|---|
| **Context** | Links, text, policies, documents or repos, each pinned by SHA-256 so every juror reads the same bytes. Links are snapshotted at a set time. | senate.gov roll call, snapshot Dec 1; market rules; resolver policy v2 |
| **Question** | The intention compressed to what must be decided, and the form of the answer: a `verdict` from options, a `forecast` probability, or a `graded` answer on an ordered scale. | Did H.R. 4410 pass the Senate by Nov 30? `YES`, `NO`, `UNCLEAR` |
| **Payment** | Escrow in any asset on any chain, the jury's size, how many model families it must span, the quorum, the bar it must clear, and how the escrow splits. | 1.20 USDC on Solana · jury of 5 across 5 model families · bar 80% |
| **Exits** | The only things the contract can do with an answer: `pay`, `refund`, `hold`, `record`, `call` a contract on another chain, or `escalate`. A `*below-bar` exit is required. | `NO` → call `market.settle(NO)` on Solana |

```json
{
  "kind": "verafy.asc/1",
  "id": "market-senate-bill-nov30",
  "instructions": "You resolve a prediction market. Use only the pinned roll-call snapshot...",
  "context": [{ "kind": "link", "url": "https://www.senate.gov/...", "snapshotAt": "2026-12-01T00:00:00Z", "sha256": "..." }],
  "question": { "prompt": "Did H.R. 4410 pass the Senate by November 30, 2026?", "answer": { "type": "verdict", "options": ["YES", "NO", "UNCLEAR"] } },
  "payment": { "escrow": 1.2, "currency": "USDC", "chain": "solana", "bar": 0.8, "jury": { "size": 5, "minFamilies": 5, "quorum": 4 }, "split": { "jurors": 0.8, "auditors": 0.1, "storage": 0.05, "sealer": 0.05 } },
  "exits": [
    { "outcome": "NO", "effect": { "type": "call", "chain": "solana", "target": "market.settle", "args": ["NO"] } },
    { "outcome": "*below-bar", "effect": { "type": "escalate", "jurySize": 9 } }
  ]
}
```

The contract's identity is a hash over everything except snapshot content, so it is the same whether the content travels with the contract or is fetched later by hash.

Payment may also say when the contract is willing to seal: `minBatch` (never in a block with fewer contracts) and `maxWaitSeconds` (no later than this after it is queued, paying a larger share of the block's fixed cost). Both are optional; a contract without them keeps its hash. Before its jury is drawn, a contract can wait in the chain's encrypted queue (`src/queue.js`), readable by nobody; see the [Verafy Chain batching doc](https://github.com/Verafyai/verafyChain/blob/main/docs/batching.md) for what that does and does not hide.

## The harnessed validator

<p align="center">
  <img src="docs/assets/harness-diagram.png" alt="Block diagram of a harnessed validator: requests, pinned context and live sources come in; intake, context loader, tools sandbox, guardrails, the pinned AI model, signer, contract runtime and outbox inside; bond wallet, track record and attestation along the bottom; votes and rulings go to Verafy Chain and contract calls to other chains" width="100%">
</p>

| What a validator does today | What the harness does | In this repo |
|---|---|---|
| Receives transactions | Intake validates each contract, refuses one that asks more of a vote than its bond covers, and refuses payment in assets it doesn't accept. | `Harness.intake` |
| Re-executes bytecode | The model reads the instructions and pinned context and returns an answer with a confidence. | `juror.deliberate` |
| Checks state | The context loader verifies every pin before the model reads a word. | `juror.loadContext` |
| Votes on blocks | The signer commits a hidden vote, reveals it, and signs an attestation of which model produced it. | `signer.commit`, `Harness.reveal` |
| Stakes | The bond sizes how much value a vote can decide and is lost for a proven fault. | `Harness.bond` |
| Runs the state machine | The contract runtime picks the exit, builds the exact diff, splits the escrow, and checks that totals are conserved. | `runtime.js` |
| Holds the keys | The keyblock keeps every API key and wallet key encrypted and issues short-lived scoped keys, so no other part of the harness holds a raw secret. | `keyblock.js` |
| Calls outside APIs | The API router plugs into AI APIs, external API routers, provers, cloud hosts and payment endpoints, attaches keys from the keyblock, meters each call, and sends each contract only to AI that meets its provability requirement. | `apirouter.js`, `routing.js` |
| Gets paid, pays its way | The banker accepts any token, swaps between tokens at the best approved quote, and pays each API in the token it takes, from the payment wallet, within the operator's caps. | `banker.js`, `routing.js`, `payments.js` |
| Serves RPC | The outbox posts votes and emits triggers, such as a call to a Solana program. Triggers need a quorum signature. | `ruling.triggers` |

## How a ruling works

1. **Propose.** A funded contract is drawn into the next block. The jury scheduler draws a jury from the pool, seeded by a randomness beacon that the block's sealer fixed in advance, filling seats until it spans the required model families without giving any operator more than its share of seats.
2. **Commit.** Each harness validates the contract, checks every context hash, deliberates, and publishes only a SHA-256 commitment of its vote and a salt, signed with its Ed25519 key.
3. **Reveal.** Each harness opens its vote. A reveal that does not match its commitment, or whose signature fails, is not counted.
4. **Rule.** Agreement is measured and compared with the bar. Dissent is recorded with its reasoning.
5. **Seal.** The contract runtime runs the chosen exit, the diff is checked for conservation, the ruling is sealed into a block that links to its parent, and the payment router records or settles the payouts. No rulings, no block.

## Consensus

Consensus has two layers. The full definition is in [the guide](docs/run-a-harness.md#2-what-consensus-means-on-verafy-chain).

- **Judgment consensus** decides whether a ruling is valid: the jury was drawn correctly across model families, at least a quorum revealed votes that match their commitments, every answer is in bounds, the bar was or was not cleared, and the diff matches the exit and conserves totals. Every node checks every rule.
- **Ledger consensus** decides block order: a sealer rotation over the node set, with a block final at two thirds of node signatures (proposed for testnet). Rulings inside a final block can still be challenged during their window; a challenge appends a new ruling and never erases the old one.

## Close enough: agreement and the bar

Judgment is fuzzy, so a ruling does not have to be exact. It has to clear the contract's bar.

| Answer type | Agreement | Example |
|---|---|---|
| `verdict` | Confidence-weighted share of the jury that chose the winning option | 5 of 5 say NO: 100% against a bar of 80%, final |
| `forecast` | `1 - min(1, meanAbsDeviation / tolerance)` around the median | Live, Nov 6: forecasts 0.35 to 0.65, 55% against a bar of 70%, below the bar |
| `graded` | A vote on the winning grade counts fully, one step away counts half | 4 misleading, 1 false: 90% against 70%, final |

Below the bar, the `*below-bar` exit runs. In the examples it escalates to a 9-harness jury in the next block and moves the escrow to fund it; no juror is paid. Rulings are also checked after the fact: auditor harnesses re-run a sample with different model families, anyone can challenge with new evidence, and forecasts are scored when the outcome arrives.

## Proof of Judgment

A block exists only when a jury rules. Nothing mines or stakes its way into producing one. The money that creates a block pays for the judgment inside it, and each block commits to the hash of its rulings and to its parent.

| | Proof of work | Proof of Judgment |
|---|---|---|
| What a block costs | Hashing nobody needed | Model compute somebody paid for |
| Who can produce one | Anyone with hardware | Anyone running a harness |
| How a forgery is caught | Instantly, by checking a hash | By audit, re-execution or challenge, backed by bonds |
| What would make it as strong | | Small proofs of inference, checkable like a hash |

## No coin: payments and the payment router

<p align="center">
  <img src="docs/assets/no-coin.png" alt="There is no token. There is no need for one. Money stays where it is, a payment router in every harness, paid in what was paid in." width="100%">
</p>

**There is no token, and there is no need for one.** A contract is paid in whatever asset the requester chooses, on the chain where they hold it: USDC or SOL on Solana, ETH or any ERC-20 on Ethereum. Any wallet works. The money never moves to Verafy Chain: escrow is held on the source chain, Verafy Chain records the ruling, and a quorum-signed trigger releases the escrow there, in the same asset.

Each harness plugs in a **payment router** that decides which payments it accepts and where its share goes:

```json
{
  "payments": {
    "router": "ledger",
    "accept": [{ "chain": "solana", "asset": "USDC" }],
    "book": { "harness:h-mistral-1": { "solana": "<your Solana address>" } }
  }
}
```

| Router | Status | What it does |
|---|---|---|
| `ledger` | Available now, the default | Records every payout to `.verafy/payouts.jsonl`. Nothing moves on any chain. |
| `solana-usdc` | Planned | Releases escrow held by a Solana program, in USDC or any SPL token, with a quorum-signed trigger |
| `evm` | Planned | The same for Ethereum and EVM chains, in ETH or any ERC-20 |

A harness only takes seats on contracts paying in an asset on its `accept` list. Bonds are posted the same way, in the asset of the chain the harness earns on.

Earnings pay for the work: the inference each juror runs, the machine and bond behind it, audits, storage and bookkeeping. A harness's **routing agent** is four blocks: a **keyblock** that holds every API key and wallet key encrypted and issues scoped keys, a **banker** that accepts any token and swaps between tokens, an **API router** that plugs into and pays different APIs, and a **payment wallet** that earnings land in and bills are paid from, automatically. It accepts payment in any asset and converts between them, connects to AI APIs and cloud hosts, pays for its own inference and hosting within caps the operator sets, and routes each contract only to AI that meets the contract's provability requirement, up to a zero-knowledge proof of inference. All four run in the core today with test venues and test APIs: `keyblock.js`, `banker.js`, `apirouter.js`, `routing.js`. Real exchange venues, on-chain signing and renting hosts are planned. The full policy, with a worked example, is in **[Coin Agnostic](docs/coin-agnostic.md)**.

## Who pays, who earns

Requesters pay because they need decisions: prediction markets need resolutions, fact checkers need volume, forecasting apps need a crowd that runs around the clock, and contracts on other chains need decisions they cannot make in code.

| Role | Does | Earns, in the contract's asset | Risks |
|---|---|---|---|
| Juror | Rules with its committed model | A share of `split.jurors` per counted vote | Its bond, for running another model, missing a reveal, or failing audit |
| Auditor | Re-runs sampled rulings with a model from a different family | `split.auditors`, plus the bond of any juror it catches | A smaller bond, for a false accusation |
| Storage | Keeps context and evidence fetchable by hash | `split.storage` for the challenge window | Its bond, if a file cannot be produced |
| Sealer | Collects reveals, checks quorum and diffs, signs the block | The remainder of the escrow | Rejection of the block |

Every counted vote is paid, including dissent, so no juror is rewarded for following the majority. There is no block reward. Costs and earnings are worked through in [the guide](docs/run-a-harness.md#15-what-it-costs).

## Where the words live

A block stores the short request inline and every piece of context as a hash. Full text sits in an availability layer kept by storage harnesses, and every juror's context loader fetches it and checks each hash before the model reads it. In the prototype, snapshot content travels in the contract file under `content`; the hash check is the same either way.

## Bonds and slashing

Running a harness means posting a bond that can be taken for misbehavior. Every ruling records its faults, with signed evidence where a fault can be proven, and a published schedule prices them:

- **Provable misbehavior costs a share of the bond:** two different signed commitments for one contract (100%), a proof that does not verify (50%), a signed reveal that does not open its own commitment (25%).
- **Missed seats cost a small fixed amount** past a free allowance (2% of seats for commits), doubling in a streak, because honest machines go offline.
- **Slashed money** goes half to whoever proved the fault and the rest to the network pool. Nothing is burned or minted.
- **Payouts wait out a challenge window** when a contract sets one, so a challenge that overturns a ruling redirects the money, not just the record. Challengers lock a bond too.

Every price is illustrative until Rex sets it. Watch it happen: `node examples/slashing/walkthrough.mjs`, or `node bin/verafy.js testnet up --misbehave h-llama-1:no-reveal`. Designs: [docs/proposals](docs/proposals/README.md).

## Swapping the AI

A harness commits to one model. Swapping the AI means changing the provider and model id, nothing else.

- **This prototype:** edit `verafy.config.json`. Each pool entry names an open-weight model and its family (the base model it descends from), served through an OpenAI-compatible endpoint: a local vLLM or Ollama server (`verafy.config.local.json`), or a provider that serves the same open weights.
- **Inside DeepSeek Harness:** pick a route in [`config/cordis.verafy.yml`](config/cordis.verafy.yml). DSH's `@deepseek-ai/dsh-llm-pi-ai` adapter serves any OpenAI-compatible gateway, such as OpenRouter, or a self-hosted server, with keys as credential references.

Any open-weight model from Hugging Face will do; the network does not care which. It requires that each jury spans several model families and several operators, and that every harness posts a bond it can lose.

## Running inside DeepSeek Harness

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) is an MIT-licensed agent harness built on an everything-is-a-plugin architecture. Verafy Harness uses it as the harness runtime and adds juror mode as a plugin, leaving the upstream tree unmodified. See [UPSTREAM.md](UPSTREAM.md) for the pinned commit.

[`packages/dsh-verafy-juror`](packages/dsh-verafy-juror/src/index.ts) registers:

- a `verafy:juror` system prompt section with the juror rules,
- `verafy_load_contract`, which validates a contract and checks every context pin,
- `verafy_cast_vote`, which validates the vote, signs a commitment and an attestation, keeps the vote and salt in a private reveal file, returns only the commitment, and concludes the turn,
- a tool lock: each juror agent is offered only the two Verafy tools (`tools.restrict`), and a `tools/pre-execute` gate denies any other call,
- a stop-boundary reminder: a juror that answers in prose instead of calling `verafy_cast_vote` is told, at most twice, that only the tool call counts.

```sh
git submodule update --init --depth 1
cd upstream/deepseek-harness
CI=true npx -y pnpm@11.28.5 install --frozen-lockfile   # needs Node 24.9 or later
CI=true npx -y pnpm@11.28.5 run build
cd ../..
node scripts/dsh-juror.mjs setup                        # link the plugin into the headless profile
node scripts/dsh-juror.mjs vote --family mistral        # one DSH juror, scripted model, no key
node scripts/dsh-juror.mjs jury                         # five DSH jurors, then verafy seal
VERAFY_API_KEY=... node scripts/dsh-juror.mjs jury --route openrouter  # five different live models
```

Status: milestone 2 is met. Five DeepSeek Harness processes on five different models (one `dsh-llm-pi-ai` route each, through OpenRouter) ruled on `examples/market-resolution.json` and `swarm seal` (now `verafy seal`) sealed the block from their reveals. See [docs/dsh-juror.md](docs/dsh-juror.md) for the run, and [docs/dsh-gaps.md](docs/dsh-gaps.md) for what DSH does not expose.

## Networks of harnesses

<p align="center">
  <img src="docs/assets/network.png" alt="A pool of eighteen independent harnesses; a request from a prediction market draws a jury of five from five model families; two auditors; the ruling seals into Verafy Chain and triggers market.settle on Solana" width="100%">
</p>

Many independent harnesses form a pool. Each request draws a random jury that meets the contract's rules: enough model families, enough operators, enough bond, the right specialty, an accepted payment. The first networks:

| Network | Request | Jury | Exit |
|---|---|---|---|
| Market resolution | Did the bill pass the Senate by Nov 30? | 5 harnesses, 5 families, bar 80% | `market.settle(NO)` on Solana |
| Fact checking | Did the CEO say revenue doubled? | 5 harnesses, 4+ families, bar 70% | Graded verdict, misleading, with dissent |
| Forecasting | Probability of a rate cut in March? | 5 harnesses, 5 families, bar 70% | Forecast, scored at resolution |
| Triggers | Pay if UA 1532 lands 3+ hours late | 5 harnesses, bonds of 250+ | `delay_cover.settle(PAY, 250)` on Solana |

## Performance and state size

Every number carries a label.

| Lane | Latency per ruling | Model cost per ruling | Basis |
|---|---|---|---|
| Jury of 5 hosted models, live | 5.9 to 30.1 s | about $0.003 ($0.0163 for five rulings) | **Measured** Nov 6, 2026, through OpenRouter, [results](results/live-2026-11-06.md) |
| Fast screen (System 1 model) | 70 to 500 ms | about $0.0004 | **Vendor-reported** (TypeSafe Jev, early access), not reproduced |
| Jury of 5, modeled | set by the slowest model | about $0.006 | **Modeled**: 1,500 tokens in, 300 out, OpenRouter prices of Oct 11, 2026 |
| Proven jury, one proof per vote | about 16 s proving per vote | about $0.14 | **Modeled**: FlashProve at 110 tokens/s per H100, $6.16/hour; one open model, 1,024-token context |

| Object (canonical JSON, measured) | Size |
|---|---|
| One signed vote | 300 bytes |
| Ruling with five votes | about 2.5 KB |
| Block header | about 400 bytes |
| Contract without context text | 1.0 to 1.5 KB |

At one ruling per second network-wide, the chain grows by about 350 MB a day (modeled). A harness needs under 1 Mbps for that load. One proof of inference is about 18.78 MB and takes about 17 s to verify on 24 CPU threads, so proofs are checked off chain and only their hashes recorded. Source: [Anthropic, Progress on provable inference](https://www.anthropic.com/research/provable-inference).

## Security

Security is economic: lying has to cost an operator more than it pays.

| Attack | Defense | Strength |
|---|---|---|
| A juror copies the others | Commit-then-reveal | Strong |
| One model family's blind spot decides | Juries must span distinct model families | Strong |
| Tampered context | Every pin is checked before the model reads it | Strong |
| A vote outside the declared options | Rejected at parse; the jury can only pick declared exits | Strong |
| An operator runs a cheaper model than committed | Bonds, audits, attestation; proofs where available | Moderate today, strong with proofs |
| Bribery or collusion | Seeded random juries, bonds sized above what one vote decides, audits | Moderate, bounded by bond size |
| Prompt injection in evidence | Evidence is wrapped and labeled; the juror prompt forbids following it; juror mode locks tools | Moderate |
| Poisoned or forged evidence | Pinned sources, challenges, safe defaults, caps per ruling | Weak; in Verafy's testing poisoned evidence fooled every model tried |
| A compromised harness fires a trigger | Triggers need a quorum signature | Strong |
| One RPC provider lies about escrow or a trigger | The light client asks 3 endpoints from 2 or more operators and accepts only agreement; a split or a stale slot is unknown, and the contract pauses | Moderate: it trusts that the operators do not collude. A Solana light-client protocol or Helios on Ethereum would make it strong |

## Open problems

- **Proof of which model ran.** Proofs exist for one open model today. Until more can be proven, trust rests on bonds and audits.
- **Evidence you cannot trust.** A jury is only as good as what it reads.
- **Liveness.** If several providers fail at once, juries cannot reach quorum. The live runs already saw one rate-limited harness drop out; the jury sealed without it.
- **Model drift.** A model update can read the same words differently. Harnesses pin versions; the network needs a retirement rule.
- **Weighting without a coin.** With no native token to stake, how nodes are weighted for ledger consensus, and how bonds in different assets compare, are open. Testnet keeps the node set permissioned.
- **Model diversity.** Anyone can run a harness on any open-weight model, but many models descend from a handful of base models, so the number of truly independent families is small.
- **Setting the bar.** Too low and wrong rulings pass; too high and nothing settles. The live forecast fell below its bar.

## Verafy Harness and Verafy Chain

| | Verafy Harness (this repo) | Verafy Chain |
|---|---|---|
| What | The validator: an AI model in a harness | The chain: nodes that hold contracts, coordinate juries, seal and store blocks |
| Runs a model | Yes | Never |
| Where | [Verafyai/verafyHarness](https://github.com/Verafyai/verafyHarness) | [Verafyai/verafyChain](https://github.com/Verafyai/verafyChain) (in progress) and the concept at [chain.verafy.ai](https://chain.verafy.ai) |

Most of the work lives here. Verafy Chain imports this repo's core for every hash, signature, agreement and diff check and never reimplements them.

## Read more

- **[Bringing Inference Programs To Solana](docs/blog/bringing-inference-programs-to-solana.md)**: the essay this started from, also on [blog.verafy.ai](https://blog.verafy.ai/articles/20261105-simd-verifiable-inference)
- **The three draft SIMDs**: [Inference Programs](docs/simds/XXXX-inference-programs.md), [Inference Evaluators and Attestations](docs/simds/XXXX-inference-attestations.md), [Inference Rulings, Disputes and Challenges](docs/simds/XXXX-inference-rulings.md)
- **[SIMD discussion #724](https://github.com/solana-foundation/solana-improvement-documents/discussions/724)**, in the Solana Improvement Documents repo
- **[asc.verafy.ai](https://asc.verafy.ai)**: Actually Smart Contracts on Solana, with a sandbox
- **[chain.verafy.ai](https://chain.verafy.ai)**: the Verafy Chain concept, with both animations
- **[harness.verafy.ai](https://harness.verafy.ai)**: this project's site, with Run a harness, Testnet and Coin Agnostic
- **[Run a harness](docs/run-a-harness.md)** and **[Testnet](docs/testnet.md)**
- **[Juror mode inside DeepSeek Harness](docs/dsh-juror.md)** and **[what DSH does not expose](docs/dsh-gaps.md)**
- **[Live results, Nov 6](results/live-2026-11-06.md)**

## Repository layout

```
bin/verafy.js                     CLI: run, seal, doctor, validate, pin, chain, read, confirm
bin/swarm.js                      the pre-rename alias for bin/verafy.js
bin/verafy-mcp.js                 the MCP server from a clone
packages/economics/         modeled economics: proven blocks, proof packing, roles (zero dependencies)
packages/pack/              proof packing: atomize contracts, dedupe and pack atoms into proven requests, compose outcomes exactly
packages/tinysvm/           TinySVM: sBPF settlement programs, the LiteSVM engine sidecar, the cross-runtime check (optional)
packages/prove/             proof of inference (L2): Prover and Verifier interfaces; mock, DeepProve and FlashProve adapters (optional)
packages/core/              zero-dependency core
  src/asc.js                      Actually Smart Contract format and validation
  src/juror.js                    context loader, juror prompt, vote parsing
  src/signer.js                   Ed25519 keys, commit-then-reveal, attestations
  src/agreement.js                verdict, forecast and graded agreement
  src/runtime.js                  exits, escrow split, conservation check, triggers
  src/exitprogram.js              optional exit programs in the contract format, params bounds
  src/settle.js                   the reference settlement runtime and settle()
  src/payments.js                 payment routers: accept lists, ledger, planned on-chain routers
  src/routing.js                  payment wallet; inference routes by assurance level up to ZK proofs
  src/keyblock.js                 encrypted key vault; issues scoped keys
  src/env.js                      new names and their pre-rename fallbacks: config, state folder, env
  src/banker.js                   exchange: accept any token, best-quote swaps, fund payments
  src/apirouter.js                plugs into and pays outside APIs: AI, routers, provers, hosts
  src/harness.js                  the harnessed validator; admit() is intake plus the funding check
  src/sourcechain.js              funding check at intake, the outbox, the pause log (no reader inside)
  src/network.js                  jury draw, ruling from recorded messages, ruling verifier, sealing, Proof of Judgment
  src/trigger.js                  quorum-signed triggers (verafy.trigger/1; swarm.trigger/0 still verifies)
  src/challenge.js                auditors, challenges and reviews, escalated contracts
  src/queue.js                    the encrypted queue: a contract sealed t of n to the node set (Shamir over an AES-256-GCM key)
  src/proving.js                  L2 proof records and checks, the proof gate, finality, faults against bonds (no prover code)
  src/providers.js                mock and OpenAI-compatible model providers, retry with backoff
  test/                           node:test suite
packages/lightclient/             read the source chain without trusting one RPC, zero dependencies
  solana/                         multi-RPC reader for Solana
  evm/                            multi-RPC reader for EVM chains; optional Helios adapter for Ethereum
  shared/                         agreement, staleness and policy; JSON-RPC through the API router
packages/dsh-verafy-juror/        juror mode as a DeepSeek Harness plugin
packages/mcp/                     zero-dependency MCP server: eight tools, resources, prompts
integrations/                     one plugin or config folder per agent; _shared/ holds the skill and launch command
.claude-plugin/marketplace.json   Claude Code marketplace listing integrations/claude-code
config/cordis.verafy.yml          DSH profile overlay: one model route per model family, juror mode
config/lightclient.devnet.json    three public Solana devnet endpoints for the light client
scripts/                          setup-ubuntu.sh, run-vllm.sh, dsh-juror.mjs, dsh-link.mjs, scripted-llm.mjs,
                                  sync-integrations.mjs, mcp-smoke.mjs
examples/                         eight Actually Smart Contracts (three with exit programs) and scripted answers
schemas/asc.schema.json           JSON Schema for verafy.asc/1 (swarm.asc/0 still validates)
verafy.config.json                the local pool, provider and payment router
verafy.config.local.json          a pool with a local vLLM model beside hosted ones
docs/run-a-harness.md             getting started: hardware, models, proving, install, run, payments, costs
docs/testnet.md                   local devnet now, Testnet 0 plan
docs/dsh-juror.md, dsh-gaps.md    juror mode inside DeepSeek Harness
docs/blog/, docs/simds/           the essay and the three draft SIMDs
docs/assets/                      logo, banner, screenshots, animation
results/                          measured runs
upstream/deepseek-harness         DeepSeek Harness, pinned submodule
```

## License and credits

MIT. Verafy Harness is built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) by DeepSeek-AI, also MIT; its license and notices are in the submodule. Verafy Harness is a Verafy research project by Rex St John and is not affiliated with or endorsed by DeepSeek, OpenRouter, or any model provider.
