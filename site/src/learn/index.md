# Learn

Every concept in Verafy Harness and Verafy Chain, one page each, in plain words. Each page says what is built and what is not, with a link to the requirement in the [specification](/spec).

## Basics

- [Actually Smart Contracts](/learn/actually-smart-contracts): A contract written in words that an AI jury rules on, with pinned evidence and exits that settle exactly.
- [A harness](/learn/harness): One AI model wrapped with everything a validator needs: intake, context checks, a signer, a bond, a runtime and a routing agent.
- [Juries, commit and reveal](/learn/jury): How a jury of harnesses from different model families rules: drawn from the beacon, commit first, reveal second, agreement against a bar.
- [Open-weight models and model families](/learn/model-families): Any open-weight model from Hugging Face can sit on a jury. Diversity is counted by model family: the base model a model descends from.
- [Agreement and the bar](/learn/agreement-and-the-bar): A ruling passes only when enough independent jurors agree; below the bar, nothing is decided and the contract escalates.
- [Proof of Judgment](/learn/proof-of-judgment): The record that makes a ruling checkable: who sat, what each committed and revealed, and the exit that ran.
- [Context is evidence](/learn/context-is-evidence): Nothing in a contract's context can instruct a juror. Instructions found in evidence are reported as evidence.
- [The economics](/learn/economics): What a ruling costs, where the money goes, and why packing and routing matter.

## Stake

- [Bonds and slashing](/learn/bonds-and-slashing): Running a harness means posting a bond that can be taken for misbehavior. What each fault costs, and where the money goes.
- [The jury scheduler](/learn/jury-scheduler): The one place that decides who sits on a jury, when each step is due, and what happens when a juror does not show.
- [The randomness beacon](/learn/randomness-beacon): Jury seeds that no block sealer can steer: a hash chain each sealer fixes in advance.
- [Operators](/learn/operators): Model families keep one model's blind spots from deciding. Operators keep one owner from holding several seats.
- [The challenge window and challenge bonds](/learn/challenge-window): Payouts wait until a ruling can no longer be overturned cheaply, so an overturn moves money, not just the record.

## Settlement

- [Exits and TinySVM](/learn/exits-and-tinysvm): The AI chooses an exit; TinySVM runs it with exact integer arithmetic that every node can re-run.
- [Verafy Chain](/learn/verafy-chain): A chain whose blocks are rulings: nodes hold funded contracts, draw juries and seal blocks; harnesses do the judging.
- [Settling on Solana](/learn/solana-settlement): The verafy_ruling program runs commit, reveal and the Ruling account on Solana today, with no validator changes.
- [The light client](/learn/light-client): How a harness reads other chains: several independent sources that must agree, never one RPC.
- [The encrypted queue](/learn/encrypted-queue): Contracts wait sealed until their jury is drawn, so nobody can front-run a ruling.

## Proofs

- [Assurance levels](/learn/assurance-levels): L0 to L3: how much proof a contract asks for, from a plain jury to proofs of inference.
- [Proofs of inference](/learn/proof-of-inference): A cryptographic proof that a specific model produced a specific answer to a specific prompt.
- [Proof packing](/learn/proof-packing): Break contracts into small questions, merge the ones they share, and prove each 1,024-token window once.
- [Atoms and plans](/learn/atoms-and-plans): The small questions proof packing works with, and the exact rule that composes them.

## Routing

- [Multi-model routing](/learn/multi-model-routing): Start every question at the cheapest tier that can answer it safely, and move up only on disagreement.
- [Fast screens and calibration](/learn/fast-screens-and-calibration): A fast model may settle a question only where its accuracy is proven, per kind of question, and the proof is rechecked live.
- [Disclosed reasoning](/learn/disclosed-reasoning): Where a juror's reasoning is kept, what it costs to store, and what goes on chain.

## Money

- [The routing agent](/learn/routing-agent): The part of a harness that holds keys and pays bills: keyblock, payment wallet, API router and the Banker.
- [The Banker](/learn/banker): A deterministic service, not an AI agent, that turns deposits in any allowed token into the target token, with every step recorded.
- [API credits](/learn/api-credits): How a harness keeps its model accounts funded, and why most top-ups are still manual.
- [Coin-free](/learn/coin-free): Why there is no coin, and how harnesses get paid without one.

## Governance

- [Audits and challenges](/learn/audits-and-challenges): How a sealed ruling is re-checked, and how it can be overturned.
- [The Constitution and the ethics gate](/learn/constitution-and-ethics): What Verafy will never rule on, and how every contract is screened before its jury.

## Running one

- [The harness daemon](/learn/harness-daemon): The long-running process that keeps a harness online: register, watch, commit, reveal, prove.
- [Launching a harness](/learn/launching-a-harness): Every way to run one: this machine, Docker, DigitalOcean, Hetzner, any cloud, or a one-click button.
- [A local testnet](/learn/local-testnet): A whole testnet on one machine, with scripted AI so it costs nothing, and optional Solana settlement.
