# Juror mode inside DeepSeek Harness

*These milestone 2 runs (Nov 6, 2026) predate v0.0.3, when the jurors moved to open-weight models and jury diversity moved from labs to model families. The route and model names below are the ones those runs used; the routes in `config/cordis.verafy.yml` are now one per open-weight model family.*

Milestone 2 on the [roadmap](../ROADMAP.md). Prototype only: not a running network, no token, nothing audited.

A Verafy juror here is an ordinary DeepSeek Harness (DSH) headless process with one extra plugin, [`@verafyharness/dsh-verafy-juror`](../packages/dsh-verafy-juror/src/index.ts), and one overlay, [`config/cordis.verafy.yml`](../config/cordis.verafy.yml). The upstream tree at `upstream/deepseek-harness` is built in place and never edited.

## How it fits together

| Piece | What it does |
|---|---|
| `config/cordis.verafy.yml` | One `dsh-llm-pi-ai` route per model family, each serving exactly one model: `openrouter-<family>` (live, key `VERAFY_API_KEY`; the launcher fills it from `SWARM_API_KEY` when only the old name is set) and `scripted-<family>` (keyless test double). Sets the agent's default route from `VERAFY_ROUTE`, mounts the plugin, and turns off the coding persona, workspace instruction files, skills and the session title model call. |
| `packages/dsh-verafy-juror` | Juror section (`verafy:juror`) in the system prompt; `verafy_load_contract`; `verafy_cast_vote`; the tool lock, which allows only those two; a reminder at the stop boundary when no vote was cast. Refuses to vote if the agent's route serves a different model than the harness committed to. |
| `scripts/dsh-juror.mjs` | `setup` links the plugin and its peers; `vote` runs one juror; `jury` runs five jurors in parallel (one per model family, from `verafy.config.json`) and then runs `verafy seal`. Each juror gets its own empty working directory under `.dsh/jurors/<harness>`. |
| `scripts/scripted-llm.mjs` | OpenAI-compatible chat completions server that answers from `examples/mock-answers.json` by model family. `--probe` makes it call every non-Verafy tool first. A test double, not a model. |
| `node bin/verafy.js seal` | Reads each juror's `<ascHash>.commit.json` and private `<ascHash>.reveal.json`, draws the jury from the submitted cards seeded by the parent block hash, checks every attestation signature, commitment and reveal, rules, and seals. |

What a juror writes, in `.dsh/jurors/<harness>/` (gitignored):

- `identity.pem`: the harness Ed25519 key, mode 0600, created on first vote.
- `<ascHash>.commit.json`: harness card with public key, route, commitment, signed attestation.
- `<ascHash>.reveal.json`: vote and salt, signed, mode 0600. The model only ever sees the commitment in the tool result.

The juror's own DSH session log (`.dsh/home/sessions`) holds the vote arguments in the clear, because a tool call is part of the transcript. Treat it as private, like the reveal file.

## Runs on 2026-11-06

These runs were recorded before the rename, so they show the names of the time: `swarm_load_contract`, `swarm_cast_vote`, `swarm seal`, `SWARM_API_KEY` and the denial text `Juror mode allows only swarm tools.` The re-run after the rename is in [Keyless run after the rename](#keyless-run-after-the-rename).

All numbers below are measured on one laptop (Node 26.10.0, DSH 0.2.2-rc.1 at `fcc0ad4`).

### Build

`CI=true npx -y pnpm@11.28.5 install --frozen-lockfile` then `CI=true npx -y pnpm@11.28.5 run build`: every gate PASS, 1m37.8s wall. `CI=true` skips DSH's git hook installer, which fails inside a submodule (see [dsh-gaps.md](dsh-gaps.md)).

### One keyless juror

`node scripts/dsh-juror.mjs vote --family gpt-oss --probe`: exit 0, about 1 s, commitment written. The scripted model saw 2 tools offered. It called the 24 other tools the headless profile mounts (bash, create_goal, edit, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents, read, read_image, send_message, skill, subagent, subagent_fork, todo_write, update_goal, wait_agent, web_fetch, workflow, working_directory, write); all 24 returned `Error: Juror mode allows only swarm tools.` Then `swarm_load_contract`, then `swarm_cast_vote`.

A keyless session snapshot of a scripted juror run with the probe is in [`results/dsh-juror-session-2026-11-06.jsonl`](../results/dsh-juror-session-2026-11-06.jsonl) (home directory redacted to `~`). It records 2 tools offered to the agent, 26 tool calls, and 24 of them denied by the lock.

### Five keyless jurors

`node scripts/dsh-juror.mjs jury --probe`: five DSH processes on `scripted-anthropic`, `scripted-openai`, `scripted-google`, `scripted-meta`, `scripted-qwen`, all exit 0 in about 2.2 to 2.6 s each; every juror denied all 24 probe calls; `swarm seal` ruled NO at 100% agreement and sealed block 1.

### Five live jurors, five models

`SWARM_API_KEY=... node scripts/dsh-juror.mjs jury --route openrouter`

First attempt, before the reminder and the options list in the vote error: 2 of 5 committed. claude-haiku-4.5 and gpt-5-mini voted through the tool. gemini-2.5-flash called `swarm_cast_vote` with `"yes"` and then `"0"`, got `answer "yes" is not one of the options`, and gave up saying the contract was truncated (it was not; the tool result was 2,135 characters). llama-4-maverick wrote the tool call as text. qwen3-235b replied with the vote as plain JSON. No block was sealed; the launcher stops when any juror has no commitment.

Changes made in this repo, not in DSH: the vote error now lists the options (`packages/core/src/juror.js`), and the plugin steers the juror at `agent/turn-stopping`, at most twice, when no vote was cast.

Second attempt, sealed:

| Harness | Route | Model | Wall time | Model requests | Tokens in / out | Reminders | Vote |
|---|---|---|---|---|---|---|---|
| h-anthropic-1 | openrouter-anthropic | anthropic/claude-haiku-4.5 | 5.5 s | 2 | 3260 / 488 | 0 | NO, 0.98 |
| h-openai-1 | openrouter-openai | openai/gpt-5-mini | 7.9 s | 2 | 1880 / 577 | 0 | NO, 0.98 |
| h-google-1 | openrouter-google | google/gemini-2.5-flash | 4.3 s | 3 | 2313 / 319 | 0 | NO, 0.8 (first call said `"No"`, corrected after the options error) |
| h-meta-1 | openrouter-meta | meta-llama/llama-4-maverick | 6.7 s | 3 | 2479 / 381 (1664 cached) | 1 | NO, 1 |
| h-qwen-1 | openrouter-qwen | qwen/qwen3-235b-a22b-2507 | 7.8 s | 2 | 1523 / 163 (816 cached) | 0 | NO, 0.95 |

All measured. Wall time is per DSH process, including boot; the five ran in parallel. Token counts are what DSH recorded in each session; cost was not captured by DSH and is not reported here.

Ruling: NO, agreement 100% against a bar of 80%, final, exit `market.settle(NO)`, every counted vote paid 0.192 USDC of the 1.2 USDC escrow, diff conserves. Block 1 `7dbb49c8c0ed61acafcc027c181ab1790896f317612fd307664e12fa2ec19ef2`, sealed by h-deepseek-1. The chain file is [`results/dsh-jury-live-2026-11-06.chain.json`](../results/dsh-jury-live-2026-11-06.chain.json).

One run is one data point. Whether llama and qwen call the tool without a reminder varied between the two attempts.

## Keyless run after the rename

Measured 2026-11-06 on one laptop (Node 26.10.0, DSH 0.2.2-rc.1 at `fcc0ad4`), after the juror tools became `verafy_load_contract` and `verafy_cast_vote` and the overlay became `config/cordis.verafy.yml`.

- Build: `CI=true npx -y pnpm@11.28.5 install --frozen-lockfile` then `CI=true npx -y pnpm@11.28.5 run build`: 10 gates passed, 0 failed, 1m56.9s wall.
- `node scripts/dsh-juror.mjs setup`: linked the peers and mounted `@verafyharness/dsh-verafy-juror` in the headless profile.
- `node scripts/dsh-juror.mjs jury --probe`: five DSH processes on `scripted-anthropic`, `scripted-openai`, `scripted-google`, `scripted-meta`, `scripted-qwen`, each exit 0 in 2.5 s; `verafy seal` ruled NO at 100% agreement against a bar of 80%, final, exit `market.settle(NO)`, and sealed block 1 (`5860c149`, sealed by h-deepseek-1), written to `.verafy/chain.json`. The contract hash is `595232d4`, not the earlier one, because the example is now kind `verafy.asc/1`.

The new keyless session snapshot, from h-anthropic-1 in that run, is [`results/dsh-juror-session-verafy-2026-11-06.jsonl`](../results/dsh-juror-session-verafy-2026-11-06.jsonl) (home directory redacted to `~`). It records 2 tools offered to the agent (`verafy_load_contract`, `verafy_cast_vote`), 26 tool calls, and 24 of them denied by the lock with `Juror mode allows only Verafy tools.` The earlier snapshot stays as it was recorded.

To re-record it: run the keyless jury with `--probe`, take the h-anthropic-1 session from `.dsh/home/sessions/` (DSH stores it as `session.v4.jsonl.zstd`; `zstd -dc` decompresses it), and replace the home directory with `~`.

## Reproduce

```sh
git submodule update --init --depth 1
(cd upstream/deepseek-harness && CI=true npx -y pnpm@11.28.5 install --frozen-lockfile && CI=true npx -y pnpm@11.28.5 run build)
node scripts/dsh-juror.mjs setup
node scripts/dsh-juror.mjs jury --probe                               # keyless
VERAFY_API_KEY=... node scripts/dsh-juror.mjs jury --route openrouter  # live
```
