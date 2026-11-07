# The randomness beacon

*Jury seeds that no block sealer can steer.*

**The problem.** Seeding a jury with the parent block's hash lets whoever sealed that block steer the next jury. The sealer chooses what goes in the block, so it can try many versions and publish the one whose hash seats the jurors it wants. Each try costs one hash.

**The fix: a hash chain fixed in advance.** Each sealer registers an anchor: the last link of a hash chain it built from a secret. Every block it seals reveals the next link back toward the secret, and anyone can check that the reveal hashes to the previous link. The reveals were fixed the day the anchor was registered, long before any contract existed, so a sealer cannot pick a reveal to suit a jury.

The beacon value is mixed forward block by block: value = sha256(previous value + this block's reveal). It does not depend on anything else in the block, so changing a block's contents changes nothing. A contract admitted while the tip is at height *a* is drawn with the value at *a* + 1, a value that did not exist when the contract arrived.

**What is left.** A sealer can still withhold a reveal, which biases the beacon by one bit: reveal or not. Withholding is a `no-beacon-reveal` fault and is slashed. A threshold beacon such as drand removes even that, at the cost of a BLS dependency; that choice is Rex's.

**Status.** Built (CONS-002): the testnet and `verafy run` seed every jury from the beacon, and `verifyBeacon` checks every reveal against its anchor. Design: [VIP-0002](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0002-randomness-beacon.md).

**Related:** [The jury scheduler](/learn/jury-scheduler), [Bonds and slashing](/learn/bonds-and-slashing)
