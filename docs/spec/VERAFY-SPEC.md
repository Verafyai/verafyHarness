# Verafy specification

**Version 0.0.2-alpha**, November 6, 2026. Covers Verafy Harness (this repo) and Verafy Chain ([Verafyai/verafyChain](https://github.com/Verafyai/verafyChain)).

<!-- score -->
**Scored 68% overall** at v0.0.4-alpha (see [SCORECARD.md](SCORECARD.md)).
<!-- /score -->

This is an alpha spec for a prototype. Nothing here describes a running network, and there is no token. Every number is labeled **measured** (our own runs, with a date), **vendor-reported** (by whoever built the tool), **modeled** (computed from those, in `packages/economics`) or **illustrative** (an assumption to replace).

## How to read this spec

- **Requirement IDs are stable.** `AREA-NNN` never changes meaning; a dropped requirement keeps its ID, marked removed in the changelog.
- **Status** is one of verified, built, partial, designed, planned or research (defined in [requirements.json](requirements.json)). The tables below are generated from that file by `npm run score -- --write`, so the status here always matches what the scoring pass checks.
- **The scoring pass** (`npm run score`) checks each claim against the code: a file, a function, or a test in `npm test`. A claim whose check fails scores zero. See [SCORECARD.md](SCORECARD.md).
- **Versioning.** Semantic versions with a pre-release tag. Alpha means the shape can still change. A change of status, a new requirement or a reworded one bumps the patch number; a change of architecture bumps the minor number. Every version is a git tag and a GitHub release, with notes in [CHANGELOG.md](CHANGELOG.md).

## The system in one picture

```
 contract in words ──▶ ethics gate ──▶ atomizer ──▶ router ───────────────┬──▶ settled (screen or panel)
 (verafy.asc/1)        (planned)        PACK         ROUTE                 │
                                                       │ L2 only           │
                                                       ▼                   │
                                       packer ──▶ prover, proven once ──▶ verifiers (sampled)
                                       PACK       PROVE                    │
                                                                           ▼
                        jury rules: commit, reveal, agreement against the bar (CORE, JURY)
                                                                           │
                                     TinySVM settles the exit exactly (SETTLE)
                                                                           │
                    record: Verafy Chain block (CHAIN) or Solana accounts per the SIMDs (SOL)
                                                                           │
                 banker pays and gets paid in existing tokens; light client watches escrow (BANK, LIGHT)
```

## Principles that bind every part

From [PRINCIPLES.md](https://github.com/Verafyai/verafyChain/blob/main/PRINCIPLES.md): payment agnostic (no token, ever); natural language first; embedded ethics; checkable and verifiable; agent friendly; context is evidence; no single model or operator; nothing is erased; legible to people; open and forkable; honest about what runs. A design that conflicts with a principle loses, or goes through the amendment process.

## CORE: the protocol

A contract is a compressed intention: instructions, pinned context, a question with a closed answer type, a bar, payment and declared exits. Jurors commit to a hashed vote, then reveal it; agreement is measured against the bar; a below-bar ruling never pays jurors; the exit's diff must conserve totals.

<!-- reqs:CORE -->
| ID | Status | Requirement |
|---|---|---|
| CORE-001 | verified | Contract format verafy.asc/1 with validation; swarm.asc/0 still validates and keeps its hash |
| CORE-002 | verified | Pinned context: every context entry checked by SHA-256 before a model reads it |
| CORE-003 | verified | Commit then reveal with Ed25519 signatures and attestations |
| CORE-004 | verified | Agreement against the bar: verdict, forecast and graded; below-bar exits never pay jurors |
| CORE-005 | verified | Exits and diffs conserve totals; declared exits only |
| CORE-006 | built | Rulings re-verifiable from their round record (ruleFromRecords, verifyRuling) |
| CORE-007 | built | Quorum-signed triggers verafy.trigger/1 for calls to other chains |
| CORE-008 | built | Batching fields minBatch and maxWaitSeconds, without changing existing hashes |
| CORE-009 | built | Exit programs with bounded params, aggregated from votes |
<!-- /reqs:CORE -->

## JURY: juries, live runs, audits and challenges

Juries span open-weight model families and operators, and are drawn by the jury scheduler from a randomness beacon. Auditors from other model families re-check sealed rulings; challenges append, never erase; a below-bar ruling's escrow funds a wider jury.

<!-- reqs:JURY -->
| ID | Status | Requirement |
|---|---|---|
| JURY-001 | verified | Live juries across five different models; measured Nov 6, 2026: five contracts, 5.9 to 30.1 s each, $0.0163 in total |
| JURY-002 | verified | Juror mode inside DeepSeek Harness: five different models sealed a block from their reveals |
| JURY-003 | built | Retry and back-off for rate-limited models |
| JURY-004 | built | Auditors from other model families re-check sealed rulings |
| JURY-005 | built | Challenges append affirm, overturn or supersede; escalation funds a wider jury |
| JURY-006 | built | Challenge bonds: lock on open, return on overturn or supersede, forfeit on affirm. *Gap: Bond factor illustrative; not on a chain.* |
| JURY-007 | planned | Track record: agreement with final rulings and forecast scores per harness. *Gap: No per-harness history yet; needed for bonds and for routing weights.* |
| JURY-008 | partial | 100 live rulings across the four market types, with audits and costs published. *Gap: Only the first five live rulings are published.* |
| JURY-009 | built | Harness daemon: a long-running process that watches for funded contracts and takes seats |
<!-- /reqs:JURY -->

## CONS: consensus hardening and slashing

Running a harness means posting a bond that can be slashed for misbehavior. A jury scheduler draws every jury from a randomness beacon that no sealer can steer, caps seats per operator, sets block-height deadlines for commit and reveal, and replaces no-shows from fixed alternates during the commit phase only. Every recorded fault (a missing commit or reveal, a reveal that doesn't match its commitment, a bad proof, equivocation, a withheld beacon reveal) carries a penalty from a published slashing schedule, applied as a bond diff that conserves totals. Payouts wait until the challenge window closes, so an overturn moves money, not just the record. Designs: [docs/proposals](../proposals/README.md).

<!-- reqs:CONS -->
| ID | Status | Requirement |
|---|---|---|
| CONS-001 | built | Jury scheduler: beacon seed, draw, alternates, block-height deadlines, commit-phase replacement. *Gap: Deadlines and alternate counts are illustrative; the verafyChain node does not call the scheduler yet.* |
| CONS-002 | built | Randomness beacon with lookahead; a withheld reveal is a slashable fault. *Gap: A hash-chain beacon with one bit of withholding bias, slashed; drand or a VRF would remove it (decision for Rex).* |
| CONS-003 | built | Operator keys on harness cards, a seat cap per operator, operator bonds. *Gap: Operator signatures are checked on every draw; an operator's bond is its harnesses' registry bonds, not yet slashed on chain.* |
| CONS-004 | built | Draw weighting: equal by default, bond-weighted with a cap as an option. *Gap: Equal is the default; whether the network allows bond weighting waits on Rex.* |
| CONS-005 | built | Slashing: a published schedule applied to recorded faults as conserving bond diffs. *Gap: Every rate is illustrative; slashes apply on the local testnet, not on a chain.* |
| CONS-006 | built | Payouts held until the challenge window closes; an overturn redirects the held escrow. *Gap: Window lengths are illustrative; the verafyChain node does not release held payouts yet.* |
| CONS-007 | built | Single-harness mode: a jury of one with a mandatory window and an automatic audit. *Gap: Offered behind a mandatory window and automatic audit; cost not modeled.* |
| CONS-008 | built | Prover placement: each harness or shared provers, with the prover named in the proof record. *Gap: Each harness proves by default; a shared prover is named in the proof record. No prover runs live yet.* |
| CONS-009 | partial | verafy_ruling: a reveal deadline slot, and a releasable-after slot. *Gap: Measured on a local validator only; not on devnet.* |
| CONS-010 | built | Economics: bond capital cost, expected slashing, challenge cost. *Gap: Every input is illustrative.* |
<!-- /reqs:CONS -->

## SIGN: Judiciary Signer, policies and model certification

A Judiciary Signer is a member of a Squads multisig that no person holds a key for. It votes only as a sealed jury ruling says, and that ruling must bind to the exact transaction, come from the signer's named jury, clear its bar and outlive its challenge window. Its policy, fixed by hash at attach, has rules that code checks, intent and judgment the jury reads. Closed models may judge only with a certification of measured attack results. Designs: VIP-0010, VIP-0011, VIP-0014, VIP-0015, VIP-0016.

<!-- reqs:SIGN -->
| ID | Status | Requirement |
|---|---|---|
| SIGN-001 | built | Judiciary Signer: a Squads member that votes only as a sealed jury ruling says, bound to the exact transaction, past its challenge window, with an escape hatch a rejection blocks. *Gap: Measured on a local validator against Squads v4 from mainnet (30 of 30 checks across the signer, registry, encoder and covenant); not deployed to devnet.* |
| SIGN-002 | built | Policies: deterministic rules, intent and judgment; templates for Covenant Launch, treasuries and upgrade authorities; hard config violations. *Gap: Rules cover SOL and SPL token transfers; other programs are refused, not read.* |
| SIGN-003 | built | Model certification: a pinned attack suite and a bar a closed model must clear before a signer may use it. *Gap: No closed model measured yet; the bar is illustrative.* |
| SIGN-004 | built | Asset transfer records: physical item sales ruled on photos and serial numbers, with ownership and transfer records localized per country. *Gap: Scripted multimodal jury only; the localizer formats per country and flags registered categories, without country-specific legal rules.* |
| SIGN-005 | built | Commission covenant: a validator bonds a promise not to raise fees on stakers. *Gap: Local validator only; pays one beneficiary account, not stakers pro rata; reads vote account versions 1 and 2.* |
| SIGN-006 | built | Bias profiles: paired probes measure how a model leans (order, authority, framing, position, roles, anchors, length, approve rate, confidence, consistency), maps and least-shared-bias juries, and unannounced probes disguised as live cases. *Gap: No real model profiled yet; probes are written for escrow cases, not yet for wallet cases.* |
<!-- /reqs:SIGN -->

## NET: harness registry, discovery, pay and attestation

Harnesses register on Solana, are discovered with one RPC call, and are paid from case fees. A harness can prove it runs a known build inside an AMD SEV-SNP enclave with its key bound in. Designs: VIP-0012, VIP-0013.

<!-- reqs:NET -->
| ID | Status | Requirement |
|---|---|---|
| NET-001 | built | Harness registry on Solana: register, update, retire, bonded withdraw; discovery in one RPC call; case fees paid to jurors who revealed. *Gap: Local validator only; bonds are not slashed on chain yet.* |
| NET-002 | partial | Hardware attestation: AMD SEV-SNP reports bound to the harness key and build, verified against a pinned root; attested juries. *Gap: Verified with a test certificate chain only; no harness has run in an enclave, and there is no reproducible image to publish a measurement for.* |
<!-- /reqs:NET -->

## CHAIN: the Verafy Chain node

A block exists only when a jury rules. The node keeps a mempool of funded contracts, coordinates juries, gossips commitments and reveals, rotates sealers and verifies every block. Batching closes an L2 block by value or by time; the encrypted queue keeps contracts sealed until the jury is drawn.

<!-- reqs:CHAIN -->
| ID | Status | Requirement |
|---|---|---|
| CHAIN-001 | built | Node: mempool, jury coordination, gossip, sealer rotation, block store, verification |
| CHAIN-002 | built | Availability layer: context served by hash through the challenge window |
| CHAIN-003 | built | Batching: blocks close by value or by time, with a pro rata cost split |
| CHAIN-004 | partial | Encrypted queue: contracts sealed t of n until the jury is drawn. *Gap: Prototype: each author deals the shares; real distributed key generation and verifiable shares are planned.* |
| CHAIN-005 | planned | Registry on chain, sealer liveness, bonds and slashing, libp2p gossip. *Gap: Needed for a network of independently operated harnesses.* |
| CHAIN-006 | planned | Escalated juries accepted by the chain; challenge juries that share no model family |
<!-- /reqs:CHAIN -->

## SETTLE: TinySVM

The AI judges and TinySVM settles: a restricted LiteSVM sidecar that runs only pinned programs (escrow, bond, ledger and exit programs) under a compute cap. It runs side by side with `runtime.js`, and any disagreement is a fault. TinySVM decides nothing.

<!-- reqs:SETTLE -->
| ID | Status | Requirement |
|---|---|---|
| SETTLE-001 | built | TinySVM phase 1: LiteSVM sidecar restricted to pinned programs and a compute cap |
| SETTLE-002 | built | Built-in programs escrow, bond and ledger; exit programs graded_payout, ranked_split, milestone_escrow |
| SETTLE-003 | built | runtime.js and TinySVM side by side; any disagreement is a fault |
| SETTLE-004 | planned (needs Rex) | Integer micro-units in runtime.js; TinySVM as the default runtime. *Gap: Needs Rex: changes some future diffs by one micro-unit.* |
| SETTLE-005 | planned | Phase 2: Anza's solana-svm crate; nodes re-run settlement when they verify a block |
| SETTLE-006 | partial | Settlement core compiled into weights (svmLLM), proven with the judgment. *Gap: Demo: the five integer programs run on svmLLM's hand-built weights as an optional third runtime and agree with runtime.js and TinySVM; the jury pay rule (doubles) is not covered. No real proof made: mock only. Success criterion (a settlement proof cheaper than the judgment proof) untested.* |
<!-- /reqs:SETTLE -->

## LIGHT: reading source chains

Escrow stays on its own chain. The harness reads it from several independent RPC providers and treats disagreement as unknown, never a guess. Intake checks funding before a jury is drawn; the outbox confirms a trigger landed.

<!-- reqs:LIGHT -->
| ID | Status | Requirement |
|---|---|---|
| LIGHT-001 | verified | Solana multi-RPC reader; one read-only devnet run measured Nov 6, 2026 |
| LIGHT-002 | built | EVM multi-RPC reader for any chain id |
| LIGHT-003 | built | Intake checks escrow funding; outbox confirms triggers; disagreement pauses, never guesses |
| LIGHT-004 | partial | Ethereum sync-committee verification through Helios. *Gap: Adapter only, tested with Helios absent.* |
<!-- /reqs:LIGHT -->

## BANK: the routing agent

Four blocks: the keyblock (keys encrypted, scoped keys out), the banker (accept any allowed token, convert at the best checked quote), the API router (pay AI APIs, provers and hosts, metered) and the payment wallet (caps, allowlist, never the bond). The Banker is a deterministic service, not an AI agent; a read-only advisor may report and flag but holds no keys. Full design in [banker.md](banker.md).

<!-- reqs:BANK -->
| ID | Status | Requirement |
|---|---|---|
| BANK-001 | built | Keyblock: keys encrypted at rest; scoped keys with expiry, use limits and revocation |
| BANK-002 | built | Payment wallet: allowlisted payees, caps, approval threshold, bond reserve never spent |
| BANK-003 | built | Banker core: accept allowed tokens, best quote across approved venues, slippage limit, ensure and pay |
| BANK-004 | built | API router: keyed calls, metering, per-call or accrued billing |
| BANK-005 | built | Inference routing by assurance level, L0 to L2; L2 never to a hosted API |
| BANK-006 | built | BankerService: deposit state machine (detect, classify, hold, quote, simulate, swap, sweep, record), idempotent by txid |
| BANK-007 | partial | Real venue adapters: Jupiter on Solana, an EVM aggregator, a bridge; price sanity against a reference. *Gap: Jupiter and LI.FI quote live (measured Nov 6, 2026); simulation and sending are built behind the execute switch but have not run against a funded wallet.* |
| BANK-008 | built | Token allowlist by address; quarantine unknown tokens; dust; sanctions screen; daily caps; kill switch |
| BANK-009 | partial | Gas reserves per chain; exact approvals; simulate before send; append-only ledger with cost basis. *Gap: Simulate before send and the hash-chained ledger are built; per-chain gas reserves, exact approvals and cost-basis export are not.* |
| BANK-010 | built | Banker advisor: a read-only model that reports and flags, holding no keys |
| BANK-011 | built (needs Rex) | Service mode (converting other people's funds) disabled in code until legal review |
| BANK-012 | planned | Rent GPU and VM hosts on demand for open-weights and proving routes |
| BANK-013 | built | API credits: read provider balances, project days left from spend, and say what to top up and how. *Gap: No provider tops up automatically: OpenRouter's crypto top-up API returns 410 Gone (checked Nov 6, 2026). An x402 pay-per-request slot is reserved.* |
<!-- /reqs:BANK -->

## PACK: proof packing and the prompt compressor

FlashProve proves at most 1,024 tokens, about 750 words, per request; each proof takes about 9 s of H100 time, produces 18.78 MB and takes 17 s to verify (vendor-reported). Proving one request per proof wastes the window and pays for every proof in full. So requests are compiled before any model sees them:

1. **Atomize.** Each contract becomes atoms: one question each, a closed answer type, only the deciding facts, every fact pinned. An exact composition rule, written as code with integer math, turns atom answers into the contract's outcome. UNKNOWN goes to the contract's declared fallback, never a guess.
2. **Dedupe.** The same question over the same evidence has the same hash, so contracts that share a question share one slot and one proof.
3. **Pack.** Atoms fill 1,024-token requests first-fit, about 16 to 18 per request in tests; slot order is shuffled by the block hash; a reply that misses or mangles any slot is rejected whole.
4. **Compress what can't be atomized.** A brief (the question, the exits and only the deciding facts, each cited) stands in for a long contract. Plain dense English, never invented shorthand: models read English tokens best.
5. **Check fidelity.** A proof covers the atoms, not whether they capture the contract. Every plan or brief is agreed by the parties or ruled FAITHFUL by an unproven panel from several model families before it is used.

In a test block, 60 contracts became 120 atoms, 61 after dedupe, in 4 requests at 85% fill (measured on the packer with mock models).

<!-- reqs:PACK -->
| ID | Status | Requirement |
|---|---|---|
| PACK-001 | built | Atoms: one question, closed answer type, only deciding facts, each with a pin |
| PACK-002 | built | Atom plans with an exact composition rule; UNKNOWN goes to the declared fallback |
| PACK-003 | built | Dedupe across contracts by atom hash; first-fit packing into 1,024-token requests; block-hash slot order (library, tested with mocks) |
| PACK-004 | built | Strict reply reading: every slot exactly once, typed answers, nothing else |
| PACK-005 | built | Atomizer: drafts a plan with any model and checks every cited pin is real |
| PACK-006 | built | Fidelity check: an unproven multi-family panel rules a plan FAITHFUL before it is used |
| PACK-007 | planned | Real token counts with the target model's tokenizer. *Gap: The packer estimates about four characters per token.* |
| PACK-008 | designed | Prompt compressor: briefs for contracts that cannot be atomized; party-agreed or checked. *Gap: Brief mode is modeled in economics, not built in the packer.* |
| PACK-009 | designed | Long contracts split by claims with a proven combine step |
| PACK-010 | built | Route before packing: only atoms in the proven lane reach the packer |
| PACK-011 | partial | Packing wired into harness runs and chain intake: atomize, route, pack, prove, assemble, end to end. *Gap: Built for harness runs (verafy packed, packedBlock) with the mock prover; the verafyChain node intake and the daemon do not call it yet, and no real prover is attached.* |
<!-- /reqs:PACK -->

## ROUTE: multi-model routing

Every question starts at the cheapest tier that can answer it safely: a fast System 1 screen (such as Jev), then panels of small, mid-size and frontier models, each spanning model families. A unanimous panel stops; a split one moves up. Three signals decide where a question goes: the screen's probability, juror disagreement, and the question itself (its stakes, type and the contract's floor). The router is plain code; no model decides routing.

Guardrails:

- **Shadow mode by default.** The screen sizes juries and logs what it would have settled. It settles nothing until its cutoffs are calibrated and an operator turns settling on.
- **Calibrated cutoffs.** Per question type, the lowest probability at which the screen's accuracy, as a Wilson lower bound on labeled examples, matches the jury it replaces. Too few examples means no cutoff. Live audits withdraw a cutoff whose accuracy drops.
- **The contract's floor is never lowered.** The screen can only add scrutiny. L2 questions never take a screen's answer, because a closed model cannot carry a proof.
- **Audits.** A share of settled answers, drawn from the block hash, is re-checked at the top tier.

What a screen is worth is not known yet. Jev's figures are its maker's (70 to 500 ms, about $0.0004 a decision, 67.8% on its benchmark against 73 to 74% for frontier models); its coverage on our questions needs a calibration run.

<!-- reqs:ROUTE -->
| ID | Status | Requirement |
|---|---|---|
| ROUTE-001 | built | Tiered router: screen, then panels from small to frontier; a unanimous panel stops, a split one escalates |
| ROUTE-002 | built | The contract's floor is never lowered; L2 never uses a screen's answer; stakes cap screen settlement |
| ROUTE-003 | built | Shadow mode by default: the screen sizes juries and logs what it would settle |
| ROUTE-004 | built | Calibration: per-type cutoffs from the Wilson lower bound; recheck withdraws a cutoff when live accuracy drops |
| ROUTE-005 | built | Audits drawn from the block hash re-check settled answers at the top tier |
| ROUTE-006 | built | Screen adapters: a Jev adapter taking any client call, and a scripted screen |
| ROUTE-007 | partial | A labeled calibration set of atoms with known answers, and a Jev calibration run. *Gap: The labeled set (1,000 atoms, 200 per kind) and the runner are built; a Jev run needs Jev access (JEV_URL, JEV_API_KEY). A simulated run checks the pipeline only.* |
| ROUTE-008 | planned | Wire the router into the harness and the chain intake, with per-contract allowScreen, stakes and floors in the contract format. *Gap: The router is a library; contracts cannot declare allowScreen or floorTier yet.* |
| ROUTE-009 | planned | Skip tiers when stakes or question type make escalation likely |
<!-- /reqs:ROUTE -->

## PROVE: proofs of inference

The proven lane is set by the contract, never by difficulty. While only one model is provable, each packed request is proven once by a prover drawn from the block hash, and other jurors verify; model-family diversity returns when a second model is provable. Proofs are attached after the reveal; an L2 ruling is final only when every counted proof verifies; a missing or failed proof drops the vote and records a fault. Proofs and their data stay off chain; a block carries one Merkle root over them.

<!-- reqs:PROVE -->
| ID | Status | Requirement |
|---|---|---|
| PROVE-001 | built | Proof hashes on votes; a proof itself on chain fails verification |
| PROVE-002 | built | Prover and Verifier interfaces with mock, DeepProve and FlashProve adapters. *Gap: DeepProve and FlashProve adapters tested against a stand-in prover only; the FlashProve binding check (bindsTo) is planned.* |
| PROVE-003 | built | Commit, reveal, then attach the proof before a deadline; L2 final only when every counted proof verifies |
| PROVE-004 | designed | Prove once, verify many while one model is provable; verifiers drawn from the block hash |
| PROVE-005 | designed | One Merkle root per block over manifests and proof hashes; sampled verification with challenges |
| PROVE-006 | partial (needs Rex) | Measured DeepProve run on packed questions; FlashProve proving-harness runbook. *Gap: Runbook written (docs/proving-harness.md), not run. No real proof made or verified; needs Rex to rent a machine and accept the Llama 4 and Lagrange licenses.* |
| PROVE-007 | research | Recursive aggregation of many proofs into one |
<!-- /reqs:PROVE -->

## COT: disclosed reasoning

Each vote carries reasoning, and the commitment covers it, so reasoning cannot be rewritten after the outcome is known. Rulings record each juror's reasoning hash. Next: step-wise reasons that cite a pin per step, so a challenge can point at the step where the logic broke. In the proven lane, reasoning uses the 1,024-token window (full reasoning roughly doubles cost per contract, modeled), so proven jurors give short reasons. Written reasoning is evidence to check, not a guarantee of what drove the answer.

<!-- reqs:COT -->
| ID | Status | Requirement |
|---|---|---|
| COT-001 | built | Each vote carries reasoning; the commitment covers it, so it cannot be rewritten after the fact |
| COT-002 | built | Rulings record a hash of each juror's reasoning; dissents keep their reasoning |
| COT-003 | designed | Structured, step-wise reasons with a cited pin per step; challenges cite a step. *Gap: Reasoning is two or three free-text sentences today.* |
| COT-004 | designed | Short reasons in the proven lane; full reasoning off chain by hash in unproven tiers |
| COT-005 | research | Disagreement graph: structured objections against a rule or evidence item, versioned across rulings |
<!-- /reqs:COT -->

## GOV: constitution, ethics and amendments

Block 0 is a draft Constitution with Embedded Ethics, to be ratified by the first jury consensus. Every governance change passes a constitution check, then an ethics check. Amendments go through seven stages and can never weaken entrenched clauses.

<!-- reqs:GOV -->
| ID | Status | Requirement |
|---|---|---|
| GOV-001 | built | Constitution Draft 0 with Article 1 (no foundation, no VC, no coin, no fundraising, no secret team, no community fund, no treasury) |
| GOV-002 | built | Ethics gate: allow, refuse or escalate at intake; doubt resolves toward refusal; no bypass. *Gap: Panel sizes, bar and the screening fee are illustrative until Rex sets them; challenges to an ethics ruling are not built.* |
| GOV-003 | built | Amendment process: seven stages, entrenched clauses, verafy.amendment/1. *Gap: Tested in process with 42 harnesses; not on the five-harness multi-process devnet.* |
| GOV-004 | built | Eleven design principles |
<!-- /reqs:GOV -->

## SOL: settling on Solana

In theory, no separate chain is needed: the three draft SIMDs describe every part of this as ordinary Solana programs, with no changes to Solana. Two pieces would still need adding: fair juror draws (slot data can be nudged) and availability for the off-chain data. Proof packing needs a small amendment so many attestations can point at one shared proof. A dedicated Verafy Chain is worth building only if the Solana version hits real limits.

<!-- reqs:SOL -->
| ID | Status | Requirement |
|---|---|---|
| SOL-001 | designed | Three draft SIMDs: inference programs, attestations, rulings; no validator changes |
| SOL-002 | partial | A Solana devnet program implementing commit, reveal and the Ruling account; one harness ruling settled on devnet. *Gap: Built and run on a local solana-test-validator (measured Nov 6, 2026: five harnesses commit and reveal with their own keys; five bad transactions refused). Not yet deployed to devnet: the devnet and testnet RPC faucets are closed, so it needs about 1 devnet SOL from faucet.solana.com.* |
| SOL-003 | designed | SIMD amendment: packed proofs shared by many attestations (proof hash, slot and manifest hash). *Gap: Text not yet drafted into the attestations SIMD.* |
| SOL-004 | planned | Fair juror draws on Solana (commit-reveal randomness or a VRF), since slot data can be nudged |
| SOL-005 | built | Availability for off-chain refs on Solana through the challenge window. *Gap: The encoder: memo backend measured on a local validator; the IQ Labs backend tested with a stand-in SDK, not run on devnet.* |
<!-- /reqs:SOL -->

## ECON: economics

All of it lives in `packages/economics`, with tests that pin every vector, and renders at [harness.verafy.ai/economics](https://harness.verafy.ai/economics). Headline results (modeled, defaults: an H100 at $4.00 an hour, FlashProve's vendor-reported speed):

| | Per decision |
|---|---|
| Unpacked, five jurors each proving | $0.1043 |
| Atomized, packed, proven once | $0.0059 |
| Plus a screen settling half the atoms and 70% of checks (assumed) | $0.0039 |

Once packed, the fidelity checks cost more than the proofs (at 1,000 contracts: $3.26 against $1.29), so the next savings are in cheaper checks. A cascade from a screen to frontier models comes out about 4 times cheaper and 3 times faster on average than sending everything to a frontier jury (illustrative tier shares), but a hard question pays every tier.

<!-- reqs:ECON -->
| ID | Status | Requirement |
|---|---|---|
| ECON-001 | built | Proven block model: per proof, per block, per decision; warm-up; capacity; break-even; roles |
| ECON-002 | built | Proof packing, atomize, dedupe and a fast screen in the model |
| ECON-003 | built | Cascade model: average and typical cost and time across tiers, and the worst case |
| ECON-004 | built | Calculator page harness.verafy.ai/economics from the same functions |
| ECON-005 | built | Calculator: cascade tiers, reasoning length, screen savings and Solana costs on the economics page |
<!-- /reqs:ECON -->

## AGENT: plugins

Your agent is a client, never a juror: the MCP server has no vote, key or funds tool, contract text comes back as evidence, and live calls need a flag and a spend cap.

<!-- reqs:AGENT -->
| ID | Status | Requirement |
|---|---|---|
| AGENT-001 | built | Zero-dependency MCP server: eight tools; no vote, key or funds tool; live calls behind a flag and a spend cap |
| AGENT-002 | built | Integrations for Claude Code, Codex, Cursor, Gemini CLI, Goose, Hermes Agent, OpenClaw and any MCP client |
| AGENT-003 | planned (needs Rex) | Publish the MCP server to npm and submit to agent catalogs |
| AGENT-004 | planned | MCP tools for routing (verafy_route) and packing (verafy_pack) |
<!-- /reqs:AGENT -->

## DEPLOY: deploy and run anywhere

A harness is one long-running process: `verafy harness serve`. It registers with nodes, watches their mempools, and serves commit, reveal and proof. It refuses a commit on any contract no watched node holds, so nobody can spend its model budget from outside. Open commitments are written to disk before they leave, so a restart can still reveal.

`verafy up` gets that process running wherever the operator wants it: on this machine with Node or Docker, on a DigitalOcean or Hetzner server it creates, or on any cloud from a first-boot script. The model key goes to a mode-600 file or the server's user data; a cloud token is used once and never stored. Hardware profiles pick an open-weights model the machine can hold (modeled memory). `verafy testnet up` runs a whole testnet on one machine, scripted by default so it costs nothing, and can settle every ruling on a local Solana validator.

Releases ship as a source tarball, single-file binaries, a container image and an install script, all from one workflow on a version tag.

<!-- reqs:DEPLOY -->
| ID | Status | Requirement |
|---|---|---|
| DEPLOY-001 | built | verafy harness serve: one harness daemon configured by VERAFY_* variables, an env file or a config file; one id and key per data directory |
| DEPLOY-002 | built | verafy up: ask a few questions, show the plan with keys masked, then run locally (Node), in Docker, on DigitalOcean or Hetzner, or print user data for any cloud |
| DEPLOY-003 | partial | Cloud clients for DigitalOcean and Hetzner, and a first-boot script that installs, hardens and runs the daemon as a service. *Gap: Tested against fake APIs; no real server has been created yet (needs an operator token).* |
| DEPLOY-004 | built | Hardware profiles: which open-weights model a machine can hold, by modeled memory, and its router tier |
| DEPLOY-005 | partial | Container image, compose file, and one-click Render and DigitalOcean App Platform buttons. *Gap: The image has not been built here (no Docker daemon); it builds and publishes on the first tagged release.* |
| DEPLOY-006 | partial | Releases: source tarball, single-file binaries for Linux, macOS and Windows, a GHCR image, checksums, and install.sh. *Gap: The workflow has not run yet; it runs on the first pushed version tag.* |
| DEPLOY-007 | built | verafy testnet: a local testnet on one machine (a daemon per model family, juries over HTTP, sealed blocks), scripted or live, with optional Solana settlement |
| DEPLOY-008 | built | verafy up --ui: the launcher as a page on 127.0.0.1, with a one-time token in its URL |
| DEPLOY-009 | built | Launch page on harness.verafy.ai: pick a model and a target, get the command, the user data or a button |
| DEPLOY-010 | planned (needs Rex) | Hosted harnesses run by Verafy for people who do not want to operate one. *Gap: Needs Rex: billing, servers and terms.* |
| DEPLOY-011 | planned | A desktop app (installer with its own window) wrapping verafy up and the daemon |
<!-- /reqs:DEPLOY -->

## SITE: sites and docs

<!-- reqs:SITE -->
| ID | Status | Requirement |
|---|---|---|
| SITE-001 | built | harness.verafy.ai: landing, run, testnet, coin agnostic, economics |
| SITE-002 | built | Versioned spec with stable requirement IDs, a changelog and a generated scorecard |
| SITE-003 | built | Spec page and release-notes blog on harness.verafy.ai |
| SITE-004 | built | Learn: one page per concept, from Actually Smart Contracts to the Banker, each with its status and related concepts |
| SITE-005 | built | Machine-readable site: llms.txt and llms-full.txt, sitemap.xml, robots.txt, canonical URLs, Open Graph and JSON-LD on every page |
<!-- /reqs:SITE -->

## OPS: security and operations

<!-- reqs:OPS -->
| ID | Status | Requirement |
|---|---|---|
| OPS-001 | built | No secret in output: tests plant a key and check no tool or log prints it |
| OPS-002 | built | Context is evidence: injected instructions in context are returned as evidence and change nothing |
| OPS-003 | planned | Monitoring: per-harness health, spend, faults and alerts |
| OPS-004 | planned | Threat model document covering keys, queue, provers, screens and the banker |
<!-- /reqs:OPS -->

## EXT: collaborations and data

Muse (semantic version control) proposed two small experiments: targeted certification from semantic diffs, and poisoned evidence with signed provenance. Both fit the harness as pinned manifests, with no dependency in core.

<!-- reqs:EXT -->
| ID | Status | Requirement |
|---|---|---|
| EXT-001 | research | Muse experiment A: targeted certification from semantic diffs vs full-context review |
| EXT-002 | research | Muse experiment B: poisoned evidence with and without signed provenance manifests |
<!-- /reqs:EXT -->

## Decisions waiting on Rex

Requirements marked *needs Rex* in the tables, plus: the block-close defaults, prove-once for L2, packing defaults, allowed brief modes, the Banker's target token, treasury, chains, caps and screening, whether to rent a FlashProve machine, and whether to publish the MCP server. From v0.0.2-alpha: whether Verafy runs hosted harnesses (DEPLOY-010), devnet SOL for the Solana program (SOL-002), Jev access for the calibration run (ROUTE-007), turning on Banker execution with a funded scoped wallet, and the illustrative defaults: block close (10% warm-up, 1-hour maximum wait), the 600-second proof deadline, the ethics panel sizes, bar and screening fee, and the amendment escrow shares. From v0.0.3-alpha: every slashing price and grace allowance (CONS-005), the challenge window and challenge bond factor (CONS-006, JURY-006), whether the network allows bond-weighted draws (CONS-004), whether to offer a jury of one (CONS-007), the seats-per-operator defaults and operator bond (CONS-003), the beacon lookahead and whether to add drand (CONS-002), and where proving runs (CONS-008).
