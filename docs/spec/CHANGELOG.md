# Spec changelog

Versions follow semantic versioning with a pre-release tag. Requirement IDs never change meaning. See [VERAFY-SPEC.md](VERAFY-SPEC.md) for the rules.

## v0.0.5-alpha, November 8, 2026

ASC templates for agreements, funding and conduct: agentic contracts, super grants, hackathon grants, a DAO constitution and agent bonds. VIP-0029 to VIP-0033 are shipped, with what is still open named in each status. Scored 68% overall across 142 requirements (five new: SIGN-007 to SIGN-011).

**New in the spec**
- SIGN-007 agentic contracts, SIGN-008 super grants, SIGN-009 hackathon grants, SIGN-010 DAO constitution, SIGN-011 agent bonds, with VIP-0029 to VIP-0033.

**New in the code**
- `packages/core/src/agentic.js`: agentic contracts between two agents: signed terms and remedies, a signed hash-chained log, settlement by mutual release, acceptance, default or ruling, disputes as ASCs, settlement proofs the judiciary signer checks itself, and a two-of-three escrow check.
- `packages/core/src/grants.js`: super grants: a Request for Ideas, agent terms, base grants, response and outcome reviews, outcome tranches, refunds.
- `packages/core/src/hackathon.js`: hackathon grants: GitHub submissions pinned to a commit, graded council contracts, ranking, prizes.
- `packages/core/src/agentbond.js`: agent bonds: priced articles, reports by anyone with a reporter bond, violation contracts, slashes, release after the term.
- `packages/snapshot`: deterministic snapshots of a GitHub repository at a commit, which hackathon councils grade and checkers rebuild.
- `packages/solana/scripts/devnet-deploy.mjs`, and a live-cluster mode for the 30 judiciary checks (`--rpc`, `--payer`); rehearsed on a stand-in cluster, not yet run on devnet.
- `templates/prompts/`: a tailoring prompt for each template: paste it into an AI and it writes the program for your case.
- `packages/core/src/programlog.js`: signed logs for programs with many participants, ruling checks against contracts rebuilt from the log, and the entitlement payout check.
- `policy.js`: the `agentic-settlement` and `program-payout` rules; the `agentic-contract`, `super-grant`, `hackathon`, `dao-constitution` and `agent-bond` templates.
- MCP: `verafy_agentic_check`, `verafy_agentic_dispute`, `verafy_grant_ledger`, `verafy_hackathon_results` (twelve tools, all new ones read only).
- Demos: `scripts/agentic-demo.mjs`, `scripts/grant-demo.mjs`, `scripts/hackathon-demo.mjs`, `scripts/agentbond-demo.mjs`.

**Not yet**
- None of the five is on devnet.

## v0.0.4-alpha, November 7, 2026

The Judiciary Signer, the harness registry, attestation, bias profiles, the encoder, the commission covenant and asset transfer records. Every VIP from 0001 to 0019 is shipped, with anything still open named in its status. Scored 68% overall across 137 requirements (eight new: SIGN-001 to SIGN-006, NET-001, NET-002).

**New in the spec**
- SIGN and NET, two new areas, with design proposals VIP-0010 to VIP-0017 written before the code, and fifteen Verafy App Pilots (VAP-0001 to VAP-0015) in `docs/pilots`.

**Status**
- Built: SIGN-001 (Judiciary Signer), SIGN-002 (policies), SIGN-003 (model certification, none measured), NET-001 (registry, discovery, pay).
- Partial: NET-002 (attestation verification; no enclave run).
- Planned: SIGN-004 (asset transfer records), SIGN-005 (commission covenant).

**Measured**
- `verafy_judiciary` and `verafy_registry` on a local validator against the Squads v4 program dumped from mainnet: 30 of 30 checks (`results/judiciary-localnet-v0.0.4.json`).

**New in the code**
- `packages/solana/judiciary` and `packages/solana/registry`: two programs. The program ABI gains cross-program calls and allows 16 accounts.
- `packages/solana/src/`: `squads.js` (program addresses, Squads accounts and instructions, no dependencies), `judiciary.js`, `registry.js`.
- `packages/core/src/`: `policy.js`, `judiciary.js`, `certification.js`, `attestation.js`; jury rules gain `allowModels` and `attested`.
- `verafy discover` and `verafy harness register`; `discoverPool` in the deploy package.
- `packages/core/src/bias.js`: bias profiles, maps, least-shared-bias juries, unannounced probes for escrow and wallet cases (VIP-0018).
- `packages/core/src/assets.js`: listings, one-time delivery codes, delivery rulings, signed transfer, ownership and receipt records, and a localizer (VIP-0015).
- `packages/core/src/operators.js`: operator signatures checked on every draw (VIP-0003); proof records name their prover (VIP-0009).
- `packages/solana/covenant`: `verafy_covenant`, a validator's bonded commission promise (VIP-0016), with the `commission-covenant` policy template for promises code can't see.
- `packages/solana/src/encoder.js`: policies and contracts on chain, with a Memo backend and an IQ Labs Code-In backend (VIP-0019).
- Site: Judiciary Signer, Policies, Roadmap and Pilots pages, five Learn pages.

## v0.0.3-alpha, November 7, 2026

Stake, slashing and open-weight models. Scored 67% overall across 129 requirements (from 65% across 119; the ten new requirements start mostly built).

**Juries are open-weight models, counted by family.** A harness runs any open-weight model from Hugging Face. Jury diversity is counted by model family, the base model a model descends from, with `minFamilies` and `excludeFamilies`. Contracts and cards written with `minLabs`, `excludeLabs` and `lab` still validate and keep their hashes and signatures. The example pool, mock answers, DSH routes, profiles and launcher moved to open-weight models.

**New in the spec**
- CONS, a new area (CONS-001 to CONS-010), with design proposals VIP-0001 to VIP-0009 in `docs/proposals` and tracking issues #26 to #36.

**Status changes**
- Built: CONS-001 (jury scheduler), CONS-002 (beacon), CONS-004 (weighting), CONS-005 (slashing), CONS-006 (held payouts), CONS-007 (single-harness mode, behind policy), CONS-010 (stake economics), JURY-006 (challenge bonds).
- Partial: CONS-003 (operator cap built; signatures and operator bonds not), CONS-009 (verafy_ruling 0.0.3, local validator only).
- Designed: CONS-008 (prover placement).

**Changed by what the numbers showed**
- Missed seats are no longer priced as a share of the bond. At 1% of the bond per missed seat, an honest harness missing 1% of its seats would lose about 200 times its fees (modeled). They now cost a small fixed amount past a free allowance, doubling only in a streak.
- The beacon is a hash chain fixed at registration, not a fresh commitment each block, which a sealer could have chosen after seeing the contracts.

**New in the code**
- `packages/core/src/`: `family.js`, `scheduler.js`, `beacon.js`, `slashing.js`, `hold.js`; `drawOrder`, `seat`, `replaceSeats` and operator caps in `network.js`; `double-commit` and `bad-reveal` faults with signed evidence; held payouts in the runtime.
- The testnet coordinator runs every jury through the scheduler and beacon, replaces no-shows, slashes faults from posted bonds, and holds payouts; `--misbehave` for scripted runs.
- verafy_ruling 0.0.3: reveal and challenge windows.
- `stake()` in packages/economics and a stake section on the economics page; `examples/slashing/`.
- Six Learn pages: model families, operators, the jury scheduler, the randomness beacon, bonds and slashing, the challenge window.

## v0.0.2-alpha, November 6, 2026

Run it anywhere. Scored 65% overall across 119 requirements (from 58% across 105).

**New in the spec**
- DEPLOY, a new area: the daemon, `verafy up`, cloud clients, hardware profiles, the container and buttons, releases, the local testnet, the launcher page; hosted harnesses and a desktop app planned.
- BANK-013 (API credits), SITE-004 (Learn) and SITE-005 (llms.txt, sitemap, structured data).

**Status changes**
- Built: JURY-009 (daemon), PACK-006 (fidelity gate), BANK-006, 008, 010, 011, GOV-001 to 004 (merged from the governance work).
- Partial: PACK-011 (packing end to end in the harness, mock prover, not in chain intake), ROUTE-007 (calibration set and runner; no Jev run), SOL-002 (verafy_ruling on a local validator; not on devnet), BANK-007 (live quotes; execution untested on a funded wallet), BANK-009.

**New in the code**
- `packages/daemon`, `packages/deploy` (serve, up, clouds, user data, profiles, testnet), `packages/solana` (the verafy_ruling program and a zero-dependency client), `packages/banker` (BankerService, Jupiter and LI.FI venues, credits, advisor), `packages/pack/src/pipeline.js`, the calibration set and runner.
- Dockerfile, compose.yaml, render.yaml, .do/deploy.template.yaml, install.sh and the release workflow.

## v0.0.1-alpha, November 6, 2026

The first versioned spec, with a scoring pass.

**New in the spec**
- One spec for Verafy Harness and Verafy Chain, in 17 areas with stable requirement IDs, generated from [requirements.json](requirements.json).
- The scoring pass: `npm run score` checks every claim against the code, scores each area, and lists gaps by impact ([SCORECARD.md](SCORECARD.md)). `npm test` fails if a claim's check fails.
- Multi-model routing (ROUTE): a fast screen, tiered panels that escalate on disagreement, calibrated cutoffs, audits and shadow mode.
- Proof packing and the prompt compressor (PACK): atoms, dedupe, packing, briefs, fidelity checks.
- The Banker as a deterministic service (BANK-006 to BANK-011, [banker.md](banker.md)).
- Proving (PROVE): prove once while one model is provable, proofs after the reveal, finality on verification.
- Disclosed reasoning (COT), governance (GOV), settling on Solana (SOL), Muse experiments (EXT).

**New in the code with this version**
- `packages/route`: the router, the Jev screen adapter, calibration and audits (12 tests).
- `packages/economics`: `cascade()` for tiered routing, and reasoning length in the proven-block model.
- `scripts/score.mjs`: the scoring pass.
- `packages/prove` and `packages/core/src/proving.js` (merged alongside, PR #16): Prover and Verifier interfaces, proofs after the reveal, finality on verification, mock, DeepProve and FlashProve adapters tested against a stand-in. PROVE-001 to 003 move to built.

**Already in the code before this version, now specified**
- Core protocol, live juries, auditors and challenges, the routing agent's four blocks, the light client, TinySVM phase 1, batching and the encrypted queue, proof packing (`packages/pack`), economics, the MCP server and agent plugins.
