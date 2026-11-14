---
vip: '0043'
title: 'Shattering: a deposit broken into shrapnel, held by a bonded agent swarm, and reassembled by whoever holds the key'
status: 'Theoretical; legal review required before any build or public launch'
created: 2026-11-14
depends: ['0029', '0033', '0039', '0042']
---

## Summary

The following is a theoretical approach to privacy in a Verafy agent swarm.

A receiver wallet takes an amount (the running example is $100,000 in bitcoin) and calls an inference program, **Shatter**. The funds are broken into **shrapnel** and sent across a swarm of agent wallets, following a **shattering strategy** the caller supplies. Every agent that takes shrapnel first locks a **bond** worth more than what it holds, so the swarm cannot steal the funds without losing more than it gains. A sealed commitment goes on chain, naming no wallet, and an **assembly key** is returned to the originator.

The funds then rest in the swarm. They are not gone and not owned by any agent: they are held under bond, and the slashing mechanism acts as insurance. The assembly key, together with the encrypted strategy metadata, can be **handed to another wallet**. The key is a bearer key: any wallet holding it can call assemble on its own, with nothing else required, and the funds are paid to that wallet or wherever it directs them. On a valid trigger, proven with a zero-knowledge proof of the key, the swarm releases the shrapnel to the destination on schedule. An agent that fails to deliver is slashed automatically, and its bond pays the owner.

Animation: [assets/VIP-0043/verafy-shattering.mp4](assets/VIP-0043/verafy-shattering.mp4) (source: `shatter.html` in the same folder).

Comparison with the Zcash shielded pool: [assets/VIP-0043/zcash-vs-shattering.png](assets/VIP-0043/zcash-vs-shattering.png).

Blog post: [Shattering: A Theoretical Approach to Privacy in a Verafy Agent Swarm](https://blog.verafy.ai/articles/20261114-shattering).

## Motivation

[VIP-0039](VIP-0039-shielded-mailbox.md) routes a payment privately from A to B. It does not cover funds that need to **rest** privately, or move under a **condition** (an estate opening, a contract milestone, a dead man's switch), or change hands **without moving on chain**. Shattering covers those cases with the pieces Verafy already has: inference programs ([VIP-0042](VIP-0042-precedent.md)), agent bonds and jury slashing ([VIP-0033](VIP-0033-agent-bonds.md)), and agentic contracts ([VIP-0029](VIP-0029-agentic-contracts.md)).

Use cases, in the order we would lead with them:
- **Inheritance and dead man's switch.** Funds rest in the swarm; an inference program judges the trigger; the key holder's heirs reassemble.
- **Escrow and milestones.** Reassembly fires when a jury rules that a milestone was met.
- **Treasury security.** No single key, wallet or server ever holds the whole amount.
- **Private holding.** The deposit cannot be read off the chain while it rests or when it moves.

## Proposal

### 1. Shatter

```
receiver wallet --(amount, strategy)--> Shatter (inference program)
   1  compile and check the strategy (section 3)
   2  break the amount into shrapnel per the strategy
   3  assign each piece of shrapnel to a bonded agent; the agent locks its bond first
   4  send the shrapnel on the strategy's schedule
   5  write a sealed commitment on chain; return the assembly key to the receiver
```

Outputs:
1. **A sealed commitment** proves the deposit was shattered, without naming the wallet that shattered it. The originator's address never goes on chain in the clear.
2. **An assembly key** goes to the originating wallet. Only a key holder can call the shrapnel back together.
3. **Encrypted strategy metadata**: the record of the shattering and its strategy, encrypted, compressed and stored. It is readable only with the assembly key.

### 2. The key can move

The assembly key and its strategy metadata form a **bearer key**: a claim on the funds in the swarm that belongs to whoever holds it, like cash.

- **Any holder can assemble.** A wallet holding the key calls assemble with only the key. No approval from the originating wallet or any earlier holder is needed, and no earlier holder chooses where the funds go.
- **The caller is paid by default.** Reassembled funds go to the calling wallet unless the caller directs them elsewhere in the same call.
- **The key can be passed on any number of times.** Each handoff happens off chain, so the funds never move while the key changes hands.

**Front-running protection.** The assemble call is visible before it executes. If it carried the key, or a proof that did not commit to where the funds go, anyone watching could copy the call with their own wallet as the destination and take the funds. So the zero-knowledge proof proves two statements together: "I hold a valid shatter key" and "pay wallet W". Changing W invalidates the proof. W is chosen by the caller and bound into its own proof; it is not approved or named by anyone else.

Consequences to design for:
- **The key is the money.** Losing it loses the funds; stealing it steals them. Key custody needs the same care as a seed phrase. Options: split the key (k of n), or add a recovery trigger judged by an inference program.
- **Transfer is invisible on chain.** That is the privacy feature, and it is also the property regulators will focus on (section 7).

### 3. The shattering strategy

The strategy is a program, not a setting. The caller can pass a declarative strategy, choose a named preset, or supply a **shattering algorithm**: code or an intention that the Shatter inference program expands into a concrete plan. Either way, the compiler turns it into an explicit plan (every piece of shrapnel, its size, its agent, its schedule) and checks that plan before any funds move.

**What a strategy can specify**

A strategy can route shrapnel through any number of networks on the way in, while it rests, and on the way out. Routing is where shattering and existing privacy systems combine rather than compete.

| Dimension | Options |
|---|---|
| Sizes | Fixed denominations from a standard set (for example 0.01, 0.1 and 1 BTC equivalents); a mix of denominations; how many pieces; how much of the total goes in each size |
| Timing | Spray window (all at once, or spread over hours or days); random delays drawn from a distribution; batching into rounds shared with other users' shatters; dwell time before any piece may move again |
| Routing | Any number of routings through any network, per piece: hops between agents, other chains, layer 2s, and privacy pools. For example, a piece can be shielded into the Zcash pool and later unshielded to a different wallet before it rests or before it reaches the destination. Cross-network legs go through the privacy router ([VIP-0039](VIP-0039-shielded-mailbox.md)) |
| Agents | Number of agents; agent selection (random, by bond size, by region or operator diversity, never more than N pieces per operator) |
| Reassembly | All at once or in parts; schedule; one destination or several; partial reassembly allowed or not |
| Triggers | Key holder, time locks, inference program conditions |
| Budget | Maximum fees, maximum agent fees, deadline |

**What a strategy cannot do: the privacy floor.** Some choices feel private and are the opposite. The compiler rejects or corrects them:

- **Unusual amounts are fingerprints.** A piece of 0.0731842 BTC is unique and traceable. Sizes must come from the standard denominations, so every piece looks like thousands of others.
- **Unusual behavior is a fingerprint.** Odd transaction formats, unusual fee patterns or distinctive timing make a user's shrapnel stand out from the swarm. Privacy comes from **uniformity**: every agent's transactions use the same formats, the same fee policy and the same batching rhythm, whether or not they are carrying shrapnel. Agents send cover traffic on that rhythm, so carrying shrapnel and not carrying it look the same. A strategy can vary *which* pieces move when; it cannot make a piece look different.
- **A lone shatter is easy to trace.** The anonymity set is the number of concurrent shatters with overlapping denominations and windows. The strategy must meet a minimum anonymity set; if the swarm is too quiet, the compiler widens the window or waits.
- **Every network leg has its own floor.** A route through the Zcash shielded pool is only as private as its entry and exit: shielding and unshielding the same amount close together in time links them. The compiler applies the same denomination and dwell rules to each leg, and counts the fees of every leg against the budget.
- **In equals out is a link.** Reassembling the exact amount right after shattering it links the two. The floor sets a minimum dwell time and encourages partial or staggered reassembly.

**What the compiler checks before funds move**
1. Every piece is covered by a bond (section 4) and the bonds are locked.
2. The plan meets the privacy floor.
3. The fees fit the budget. On Bitcoin's base layer every piece pays its own fee, so a large number of small pieces can cost a large share of the deposit; the compiler reports the cost and refuses plans where fees exceed the budget.
4. The strategy contains no instruction that would move funds anywhere other than swarm agents and the eventual destination. A strategy is evidence, not authority: Prompt Guard screens it, and the jury path follows no instructions found in it.

The strategy itself is encrypted and stored with the commitment, so the plan is known only to key holders, and an audit (by the key holder, or under legal process) can replay exactly what happened.

### 4. Bonds and slashing: how the swarm restores the value

- **Bond before custody.** An agent cannot receive shrapnel until it has locked a bond worth more than the shrapnel: 150% to start. The bond sits in a program-controlled account, not the agent's wallet.
- **Same asset where possible.** Bond BTC shrapnel with BTC. If the bond is in another asset, the program issues margin calls when prices move and slashes agents that do not top up.
- **Two slashable offenses, checked in code with no jury, because the chain shows both:**
  - **Unauthorized move.** Shrapnel leaves the agent's wallet in a way the strategy did not schedule. The bond is slashed on the spot and held for the owner.
  - **Failure to restore.** Reassembly is triggered and the shrapnel has not reached the destination by the deadline. The bond pays the destination directly: the full value plus a premium for the delay.
- **Disputes go to a Verafy jury.** An agent that claims it delivered (reorg, wrong amount, stuck transaction) appeals; the jury rules on the evidence. If the agent wins, its bond is restored and an insurance fund covers the owner in the meantime.
- **Slashed agents are out for good**, under [VIP-0033](VIP-0033-agent-bonds.md).
- **Agents are paid** for every hour their bond and shrapnel are locked. This is the real price of a shatter: a $100,000 deposit locks $150,000 of agent capital for as long as it rests.

The guarantee: the owner gets back at least the full value, in shrapnel or in the bonds that replace it, as long as the bonds stay above the value they cover.

### 5. Reassembly

```
trigger (key holder | time lock | inference condition)
   1  the calling wallet proves possession of the key with a zero-knowledge proof that
      also binds the payout wallet: the network learns the call is valid, not which deposit
   2  the payout wallet is the caller, unless the caller bound a different one into its proof
   3  the swarm releases shrapnel to the destination on the strategy's reassembly schedule
   4  missed deadlines are slashed automatically; bonds pay the destination
   5  agents are paid, bonds released, the commitment marked complete
```

### 6. What exists, and what does not

- **Exists in the harness:** juries, agent bonds and slashing (VIP-0033, alpha), Prompt Guard, inference program direction (VIP-0042).
- **Does not exist:** the Shatter program, the strategy compiler and privacy floor, the zero-knowledge key proof, cover traffic, the insurance fund, cross-chain custody of BTC by agents. The chain this runs on is not chosen; Bitcoin's base layer is likely too expensive per piece, so a low-fee chain or a Bitcoin layer 2 is the likely home.

### 7. Legal: required before any build or launch

This design must be reviewed by counsel before it is built or presented as a product. In the United States, the developers of Tornado Cash and Samourai Wallet were prosecuted, and in Tornado Cash's case convicted, on unlicensed money transmitting charges. Shattering has agents in a network the Foundation operates holding user funds, and a transferable bearer key that moves value without an on-chain transfer. Both make it look more like money transmission, not less.

Design choices that should be evaluated with counsel:
- **Proof of clean funds.** A Privacy Pools style association proof, in which a user shows their deposit is not from a flagged source without revealing which deposit is theirs. A Verafy jury could judge membership against an inference program rather than a fixed list.
- **Leading with the inheritance, escrow and treasury use cases**, which do not depend on hiding from anyone.

Nothing here is legal advice.

## Open questions and decisions for Rex

1. Which chain holds the shrapnel, and how BTC is represented there.
2. Bond ratio, premium for late delivery, and agent fee per hour locked.
3. The minimum anonymity set and minimum dwell time in the privacy floor.
4. Whether a shatter must carry a proof of clean funds.
5. Who runs the insurance fund for disputed slashes.
6. Counsel: who reviews this, and before which milestone.

## Alternatives considered

- **A conventional mixer.** Simpler, but offers no conditional triggers, no off-chain key transfer, and no restoration guarantee; and it carries the same legal exposure.
- **Unbonded agents.** Rejected: nothing stops an agent from keeping the shrapnel.
- **Arbitrary piece sizes chosen for "unpredictability".** Rejected: unique amounts are the easiest thing to trace.
