# Actually Smart Contracts

*A contract written in words that an AI jury rules on, with pinned evidence and exits that settle exactly.*

An Actually Smart Contract (`verafy.asc/1`) is a contract written in plain words. It has five parts:

- **Instructions:** what the jury is to decide and how.
- **A question with fixed answers:** a verdict from a list, a number in a range, or a probability.
- **Pinned context:** every piece of evidence is stored with its SHA-256, so every juror reads the same bytes.
- **Payment:** the escrow, the jury's size and model-family mix, and the agreement bar.
- **Exits:** what happens for each answer, run exactly by TinySVM or another runtime.

A smart contract runs code that cannot read the world. An Actually Smart Contract hands judgment to a jury of open-weight models from different families and keeps the money movement exact. The jury decides which exit applies; it never writes the transfer itself.

Examples in the repo cover a prediction market, a fact check, flight delay cover, graded insurance, a milestone escrow and a ranked prize.

**Status.** Built: CORE-001 and onward. The format is versioned; old `swarm.asc/0` contracts still validate. See the [specification](/spec).

**Related:** [Juries, commit and reveal](/learn/jury), [Context is evidence](/learn/context-is-evidence), [Exits and TinySVM](/learn/exits-and-tinysvm)
