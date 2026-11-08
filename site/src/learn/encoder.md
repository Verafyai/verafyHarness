# The encoder

*Put the full text of a policy or contract on Solana, and read it back checked against its hash.*

**Why.** The chain stores hashes: the policy hash in a signer's config, the contract hash in a ruling. A hash proves which text was agreed. It doesn't make that text available to a buyer who wants to read the covenant.

**How.** The encoder writes the canonical JSON on chain, and a reader recomputes the hash and refuses anything that doesn't match. So storage can lose a text, but it can never pass off a different one.

**Backends.**
- **IQ Labs Code-In:** data in ordinary Solana transactions. The default until a data-availability SIMD exists.
- **Memo:** chunks in Memo program instructions, each linked to the one before. It uses no third-party program.

**Status.** Built (SOL-005). The Memo backend was measured on a local validator, writing and reading a 1.7 KB policy. The IQ Labs backend is tested with a stand-in SDK; it isn't on devnet yet. Design: [VIP-0019](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0019-encoder.md).

**Related:** [Policies](/learn/policies), [Solana settlement](/learn/solana-settlement)
