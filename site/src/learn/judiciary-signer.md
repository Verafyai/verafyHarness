# The Judiciary Signer

*A Squads member no person holds a key for. It votes only as a sealed jury ruling says.*

**What it is.** A program address that sits in a Squads multisig as a voter. It approves or rejects a proposal only when a ruling from its own jury, on that exact transaction, has cleared its bar and outlived its challenge window. Set the threshold so the humans can't pass anything without it, and the wallet's policy becomes enforceable.

**What's fixed when it's attached.** The policy hash, up to three models, the jury's keys, the bar, the challenge window and the escape delay. None of it can change. A new policy is a new signer, added by a config change the current signer must approve.

**How a ruling binds to a transaction.** Registering a proposal records `sha256` of the Squads transaction account. The ruling must carry `sha256("verafy-judiciary/1" || signer || proposal || that hash)` as its contract hash. A ruling on any other transaction, or on a changed one, is refused on chain.

**The escape hatch.** Optional. If a case waits the full delay with no ruling, the signer approves, so a dead jury can't trap funds. A rejected case never escapes.

**Status.** Built (SIGN-001). Measured end to end on a local validator against Squads v4 from mainnet, 30 of 30 checks. Not deployed yet. Design: [VIP-0010](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0010-judiciary-signer.md).

**Related:** [Policies](/learn/policies), [Model certification](/learn/model-certification), [The challenge window](/learn/challenge-window)
