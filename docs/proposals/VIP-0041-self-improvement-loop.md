---
vip: '0041'
title: 'The self-improvement loop: a durable graph that scans, scores and fixes every Verafy project, with Looper as its dashboard'
status: 'Idea; decision needed. Documented, not built'
created: 2026-11-13
depends: ['0033', '0036']
---

## Summary

[docs/loop/](../loop/README.md) describes a loop that scans every Verafy site, sample, repository, blog post and VIP, scores each against a fixed bar, fixes what it can and implements the next VIP. This VIP specifies how to run that loop so that **every step is guaranteed to happen and every result can be audited**, rather than trusting one agent to work through a long checklist.

The design: the manifest expands into a fixed list of work items; each work item runs as a durable step in a workflow engine; the agent does the work inside the step, but the step completes only when a **deterministic verifier written in code** passes; judgment calls are scored by a **Verafy jury**, not by the agent that did the work; and a **coverage gate** fails the run if any work item has no recorded result. Results are written in **Looper's** loop format, so Looper is the dashboard.

Recommended engine: **Inngest**, on Vercel, in TypeScript. The alternatives are compared below. Modeled cost: about $250 to $500 a month with weekly full runs and nightly change-only runs, almost all of it model tokens.

## Motivation

### Why a plain agent loop is not enough

A single agent given the loop document will start well and drift. It runs out of context, summarizes its own progress, decides what is "done", and skips steps it judged unimportant. Nothing outside the model records which checks actually ran, so a run that silently skipped 30 pages looks the same as one that checked them all. Rex's concern, in his words, is the depth and seriousness of the agent; the fix is to stop relying on it for either.

### What changed

Durable execution engines (Temporal, Inngest, Trigger.dev, LangSmith Deployment, Vercel Workflow, Restate) now run long agent workflows as code: each step is persisted, retried and resumed after a crash. Agent SDKs (the Claude Agent SDK, OpenAI Agents SDK) can run inside a single step. Verafy's own jury can score subjective work with bonded, multi-provider jurors. Put together, the agent becomes a worker inside a structure it cannot skip.

## Proposal

### Architecture

```
cron (weekly full, nightly changed-only)
  -> loop/run.started
     -> expand manifest into work items  (pure code, no model)
     -> fan out: one durable run per work item
          step 1  gather      fetch the page / clone the repo / read the post   (code)
          step 2  check       run the deterministic checks                       (code)
          step 3  work        agent fixes what the checks failed                 (Claude Agent SDK)
          step 4  verify      rerun the checks against the result                (code)
          step 5  judge       jury scores the subjective points                  (Verafy jury)
          step 6  record      write the score with evidence                      (code)
     -> coverage gate: every work item has a recorded result, or the run fails
     -> report: scores before and after, PRs, blockers, learnings
     -> write Looper files: loop spec, status.json, runs/<id>.jsonl
```

The model is used in exactly two places: step 3, where it does the work, and step 5, where a jury scores it. Everything that decides whether a step happened, and whether it passed, is code.

### Work items

The expansion is deterministic. From `docs/loop/manifest.json`:

| Pass | One work item per | Approximate count (modeled) |
|---|---|---|
| 1. Website | page on each site (sitemap, then same-host crawl) | about 400 |
| 2. Docs and samples | project | about 20 |
| 3. Go-to-market | project | about 20 |
| 4. GitHub | project | about 20 |
| 5. Blog | project | about 20 |
| 6. VIPs | VIP to score, plus the one chosen to implement | about 41 |

Each work item has a stable id, `"<pass>:<project>:<target>"`, so every engine below can be idempotent on it.

### Verifiers (step 2 and step 4)

Each check in the loop document maps to code. The agent cannot pass a step whose verifier fails.

| Check | Verifier |
|---|---|
| Title, description, h1, canonical, lang | Parse the fetched HTML |
| Sitemap, robots, llms.txt | HTTP fetch and parse |
| Social cards | Parse OG and Twitter tags; fetch the image; check 1200x630 |
| Google Analytics | Load the page in headless Chrome; assert the GA4 request fires after consent and not before |
| Performance and accessibility | Lighthouse in headless Chrome (run off Vercel, on Modal or a small VPS) |
| Banned words, dashes, unlabelled numbers | Regex list from STYLE-GUIDE.md, shared with `lineage-api/evals/slop-phrases.txt` |
| Links | Fetch every link; 2xx or a known redirect |
| Demos | Playwright script per demo; must reach its result state with no console errors |
| Sample compliance | Run the sample against devnet; assert a ruling account exists and the Solana transaction succeeded; assert model calls were made (request log) |
| Repo | GitHub REST: README sections, logo file, About box, licence, checks on main |
| Blog | Post exists for each project; screenshots newer than the last deploy; links resolve |
| VIP | Front matter complete; status line agrees with the code (files named in the VIP exist; tests named pass) |

Checks that need judgment (landing page structure, teaching, "would this sentence be true on a competitor's site?") go to step 5.

### The jury (step 5)

Subjective points are scored by a Verafy jury: three to five jurors from different model families, the same rubric each time, the median per point, scores and juror ids recorded. The agent that did the work in step 3 is never on the panel. This is the same machinery as Tasks (VIP-0036), so the loop also dogfoods Verafy. For cost, the jury runs only on pages that changed or that failed a code check.

### State and evidence

- Every score is written to `docs/loop/scores/<run-date>/<project>.json` with each check, its points and its evidence (URL, file path, command output hash, transaction signature).
- Unchecked means zero, with the reason. A score is never estimated.
- The engine's own run history holds every step's input and output for the retention window of the plan chosen.

### Looper as the dashboard

The loop writes Looper's format, so no new dashboard is built:

- `loops/verafy-loop.md`: the loop spec, with front matter (`id`, `name`, `schedule`, `owner`, `kpis`, `okrs`) and the sections Looper reads, from this VIP and `docs/loop/README.md`.
- `status.json`: `enabled`, `last_run`, `result`, `next_run` and current KPIs.
- `runs/verafy-loop.jsonl`: one line per run, with scores, PRs, blockers and cost.

KPIs, each scaled 0 to 100 against its target as Looper expects: mean project score (target 85), projects passing the Verafy compliance check (target: all listed), coverage (target 100%), pages with GA (target: all non-excluded), measured revenue against the manifest's targets. One loop per pass can be shown separately if the single loop gets too coarse.

### Change-only runs

Nightly runs expand only work items whose target changed since the last recorded result: a new deploy on the site (Vercel deployment time), a new commit on the repo, a new or edited post, a changed VIP. Weekly runs expand everything. This is what keeps the cost down.

### Guards

- **Budget.** A run carries a spend cap (model tokens, Lighthouse minutes, PR count). The engine stops expanding new work items when it is reached, and the report says what was left.
- **Kill switch.** `LOOP_ENABLED=false` stops all scheduled runs.
- **Rate limits.** Concurrency caps per provider (models, GitHub, Vercel). GitHub uses REST only.
- **Secrets.** All keys from the engine's environment. None in logs, screenshots or scores.
- **Repo rules win.** Step 3 reads the target repo's `CLAUDE.md` first. Where it forbids an action (merging in lineage-api, analytics on rexstjohn.com), the step records a blocker instead.
- **Never:** DNS, Stripe objects, production env vars, mainnet transactions, emails or posts, a token.

### Engine options

| Option | Fit | For | Against |
|---|---|---|---|
| **Inngest** (recommended) | TypeScript, on Vercel | Durable steps over HTTP to the existing app, cron, fan-out, idempotency keys; Kin already uses it; free tier covers weekly runs | Concurrency on the free tier is low (5 steps), so full runs take hours |
| **LangGraph on LangSmith Deployment** | Python graph | A real graph with a visual Studio; cron jobs; LangSmith traces and evals | Python-first; Temporal notes a LangGraph run lives in one process unless you add its plugin; a second language for these repos |
| **Temporal** | Any language, heavy | The strongest durability and scale; deterministic workflows; mature | More to operate or a higher floor price; more than this loop needs |
| **Trigger.dev** | TypeScript | Open source, long-running tasks, good for agents | Another platform alongside Vercel |
| **Vercel Workflow** | TypeScript on Vercel | Native to where the sites run | Newer; Lighthouse and Playwright still need to run elsewhere |
| **Restate** | Any | Lightweight durable services and state | Smaller ecosystem |
| **Plain cron plus the Claude Agent SDK** | Any | Cheapest, simplest | No durable steps, no retries per step, no coverage guarantee: the failure mode this VIP exists to avoid |

### Cost (modeled, not measured)

Inngest bills per execution: each run counts once, plus once per step. With about 6,000 executions per full run (including about 50% for retries):

| Schedule | Executions a month | Inngest |
|---|---|---|
| Weekly full | about 25,000 | Free tier (50,000), which pauses rather than bills when exhausted |
| Weekly full plus nightly change-only | about 40,000 to 60,000 | At or just over the free tier |
| Nightly full | about 180,000 | Pro plan; third-party sources put it between $50 and $99 a month, with the included executions well above this. Confirm on Inngest's pricing page |

Model tokens dominate. At about 15 to 20 million tokens per full run, and assuming Sonnet-class prices of about $3 per million input and $15 per million output tokens:

| Schedule | Model cost a month |
|---|---|
| Weekly full | $200 to $400 |
| Weekly full plus nightly change-only | $250 to $500 |
| Nightly full | $1,500 to $3,000 |

Add $10 to $20 a month for a headless Chrome runner (Modal or a small VPS). Cheaper models for mechanical checks and a jury only on changed or failing pages keep it at the low end.

### Repository

A new repository, `Verafyai/verafy-loop`:

```
src/
  inngest/          client and functions (run, expand, work item, coverage, report)
  expand.ts         manifest to work items
  verifiers/        one file per check, each a pure function over gathered evidence
  work/             Claude Agent SDK prompts per pass, reading STYLE-GUIDE.md
  judge/            Verafy jury client
  record/           score files and Looper files
  runners/          Lighthouse and Playwright, deployed to Modal
test/               verifier fixtures; a coverage-gate test that fails on one missing item
```

The manifest, style guide, learnings and asks stay in `verafyHarness/docs/loop/`; the loop reads them from GitHub at the start of each run.

## Build order

1. Expansion, the coverage gate and the Looper writer, with no model calls. A run that only gathers and checks, to prove every work item gets a result.
2. Website verifiers and the Lighthouse runner. First real scores.
3. Step 3 for the website pass: PRs for meta tags, GA, alt text, copy.
4. The jury step.
5. Passes 2 to 5.
6. Pass 6 and change-only runs.

## Test cases

- [ ] Expansion of a fixed manifest produces the same work item ids every time
- [ ] The coverage gate fails a run with one work item missing a result
- [ ] A work item retried after a crash does not create a second PR (idempotency on its id)
- [ ] A page whose GA request fires before consent fails the analytics verifier
- [ ] A banned word in copy fails the style verifier with the line and the rule
- [ ] A sample with a mocked model fails compliance check 3
- [ ] A sample without a ruling account fails compliance check 5
- [ ] The agent's own self-assessment never changes a score (scores come only from verifiers and the jury)
- [ ] A repo whose `CLAUDE.md` forbids merging gets a PR and a blocker, never a merge
- [ ] The run stops expanding at its budget and the report lists what was skipped
- [ ] Looper renders the written loop, status and run files
- [ ] `LOOP_ENABLED=false` prevents the next scheduled run

## Alternatives

- **Keep running the loop by hand in agent sessions.** What happens today. Works, cannot prove coverage.
- **Looper as the engine, not just the dashboard.** Looper deliberately makes no network calls at runtime; turning it into an engine would change what it is.
- **No jury, agent self-scoring.** Cheaper and the exact weakness this VIP fixes.

## Decisions only Rex can make

- Whether to build this at all, and when.
- Engine: Inngest (recommended), LangSmith Deployment, Temporal or another.
- Schedule and monthly budget cap.
- The GA4 property id; revenue targets per project.
- One GitHub owner for Verafy, or keep Verafyai and VerafyTechnologies.
- Whether the loop may merge docs-only PRs and publish blog posts, or only open PRs.
- Whether the loop's Looper data is public (shown on looper.rexstjohn.com) or private.

## Done when

A weekly run completes over every work item in the manifest, the coverage gate passes, every score has evidence, at least one fix has shipped as a merged PR and been re-verified on the live site, and Looper shows the run.

## Sources

- [LangChain: LangGraph Platform renamed LangSmith Deployment](https://www.langchain.com/blog/langgraph-platform-announce)
- [LangSmith Deployment docs: durable execution and cron](https://docs.langchain.com/langgraph-platform/index)
- [Temporal: LangGraph plugin and durable execution](https://temporal.io/blog/temporal-langgraph-plugin-durable-execution)
- [Inngest: compare to Temporal](https://www.inngest.com/compare-to-temporal)
- [Inngest pricing calculator](https://www.inngest.com/pricing?ref=footer)
- [Budgetforge: Inngest pricing 2026 (third party)](https://www.budgetforge.dev/tools/inngest-pricing-2026)

## Tracking

No requirement or issue yet. Documented for later; Rex has not decided to build it.
