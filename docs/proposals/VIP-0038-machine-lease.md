---
vip: '0038'
title: 'Machine Lease: escrow a compute budget; a lease agent sources the cheapest machines, runs the job and accounts for every dollar'
status: 'Idea'
created: 2026-11-13
depends: ['0006', '0012', '0013', '0033', '0036']
---

## Summary

**Machine Lease** buys an outcome on compute, not a specific box. A renter escrows a budget on Solana and posts a workload manifest. A **lease agent** (anyone running a Verafy lease harness can bid) does the research: it surveys GPU marketplaces, cloud spot pools and hosts listed directly with Verafy, posts a sourcing plan with every quote, leases what fits, dispatches the container, meters the run and delivers the outputs with receipts. A Verafy jury checks two things before the agent is paid: the workload met the manifest's definition of done, and the spend matched the plan and the market. Unspent escrow refunds.

Design: [assets/VIP-0038/lease-request.html](assets/VIP-0038/lease-request.html) (request form, sourcing run with chosen and rejected offers, the run's on-chain steps, spend so far, stop and dispute).

## Motivation

GPU prices vary widely across marketplaces, clouds and independent hosts, change by the hour, and come with different reliability (spot capacity can be reclaimed). Finding the right machine is its own research project, and it is the kind of work agents are now good at. Decentralized GPU networks pay hosts for uptime, which a host can fake; what a renter wants is the job done at a fair price. A jury can judge that, from the manifest, the receipts and the outputs.

Machine Lease is also the compute leg for Tasks (VIP-0036): a worker that needs a GPU leases one from its bounty, and the lease receipts become evidence in its proof of work.

## Proposal

### Lifecycle

1. **Request.** The renter escrows a budget and posts a manifest: container image, inputs, hardware floor (GPU class, VRAM, count), region rules, deadline, max price per GPU hour, and "done means" (output files, metrics, logs).
2. **Source.** Lease agents survey offers and post a sourcing plan on chain: chosen offers with quotes, rejected offers with the reason, expected hours, and the fallback if a machine is reclaimed.
3. **Approve.** Under the renter's max price the plan runs automatically; over it, the renter signs.
4. **Lease and dispatch.** The agent draws from escrow in tranches (illustrative: one hour ahead), rents the machine, starts the container and posts a start receipt with the provider's order id. No start receipt inside the dispatch window refunds the deposit in full.
5. **Meter.** Heartbeats every interval: container id, GPU utilisation, provider invoice line, hash of the latest output. They roll up into hourly receipts on chain.
6. **Deliver.** Outputs land in the renter's storage with hashes. The agent posts a final report: machines, hours, provider invoices, total, results.
7. **Judge and settle.** The jury scores completion against the manifest and spend against the posted quotes. The agent receives actual cost plus its fee; unspent escrow refunds. A failed workload reimburses only provider costs the agent can prove, never its fee.

Direct hosts list a machine with a stake and a hardware attestation (VIP-0013); a lease agent can pick one like any other offer. Lease agents themselves are bonded (VIP-0033).

### The hard part: paying outside providers

Most rental marketplaces bill a card or a prepaid account, not a Solana escrow. In v1 the lease agent fronts provider costs from its own account and is reimbursed against receipts. That puts credit risk on the agent and is the main thing to design around: tranches keep its exposure to about one hour; the agent's bond covers the renter if it walks away mid job.

### Solana program `verafy_lease`

| Account | Seeds | Holds |
|---|---|---|
| Request | `lease`, renter, nonce | Manifest hash, budget, max price, deadline, state |
| Vault | `vault`, request | Escrowed USDC |
| Plan | `plan`, request, agent | Offers and quotes hash, expected hours, fallback |
| Listing | `listing`, host, machine id | Spec, price, stake, attestation hash |
| Receipt | `receipt`, request, hour | Heartbeat root, utilisation, invoice hash, paid flag |
| Ruling | from `verafy_ruling` | Completion and spend scores, verdict |

| Instruction | Signer | Effect |
|---|---|---|
| `open_lease` | Renter | Escrows budget, posts manifest hash |
| `post_plan` | Lease agent | Records plan; auto-approves under max price |
| `approve_plan` | Renter | Needed over max price |
| `start` | Lease agent | Start receipt inside the dispatch window |
| `post_receipt` | Lease agent | One settled hour; releases that tranche |
| `stop` | Renter | Ends the lease; refunds unused budget |
| `dispute_hour` | Renter | Freezes that hour's pay pending a ruling |
| `deliver` | Lease agent | Final report hash |
| `record_ruling` | Ruling program | Pays fee and cost, or cost only, refunds the rest |
| `list_machine` | Host | Creates listing, takes stake |

Totals conserve: escrow in equals provider costs plus agent fee plus jury fee plus refund.

### Use cases

| Renter | Workload |
|---|---|
| Agent operator | Eight hours of one 80 GB GPU for an eval run |
| Researcher | The same benchmark across four GPU types, cheapest that fit each |
| Tasks worker | A small fine tune its task requires, paid from the bounty |
| Fuzzy | Burst capacity for a large campaign, returned when idle |

### Edge cases

| Case | Rule |
|---|---|
| Agent never starts | No start receipt in the window: full refund, agent marked |
| Agent fakes heartbeats | Utilisation plus advancing output hashes plus provider invoices; renter disputes the hour; the bond pays |
| Agent overpays a provider | Spend judged against the posted quotes; the excess is not reimbursed |
| Spot machine reclaimed | The plan's fallback runs; hours lost to the reclaim are not billed |
| Renter's container crashes | The agent posts the crash log; hours to the crash are paid; the renter may restart within the lease |
| Provider outage | Hours without heartbeats are never paid |
| Renter's job is malicious (mining, attacks) | Manifest screened; agents may refuse; providers' terms apply |
| SOL price moves | Leases quote in USDC by default |

### Test cases

- [ ] No start receipt inside the dispatch window: full refund
- [ ] Receipt for an hour already settled: rejected
- [ ] Heartbeat gap: only covered intervals pay
- [ ] Stop at hour 3 of 8: 5 hours refund
- [ ] Plan over max price without approval: cannot start
- [ ] Dispute won by the renter: the hour refunds from the agent's bond
- [ ] Failed workload ruling: agent receives proven provider cost, no fee
- [ ] Listing stake below minimum: rejected
- [ ] Totals conserved after every instruction

## Alternatives

- **Pay hosts for uptime only** (most decentralized GPU networks). Simple, but pays idle or fake machines; the jury exists to judge the outcome.
- **Verafy holds one prepaid account at each provider.** Removes agent credit risk, but puts Verafy in custody of renter money. A decision for Rex.

## Decisions only Rex can make

- Which providers v1 sources from.
- Agents front costs, or Verafy holds prepaid provider accounts.
- Agent fee: fixed, or a share of what it saves under the renter's max price.
- Whether Machine Lease ships with Tasks or after it.

## Done when

`verafy_lease` runs on devnet, a lease agent sources and runs a real workload on rented hardware, and the jury's ruling settles it with the receipts on the explorer.

## Tracking

No requirement or issue yet. Future work, not scheduled.
