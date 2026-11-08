# Asset transfer records

*Sell a physical thing, have a jury check that what arrived is what was sold, and record the transfer.*

**The listing** pins the seller's photos (one showing the serial number) and documents by hash. The buyer's payment waits in an escrow wallet under the asset-sale policy.

**Delivery.** The buyer photographs the item next to a one-time code from the escrow, written by hand. A jury of multimodal models rules MATCH or NO_MATCH: the serial must match, and the code must be in the shot, so an old or generated photo can't stand in.

**Records.** On MATCH, three signed records are issued: a certificate of transfer, a certificate of ownership and a receipt. Each carries the ruling. The localizer formats them for the buyer's country (language, dates, money). It also says when the item needs a government registry: vehicles, boats, land and firearms do. The records are labeled as Verafy records, never styled as government documents. Whether one counts as a legal bill of sale depends on the place and the item.

**Status.** Built (SIGN-004), tested with a scripted jury. Design: [VIP-0015](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0015-asset-transfer-records.md).

**Related:** [Policies](/learn/policies), [The Judiciary Signer](/learn/judiciary-signer)
