# Slashing, with scripted models

Running a harness means posting a bond that can be taken for misbehavior. These examples show it end to end, with no model calls and no money. Every rate and amount is illustrative until Rex sets the network's schedule.

| File | What it shows |
|---|---|
| `walkthrough.mjs` | One process: a jury drawn from the beacon, a withheld reveal recorded and slashed, payouts held through a challenge window, then a challenge that overturns the ruling and redirects the held escrow. `--both` adds a juror that reveals a changed answer: a provable fault that takes 25% of its bond. |
| `held-delay-cover.json` | The flight-delay contract with `payment.challengeWindow: 6`, so its payouts wait six blocks. |

```sh
node examples/slashing/walkthrough.mjs
node examples/slashing/walkthrough.mjs --both

# The same faults across real harness processes on this machine:
node bin/verafy.js testnet up --misbehave h-llama-1:no-reveal,h-qwen-1:no-commit
node bin/verafy.js testnet up --misbehave h-llama-1:bad-reveal
node bin/verafy.js testnet up examples/slashing/held-delay-cover.json
```

`--misbehave` works only with scripted answers. The schedule is `DEFAULT_SLASHING` in `packages/core/src/slashing.js`; the design is [VIP-0005](../../docs/proposals/VIP-0005-fault-slashing.md).
