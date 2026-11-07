# Proof packing

*Break contracts into small questions, merge the ones they share, and prove each 1,024-token window once.*

Proving is expensive and FlashProve takes at most 1,024 tokens per request. Proof packing makes each proof count:

1. **Atomize.** Each contract becomes a plan: small yes-no, choice or number questions (atoms), each with only the facts that decide it, and an exact rule that turns the atoms' answers into the contract's outcome.
2. **Check fidelity.** A panel of models from different families rules whether the plan reaches the same outcome as the original question. Below its bar, the contract is not packed.
3. **Dedupe and pack.** Atoms shared by many contracts become one slot. Slots fill each window, in an order set by the block hash.
4. **Prove once, verify.** One prover proves each window; the proof is verified before any answer counts.
5. **Assemble.** A reply that mangles any slot fails its whole window, and those contracts go back to a normal jury.

Modeled cost per decision: $0.1043 unpacked, $0.0059 atomized and proven once.

**Status.** Built end to end in the harness with a mock prover (PACK-011, `verafy packed`). Chain intake does not use it yet. See the [specification](/spec).

**Related:** [Proofs of inference](/learn/proof-of-inference), [Atoms and plans](/learn/atoms-and-plans), [The economics](/learn/economics)
