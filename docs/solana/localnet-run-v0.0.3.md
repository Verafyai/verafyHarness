# verafy_ruling v0.0.3 on a local validator: a withheld reveal no longer blocks a seal

**Measured** on a local `solana-test-validator`, November 7, 2026, with `node bin/verafy.js testnet up --solana --misbehave h-gemma-1:no-reveal examples/market-resolution.json`.

- Program: verafy_ruling 0.0.3 (21,256 bytes), deployed fresh to the local validator.
- Jury: five harnesses, one per model family (mistral, gemma, gpt-oss, deepseek, llama), seeded by the coordinator's beacon.
- `h-gemma-1` was set to withhold its reveal (a test-only switch, scripted answers only).
- Off chain: the ruling sealed NO; `h-gemma-1` was recorded as a `no-reveal` fault and slashed 5% of its 500 bond (25, an illustrative rate).
- On chain: the ruling account opened with a reveal window of 6 slots. Five seats committed, four revealed, and the seal waited out the deadline and then counted the four revealed seats: **sealed, NO, 4 of 5**, with one seat left unrevealed.

Before v0.0.3 the same seal failed with error 104 (`not all revealed`) and could never succeed. A seal before the deadline still fails with 104, and a ruling opened without windows behaves exactly as v0.0.2.

The program keypair is generated at build time and is not in git. Generate a new one before any devnet deploy.
