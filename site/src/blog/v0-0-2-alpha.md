# Verafy Harness v0.0.2-alpha: run it anywhere

*Release notes, November 6, 2026. Tag [`v0.0.2-alpha`](https://github.com/Verafyai/verafyHarness/releases/tag/v0.0.2-alpha).*

v0.0.1-alpha wrote the spec down and scored it. This release closes the biggest gaps that scoring found, and makes a harness something anyone can launch: on a laptop, in Docker, on a cloud server, or as a whole testnet on one machine. It is still an alpha for a prototype. Nothing here is a running network, and there is no token.

The short version: **@@OVERALL@@ of the spec is built, weighted by importance, across @@COUNT@@ requirements**, up from 58% across 105.

@@SCORE_SVG@@

## What is in this release

### The harness daemon

A harness is now a long-running process: `verafy harness serve` (JURY-009). It registers with each node, signed with its own key. It watches their mempools and serves the routes a node calls when it is drawn: commit, reveal, and proof at L2.

Two details matter:
- **Nobody can spend its model budget from outside.** It refuses to commit on any contract that no node it watches holds.
- **A crash can't lose a commitment.** The vote and salt behind a commitment are written to disk before the commitment leaves the process, so a restarted daemon can still reveal.

It is configured entirely by `VERAFY_*` variables, so it is the same process everywhere. [How the daemon works](/learn/harness-daemon).

### Launch anywhere: `verafy up`

`verafy up` asks where and which model, shows the plan with keys masked, and runs it:
- on this machine with Node or Docker;
- on a DigitalOcean or Hetzner server it creates, whose first boot installs and hardens everything;
- on any other cloud, from a first-boot script it prints.

`verafy up --ui` asks the same questions as a page on your own machine. Hardware profiles suggest an open-weights model the machine can hold, by modeled memory, or a hosted model when nothing fits.

The new [Launch page](/launch) writes the command, script or one-click button for you, without ever asking for a key.

Releases now ship from one workflow on each version tag: a source tarball, single-file binaries for Linux, macOS and Windows, a container image on GitHub's registry, checksums, and an install script. The first run of that workflow is this tag, so the binaries and image appear when it is pushed.

### A testnet on one machine

`verafy testnet up` starts one harness daemon per model family, each its own process, and a local coordinator that does a node's job: draw each jury from the parent block hash, run commit and reveal over HTTP, rule, and seal a block. AI answers are scripted by default, so it costs nothing; `--live` uses real models. Measured on one machine on Nov 6, 2026: eight harnesses, three contracts, three blocks.

### Settling on Solana, for real

A new program, `verafy_ruling`, runs commit, reveal and the Ruling account on Solana with no validator changes (SOL-002). It is about 20 KB with no dependencies. Each harness signs its own commit and reveal on Solana with its harness key: both use Ed25519.

Measured on a local Solana test validator on Nov 6, 2026:
- **The happy path:** five harnesses ruled on the Senate market, committed and revealed on chain, and the program sealed NO, 5 of 5.
- **Five bad transactions, all refused:** a commit from a key with no seat, a reveal before its commit, a reveal of a different answer, a seal before every seat revealed, and a seal by someone other than the opener.

`verafy testnet up --solana` does this for every ruling. It is not on devnet yet: the devnet and testnet faucets no longer give SOL over RPC, so it needs about 1 devnet SOL from faucet.solana.com.

### Proof packing, end to end

Packing now runs as one pipeline (PACK-011): atomize, check fidelity with a panel spanning model families, route, pack, prove, verify, read and assemble. `verafy packed` runs it on contracts. Two contracts sharing one question become three unique questions in one proven request, proven once and verified.

The guardrails:
- a plan the panel does not rule FAITHFUL is never packed;
- a proof that does not verify, or a reply that mangles any slot, sends its contracts back to a normal jury.

To be precise about status: the prover is still the mock prover, which binds an answer to its request but is not a proof of inference. The chain's intake does not call the pipeline yet.

<img class="anim" src="/assets/proof-packing.gif" alt="Animation: six contracts become twelve small questions; a question shared by four contracts becomes one slot; nine unique questions pack into two 1,024-token requests proven once. The cost per decision falls from $0.1043 unpacked to $0.0059 atomized, modeled." width="1280" height="720" loading="lazy">

### A calibration set for fast screens

A fast screen such as Jev may settle a kind of question only where its accuracy is proven. This release adds the labeled set to prove it on: 1,000 atoms, 200 per kind (comparisons, deadlines, vote tallies, list membership, and questions the facts do not settle). The answers are known by construction, plus a runner for Jev, for any model as a screen, or for a simulated screen.

One finding from building it: under about 130 examples per kind, no screen can show a 97% Wilson lower bound even if it never errs, so 100 per kind was not enough. A Jev run waits on Jev access.

### The Banker, as a service

The Banker is now a deterministic deposit state machine (BANK-006 to 011), not an AI agent. In order: detect, classify, hold, quote, simulate, swap, sweep, record.

- **Tokens:** allowlisted by address, never by name. Unknown tokens are quarantined and never touched.
- **Quotes:** from real venues, checked against an independent reference price:
  - Jupiter on Solana. Measured Nov 6, 2026: 1 SOL quoted at 90.12 USDC against a reference of 90.08.
  - LI.FI for EVM chains and bridges.
- **Simulation:** the exact transaction is dry-run before anything is sent.
- **Ledger:** hash-chained and append-only.
- **Execution:** off by default, behind a scoped signer and a kill switch.
- **Service mode:** converting other people's money is disabled in code until a legal review.

It also reads model API balances and says when to top up and by how much. Automatic top-ups wait on providers: OpenRouter's crypto top-up API now returns 410 Gone.

### Learn, and a site machines can read

The new [Learn](/learn) section explains every concept, from Actually Smart Contracts to the Banker, one page each, with what is built and what is not. The site now publishes:
- [llms.txt](/llms.txt) and [llms-full.txt](/llms-full.txt), for agents;
- a sitemap;
- structured data on every page.

### Governance, rescored

The ethics gate and the seven-stage amendment process merged in both repos since v0.0.1-alpha, so governance moves from 25% to 80%. Panel sizes, bars, fees and escrow shares are still illustrative until Rex sets them.

## The architecture, as specified

@@ARCH_SVG@@

## What is built, area by area

@@AREA_TABLE@@

## What is next

The biggest gaps, by weight times what is missing:

@@GAPS@@

## Decisions waiting on Rex

- **Devnet SOL** for the Solana program, and **Jev access** for a calibration run.
- **Proving:** renting a FlashProve machine, and accepting the Llama 4 and DeepProve licenses.
- **The Banker:** turning on execution with a funded scoped wallet; the target token, treasury, chains and caps.
- **Hosted harnesses:** whether Verafy runs them for people.
- **The illustrative defaults:** block close (10% warm-up, 1-hour maximum wait), the 600-second proof deadline, the ethics panel sizes, bar and screening fee, and the amendment escrow shares.
- **TinySVM:** when it becomes the default runtime. **Helios:** whether to install it for Ethereum reads.

## Try it

```sh
git clone https://github.com/Verafyai/verafyHarness.git
cd verafyHarness
npm test                                  # every package, plus the spec check
npm run testnet                           # a testnet on this machine, scripted
node bin/verafy.js packed examples/market-resolution.json examples/packed/cloture.json --plans examples/packed/plans.json
node bin/verafy.js up --ui                # launch a harness
```
