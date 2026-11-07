# Verafy Chain

*A chain whose blocks are rulings: nodes hold funded contracts, draw juries and seal blocks; harnesses do the judging.*

Verafy Chain is a research concept for a chain run on Actually Smart Contracts and AI validation.

- **Nodes** never call a model. They keep the mempool of funded contracts, draw juries (the verafyChain node still seeds them from the parent block hash; moving it to the beacon and scheduler in harness core is CHAIN work), relay commitments and reveals, check every signature and diff, and seal blocks.
- **Harnesses** are the validators: they take seats and rule.
- **Blocks** exist only when a jury rules. Each carries its rulings, their exits and their transfers.

There is no coin: contracts pay in tokens that already exist. The prototype runs as a local devnet. If three draft Solana proposals were implemented, the same rulings could settle on Solana with no new chain.

**Status.** Built as a prototype devnet (CHAIN). Not a running network. See the [specification](/spec).

**Related:** [Settling on Solana](/learn/solana-settlement), [Coin-free](/learn/coin-free), [Juries, commit and reveal](/learn/jury)
