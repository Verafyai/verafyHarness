---
vip: '0012'
title: 'Harness registry: find harnesses on chain, and pay them'
status: Built
created: 2026-11-07
requirement: NET-001
depends: ['0005', '0010', '0013']
---

## Summary

Anyone can run a harness, register it on Solana, and be found and paid by whoever needs a jury. A registry program holds one account per harness: its key, operator, model and family, endpoint, price per seat, bond, and attestation (VIP-0013). Finding every harness is a single RPC call. Paying them comes from the case escrow, when the ruling is decided.

## Motivation

Today the pool is a file, `verafy.config.json`, and a judiciary signer names its jury by key at attach time (VIP-0010). That works for a first customer, whose jury you run. It doesn't let a stranger with a harness earn from it, or a stranger with a wallet find one.

Solana answers the same question for validators in two layers:
- **Gossip:** nodes announce their network addresses to each other. `getClusterNodes` lists them.
- **On chain:** each validator has a vote account, where its stake and commission live.

Harnesses need the on-chain half: an account anyone can list, with the facts a jury draw needs. They don't need their own gossip network; the endpoint in the account is enough to reach them.

## Proposal

### On chain: `verafy_registry`

Path: `packages/solana/registry`.

**The harness account.** It sits at the address `["harness", harness key]`, one per harness, and holds:

- the harness key, which signs commits and reveals;
- the operator key, which updates the account and withdraws;
- the model family and model id, plus the model commitment for proofs (VIP-0009);
- the endpoint, an HTTPS URL that takes cases;
- the price per seat, in lamports;
- the attestation hash (VIP-0013): zero when there's no attestation;
- its status, registered slot and retire slot;
- the bond: the SOL held in the account above rent.

**Instructions:**

1. **`register`**: the harness key and the operator both sign. The harness key signing proves the operator controls the key that will vote.
2. **`update`**: the operator changes the endpoint, price or attestation hash. The model can't change, because a new model is a new harness.
3. **`bond`**: anyone adds SOL to the bond.
4. **`retire`**: the operator stops new draws.
5. **`withdraw`**: the operator takes the bond out, only after an unbonding delay since retiring, so a harness can't pull its bond the moment it misbehaves.

### Payment: `verafy_judiciary` `pay`

1. `register` takes a fee on top of rent. The fee sits in the case account.
2. After the case is decided, `pay` splits the fee equally among the jurors whose reveal the ruling records.
3. Each share goes to the juror's key. Jurors who never revealed get nothing, and their share stays with the case for the payer to reclaim.

This is the minimum that gets a harness paid on chain. Fees in tokens other than SOL, and the split between jurors, auditors, storage and sealer (`payment.split` in a contract), come later.

### Discovery: `packages/solana/src/registry.js` and the daemon

- **`discoverHarnesses(rpc, programId)`**: lists every registered harness with `getProgramAccounts`, keeps the active ones, and returns harness cards the scheduler can draw from.
- **The daemon.** `verafy serve --discover` builds its pool from the registry instead of a file.

## What it doesn't do yet

- **Slashing on chain.** Faults are recorded and priced (VIP-0005), and the bond sits on chain. A program that takes a bond on proven fault evidence is the next step, and needs the fault formats fixed first.
- **Proof the endpoint is honest.** Registration proves who holds the key. It doesn't prove what runs behind the URL. That's what attestation (VIP-0013) and audits are for.

## Decisions for Rex

- **Unbonding delay.** The illustrative value is 2 epochs, about 4 days.
- **Minimum bond to register.** There's none in this version.
- **Fee asset.** Whether prices should move to USDC early.

## Tracking

Requirement NET-001.
