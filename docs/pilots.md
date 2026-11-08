# Pilots

Stage 2 of the [Roadmap](/roadmap) is 10 to 50 pilots. This page names the Solana apps that earn the most, suggests one to three jury projects for each, and says how each one makes money, saves money, speeds things up or keeps customers. At the end is a ranked pilot list.

Every revenue figure is reported by DefiLlama, as read on November 7, 2026, or by Solana Compass's summary of DefiLlama for August 2026. None is measured by us. Value is described, not estimated: no pilot has run yet.

## Who earns on Solana

Solana apps earned about $143 million in August 2026, 38% of all blockchain app revenue. Six apps took about $119 million of it.

| App | What it is | Revenue, last 30 days | August 2026 |
|---|---|---|---|
| Pump | Memecoin launchpad and DEX | $26.48M | $58.2M |
| Collector Crypt | Physical trading cards, vaulted and tokenized | $13.46M | $9.7M |
| Axiom Pro | Trading terminal | $7.61M | $24M |
| Phantom | Wallet | $4.85M | $6.6M |
| Jupiter | Aggregator, perps, launchpad | $4.74M | $6.2M |
| ZINC, ORE, GODL | Gamified mining | $3.92M, $3.48M, $0.90M | |
| DEX Screener | Token tracker, paid token profiles | $2.44M | |
| fomo | Social trading app | $2.41M | $14.6M |
| Meteora | DEX, launch pools | $1.81M | |
| GMGN, Trojan, Photon | Trading bots and terminals | $0.96M, $0.86M, $0.46M | |
| GMTrade | Derivatives | $0.81M | |
| Raydium, Orca | DEXs and launchpads | $0.73M, $0.42M | |
| Kamino | Lending | $0.73M | |
| Geodnet | Positioning network (oracle) | $0.63M | |
| Sanctum | Liquid staking | $0.36M | |
| Bags | Launchpad | $0.29M | |
| MetaDAO | Futarchy raises and markets | $0.13M | |

Not in the revenue table but central to the pilots: Squads, where Solana treasuries live; Superteam, which runs bounties and grants; and Jito, Marinade and validators, for staking.

## Projects by app

### Squads: the partner, not a target

1. **Judiciary Signer as a member type in the Squads app.** Pick a policy template, pick models, attach.
   - *Makes money:* a premium tier for treasuries and launches.
   - *Satisfaction:* the "who can drain this" question gets a published answer.
2. **Policy review on existing treasuries.** Scan a multisig and report what a policy should cover: spending limits, config authority, thresholds the humans can reach alone.
   - *Saves money:* finds the paths that lose funds before they're used.

### Pump, Bags, LetsBonk, Raydium and Meteora launches

1. **Covenant Launch as a launch option.** The creator's supply goes into a policy wallet with a published release schedule. A "covenant" badge appears on the token page.
   - *Makes money:* a paid launch tier.
   - *Keeps customers:* buyers return to launchpads where they weren't dumped on.
2. **Insider check at launch.** A jury rules, from funding paths and timing, which early wallets are tied to the creator. Those wallets are bound by the covenant too.
   - *Saves money:* for buyers.
   - *Makes money:* for the launchpad, as a trust feature the others lack.
3. **Creator-fee disputes.** Rule on claims to creator rewards when a token's creator is disputed.
   - *Speed:* minutes instead of support tickets.

### Axiom, fomo, GMGN, Trojan and Photon trading apps

1. **Covenant and risk signal in the token view.** Show whether a token's supply is under a covenant, with the jury's insider ruling.
   - *Keeps customers:* fewer users lose money on rugs.
   - *Makes money:* a paid safety filter for copy trading and snipers.
2. **Copy-trading disputes.** For apps where users follow a trader: rule on whether a followed trader front-ran followers, against the app's stated rules.
   - *Satisfaction*, and a refund pool that pays only on a ruling.

### Jupiter

1. **DAO proposal review.** Before a JUP DAO vote, a jury checks the proposal against the DAO's stated rules and says what it changes for holders.
   - *Speed:* voters read a ruling, not a forum thread.
2. **Launchpad covenants.** Require Covenant Launch for launchpad projects.
   - *Keeps customers:* launchpad buyers.
3. **Perps edge cases.** Rule on disputed fills or liquidations during oracle outages, against the published rules.
   - *Saves money:* support and goodwill payouts decided case by case.

### Phantom

1. **Policy-checked signing for large transfers.** A user sets rules ("never send more than X to a new address in a day"), and a jury reviews any transaction that breaks them before it's signed.
   - *Saves money:* for users.
   - *Keeps customers:* a reason to stay with the wallet that prevented the loss.

### Collector Crypt: physical goods

1. **Condition and authenticity disputes.** Card photos, grading records and the buyer's claim go to a jury. Its ruling releases escrow or triggers the buyback.
   - *Speed* and *satisfaction*.
   - This is the asset-transfer design in [VIP-0015](../docs/proposals/VIP-0015-asset-transfer-records.md).
2. **Redemption proof.** When a vaulted card is redeemed and shipped, the jury compares vault photos with the delivery photo and its one-time code.
   - *Saves money:* fewer "never arrived" refunds.

### DEX Screener

1. **"Covenant verified" on paid token profiles.** A profile can show the covenant wallet, its policy and its release history, checked by the jury.
   - *Makes money:* a higher-priced verified profile.

### MetaDAO

1. **Milestone treasuries.** Raise proceeds sit in a policy wallet. Each release needs a jury ruling that the stated milestone was met, from the team's evidence.
   - *Keeps customers:* investors.
   - *Saves money:* funds stop leaving before delivery.

### Kamino and lending protocols

1. **Risk-parameter changes under a policy.** Parameter updates by the risk team go through a Judiciary Signer that checks them against the published risk framework.
   - *Saves money:* bad parameter pushes are caught before they execute.

### Sanctum, Marinade, Jito and validators

1. **Commission covenant.** A validator bonds a promise not to raise its commission. Code checks the vote account. The jury covers MEV commission and promises made in words. See [VIP-0016](../docs/proposals/VIP-0016-commission-covenant.md).
   - *Makes money:* for validators who can show they won't raise fees on stakers.
2. **Governance proposal review** for Jito improvement proposals and Solana SIMDs: what a proposal changes for stakers and users, against a stated policy. This could live in Ecosystem IQ, as a scanner.

### Geodnet

1. **Reward fraud review.** Stations flagged for spoofed positions go to a jury with the station's data and neighbors' data. It rules before rewards are clawed back.
   - *Saves money:* rewards paid to fraud.
   - *Satisfaction:* honest stations aren't clawed back by a heuristic alone.

### Superteam and grant programs

1. **Bounty acceptance.** Did a submission meet the spec? A ruling releases the bounty from a policy wallet.
   - *Speed:* reviewers stop being the bottleneck.

### Gamified mining (ZINC, ORE, GODL)

Weak fit. Rewards are set by code, and disputes are rare. Not a pilot.

## The ranked pilot list

Ranked by how well the jury fits the problem, and how reachable the team is. Not by revenue. Each pilot is written up as a Verafy App Pilot (VAP), with its done condition: [the VAP index](../docs/pilots/README.md).

| # | Pilot | App | Policy or VIP | First metric |
|---|---|---|---|---|
| 1 | Judiciary Signer in Squads | Squads | VIP-0010, VIP-0011 | Wallets attached |
| 2 | Covenant Launch on a mid-size launchpad | Bags or LetsBonk | Covenant Launch | Launches with a covenant; buyer retention against launches without |
| 3 | Milestone treasuries | MetaDAO | Treasury template plus milestone judgment | Releases ruled, disputes |
| 4 | Card condition disputes | Collector Crypt | VIP-0015 | Disputes resolved, time to resolve, agreement with human reviewers |
| 5 | Covenant badge on token profiles | DEX Screener | Covenant Launch | Paid verified profiles |
| 6 | Bounty acceptance | Superteam | Treasury template | Bounties released, appeals |
| 7 | DAO proposal review | Jupiter | Governance review | Proposals reviewed before votes |
| 8 | Insider check at launch | Pump | Covenant Launch plus launch rulings | Insider wallets found, false positives |
| 9 | Commission covenant | A validator or Sanctum LST | VIP-0016 | Stake under covenant |
| 10 | Policy review scanner for treasuries | Any Squads treasury | Setup check | Treasuries scanned, issues found |
| 11 | Covenant and risk signal in a trading app | Axiom, fomo or GMGN | Covenant Launch | Users who filter on it |
| 12 | Policy-checked signing | Phantom | Personal policy | Transfers stopped, users who keep it on |
| 13 | Reward fraud review | Geodnet | Fraud review | Cases ruled, agreement with their team |
| 14 | Risk-parameter changes | Kamino | Upgrade and parameter policy | Changes reviewed |
| 15 | Launchpad covenants | Jupiter launchpad, Meteora launch pools | Covenant Launch | Launches |

**Where to start:** Squads first, because every other wallet pilot rides on it. Then one launchpad for Covenant Launch, and MetaDAO for milestone treasuries. For each, Verafy builds the pilot alongside the team, then turns it into a template the next customer gets for free.

## Sources

- [DefiLlama, Solana revenue rankings](https://defillama.com/revenue/chain/solana), read November 7, 2026.
- [Solana Compass, Solana tops all blockchains for app revenue in August 2026](https://solanacompass.com/news/solana-tops-all-blockchains-for-app-revenue-in-august-2026-with-143m-capturing-38-of-global-total).
- [Solana Compass, Solana dApps generated $257M in Q2 2026 revenue](https://solanacompass.com/news/solana-dapps-generated-257m-in-q2-2026-revenue-leading-all-blockchains-for-ninth-straight-quarter).
