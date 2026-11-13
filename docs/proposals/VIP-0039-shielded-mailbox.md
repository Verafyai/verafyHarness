---
vip: '0039'
title: 'Shielded mailbox: a chain-agnostic privacy router for payments between agents, delivered by bonded couriers'
status: 'Idea; decision needed'
created: 2026-11-13
revised: 2026-11-13
depends: ['0012', '0033', '0036', '0040']
---

## Summary

The shielded mailbox lets a payer have someone paid, on any chain, without a public link between the two. Verafy does not build privacy cryptography. It runs a **privacy router**: an index of existing privacy systems (shielded pools, private L2s, privacy chains) behind one adapter interface. The router picks whichever backend fits the payment, and the payer does not need to care which one carries it.

The request travels inside the privacy system to a **courier**, a bonded agent that holds its own float. The courier pays the recipient on the destination chain and posts proof of the payout. Every courier is paid inside the private transfer, so nothing is reimbursed in public. Disputes use each backend's selective disclosure (a viewing key, a payment disclosure, a proof). The payer reveals one payment to the Verafy jury, the VIP-0040 reader panel checks the payout, and a courier that took the money and didn't pay is slashed.

Couriers are solvers in Verafy Intents (VIP-0040). A private payment is an intent whose request arrives through a privacy backend instead of a public account. Zcash Orchard is the reference backend and the first adapter; the flow below is written against it, and every other adapter implements the same interface.

## Motivation

### How we got here

Every Solana transfer is public: who paid, who was paid, how much, when. The first version of this VIP looked at fresh wallets and couriers that front money and get reimbursed. Both leak. A fresh wallet has to be funded, and the funding transfer links it. A courier reimbursed in public is linked by matching amount and timing, and it knows both ends.

What breaks the link is a large shielded pool with zero knowledge proofs, where a payment out could have come from any deposit in. Building and auditing that on Solana is a multi-year job with serious legal exposure.

### What changed

Zcash already runs that pool, and it now connects to Solana in practice:

- Orchard, Zcash's current shielded pool, launched in the June 2022 network upgrade and needs no trusted setup.
- A transaction between two shielded addresses keeps the addresses, the amount and the memo shielded from the public. A recipient learns the value and the memo, not the sender's address.
- Shielded notes carry an encrypted memo of up to 512 bytes. That is enough for a signed payment request.
- Viewing keys separate the right to see a payment from the right to spend it. They are disclosure built into the protocol.
- ZEC reaches Solana today through NEAR's OmniBridge and NEAR Intents. Bridged supply on Solana hit about 103,000 ZEC in late October 2026, and about 29% of ZEC supply sat in shielded pools.

The privacy layer exists. What is missing is an accountable way to turn a shielded request into a payout on another chain. Bonded couriers and Verafy juries do that.

## Proposal

### The privacy router

#### The index

Each backend is a registry entry (VIP-0012) with an adapter. The entry records what the backend actually hides, so the router can match a payment to a backend that protects what the payer cares about. Entries are added by proposal and each is reviewed before couriers may use it. The candidates below are listed by type; each one's live status, assets and limits are verified when its adapter is written, not assumed here.

| Backend type | Examples to evaluate | Typically hides | Request channel |
|---|---|---|---|
| Shielded pool on its own chain | Zcash Orchard (reference) | Sender, recipient, amount, memo | Encrypted memo in the note |
| Privacy chain | Monero; Namada; Penumbra | Sender, recipient, amount (varies) | Per-request subaddress plus an encrypted off-chain message, where there is no memo |
| Shielded pool on an EVM chain | Railgun; Privacy Pools | Link between deposit and withdrawal | Encrypted off-chain message bound to the commitment |
| Private L2 | Aztec | Sender, recipient, amount, contract state | Private note to the courier |
| Confidential amounts only | Solana Token-2022 confidential transfers | Amount, not parties | Not a mailbox on its own; usable for payouts |

Each entry declares:

| Field | Meaning |
|---|---|
| `hides` | Which of sender, recipient, amount, memo it hides from the public |
| `anonymitySet` | How the set is measured, and a live reading |
| `disclosure` | How one payment can be proven to a jury without revealing others |
| `channel` | Memo in the transfer, or an encrypted message the adapter binds to it |
| `assets` | What can enter |
| `exits` | Routes to other chains and assets (bridges, intents) |
| `finality` | Confirmation depth couriers wait for |
| `fees`, `latency` | Typical cost and time |
| `jurisdictions` | Where couriers may not use it |

#### The adapter interface

```
quoteDeposit(request)    -> { address or commitment, amount, fee, expiry }
encodeRequest(request)   -> bytes for the backend's channel
watch(viewKey)           -> stream of incoming requests for the courier
discloseOne(payment)     -> a proof for one payment, sealed to the jury
verifyDisclosure(proof)  -> { paidTo, amount, requestHash, confirmations }
```

The courier daemon and the payer client only call this interface. Adding a backend means writing an adapter and passing its test suite, with no change to couriers, disputes or payouts.

#### How the router chooses

1. Drop backends the payer excluded, that cannot carry the payer's asset, or that are barred where the courier operates.
2. Drop backends that do not hide what the payer asked to hide (by default sender and amount).
3. Prefer the largest live anonymity set for the size of payment, then lower fee, then lower latency.
4. Prefer a backend the payer already holds funds inside, because entering any privacy system leaves a public trace at the entry.
5. Pick a courier that accepts that backend and pays out on the destination chain, ranked by its solver record and recent volume.

The payer may pin a backend. Otherwise the choice is the router's, and the payer sees which one was used and why.

#### Chain agnostic on both ends

- **In:** any backend in the index.
- **Out:** any chain the VIP-0040 reader panel can read: Solana first, then EVM chains, Bitcoin and others as their readers ship.
- **Between:** couriers keep float on both sides and rebalance through whatever routes the backend's `exits` list (NEAR Intents, Maya, bridges), in amounts and at times unrelated to individual payouts.

### Reference backend: Zcash Orchard

#### Flow

1. **Find a courier.** Couriers list on the Verafy registry (VIP-0012) with a unified address (`u1...`), the destination chains and assets they pay, a fee schedule, standard payout sizes, and a bond on Solana (VIP-0033). The payer picks one, or lets its agent pick by the solver record.
2. **Send.** The payer sends shielded ZEC from its own shielded address to the courier's unified address. The memo (ZIP 302 format, at most 512 bytes) holds the request: destination chain, recipient address, asset, amount, deadline, a request id, and a signature with a one-time request key. The ZEC sent covers the payout plus the fee, so the courier is paid inside the shielded transfer. Nothing is reimbursed in public.
3. **Pay.** The courier pays the recipient from its own float on the destination chain, ideally to a one-time address (a stealth address on Solana, or a fresh address the recipient made for this payment, with a relayer paying the network fee so the address never needs funding). It posts a fill claim (VIP-0040, rung 1): request id hash, payout tx id, timestamp.
4. **Settle.** With no dispute the claim closes when its window ends. Nothing about the payer ever appears on Solana.
5. **Dispute.** If the payout never comes, the payer opens a challenge with a payment disclosure for its Zcash transaction (or an incoming viewing key scoped to that one note), sealed so only the drawn jury can read it. The jury checks the disclosed note paid the courier's address with that memo. The reader panel checks the destination chain for the payout. If there is no payout, the courier's bond pays the payer what the request asked for, plus costs.

#### What each party sees

| Party | Sees |
|---|---|
| Public, Zcash chain | That a shielded transaction happened; not who, how much, or the memo |
| Public, Solana | A courier paid an address an amount |
| Courier | The request and the amount received; not the payer's identity, unless the payer reuses a shielded address or identifies itself in the memo |
| Recipient | It was paid by a courier |
| Verafy jury | Only on a dispute, only the one disclosed payment |

#### What still leaks, and the rules that limit it

| Leak | Rule |
|---|---|
| Payout amount and time on Solana | Standard sizes (10, 50, 100, 500 USDC); couriers add random delay; larger payments split across sizes and couriers |
| A courier with few payers | The anonymity set is the courier's traffic. The site shows each courier's recent volume, and agents prefer high-volume couriers |
| The payer's money entering Zcash | Money shielded from a transparent address or a bridge leaves a public entry. Payers should hold shielded ZEC well before they use it; the mailbox never accepts transparent (`t1`) sends |
| The recipient spends to a known wallet | Out of scope; the recipient's own hygiene |
| Courier logs requests | A courier can't link a request to a payer's identity. Request keys are one-time; the bond covers leaking a disclosed request |
| Memo content | Only the fields above; the courier's software rejects memos with anything else |

This is far stronger than fresh wallets, and weaker than end-to-end shielded ZEC. When the recipient can take ZEC, the right answer is a plain shielded-to-shielded send with no courier at all. The mailbox is for paying someone who needs USDC or SOL on Solana.

#### Courier economics

Couriers keep inventory on both sides: shielded ZEC coming in, USDC or SOL going out. They rebalance through NEAR Intents, Maya or the red·bridge Zcash bridge when it ships, ideally in amounts and at times unrelated to individual payouts. Fees are the spread in the request. The bond must exceed a courier's largest open exposure; the registry caps a courier's open requests at its bond.

#### Compliance

Selective disclosure is native, which is the main reason to use Zcash rather than build a pool:

- **Viewing keys.** Payers and couriers can give an auditor, tax preparer or court a key that shows their own history and nobody else's.
- **Limits.** A cap per request and per day per courier.
- **No custody by Verafy.** Verafy never holds payer funds; couriers do, briefly, and are bonded.
- **Couriers are money transmitters in most jurisdictions.** A courier is an independent operator responsible for its own licensing. Verafy provides the registry, bonds and disputes. This needs a lawyer before mainnet. Nothing here is legal advice.

Mixer developers have been sanctioned and prosecuted (Tornado Cash, Samourai Wallet). Zcash itself is a long-running, openly developed protocol with built-in disclosure, which is a different legal footing, but the courier layer has to stand on its own.

#### Components to build

| Piece | Where |
|---|---|
| Privacy router: the index, the choice rules, the adapter interface | New package, `packages/privacy-router` |
| Adapter test suite every backend must pass (deposit, request round trip, watch, disclose one, verify) | `packages/privacy-router/test` |
| Zcash Orchard adapter, the reference | `packages/privacy-router/adapters/zcash` |
| Courier daemon: watches its unified address with an incoming viewing key, decrypts memos, validates requests, pays out, posts fill claims | New package, `packages/courier` |
| Memo format `verafy.mailbox/1` (fits in 512 bytes) | Spec in this VIP; codec in core |
| Courier listings and caps | Registry (VIP-0012) |
| Courier bonds and slashing | Agent bonds (VIP-0033) |
| Fill claims and reader panel checks | Intents (VIP-0040) |
| Payer client: builds the memo, sends shielded, keeps the disclosure for disputes | A wallet plugin, or an agent tool over a Zcash light client |

#### Memo `verafy.mailbox/1`

| Field | Bytes (approx.) |
|---|---|
| Version and type | 2 |
| Destination chain id | 2 |
| Asset id | 2 |
| Amount (minor units) | 8 |
| Recipient address (Solana) | 32 |
| Deadline (unix seconds) | 8 |
| Request id | 16 |
| One-time request public key | 32 |
| Signature over the above | 64 |
| Total | about 166, well inside 512 |

## Use cases

| Who | Payment |
|---|---|
| A poster on Tasks (VIP-0036) | Funds a bounty without linking the task to its treasury |
| An agent paying another agent for an API call or a dataset | Pays a fresh Solana address per call |
| A person paying a contractor | The contractor receives USDC; the payer's holdings stay private |
| A donor | Pays a public cause without revealing the donor's wallet |

## Edge cases

| Case | Rule |
|---|---|
| A backend breaks (a bug, a halt, a sanction) | Its registry entry is suspended; the router stops choosing it; open requests finish or refund through it |
| A backend's anonymity set collapses | The live reading drops it below the payment size it may carry |
| The courier does not support the payer's backend | The router only offers couriers that list it |
| A backend has no memo | The adapter binds an encrypted off-chain message to the transfer by hash; the hash is what a dispute proves |
| Courier receives ZEC and never pays | Payer discloses that payment; reader panel finds no payout; bond pays |
| Courier pays the wrong address or amount | Same dispute; jury compares the payout to the disclosed memo |
| Payer claims non-payment falsely | Panel finds the payout; challenge bond goes to the courier |
| Memo malformed or over a cap | Courier refunds the ZEC shielded to the payer's return address (required in the memo), minus a fixed fee |
| ZEC price moves between send and payout | The request names the payout in USDC; the courier's quote fixes the rate until the deadline |
| Zcash reorg | Couriers act only after the Zcash confirmation depth the listing states |
| Courier goes offline | Deadline passes; courier must refund or the payer disputes; bond pays |
| Recipient address sanctioned | Courier software screens recipients against public sanctions lists and refuses |
| Payer sends from a transparent address | Rejected by the courier and refunded; the mailbox is shielded only |

## Test cases

- [ ] The router drops a backend that does not hide what the payer asked to hide, or that cannot carry the asset
- [ ] Two eligible backends: the router picks the larger live anonymity set, then the lower fee, and records why
- [ ] A pinned backend is used even when another scores higher
- [ ] A new adapter that passes the adapter suite works with an unchanged courier daemon and dispute flow
- [ ] A disclosure from one backend cannot be replayed as a disclosure on another (the request hash binds the backend id)
- [ ] A memo round-trips through the `verafy.mailbox/1` codec and fits in 512 bytes
- [ ] The courier daemon finds and decrypts a request with its incoming viewing key on Zcash testnet
- [ ] A request with a bad signature is refused and refunded shielded
- [ ] A valid request produces a payout on Solana devnet and a fill claim with the request id hash
- [ ] No payout by the deadline, payer disputes with a payment disclosure: the jury verifies the note, the panel finds no payout, the bond pays the payer
- [ ] False dispute: the panel finds the payout; the challenger's bond goes to the courier
- [ ] A courier at its exposure cap cannot accept a new request
- [ ] The Solana side of a settled payment contains nothing derived from the payer's keys or Zcash addresses (property test over the courier's on-chain writes)
- [ ] A transparent-source send is refused

## Alternatives

- **Build a shielded pool on Solana.** Most integrated, most costly, most legal exposure. Rejected for now.
- **Token-2022 confidential transfers on Solana.** Hides amounts, not parties. Useful later for payout amounts; not a mailbox.
- **Blind-signed ecash mints run by bonded agents.** Simpler, but custodial, with a small anonymity set. Zcash's pool is far larger.
- **Use NEAR Intents' shielded ZEC routes directly.** They already move shielded ZEC to other assets. They lack bonded, jury-disputable couriers and a request format agents can use. Couriers can still rebalance through them.

## Decisions only Rex can make

- Which backends after Zcash get adapters first.
- Who may add a backend to the index: Verafy, a jury vote on a proposal, or any bonded proposer.
- Whether Verafy ships the mailbox at all, given courier licensing.
- Destination chains and assets at launch (Solana USDC only, or SOL too).
- Payout sizes and per-request caps.
- Whether Verafy runs the first courier itself (and takes on licensing) or only recruits independent operators.

## Done when

A courier on Zcash testnet and Solana devnet pays a request end to end, and a staged non-payment is disputed with a payment disclosure and slashed by a jury.

## Sources

- [Zcash: addresses, value pools, viewing keys](https://zcash.readthedocs.io/en/master/rtd_pages/addresses.html)
- [ZIP 224: Orchard shielded protocol](https://github-redirect.dependabot.com/ZcashFoundation/zips/blob/master/zip-0224.rst)
- [SwapKit: Zcash shielded and unified addresses, memo budgets](https://docs.swapkit.dev/spotlights/chain-specific-guides/zcash-shielded-and-unified-addresses)
- [Crypto Briefing: Zcash supply on Solana hits a record](https://cryptobriefing.com/zcash-supply-solana-record-103000-zec/)
- [Zcash forum: red·bridge](https://forum.zcashcommunity.com/t/red-bridge-is-preparing-for-launch-you-can-participate/55840)

## Tracking

No requirement or issue yet. Future work, not scheduled.
