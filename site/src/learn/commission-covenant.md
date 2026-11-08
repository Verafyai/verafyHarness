# The commission covenant

*A validator bonds its promise not to raise fees on stakers.*

**Code, where code can see.** A validator's commission is in its vote account, on chain. `verafy_covenant` holds the bond with a maximum commission and an end slot. Only the vote account's withdrawer can open one. If the commission goes over the maximum before the end, anyone can claim and the bond goes to the beneficiary named at open. If the promise holds to the end, the validator takes the bond back.

**A jury, where code can't.** Promises about MEV commission, or about notice before a change, go to a bond wallet with a Judiciary Signer under the `commission-covenant` policy.

**Status.** Built (SIGN-005). Measured on a local validator: a broken promise paid its bond out, and a kept one got its bond back. It pays one beneficiary account, not each staker pro rata. Design: [VIP-0016](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0016-commission-covenant.md).

**Related:** [Bonds and slashing](/learn/bonds-and-slashing), [Policies](/learn/policies)
