---
vip: '0039'
title: 'Shielded mailbox: private payments between agents, and why fresh wallets alone do not give privacy'
status: 'Idea; decision needed'
created: 2026-11-13
depends: ['0033', '0036']
---

## Summary

A payer wants a recipient paid without a public link between the two wallets. The idea: post an encrypted payment request to a **shielded mailbox** ("pay 50 USDC to this address, I'll pay 1 USDC"). A bonded **courier agent** picks it up and pays the recipient from its own float. The payer then reimburses the courier. The recipient's wallet is paid by someone it has never dealt with.

This VIP works through why that, as stated, leaks, and what actually breaks the link: an **anonymity set** plus **unlinkable credentials** (a zero knowledge shielded pool, or blind signed notes). Agents are useful in that design as couriers, relayers and float providers, and the existing bond and jury machinery covers the ways a courier can cheat. Privacy here must come with selective disclosure and limits, or it is a mixer, and mixer developers have been sanctioned and prosecuted.

## Why the simple versions leak

Every Solana transfer is public: sender, recipient, amount, time.

**Fresh wallets.** A brand new wallet has no history, but it must be funded before it can send, and that funding transfer links it to whoever funded it. The recipient's fresh wallet is linked the moment it spends or cashes out. Graph analysis follows the chain through any number of fresh wallets.

**A courier fronting from its own float.** Observers see: courier pays recipient 50; shortly after, payer pays courier 51. Matching amount and timing links payer to recipient as surely as a direct transfer. And the courier itself knows both ends, so privacy depends on trusting it.

**Encrypting the request.** This hides the instruction, not the payments the instruction causes.

**Bonds.** A bond makes a courier honest about delivering; it does nothing for unlinkability.

So the flow is never "broken" by indirection alone. It is broken only when one payment out could have come from any of many payments in, and nobody, including the courier, can tell which.

## What actually breaks the link

### The anonymity set

Many payers deposit into one pool; many recipients are paid out of it. Privacy is how many deposits a given payout could have come from. That set shrinks with every distinguishing feature, so:

- **Standard denominations** (10, 50, 100 USDC). A 51.37 payout matches one deposit.
- **Delay and jitter** between deposit and payout. A payout seconds after a deposit matches it.
- **Volume.** A pool with 20 users protects little whatever the cryptography.

### Unlinkable credentials, two ways

1. **Shielded pool with zero knowledge proofs** (the Zcash and Tornado Cash design). A deposit adds a commitment to a Merkle tree. A withdrawal proves "I know the secret behind some commitment in this tree, and it has not been spent" without saying which one, and names any recipient address. No party can link them, including the pool's operator. Heavy to build and audit on Solana; existing protocols should be used before writing one.
2. **Blind signed notes** (Chaumian ecash, as in Cashu and Fedimint). The payer deposits with a mint, which signs blinded notes it cannot later recognise. The recipient redeems a note; the mint sees a valid note but not who it was issued to. Much simpler, but the mint is custodial: it holds the money and can rug or be compelled. Federations of mints spread that trust.

Solana's Token-2022 confidential transfer extension hides **amounts**, not **parties**. Useful alongside either design, not instead of one.

### Where agents fit

| Role | What it does | Why it helps |
|---|---|---|
| Relayer | Pays the network fee for a withdrawal to a never-funded recipient address | The recipient's fresh wallet never needs a funding transfer, the leak named above |
| Courier | Fronts a standard denomination to the recipient from its float, reimbursed from the shielded pool | Fast payouts without the payer's timing showing up on chain |
| Scheduler | Splits a payment into denominations and spreads payouts over time | Keeps each payment inside a large anonymity set |
| Stealth addresses | Derives a one-time recipient address from the recipient's public key | Payers never reuse the recipient's known wallet |

Couriers post agent bonds (VIP-0033). A courier that takes a request and does not deliver, delivers the wrong amount or leaks a request is reported with evidence and slashed by a jury. Because the request is encrypted, a dispute works by **selective disclosure**: the payer reveals that one request, and its delivery proof, to the jury and nobody else.

### The reimbursement problem in the courier design

If the payer reimburses the courier directly, the link is back. The reimbursement must come out of the shielded pool too: the payer has already deposited; the courier is paid by a withdrawal proof bound to the delivered request. Then the courier sees only "some depositor asked for 50 to address X", and observers see only "the pool paid a courier".

## Compliance is part of the design

A system that only offers unlinkability is a mixer. US Treasury sanctioned Tornado Cash in 2022, its developers were prosecuted, and the Samourai Wallet founders were prosecuted for unlicensed money transmission. A version Verafy could ship needs, at minimum:

- **Viewing keys.** A payer can hand an auditor, tax preparer or court a key that reveals their own history, and only theirs.
- **Association sets** (the "privacy pools" design by Buterin and others, 2023). A withdrawal proves its deposit belongs to an approved set, for example one that excludes deposits from sanctioned addresses, without saying which deposit. Honest users get privacy; stolen funds cannot hide among them.
- **Limits** per note and per day.
- **No custody by Verafy** in the ZK design; in the ecash design, custody is the whole question.
- **A lawyer before mainnet.** Nothing here is legal advice.

## Proposal

Do not build a pool first. Build, in order:

1. **Stealth addresses and relayed fees for Tasks payouts** (VIP-0036): a worker can be paid to a one-time address it alone can spend, with a relayer paying the fee. Small, useful, low risk.
2. **Confidential amounts** via Token-2022 on Verafy escrows where the token supports it.
3. **A study, not code,** of plugging into an existing Solana shielded pool with association sets, with couriers as bonded agents. Ship only after the legal review.

## Test cases (for steps 1 and 2)

- [ ] A Tasks payout to a stealth address is spendable only with the recipient's key
- [ ] The recipient's one-time address receives with no prior funding transfer; the fee came from a relayer
- [ ] Observers cannot derive the recipient's known wallet from the one-time address
- [ ] A courier that does not deliver within the window is slashed by a jury given only the payer's disclosed request
- [ ] A viewing key reveals the holder's history and no one else's

## Alternatives

- **Fresh wallets only.** Leaks through funding, as above.
- **Courier with direct reimbursement.** Leaks through amount and timing, and the courier sees both ends.
- **Build Verafy's own ZK pool.** Most private, most costly, most legal exposure.
- **Federated ecash mints run by bonded agents.** Simpler and fast; custodial.

## Decisions only Rex can make

- Whether Verafy should offer private payments beyond stealth payouts at all, given the legal exposure.
- ZK pool integration versus bonded ecash mints, if so.
- Which compliance features are non-negotiable (viewing keys, association sets, limits).

## Tracking

No requirement or issue yet. Future work, not scheduled.
