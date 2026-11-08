# Roadmap

Verafy Harness goes from a local prototype to an open network in stages. Each milestone has a done condition that can be checked. Dates are not set.

## The three stages

1. **Build it on Solana programs, with no SIMD.** Bootstrap the harness, launcher, testnet and internal infrastructure of the v1 harness on ordinary Solana programs (`verafy_ruling`, `verafy_judiciary`, `verafy_registry`). [VIP-0017](docs/proposals/VIP-0017-programs-first.md).
2. **Prove it with 10 to 50 pilots.** Real wallets and launches, built alongside each customer, with policies, contracts, certifications and scanners turned into templates as we go. [Verafy App Pilots](docs/pilots/README.md).
3. **Show the demand, then scale to a SIMD and beyond.** Publish adoption, measure where programs fall short, and propose the SIMD that removes that limit.

The milestones below are stage 1 in detail. The same stages, for readers: [docs/roadmap.md](docs/roadmap.md), published at /roadmap.

## Milestone 4d: ASC templates for agreements and funding (v0.0.5-alpha)

- [x] VIP-0029 Agentic contracts: two agents, signed terms and remedies, a signed log, disputes as Actually Smart Contracts, a two-of-three escrow whose signer checks a settlement proof
- [x] VIP-0030 Super grants: a Request for Ideas, base grants, jury review of responses and outcomes, outcome tranches, refunds
- [x] VIP-0031 Hackathon grants: a prize pool, GitHub submissions pinned to a commit, a graded council, a ranking the escrow pays exactly
- [x] VIP-0032 DAO constitution: articles pinned by hash, caps in code, one jury question per article
- [ ] Each on devnet, with one real program run end to end

Done when: one agentic contract, one super grant and one hackathon settle on devnet through the judiciary signer program.

## Milestone 4c: Judiciary Signer, registry and attestation (v0.0.4-alpha)

- [x] VIP-0010 Judiciary Signer: `verafy_judiciary`, a Squads member that votes only on a sealed ruling bound to the exact transaction; setup check; case contracts; escape hatch. Localnet against Squads v4 from mainnet, 30 of 30
- [x] VIP-0011 Policies and Covenant Launch: rules engine and templates
- [x] VIP-0012 Harness registry: `verafy_registry`, discovery in one RPC call, case fees paid to jurors, `verafy discover` and `verafy harness register`
- [x] VIP-0013 Hardware attestation: verification built. Still open: a harness in a real SEV-SNP VM, and a reproducible image
- [x] VIP-0014 Model certification: the suite and the bar; no closed model measured yet
- [ ] Deploy the three programs to devnet
- [x] VIP-0015 asset transfer records: listings, delivery rulings, records, localizer
- [x] VIP-0016 commission covenant: `verafy_covenant`, measured on a local validator
- [x] VIP-0018 bias profiles, with unannounced probes
- [x] VIP-0019 encoder: Memo backend measured on a local validator; IQ Labs backend ready
- [x] VIP-0003, 0004, 0008, 0009 closed with their defaults: operator signatures, equal weighting, single-harness mode behind a window, the prover named in each proof

Done when: the three programs are on devnet and an outside wallet attaches a Judiciary Signer without help.

## Milestone 1: Local prototype (done)

- [x] Actually Smart Contract format `swarm.asc/0` (now `verafy.asc/1`; the old kind still validates): context, question, payment, exits, with a JSON Schema
- [x] Context pinning by SHA-256 and a loader that rejects mismatched content
- [x] Harnessed validator: intake, bond check, juror prompt with evidence wrapping, vote parsing
- [x] Ed25519 identities, commit-then-reveal, signed attestations
- [x] Agreement for verdicts, forecasts and graded answers, compared with a bar
- [x] Contract runtime: exits, escrow split, conservation check, cross-chain triggers, escalation below the bar
- [x] Seeded jury draw across model families; rulings sealed into linked blocks
- [x] CLI with scripted and live (OpenAI-compatible) providers; five example contracts; 14 tests
- [x] Payment routers: per-harness accept lists and a local payout ledger, in the contract's own asset (added with the run-a-harness guide)

Done when: `npm test` passes and `npm run demo` seals five blocks. Met.

## Milestone 2: Juror mode inside DeepSeek Harness (done, 2026-11-06)

- [x] Build DSH at the pinned commit and load the juror plugin (now `packages/dsh-verafy-juror`) into it. Not through DSH's pnpm workspace, which would mean editing `upstream/`: DSH is built in place, and `scripts/dsh-juror.mjs setup` links the plugin into the headless profile and links its peers to the built DSH packages
- [x] Run a headless DSH agent with the juror overlay (now `config/cordis.verafy.yml`) that loads a contract and casts a committed vote
- [x] Confirm the tool lock denies every non-juror tool during a juror run: the agent is offered 2 tools; a scripted probe called all 24 other tools the headless profile mounts, and all 24 were denied (measured, every juror in a five-juror run)
- [x] Record a keyless session snapshot of a juror run: `results/dsh-juror-session-2026-11-06.jsonl`, and again after the tool rename: `results/dsh-juror-session-verafy-2026-11-06.jsonl`
- [x] One harness per model family, each a DSH process with a different `dsh-llm-pi-ai` route

Done when: five DSH processes on five model routes rule on `examples/market-resolution.json` and the CLI seals the block from their reveals. Met on 2026-11-06 with live models through OpenRouter: anthropic/claude-haiku-4.5, openai/gpt-5-mini, google/gemini-2.5-flash, meta-llama/llama-4-maverick, qwen/qwen3-235b-a22b-2507. All five voted NO, agreement 100% against a bar of 80%, block sealed. Details and the runs that failed first are in [docs/dsh-juror.md](docs/dsh-juror.md); what DSH does not expose is in [docs/dsh-gaps.md](docs/dsh-gaps.md).

## Milestone 3: Live juries (started)

- [ ] Live runs of every example on real models, with measured latency and cost per ruling published. First pass measured 2026-11-06 ([results/live-2026-11-06.md](results/live-2026-11-06.md)): five contracts, wall time per contract, total cost only (OpenRouter reports cost per key, not per run), and one harness dropped on an upstream HTTP 429
- [x] Retry for rate-limited models: each harness's provider retries 429, 5xx and network errors with capped exponential backoff and full jitter, honoring Retry-After; a harness that still fails is dropped as before (`withRetry`, on by default in `openaiProvider`). Tested with fake providers only; not yet measured live
- [ ] Track record: per-harness agreement with final rulings and forecast scores (Brier) once outcomes arrive
- [x] Auditor role, in core: `drawAuditors` picks harnesses from model families not on the jury, `sampleForAudit` takes a seeded sample, and `audit` re-verifies a sealed ruling from its round record and re-runs the contract, returning a signed `swarm.audit/0` report that flags a bad record or disagreement. Tested with scripted models. Not yet: auditor pay from `pool:auditors`, auditor bonds, and audits run live or on a schedule
- [x] Challenge with new evidence, in core: `challengeContract` builds a `swarm.challenge/0` contract (the prior ruling as a pinned `ruling` context entry, the original evidence, the new material labeled new; a jury at least as large that shares no model family or harness with the original; exits that only record), and `resolveChallenge` returns a `swarm.review/0` record: affirm, overturn (new or false evidence, error), supersede (changed rules), or the original stands. `appendReview` and `reviewStatus` keep an append-only log; `seal` carries reviews only in the block of the ruling that decided them. The original ruling is never edited. Tested end to end with scripted models: forged evidence, then a challenge on false evidence, then overturned
- [x] Escalation, in core: `escalate` turns a below-bar ruling into a `swarm.escalation/0` contract funded by exactly the carried escrow, with a wider jury that excludes the original jury's model families and harnesses. Tested with a nine-seat jury drawn from model families not on the original
- [x] Challenge bonds: lock on open, return on overturn or supersede, forfeit on affirm (draft rulings SIMD). Built in core in v0.0.3-alpha ([VIP-0006](docs/proposals/VIP-0006-challenge-bonds.md))
- [ ] Run challenges and escalations from the CLI and the demo; today they are core functions and tests only
- [ ] A fast lane: a System 1 screen that settles only the safe default and escalates the rest

Audits do not catch forged evidence: an auditor reading the same pinned page reaches the same answer (the poison test shows this). Forged evidence is caught by a challenge that brings new material.

Done when: 100 live rulings across the four market types, with audit results and costs published.

### Core changes the chain asked for (Nov 2026)

From the verafyChain ROADMAP's "Needed in verafyHarness" list. Done in core:

- [x] `ruleFromRecords(asc, commits, reveals, {jury, sealer, seed})`: rules from recorded messages, pure and synchronous, no stand-in jurors. `rule()` now runs on top of it and accepts async reveals
- [x] A committed juror that never reveals is not counted and is listed in `round.faults` as `no-reveal` (and `no-commit` for a seated juror with no valid commitment); nothing throws
- [x] `verifyRuling(asc, ruling, {cards, pool, seed})` with reasons; `checkQuorum(asc, reveals)` exported
- [x] Every ruling carries `round`: seed, sealer account, jury cards with public keys, accepted commitments, counted reveals with salts, and faults, so it can be re-verified alone
- [x] The sealer account is configurable (`harness:<id>`, `node:<id>`, or any account; `accountFor`), and the pay rules are an exported check (`checkPay`)
- [x] `drawJury` takes a bond floor; `drawJuryFor(asc, pool, seed)` and `eligibleJurors` apply `maxValuePerVote` and the new `excludeLabs` and `excludeHarnesses` jury rules
- [x] `Harness` keeps an identity (`identity`) or loads one from a PEM file (`identityFile`, the same format as the DSH plugin's `identity.pem`)
- [x] `mockProvider(script)` answers any contract and model family, read from each request
- [x] `swarm.trigger/0` with `triggerMessage`, `signTrigger` and `verifyTrigger`; new triggers are now signed as `verafy.trigger/1`, and `swarm.trigger/0` still verifies
- [x] Challenge (`swarm.challenge/0`) and escalated-contract (`swarm.escalation/0`) formats, in the schema and `validate`
- [x] An optional `proofHash` on votes. Only the hash is recorded; a `proof` field anywhere in a ruling fails verification. A stored hash is not a proof by itself
- [x] `seal(parent, rulings, sealer, {time})` for deterministic headers
- [x] The rename to Verafy (Nov 6, 2026): CLI `verafy` with `swarm` as an alias, `verafy.asc/1`, `verafy.trigger/1`, `verafy.config.json`, `.verafy/`, `VERAFY_API_KEY`, `VERAFY_KEYBLOCK_PASSPHRASE`, juror tools `verafy_load_contract` and `verafy_cast_vote`. Every old name is still read, and old contracts keep their hashes (`packages/core/test/rename.test.js`)
- [x] Batching fields (Part C): optional `payment.minBatch` and `payment.maxWaitSeconds`, in the schema and `validate`. Contracts without them keep their hashes (`packages/core/test/queue.test.js`)
- [x] The encrypted queue's crypto (Part C, prototype): `sealContract` encrypts a contract under a fresh AES-256-GCM key and splits the key t of n (Shamir over GF(2^521 - 1)) across the nodes' X25519 keys; `openShare`, `openContract`, `openWithKey`. Only the escrow reference and payment metadata are in the clear, bound as associated data. `node:crypto` only
- [ ] Real distributed key generation for a standing node-set key, and verifiable secret sharing so a bad share is caught before it is combined (planned, not built; today the author deals the shares for its own contract)
- [x] Governance (Part G, for the draft Verafy Chain Constitution, Draft 0): the `verafy.amendment/1` contract kind and `validateAmendment` (one target, the declared exits `adopt`, `reject`, `revise`, cites `block:0`, one of four kinds), the entrenched-clause list from Article 5 and `entrenchment` (only Extend and Clarify may touch an entrenched clause), and `AMENDMENT_STAGES`. Existing contract and block hashes are unchanged (`packages/core/test/governance.test.js`). The panels that rule on amendments run on verafyChain
- [x] Declining a seat on ethics grounds (Constitution Article 3.4): a `Harness` with its own `declines` policy returns a signed `verafy.decline/1` in place of a commitment; `checkDecline`; `ruleFromRecords` and `verifyRuling` take `declines`, and a declined seat is never counted, never paid and never a fault. Rulings without declines are unchanged
- [x] `seal` takes `screenings` (ethics gate entries) and `governance` (amendment stage records) and signs their roots in the header; a block without them hashes exactly as before

Still open from that list: the harness daemon (milestone 4).

### Agent plugins (Nov 6, 2026)

- [x] `packages/mcp`: a zero-dependency MCP server with eight tools (validate, pin, hash, run, chain, block, doctor, examples), resources and two prompts. No vote, key or funds tool; contract text under `evidence`; live calls only with `--allow-live`, `live: true` and a `maxSpendUsd`
- [x] `integrations/`: Claude Code, Codex, Cursor, Gemini CLI, Goose, Hermes Agent, OpenClaw and any MCP client
- [ ] Publish `@verafy/mcp` to npm, then launch with `npx -y @verafy/mcp`
- [ ] Submit to the Claude Code, Hermes and OpenClaw catalogs, Cursor's directory and the Gemini CLI extension gallery

## Milestone 4: A network of harnesses

- [x] Harness daemon: a long-running process that watches for funded contracts and takes jury seats (`verafy harness serve`, v0.0.2-alpha)
- [ ] MCP daemon tools, once the daemon exists: `verafy_harness_start`, `verafy_harness_status` and `verafy_harness_stop`. They run a real juror process with its own model and tool lock, so the agent that calls them still never votes. Not in `packages/mcp` yet.
- [ ] Gossip between harnesses for commitments and reveals; a sealer rotation
- [ ] Availability layer: storage harnesses that serve context by hash through the challenge window
- [ ] Bonds and slashing on a test network; faults proven by audit or by a missing reveal
- [ ] Hardware attestation where providers offer it, recorded with each vote

Done when: ten independently operated harnesses, on at least five different models, seal blocks on a test network for a week.

## Milestone 4b: Consensus hardening and slashing (v0.0.3-alpha)

Running a harness means posting a bond that can be taken for misbehavior. Each item has a design proposal in [docs/proposals](docs/proposals/README.md), a requirement in the spec, and a GitHub issue labeled `proposal`.

- [x] Jury scheduler: seed, draw, alternates, block-height deadlines, commit-phase replacements, audit sampling ([VIP-0001](docs/proposals/VIP-0001-jury-scheduler.md), CONS-001)
- [x] Randomness beacon (a hash chain fixed in advance) with lookahead; withholding a reveal is slashable ([VIP-0002](docs/proposals/VIP-0002-randomness-beacon.md), CONS-002)
- [ ] Operator keys on harness cards; seat cap per operator; operator bonds. The cap is built; signature checks and posted operator bonds are not ([VIP-0003](docs/proposals/VIP-0003-operator-diversity.md), CONS-003)
- [x] Draw weighting: equal (default) or bond-weighted, capped. Rex decides the network default ([VIP-0004](docs/proposals/VIP-0004-draw-weighting.md), CONS-004)
- [x] Slashing: a published schedule (provable faults as a share of the bond, missed seats as small fixed amounts past a free allowance), `slash()` producing conserving bond diffs, operator reach, appeals ([VIP-0005](docs/proposals/VIP-0005-fault-slashing.md), CONS-005)
- [x] Challenge bonds: lock on open, return on overturn or supersede, forfeit on affirm ([VIP-0006](docs/proposals/VIP-0006-challenge-bonds.md), JURY-006)
- [x] Payouts held until the challenge window closes; an overturn inside the window redirects the held escrow ([VIP-0007](docs/proposals/VIP-0007-payout-hold.md), CONS-006)
- [x] Single-harness mode, behind the network policy: a jury of one with a mandatory window and an automatic audit. Rex decides whether to offer it ([VIP-0008](docs/proposals/VIP-0008-single-harness-mode.md), CONS-007)
- [ ] Prover placement: each harness, or shared provers. Rex decides the default ([VIP-0009](docs/proposals/VIP-0009-prover-placement.md), CONS-008)
- [x] `verafy_ruling` 0.0.3 on Solana (measured on a local validator; not on devnet): a reveal deadline so one silent juror can't block a seal, and a releasable-after slot (CONS-009)
- [x] Economics: bond capital cost, expected slashing, and the cost of a challenge, in `packages/economics` (CONS-010)

Done when: the testnet coordinator runs every ruling through the scheduler, a harness that withholds a reveal is slashed in a sealed block, and a challenged ruling's held payout follows the challenge outcome. The first two are met on the local testnet; the third is met in core and in `examples/slashing/walkthrough.mjs`, not yet on the testnet.

Still open: slash appeals, operator signature checks and operator bonds, slashing on the verafyChain node (CHAIN-005), and every number, which is illustrative until Rex sets it.

## Milestone 5: Solana integration

- [ ] A Solana program that accepts quorum-signed triggers, matching the draft SIMDs
- [ ] A devnet prediction market resolved end to end by a Verafy Harness jury
- [ ] Harnesses as evaluators under SIMD 2: model commitments, attestations, bonds and challenges

Done when: a devnet market is created, funded, resolved by a jury, and settled by a quorum-signed call, with the ruling readable by any program.

### Light client: reading the source chain without trusting one RPC

Built in `packages/lightclient` (zero dependencies) and wired into core through `packages/core/src/sourcechain.js`. Off unless the config has a `lightclient` block, so `npm test` and `npm run demo` run offline as before.

- [x] Solana multi-RPC reader: N endpoints (default 3) from at least 2 operators, commitment `finalized` by default; all agree is accepted, all different is unknown at once, a stale slot (more than 150 slots behind the newest answer, or below a floor) is rejected, and a 2 to 1 split follows the policy (default reject and retry, 2 retries; `accept-majority` is opt-in and still needs 2 operators in the majority). Tested with mocked RPCs
- [x] Endpoints are API router entries; a key is a keyblock secret or an environment reference (`secretEnv`), never a value. Results record each source's id, operator and host only, never a path, query or header. Tested, including a key that must not appear in results or the meter
- [x] EVM multi-RPC reader for any chain id: agree on a finalized head, check the block hash at it, then read balances, ERC-20 balances and receipts at that block. Tested with mocked RPCs
- [x] Intake checks escrow funding (`Harness.admit`, `fundingCheck`) before the jury is drawn; the outbox (`Outbox`) confirms a trigger landed and records the confirmation; a read whose sources disagree pauses the contract in an append-only `PauseLog` with the reason and the sources. Tested
- [x] One read-only run on Solana devnet, Nov 6, 2026 (**measured**): `api.devnet.solana.com` (Solana), `solana-devnet.api.onfinality.io/public` (OnFinality) and `devnet.rpcpool.com` (Triton) agreed on the genesis hash, the finalized slot, the SPL Token program account, and the finalized status of one transaction. A first attempt with Tatum's public gateway was replaced: it allows 5 requests per minute without a key
- [ ] Ethereum mainnet sync-committee verification. **Not built in this package.** `evm/helios.js` is an optional adapter for Helios (a16z, 0.12.0, released Oct 5, 2026; checked Nov 6, 2026), as a sidecar or a subprocess. It is tested only with Helios absent (reports "not installed") and with a mocked Helios RPC; it has not been run against a live Helios. Until it is, mainnet results are labeled `verification: multi-rpc`
- [ ] Run the funding check and trigger confirmation against a real devnet escrow (needs the Solana program in milestone 5)
- [ ] A harness daemon that re-reads paused contracts and resumes or refunds them (milestone 4)

**Watch for a Solana light-client protocol.** Status on Nov 6, 2026: none in production. Tinydancer, the main effort, has stopped development (Solana forum thread, May 2026); SIMD-0052 (transaction proofs and a block Merkle root for light clients) has had no recent activity. Alpenglow (SIMD-0326) changes how finality is reached, so recheck the commitment mapping when it activates. When a light-client protocol ships, add it as a source beside the RPC quorum, then make it the default. Recheck monthly.

## Milestone 5a: The routing agent

- [x] Payment wallet spending rules: allowlisted payees, monthly caps, approval threshold, bond reserve, full log (`PaymentWallet`)
- [x] Keyblock: API keys and wallet keys encrypted at rest; scoped keys with scopes, expiry, use limits, revocation and lock (`keyblock.js`)
- [x] Banker: accept any allowed token, best-quote swaps across approved venues, slippage limit, never sells the bond reserve, funds payments in the payee's token (`banker.js`, fixed-rate test venue)
- [x] API router: plug in AI APIs, external API routers, provers, hosts and payment endpoints; keys from the keyblock; metering; per-call and accrued billing through the banker (`apirouter.js`)
- [ ] Banker venue adapters for real DEX aggregators on Solana and EVM chains, and cross-chain bridges
- [x] Inference routing by assurance level: the cheapest route that meets the contract's L0 to L2 requirement, refusing when none does (`routing.js`)
- [ ] Accept payment in any asset and convert between assets on approved venues, within a slippage limit
- [ ] Connect to cloud backends: rent GPU and VM hosts for open-weights and proving routes, on demand where a contract needs L2
- [ ] Pay allowlisted suppliers (model credits, GPU or cloud host, storage) within caps; keep the bond topped up and a reserve
- [ ] Off-ramp hook for suppliers that only take cards or bank transfers
- [ ] Per-ruling accounting: what each ruling earned and what it cost to produce

Done when: a testnet harness runs for a week, accepting payment in at least two assets, renting its own host, paying its own model and hosting costs from its earnings, and serving one L2 contract on a proving route, with every conversion and payment logged and no manual transfers.

## TinySVM: exact settlement next to the AI (phase 1 built, 2026-11-06)

- [x] sBPF programs with no dependencies: `escrow`, `bond`, `ledger`, and the exit programs `graded_payout`, `ranked_split`, `milestone_escrow`, pinned by SHA-256 in `packages/tinysvm/programs.lock.json`
- [x] LiteSVM 0.18.2 as an engine sidecar (JSON lines over stdio), restricted to the pinned programs, an allowlist per contract, and a compute cap. LiteSVM does not build for WebAssembly (`packages/tinysvm/README.md`)
- [x] An optional `exitProgram` per exit with a params schema; params bounded before execution; settlement state kept across rulings. Existing contracts keep their hashes
- [x] runtime.js and TinySVM side by side on every built-in exit, with a property test over random in-bounds rulings; disagreement is a fault
- [ ] Move runtime.js's jury split to integer micro-units, so TinySVM can be integer only (needs Rex: it changes some future diffs by one micro-unit)
- [ ] TinySVM as the default runtime (needs Rex)
- [ ] Phase 2: Anza's `solana-svm` crate, and chain nodes re-running settlement when they verify a block

## Research: a settlement core compiled into weights (svmLLM, Part H, demo, 2026-11-06)

- [x] The instruction subset the compiled exit programs execute, traced on solana-sbpf (svmLLM `results/settlement_subset.json`)
- [x] The five integer programs (`graded_payout`, `ranked_split`, `milestone_escrow`, `bond`, `ledger`) written in svmLLM's reduced sBPF and run on its hand-built weights: integer, deterministic, every activation exactly 0 or 1 (svmLLM `svllm/settle.py`)
- [x] svmLLM as an optional third runtime in the cross-runtime test, agreeing with runtime.js and TinySVM; skipped with the reason when svmLLM is not installed (`packages/tinysvm/src/svmllm.js`)
- [x] Size and latency measured (`packages/tinysvm/README.md`)
- [x] One settlement proved with the mock prover; real-prover cost modeled with `packages/economics` (`packages/tinysvm/scripts/svmllm-proof.mjs`)
- [ ] The jury pay rule and escrow hold and release on svmLLM (the pay rule is IEEE-754 doubles; the core is integer only)
- [ ] A real proof of one settlement (needs a prover that takes this network; DeepProve's license and a FlashProve machine are Rex's decisions)
- [ ] Success criterion, untested: a settlement proof cheaper than the judgment proof. Until then this stays a demo

## Milestone 6: Proofs of inference (Part D: mock flow built, 2026-11-06)

- [x] Timing: commit, reveal, then a signed proof record (`verafy.proof/1`, the proof hash only) before a proof deadline; proving never blocks the commit (`packages/core/src/proving.js`)
- [x] Finality: an L2 ruling is final only when every counted vote's proof verifies; a missing or failed proof drops the vote, re-measures agreement against the bar (escalating below it), and records a `no-proof` or `bad-proof` fault against the bond (`gateProofs`, `finality`, `bondFaults`)
- [x] `packages/prove`: Prover and Verifier interfaces; `mock` (not a proof of inference), `deepprove` and `flashprove` adapters by subprocess or HTTP, with a documented contract for the real binary; FlashProve's own `cp_verify` callable directly
- [x] `routeInference` for L2 uses a local prover or a proving service, never a hosted API
- [x] Prover batches up to `proverBatch`; long contracts split into chunks with `map-reduce/1`, every chunk's proof attached
- [x] Proving as a service: `provers` entries in the API router, metered per proof; the harness verifies before it counts, holds the bond and casts the vote
- [x] Off-chain verification with signed proof checks, proof hashes recorded in rulings; verified on the Verafy Chain devnet with the mock verifier
- [ ] A real proof: DeepProve (GPT-2 or Gemma 3) on a large-memory CPU server. Not run: the DeepProve repo's license is the Lagrange License, which binds whoever uses the software, so it needs Rex; this Mac (Apple M4, 10 cores, 16 GB) is also far below the 504 GB reference machine
- [ ] FlashProve `cp_verify` built and checking a stored proof (the README's route 1 needs Linux and g++ 13 or later). The adapter is tested against a stand-in only
- [x] FlashProve proving harness runbook (`docs/proving-harness.md`, Part D3 step 3): the machine, building, Llama 4 Maverick under Meta's license, the one-time commitment, and `verafy harness commit-model`. Not run; Rex decides when to rent
- [ ] A wrapper per real prover that meets the contract in `packages/prove/src/external.js`, including the check that FlashProve's request and reply files are our prompt and answer
- [ ] Track proof size and verification time as they change, and move rulings from bonded to proven as they become practical

Done when: a ruling with a verified proof for every counted vote is sealed.

## Not planned

- A token. Escrow is paid in an existing currency.
- Unbounded authority for any single ruling. Contracts cap what one ruling can move.
- Resolving disagreement by hiding it. Dissent is always recorded.
