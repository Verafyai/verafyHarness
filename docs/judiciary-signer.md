# Judiciary Signer

A member of your Squads multisig that no person holds a key for. It signs only what your wallet's policy allows, as a jury of AI models rules.

## How wallets got here

Crypto started with one key per wallet: whoever held the key held the money. Multisigs came next, so that no single stolen key could move funds. On Solana, Squads is where teams, DAOs and token projects keep their treasuries: several members, a threshold of approvals, and a time lock before anything executes.

## What multisigs still can't do

A multisig protects a treasury from an outsider. It doesn't protect anyone from the signers themselves. If enough of them agree, the money moves, whatever the wallet was for:

- A token team says it holds a small share, spreads the rest across wallets, and sells into its own buyers. Most meme coin launches end this way.
- A treasury set up for grants pays its own members.
- A program's upgrade key ships a change nobody reviewed.

The rules of these wallets are written in blog posts and promises. Nothing on chain reads them.

## What changed

Two things changed at once:

- **Models can read intent.** An AI model can read "this wallet releases the creator's share on a schedule, never to fresh wallets" and judge a transaction against it. It reads the decoded instructions, not the description someone typed.
- **A program can be the member.** Squads accepts a program address as a member. A program can vote only when its conditions are met, and there's no private key to steal or misuse.

Put those together and a wallet's rules can be enforced by a member nobody controls.

## What it does

1. **Write the policy.** Hard rules plus the wallet's intent: which programs it may call, how much may leave and to whom, the release schedule. Start from a template. See [Policies](/policies).
2. **Choose the models.** One to three: open-weight models, or closed models such as Claude that hold a [certification](/learn/model-certification) with measured attack results.
3. **Attach the signer.** `verafy_judiciary` fixes the policy hash, the models and the jury's keys on chain, and gives you its member address. Add it to the multisig as a voter, with a threshold the humans can't reach without it. The setup check refuses any multisig where they can.
4. **Each proposal becomes a case.** The jury rules APPROVE or REJECT on the decoded transaction, the rule report and the policy. Memos and descriptions are treated as untrusted text.
5. **The signer votes as the ruling says,** and only after the challenge window. A ruling from the wrong jury, on a different transaction, or inside its window is refused on chain.

## What you get

- **Rules buyers and members can check.** The policy hash sits on chain next to the multisig. Anyone can read what the wallet may do before trusting it.
- **No key to steal.** The member is a program address. It signs nothing outside the program's checks.
- **Exactly the transaction that was judged.** The ruling is bound to the bytes of the Squads transaction. Change one byte and the ruling no longer counts.
- **A way out if the jury fails.** An optional escape hatch approves a case that has waited a long, public delay with no ruling. A rejected case can never escape.
- **The jury gets paid on chain.** A fee rides with each case and is split among the jurors who voted.

## Measured

Tested end to end on a local validator against the real Squads v4 program, dumped from mainnet, on November 7, 2026: 30 of 30 checks pass. The checks cover:

- humans alone can't pass a proposal;
- a wrong jury or wrong case is refused;
- the challenge window holds;
- an approved transfer executes from the vault;
- a rejection blocks the escape hatch;
- the escape hatch waits its delay;
- jurors are paid once;
- harnesses register and are discovered;
- the encoder writes a policy on chain and reads it back;
- a commission covenant pays out when broken, and returns its bond when kept.

Results: [judiciary-localnet-v0.0.4.json](../results/judiciary-localnet-v0.0.4.json). Not yet deployed to devnet or mainnet.

## Devnet

The deploy and the same 30 checks run against any live cluster. Rehearsed on a local validator standing in for devnet (Squads v4 from a mainnet dump, no Verafy programs preloaded): the deploy script put all four programs up under their fixed ids for about 0.77 SOL, a second run skipped them, and the 30 checks passed in live mode twice in a row, about 1 SOL per run in 0.01 SOL units (measured; [rehearsal](../results/devnet-deploy-rehearsal.json)).

```
# 1. fund a payer with about 3 devnet SOL (https://faucet.solana.com)
solana-keygen new -o payer.json && solana address -k payer.json
# 2. deploy the four programs (checks the balance first, skips what is already there)
node packages/solana/scripts/devnet-deploy.mjs --payer payer.json --out results/devnet-deploy.json
# 3. run the 30 checks against devnet Squads v4
node packages/solana/scripts/judiciary-localnet.mjs --rpc https://api.devnet.solana.com --payer payer.json --out results/judiciary-devnet.json
```

The payer becomes the programs' upgrade authority.

## Try it

```
node packages/solana/scripts/judiciary-localnet.mjs --squads squads_v4.so
```

You dump the Squads program first with `solana program dump -u m SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads_v4.so`.

Design: [VIP-0010](../docs/proposals/VIP-0010-judiciary-signer.md). Policies: [VIP-0011](../docs/proposals/VIP-0011-policies.md). Where this is going: [Roadmap](/roadmap).
