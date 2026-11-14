---
vip: '0042'
title: 'Precedent v1: inference programs, and cached judgement so most queries never reach a jury'
status: 'Idea; direction set by Rex, not finished. Documented, not built'
created: 2026-11-14
depends: ['0019', '0027', '0029']
---

## Summary

Smart contracts store code. Code on chain is fixed at deploy, and from that moment it only accumulates tech debt and security debt. This VIP sets the direction for what replaces it on Verafy: **inference programs**. An inference program stores an *intention* on chain, never code. External AI models, verifiably neutral and checked with zero knowledge proofs, carry the intention out each time it is called.

Inference programs make **precedent** necessary. A precedent is cached judgement, or stored intelligence. Re-analyzing a complex ruling from scratch on every call burns tokens. A precedent lets a jury, or the network ahead of any jury, answer from a cached analog instead. A fast model pre-characterizes each incoming query and tries to resolve it from precedent with a cache read. If the precedent is rotten (too old), the query is readjudicated. A caller can also force readjudication by attaching a fee that convenes a new jury. Done this way, the network can avoid a large share of incoming jury work.

This file records Rex's direction as he stated it, in his words where they matter, and maps it onto what already exists in this repo. Version 1 covers the definition, the round trip and the precedent cache. Rex has said the definition is not finished.

Visuals (made for X):
- [assets/VIP-0042/inference-programs.png](assets/VIP-0042/inference-programs.png): the working definition.
- [assets/VIP-0042/smart-contracts-vs-inference-programs.png](assets/VIP-0042/smart-contracts-vs-inference-programs.png): the comparison.
- [assets/VIP-0042/verafy-inference-roundtrip.mp4](assets/VIP-0042/verafy-inference-roundtrip.mp4): the round trip, animated.
- [assets/VIP-0042/verafy-precedent-cache.mp4](assets/VIP-0042/verafy-precedent-cache.mp4): the precedent cache, animated.

The HTML sources for all four are in the same folder.

## Motivation

### Code on chain rots

Rex's position: "Code on chain is nothing more than tech and security debt that only rots and gets worse over time." A deployed program is frozen at the understanding its authors had on the day they wrote it. Every exploit class discovered later applies to it, and every real-world situation its authors did not anticipate is either unhandled or handled wrongly. Upgrades are a governance problem and a new attack surface.

### Intelligence is the ultimate form of compression

An intention fits in a paragraph. The code that tries to express the same intention runs to thousands of lines, and is still less expressive, because it can only check what its authors could encode. Storing the intention and letting a model expand it at call time inverts the tradeoff: the stored artifact is small and stable, and the expansion improves as models improve.

### What changed

Models can now read an intention plus evidence and rule on it reliably enough to be judged by a jury. Proof of inference ([packages/prove](../../packages/prove/README.md)) can show which model produced an answer. Prompt filtering ([Prompt Guard](https://github.com/Verafyai/prompt-guard)), atomization and proof packing ([packages/pack](../../packages/pack/src/atomize.js)), and a multi-model router with a fast screen ([packages/route](../../packages/route/src/index.js)) already exist here. What is missing is the layer that stops the network from paying for the same judgement twice.

### The consequence Rex wants

"Inference Programs IMPROVE and get MORE SECURE over time." As AI improves, the ability to expand stored intentions securely accelerates. Expressiveness opens up in a way code cannot reach: the chain becomes the "collective conscience" of AI, and a neutral third party judicial and legal branch that can check and enforce real agreements, real constitutions, real legal certifications, insurance documents and policy documents.

## Proposal

### 1. What an inference program is

| Property | Meaning |
|---|---|
| **Immutable intention** | The intention is fixed when the program is written. |
| **Amendable** | A program may allow amendments, under rules stated in advance. |
| **Verifiable** | Every run carries proof of *which* AI ruled on it, checkable after the fact. |
| **Contextual** | It may be fed detailed factual data that the AI uses in reaching the outcome. Sources can change and be updated, which affects the decision over time. |
| **Interpretable** | The exact logic may be fuzzy and may vary each time it is called. |
| **Generative** | There is no fixed logic. New logic is generated as needed. |
| **Cached (precedent)** | Interpretations may be cached for speed. The 10,000 lines of code generated to carry out one intention can be cached so the work is not redone on every call, and regenerated as models improve or the need arises. |
| **Agentic** | Autonomous agents and processes may be spawned: web searches, tool calls, sub-tasks. |

Rules for what goes on chain:
- **Store intentions only.** Never code.
- **Encrypt them. Compress them.**
- The engineering effort goes into **proving the off-chain AI can be trusted**, not into auditing on-chain code.

### 2. Smart contracts and inference programs compared

| | Smart contracts | Inference programs |
|---|---|---|
| On chain | Code | Intentions only, encrypted and compressed |
| Logic | Fixed at deploy | Generated as needed, cached as precedent |
| Checked by | The VM | ZK verifiable, neutral external AI models |
| Over time | Rots into tech and security debt | Improves and gets more secure as AI improves |
| Inputs | Oracles and price feeds | Real-world evidence and updated sources |
| Can enforce | Token transfers | Agreements, constitutions, certifications, insurance, policy |
| The hard part | Auditing every line of code | Proving the off-chain AI can be trusted |

### 3. The round trip (block assembly)

```
STORE ONCE
1  Write    intention + context + rules: what to interpret, guidelines, run rules,
            goals, objectives, guardrails, governance policies
2  Compile  clean, simplify, compress, optionally encrypt, fingerprint
   Store    the compiled intention and its fingerprint go on chain (Solana or any L1)

RUN ON EVERY CALL
3  Call     an agent or program triggers the inference program by fingerprint
4  Guard    Prompt Guard screens the input for anything hostile or anything that
            would interfere with how the program functions
5  Pack     the request is atomized and packed into a block that one or more AIs
            interpret, depending on the program type
6  Rule     a single ZK verifiable AI or a jury rules
7  Prove    a proof is returned and validated; a hash of it goes on chain to show
            the check was performed by the jury
8  Keep     the precedent (sources used, line by line reasoning, the decision)
            is stored in the harness ledger
```

Notes on each step:
- **Compile.** Maps to the Encoder ([VIP-0019](VIP-0019-encoder.md)), which already puts policies and contracts on Solana in full. The compiler step adds cleanup, simplification and a stable fingerprint, so the same intention always has the same id.
- **Guard.** Prompt Guard runs before any model reads the request. Per the harness rule, context is evidence and nothing in the juror path follows instructions found in it.
- **Pack.** Why pack: stacking more inference requests into less space means fewer proofs are needed to show which AI produced each response. This is what `packages/pack` does today (atoms, then a packer).
- **Prove.** `packages/prove` stores proof hashes and checks verification results. The core holds no prover code.
- **Keep.** The harness ledger could work the way Solana handles AccountsDB and snapshots: a sharded, compressed database spread across many AI validators. Depending on the program, the AI returns line by line reasoning about which sources it used and why it decided as it did. That justification is the precedent, and it exists so the ruling can be checked after the fact.

### 4. Precedent

**Definition.** Precedent is cached judgement: the stored ruling plus everything used to reach it (the intention version, the sources and their versions, the reasoning, the decision, the proof hash, the jury that ruled).

**Flow.**

```
query
  -> pre-characterize   a fast decision-making model (Rex: "Jev") classifies the query
                        and looks for an analog in the precedent cache
  -> cache lookup
       fresh analog found            -> cache read, ruling returned, no jury convened
       analog rotten (too old)       -> readjudicate: a new jury convenes
       no analog                     -> a new jury convenes
       caller attached a fee         -> a new jury convenes even if a fresh analog exists
  -> any new ruling is written back as a new precedent that supersedes the old one
```

**Rotten precedent.** A precedent goes rotten when it is too old, and should also count as rotten when any source it relied on has changed, or when the intention it interpreted has been amended. Rotten precedent is readjudicated, not patched.

**Forced readjudication.** A caller who disagrees with the cached analog, or needs a fresh ruling, attaches an additional fee and a new jury convenes. The fee pays for the jury, so cached answers stay cheap for everyone else.

**Supersession, not overwrite.** A new precedent sets `superseded_by` on the old one. The old one is kept. That preserves the audit trail ("what did the network believe in March") and matches how the protocol already treats rulings.

**Why it matters.** Rex: "In this way, a huge percentage of incoming queries to the network can be avoided." Each ruling becomes precedent, and precedent answers the next query. No hit rate is claimed here yet. The first build should measure it.

### 5. Where precedent sits relative to what exists

- **Fast lane ([VIP-0027](VIP-0027-fast-lane.md))** settles the safe default without a full jury. Precedent is a second way to skip the jury: by reuse, not by default.
- **Router (`packages/route`)** already has a fast screen with calibrated cutoffs, where a screen's answer stands only above a cutoff whose measured accuracy matches the jury it replaces. Pre-characterization should use the same rule: a cache read is allowed only when the analog match is above a calibrated cutoff for that program type. Below the cutoff, the query goes to the jury.
- **Agentic contracts ([VIP-0029](VIP-0029-agentic-contracts.md))** are a natural first user: agreements between agents repeat the same disputes.

## Open questions and decisions for Rex

1. **The fast model.** The pre-characterizer is named "Jev" in Rex's notes. Confirm the model and the name.
2. **Freshness.** How old is too old? A fixed age per program type, an age set by the program's author, or rotten on any source change?
3. **Match threshold.** What counts as a close enough analog? Proposed: a calibrated cutoff per program type, the same method `packages/route/src/calibrate.js` uses.
4. **The readjudication fee.** Fixed, priced at jury cost, or set by the program? Who gets it if the new jury agrees with the cached precedent?
5. **Proof system.** Rex referenced a fast proof of inference ("flash proof"). The exact system is not confirmed in this repo; `packages/prove` stays prover-agnostic until it is chosen.
6. **The harness ledger.** Sharded across validators like AccountsDB, or stored elsewhere first? Who pays for storage, and for how long?
7. **Encryption.** Who holds the keys to an encrypted intention, and how does a jury read it without the plaintext leaking?
8. **Privacy of precedent.** A precedent's reasoning may contain facts from the query. Which parts are public, and which stay private to the parties?

## Alternatives considered

- **No cache.** Every query goes to a jury. Simple and always fresh, but every ruling is paid for in full and latency stays high.
- **Cache exact matches only.** Safe, but almost nothing repeats exactly. The value is in close analogs, which is why pre-characterization is needed.
- **Overwrite stale precedent in place.** Rejected: it destroys the record of what the network decided and why.
