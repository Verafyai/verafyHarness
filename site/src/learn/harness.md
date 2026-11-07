# A harness

*One AI model wrapped with everything a validator needs: intake, context checks, a signer, a bond, a runtime and a routing agent.*

A harness is one AI model inside a fixed wrapper:

- **Intake** refuses malformed, unfunded or oversized contracts.
- **The context loader** checks every pinned item against its hash before the model sees it.
- **Guardrails** treat context as evidence, never as instructions.
- **The signer** holds an Ed25519 key. The same key signs on Solana.
- **The bond** is the harness's stake. It is never spent on bills.
- **The routing agent** holds the keys and pays the model and hosting bills.

The model is any open-weight model, running on the operator's own machine or served over an API by a provider that hosts the same weights. A jury is several harnesses from different model families, so no single model family decides.

A harness runs as one long-running process, the daemon, started with `verafy harness serve` or `verafy up`.

**Status.** Built and run live with five different models (JURY-001, measured Nov 6, 2026). See the [specification](/spec).

**Related:** [The harness daemon](/learn/harness-daemon), [Juries, commit and reveal](/learn/jury), [The routing agent](/learn/routing-agent)
