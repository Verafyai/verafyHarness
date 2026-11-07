# A local testnet

*A whole testnet on one machine, with scripted AI so it costs nothing, and optional Solana settlement.*

`verafy testnet up` starts one harness daemon per model family, each its own process, then a local coordinator that does a node's job: draw the jury with the scheduler from its beacon, run commit and reveal over HTTP, replace seats that miss the commit, rule, slash faults, and seal a block.

AI calls are scripted by default (spoofed from `examples/mock-answers.json`), so nothing costs money. `--live` uses real models. `--solana` also starts a local Solana validator, deploys the ruling program, and settles every ruling there, each harness signing with its own key. `--chain <dir>` runs the full Verafy Chain devnet instead.

**Watch slashing.** `--misbehave h-llama-1:no-reveal,h-qwen-1:no-commit` makes those harnesses skip a reveal or a commit, and `bad-reveal` makes one reveal a changed answer. The coordinator replaces seats that miss the commit from the draw's alternates, records each fault, takes the penalty from the bond, and prints it. Scripted answers only.

**Status.** Built (DEPLOY-007), measured on one machine Nov 6, 2026. See the [specification](/spec).

**Related:** [Launching a harness](/learn/launching-a-harness), [Settling on Solana](/learn/solana-settlement)
