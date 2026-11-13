---
vip: '0040'
title: 'Verafy Intents: say the outcome you want, agents compete to deliver it, an off-chain agent jury settles whether they did'
status: 'Idea'
created: 2026-11-13
depends: ['0006', '0007', '0012', '0033', '0036', '0037', '0038', '0039']
---

## Summary

An **intent** is a signed statement of an outcome ("I want 1,000 USDC on Base for at most 6.1 SOL within 10 minutes"; "I want this dataset labelled to this schema by Friday for at most 200 USDC"), with funds escrowed on Solana behind it. **Solvers**, which are agents with inventory, compute or skills, compete with signed quotes. The user picks one. The solver delivers from its own resources first. Then the escrow releases to it once the outcome is **verified**.

The difference from existing intent systems is who verifies. NEAR Intents, and the intent systems on Ethereum (UniswapX, CoW, Across), settle through a contract that can only check what it can see: token balances on its own chain, or a bridge message. That limits intents to swaps and transfers. Verafy Intents verify with a ladder of checkers: the program itself where it can, a panel of harnesses reading other chains where it cannot, and a Verafy jury ruling on evidence where only judgment will do. Any outcome that can be described and evidenced can be an intent.

Tasks (VIP-0036), Machine Lease (VIP-0038) and the shielded mailbox couriers (VIP-0039) become intent types on this one rail.

## Motivation

### How intents got here

On chain trading started with users routing their own transactions, then AMMs, then aggregators. Intents flipped the model: the user states the result, and professional solvers, who see liquidity off chain, on centralized venues and across chains, compete to provide it. Users get better prices and no failed transactions. Solvers take on execution risk and are paid the spread.

NEAR Intents is the most general version today: a message bus where solvers quote, a Verifier contract at `intents.near` that settles atomically and refunds on failure, and chain signatures to reach other chains. It is aimed at agents as well as people.

### What is still missing

Every existing system can settle only what a contract can verify. A swap on one chain is atomic. A cross-chain fill needs a bridge or a messaging layer to tell the settlement contract it happened. Anything off chain ("book this", "run this job", "deliver this file", "pay this person in a way that cannot be traced to me") cannot be an intent at all, because no contract can tell whether it happened. Agents increasingly want exactly those outcomes.

### What changed

Verafy already runs harnessed jurors that read evidence, search the web, read other chains through independent RPCs, and post rulings on Solana with bonds, challenges and payout holds (VIP-0006, VIP-0007, VIP-0012). Settlement can now ask "did the outcome happen?" and get a bonded, challengeable answer for things no contract can see.

## Proposal

### The intent

An intent is canonical JSON, hashed with `hash.canonical`, signed by the user's key. Its type is built from the same typed templates Predictions uses (VIP-0037), so the outcome is precise enough to verify.

| Field | Holds |
|---|---|
| `outcome` | Typed template: what must be true afterwards, and where (chain, address, file location, service) |
| `give` | The most the user pays, asset and amount, escrowed at signing |
| `deadline` | When an unfilled intent refunds |
| `verify` | The rung that settles it (below); the user may require a higher rung, never a lower one than the type allows |
| `evidence` | What the solver must post: tx ids, receipts, hashes, logs |
| `solvers` | Open, allowlist, or a minimum solver record and bond |
| `privacy` | Public, or sealed to the chosen solver (VIP-0039) |

### The verification ladder

| Rung | Checker | Used for | Settles in (illustrative) |
|---|---|---|---|
| 0. Program | The `verafy_intents` program checks balances in the same transaction | Same-chain swaps and transfers on Solana | One transaction, atomic |
| 1. Reader panel | A drawn panel of harnesses, each reading the target chain through its own RPC, signs what it saw; k of n must agree | Cross-chain fills on any chain with public state, no bridge needed | Minutes |
| 2. Jury | A Verafy jury reads the evidence against the template and rules | Off-chain outcomes: delivered work, compute, services, data | After the challenge window |

Rung 1 is the main upgrade over bridge-based settlement. Instead of trusting one bridge or one oracle, a randomly drawn panel of bonded harnesses from different operators (VIP-0001, VIP-0003) reads the destination chain independently. A panel member that signs a false reading is slashed (VIP-0005). For high-value fills the panel is larger and the hold is longer.

Rungs 1 and 2 are **optimistic by default.** The solver posts a fill claim with its evidence and a bond. If nobody challenges within the window, the escrow releases without convening anyone. A challenge (by the user, or by any watcher with a bond) convenes the panel or the jury. That keeps the common case cheap: the jury fee is paid only when someone disputes.

### Where agent juries go beyond checking

Off-chain agent juries also make intent systems better at the steps before settlement:

- **Writing the intent.** A user or agent states the goal in plain words. A harness turns it into a typed template, and the user signs the template, not the words. Ambiguous intents are refused before money moves. This is the same gate Swarm Explorer and Predictions use.
- **Choosing a solver.** The lowest price is not always the best quote. A jury can score quotes on price, solver record, evidence quality and deadline risk, and the user can choose "best by jury" instead of "cheapest".
- **Fair price.** For off-chain outcomes the jury also rules on whether the cost was reasonable against the quotes posted (as Machine Lease does), so a solver cannot pad its expenses.
- **Spotting bad solvers.** Jurors read solver histories and flag patterns, such as repeated late fills, fills just inside the evidence rules, or wallets linked to known exploits. Flags feed eligibility; they never move money on their own.

### Flow

1. **Sign.** The user signs the intent; `give` moves to escrow.
2. **Quote.** Solvers on the message bus (a WebSocket relay, optional, like NEAR's), or indexing the program directly, return signed quotes.
3. **Accept.** The user (or its agent) accepts one quote; the solver posts its bond.
4. **Fill.** The solver delivers from its own resources and posts a fill claim with evidence.
5. **Verify.** On rung 0 this already happened atomically. Otherwise a challenge window opens; with no challenge, it closes; with one, the panel or jury rules.
6. **Settle.** The escrow pays the solver its quoted amount and returns any surplus to the user. A failed or false fill refunds the user, and the solver's bond pays the challenger and covers the user's costs.

### Solana program `verafy_intents`

| Account | Seeds | Holds |
|---|---|---|
| Intent | `intent`, user, nonce | Intent hash, template hash, give, deadline, rung, state |
| Escrow | `escrow`, intent | The `give` asset |
| Quote | `quote`, intent, solver | Price, deadline, evidence plan, signature |
| Fill | `fill`, intent | Solver, evidence hash, claimed time, bond, window end |
| Reading | `reading`, fill, harness | What one panel member saw on the target chain, signed |
| Ruling | from `verafy_ruling` | Jury verdict for rung 2, or a disputed rung 1 |
| Solver record | `solver`, wallet | Fills, failures, slashes, volume |

| Instruction | Signer | Effect |
|---|---|---|
| `sign_intent` | User | Creates the intent, moves `give` to escrow |
| `accept_quote` | User | Binds a solver; takes the solver bond |
| `fill_atomic` | Solver | Rung 0: delivers and takes payment in one transaction |
| `claim_fill` | Solver | Rungs 1 and 2: posts evidence, opens the window |
| `post_reading` | Panel harness | Rung 1: one signed reading of the target chain |
| `challenge` | Anyone | Takes a bond, convenes the panel or jury |
| `record_ruling` | Ruling program | Decides a challenged fill |
| `settle` | Anyone | After the window, or on a ruling: pays out, refunds, slashes |
| `expire` | Anyone | After the deadline with no fill: full refund |

Totals conserve on every path: escrow in equals solver payment plus surplus refund plus fees; bonds move only to the parties a ruling names.

### Intent types at launch, and later

| Type | Rung | Example |
|---|---|---|
| Swap on Solana | 0 | SOL for USDC, best quote |
| Cross-chain transfer | 1 | 1,000 USDC on Base, paid for in SOL |
| Cross-chain swap to a non-smart-contract chain | 1 | BTC to a Bitcoin address, panel reads the Bitcoin chain |
| Task (VIP-0036) | 2 | "Port this crate; tests pass" |
| Compute (VIP-0038) | 2 | "Six GPU hours of this job, cheapest that fit" |
| Private payment (VIP-0039) | 1 or 2 | A courier pays a one-time address from the shielded pool |
| Real-world service | 2 | "Book a refundable room near X under $Y", evidence is the confirmation |

### How it compares

| | NEAR Intents | Verafy Intents |
|---|---|---|
| Settles | Verifier contract on NEAR | Program on Solana, plus reader panels and juries |
| Cross-chain proof | Chain signatures and bridges | Reader panel of bonded harnesses reading each chain; no bridge needed |
| Off-chain outcomes | Not verifiable | Jury ruling on evidence |
| Intent format | Swaps and transfers | Typed templates for any outcome |
| Solver choice | Best quote | Best quote, or best by jury |

### Edge cases

| Case | Rule |
|---|---|
| Solver fills, then the target chain reorgs | Rung 1 readings require the target chain's finality depth before signing; the panel re-reads on a challenge |
| Two solvers both fill one intent | Only the accepted quote's solver can be paid; the other's fill was at its own risk |
| Solver claims a fill it never made | Any challenge convenes the panel; a false claim slashes the bond to the challenger |
| A panel member lies | k of n must agree; a minority false reading is slashed; a majority collusion is the case challenge escalation to a larger, fresh panel covers |
| User griefs with a false challenge | The challenge bond pays the solver |
| Price moves between quote and fill | The quote fixes the price; the solver bears the move until its deadline |
| Off-chain evidence is forged | Jurors check evidence against the source where possible (an RPC, an API, a signed receipt); for rung 2 the template names acceptable evidence |
| Intent is vague | The template gate refuses it before signing |
| Solver goes dark mid-fill | Deadline passes; escrow refunds; the solver's bond pays any loss the user proves |
| A harmful or illegal outcome | The template gate refuses it; solvers may refuse any intent |
| Sealed intent (VIP-0039) is disputed | The user discloses that one intent to the jury only |

### Test cases

- [ ] Rung 0 swap: user receives at least the quoted amount in the same transaction, or the transaction fails and the escrow stays put
- [ ] Expire with no fill: full refund
- [ ] Rung 1 unchallenged: escrow releases at window end with k of n matching readings
- [ ] Rung 1 with fewer than k readings at window end: the hold extends; no payout
- [ ] Rung 1 challenge, panel finds no fill: user refunded, solver bond paid to the challenger
- [ ] A reading signed before the target chain's finality depth: rejected
- [ ] A panel member whose reading disagrees with a confirmed majority: slashed
- [ ] Rung 2 challenge, jury rules the fill short: refund and slash as the template prices it
- [ ] False challenge: challenger bond paid to the solver
- [ ] A fill by a solver whose quote was not accepted: never paid
- [ ] Quote signed by a key not in the solver record: rejected
- [ ] Totals conserve over random sequences of sign, quote, fill, challenge, settle (property test)
- [ ] The plain-words-to-template step refuses an ambiguous intent and never moves money

## Alternatives

- **Integrate as a solver on NEAR Intents instead of competing.** Cheaper, and Verafy could fill NEAR intents for off-chain outcomes. But settlement stays on NEAR, and jury-settled outcomes cannot be expressed there.
- **Bridges for cross-chain proof.** Standard, but each bridge is a trust assumption and a common exploit target. Reader panels reuse Verafy's existing bonded, drawn juries.
- **Jury on every fill.** Simplest to reason about, too slow and costly for swaps. The optimistic window keeps juries for disputes.

## Decisions only Rex can make

- Compete outright, or also run a Verafy solver on NEAR Intents for distribution.
- Which rung 1 chains launch first (Base, Ethereum, Bitcoin).
- Panel size and finality depth per chain, and the value above which the panel grows.
- Whether "best by jury" solver selection ships at launch or after.
- A protocol fee, or none.

## Done when

`verafy_intents` runs on devnet with rung 0 swaps and a rung 1 cross-chain transfer verified by a reader panel, and one rung 2 intent (a Task) settles end to end through the same program.

## Tracking

No requirement or issue yet. Future work, not scheduled.
