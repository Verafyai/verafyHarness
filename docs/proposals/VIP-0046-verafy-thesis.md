# VIP-0046: Verafy Thesis, an open check of Verafy's own claims by AI juries

| Field | Value |
|---|---|
| Status | Live: investor page at https://www.verafy.ai/thesis, claims ledger at https://www.verafy.ai/thesis/claims, investor report at https://www.verafy.ai/thesis/report (alpha). No jury run stored yet: Verafy's own api.verafy.ai key is out of credits (section 15.8). |
| Spec version | `verafy-thesis/1` |
| Author | Rex St John |
| Created | 2026-11-18 |
| Code | `VerafyTechnologies/verafy-website`, PRs #59 to #71; `VerafyTechnologies/testnet-demo` #256; `VerafyTechnologies/verafy-apis` #50 |
| Assets | `docs/proposals/assets/VIP-0046/` (screenshots, logo, claims, spec, slide generators, and the revision 2 sources: `score.ts`, `merkle.ts`, `revenue.ts`, `diligence.ts`) |

This VIP records everything needed to rebuild Verafy Thesis from nothing: why it exists, every requirement, the design, the data model, the content, the calculators' math, the jury and stamping protocol, and what is not done. If the site is lost, this file plus its assets regenerate it.

---

## 1. Why

**How we got here.** Verafy pitches a thesis: off-chain AI juries can supply the judgment smart contracts lack, and inference costs are falling fast enough to make that cheap. Investors, and people like Toly at Solana, push back. A founder's own deck is the least credible place for those claims to live.

**What is unaddressed.** No investor has a neutral way to check a startup's claims. Diligence is slow, private and depends on whoever the investor asks.

**What changed.** Verafy's core product is a jury of models from different labs that checks claims, signs the result and records it. That same machinery can check Verafy.

**The idea.** Publish every claim Verafy makes, with sources and labels, plus an open spec anyone can paste into any model to check them. Then run the check as a five-model jury, stamp each report's hash on Solana, and re-run it as the technology changes. The page is both a diligence tool and the clearest demo of the product.

Rex's framing, kept on the page as the subtitle: Verafy relies on machine consensus and reports to check our claims over time. We open the specs and models so anybody can run them independently, and measure them over time as the landscape evolves so we stay aligned. Once you see the power of AI juries through this check, the world we envision will be clear.

## 2. Requirements (as given, Nov 18, 2026)

1. Take 100% of the claims in every deck Rex shared (v1 for Frachtis, v2 for Xavier Meegan at Frachtis, and the Verafy Pre-Seed Deck), the 17-page data room, and the investor emails, with their sources.
2. A spec anyone can run: "put this into Claude or your favorite model and run it", to check the sources and the validity of the claims and the models. Framed as an independent third-party jury replication process, an extra background check for investors, users and believers.
3. A business model critique: Verafy's primary competitors, a list of sources to check, and an instruction to search for any others.
4. Defensibility: what makes Verafy defensible, whether executing the plan would let it take and hold a competitive advantage, and a critique of that advantage.
5. Data and modeling: how big the market is, refreshed with web searches.
6. Store each report on Solana, dated, so it can be checked after the fact. Show it in the Explorer.
7. A subsite at verafy.ai/thesis (or /investors). A design that lists the latest stamped reports certified by AI juries, each with a confidence interval from a five-model jury.
8. Keep the thesis checker in GitHub.
9. Organize the claims by factuality, from fact to inference to hypothesis. For example: inference cost is dropping, therefore X. It is cheaper to generate a contract and use it than to store it. It is more secure to generate a contract, check it with an AI jury and execute it than to store it.
10. A button so investors can run the check with Swarm Explorer.
11. A data room link: an index of every slide, data set and diagram shared.
12. The subtitle in section 1.
13. The unified Verafy header used across all products, the credit system, 200 credits per run, and a new logo in the top left. Follow the product template.
14. A sources tab, indexed and categorized by area.
15. A two-panel layout: navigation down the left, content in the middle.
16. Pushbacks, each with arguments for and against:
    - Why do you need a blockchain at all?
    - Your approach is nondeterministic while smart contracts are deterministic. LLMs are random and generative. How do you solve that? (Answer includes the light SVM in the harness.)
    - "There are only about six smart contracts that matter."
    - ZK inference does not check the context fed to the model. Lies or missing sources in the context still produce a proven answer. How do you guard against that?
    - All models are trained on largely the same corpus, so they are biased in the same ways. Link the data.
    - "By this time next year anyone can scan this site and copy the whole thing. What prevents that?" Answer: human trust built in person, face to face, is the last moat, together with a track record of data.
    - Find other pushbacks and fill them in.
17. Economics calculators for every cost claim: off-chain jury cost, Verafy's approach to proof cost, cheap verification. Built-in assumptions, graphs, interactive.
18. This VIP, with 100% of the designs and thinking, so the whole thing can be regenerated.

## 3. What shipped

| Piece | Where |
|---|---|
| Page | `src/app/(thesis)/layout.tsx`, `src/app/(thesis)/thesis/page.tsx` |
| Run button and copy prompt | `src/app/(thesis)/thesis/RunJury.tsx` |
| Calculators and charts | `src/app/(thesis)/thesis/Economics.tsx`, `charts.tsx` |
| Paid jury API | `src/app/(frontend)/api/thesis/run/route.ts` |
| Identity, jury queries, sources, model | `src/products/thesis/identity.ts`, `jury.ts`, `sources.ts`, `economics.js` (verbatim copy of this repo's `packages/economics/src/index.js`), `model.ts` (typed wrappers) |
| Claims registry | `public/thesis/claims.json` (snapshot: `assets/VIP-0046/source/claims.json`) |
| Runnable spec | `public/thesis/VERIFY-THESIS.md` (snapshot: `assets/VIP-0046/source/VERIFY-THESIS.md`) |
| Reports index | `public/thesis/reports/index.json` (empty) |
| Data room | `public/thesis/dataroom/` (12 slides, thumbnails, 17-page PDF) |
| Scripts | `scripts/thesis/canonical.mjs`, `combine.mjs`, `stamp.mjs` |
| Header | `thesis` added to `PRODUCTS` in `public/header/v1/verafy-header.js`; marks at `public/logos/thesis-{32,64,128,512}.png` |
| Docs | `docs/thesis.md`, `docs/HEADER.md` |

## 4. Design

**Shell.** Its own route group `(thesis)` with its own `<html>`, so it does not inherit the marketing site's header. It loads the canonical header script and renders `<verafy-header product="thesis" home="/thesis" links="Economics:/thesis#economics, Claims:/thesis#claims, Data room:/thesis#dataroom">`. The header draws the mark, name, Alpha pill, links, Verafy.ai and the shared credits badge, and handles analytics. Header links must start with `/` or `https://`; hash-only links are dropped by the parser.

**Layout.** Two panels at `lg` and up: a sticky 240px left rail with the section links and the spec version and claims date; content on the right, max 920px. On phones the rail is hidden and the page is one column.

**Tokens.** Verafy dark: background `#05080d`, surface `#0e141b`, border `#232c36`, text `#e6edf3`, muted `#9aa6b2`, accent `#5fe0c8`, accent fill `#3f8f80` with dark text, warning `#e0b45f`, danger `#f28b82`, chart violet `#8b93ff`. Inter and Geist. Body text 16px and up. Borders separate records. No em or en dashes in copy.

**Label colors.** Measured and sourced in teal. Modeled, founder-measured and vendor-reported in amber. Founder-reported, illustrative, hypothesis and opinion in red. A desk-check status uses the same scheme.

**Logo.** `assets/VIP-0046/thesis-mark.svg`: a document outline in slate `#2b3440` with two text lines and a folded corner, and a teal `#2dd4bf` seal at the bottom right with a dashed inner ring and a dark check. Render it at 32, 64, 128 and 512 with a transparent background.

**Sections, in order** (screenshots `01` to `14` in the assets):

1. **Overview.** Kicker "Verafy Thesis", the headline "Check our claims with an AI jury.", the two-paragraph subtitle, the run button "Run the check with Swarm Explorer (200 credits)", then "Copy the prompt for your own model", "Read the spec" and "Download claims.json". Then four stat tiles: claims checked, thesis steps, competitors, sources cited.
2. **Stamped reports.** An explanation of the jury and the hash, then either an honest empty state or one card per report: date, thesis support score with 90% interval, juror models, `sha256`, and links to Solana Explorer and Verafy Explorer, with devnet labeled.
3. **The thesis, step by step.** Three tiers: Facts (premises), What follows (inferences), What must be proven (hypotheses). Each step shows its id, statement, the claims it rests on and its status.
4. **Economics calculators.** Five panels, see section 7.
5. **Pushbacks.** One card each: question, the case against (red), the case for (teal), our answer, what would settle it (amber), and source links where present.
6. **Every claim.** Grouped: Why now, Product and traction, Proof economics, Business and round, Thesis claims. Each card shows id, label pill, desk check, the claim, a note, how to check it, and source links. Each card has an anchor (`#C01`).
7. **Business critique.** The competitor table (name links to source, what it does, overlap), possible moats, weaknesses, and the questions the jury answers.
8. **Market size.** The reading, inputs with labels and links, and four scenarios with formula and modeled annual revenue.
9. **Sources.** Two-column grid of source groups (section 6).
10. **Data room.** A link to the PDF, then a numbered grid of 12 thumbnails linking to full images.
11. **Run it yourself.** Four steps, and a note that nothing on the page asks you to trust Verafy.

## 5. Data model (`claims.json`)

Top level: `spec`, `title`, `as_of`, `author`, `sources_of_claims`, `labels`, `thesis_chain`, `claims`, `pushbacks`, `competitors`, `market`, `defensibility`.

- **Claim:** `id`, `group` (`why-now`, `traction`, `proof`, `business`, `thesis`), `claim`, `label`, `sources[]`, `how_to_check`, `desk_check`, `note`, `appears_in[]`.
- **Labels:** measured (run by Verafy), founder-measured (run by Verafy, not reproduced), modeled (computed from stated inputs), vendor-reported (a third party's own figure), sourced (public data with a link), founder-reported (stated without public evidence yet), illustrative (assumed shares), hypothesis (what the thesis needs to be true), opinion, attributed-opinion, founder-claim.
- **Desk check values:** supported, supported-with-caveat, partly-supported, needs-update, checkable, modeled, vendor-reported, founder-measured, unverified, unsupported, incomplete, untested, opinion, category-error-risk.
- **Thesis step:** `id`, `kind` (premise, inference, hypothesis), `statement`, `rests_on[]`, optional `status`.
- **Pushback:** `id`, `question`, `against[]`, `for[]`, `our_answer`, `what_would_settle_it`, optional `sources[]`.
- **Competitor:** `name`, `what`, `overlap`, `source`.
- **Market:** `as_of`, `inputs[]` (`name`, `value`, `label`, `source`), `scenarios[]` (`name`, `formula`, `annual_revenue_usd`, `label`), `reading`.
- **Defensibility:** `possible_moats[]`, `weaknesses[]`, `questions_for_the_jury[]`.

The full content as shipped is in `assets/VIP-0046/source/claims.json`. A summary follows so the thinking survives even if the file does not.

### 5.1 Claims (48)

- **Why now:** the Binance theft (C01 to C03), x402 agent payments (C04, out of date: Token Terminal shows 285.2M transfers and $59.3M), the FlashProve release (C05), five live rulings for $0.0163 (C06), the inference price decline (C07), Ethereum and Solana fees (C08, C09), the 2023 modeled ruling (C10), and the ruling being cheaper than Ethereum (C11).
- **Traction:** Swarm rulings, credit income, validators, npm downloads, the Judiciary Signer 30 of 30, 250+ models, the community, Truth Node stake, keynote views, the Harness release, SIMD #724, the MCP plugins, and the Senate forecast (C20 to C32).
- **Proof economics:** FlashProve figures, the Solana transaction size, the naive proven cost, packing, the measured test block, block time and size, CommitLLM, and routing (C40 to C47).
- **Business:** price, the round (use of funds sums to 97%), bootstrapping, the team, the founder's track record, and the competition slide (it omits GenLayer and the Internet Court) (C60 to C65).
- **Thesis:** inference cheapening, fees near their floor, tech debt, H1 cost, H2 security, juries vs validators, the Karpathy prediction, Qwen compression (sourced to PrismML's Ternary Bonsai 2 27B: Qwen3.8 27B, 54 GB to 5.9 GB, 98.2%, vendor-reported), the 20,000 lines claim (unsupported), and labs choosing cards (T01 to T10).

### 5.2 Thesis chain

- **P1:** inference at fixed capability gets 10 to 40x cheaper a year.
- **P2:** on-chain fees have fallen but are near their floor.
- **I1:** therefore a jury ruling already costs less than an Ethereum L1 transaction, and the gap widens.
- **P3:** proving which model answered is possible but costly.
- **I2:** therefore packing, routing and precedent can bring proven rulings under one cent (modeled).
- **P4:** agents hold wallets and pay on chain at small scale.
- **P5:** the largest losses come from validly signed transfers no rule stopped.
- **I3:** therefore there is demand for a judgment check before execution (needs buyers).
- **H1:** generate, check and execute is cheaper than storing.
- **H2:** it is more secure.
- **H3:** Verafy can capture and hold this layer.

### 5.3 Pushbacks (Q1 to Q10)

| Id | Question | Our answer, short |
|---|---|---|
| Q1 | Why a blockchain at all? | The chain is for settlement, bonds and the record, not inference. If a signed API is enough for a buyer, we sell that too. |
| Q2 | LLMs are nondeterministic; contracts are deterministic | Settle the signed ruling, not the generation. Fixed outcome sets, quorum, appeal, precedent. Exact logic stays in a light SVM inside the harness. |
| Q3 | Only about six contract types matter | Agreed; keep them as code. Verafy adds the judgment step around them where money moves on a decision. |
| Q4 | ZK proofs don't check the context | Context is evidence, not instructions (Prompt Guard). Evidence is hashed with the ruling, source rules, independent fetching, and paid challenges. |
| Q5 | Shared training data means shared bias | The data supports the objection (Kim et al., ICML 2025: about 60% agreement when two models both err; a 2026 forecasting study). Treat agreement as a signal, require cited evidence, and publish error rates by family. |
| Q6 | Anyone can copy this within a year | Software is copyable; human trust earned in person and a public track record of rulings are not. |
| Q7 | Who is liable? | Bonds, caps, human appeal for large amounts, and counsel in the use of funds. |
| Q8 | Operators swap models or take bribes | Proofs or receipts, random selection, commit and reveal, and slashing. |
| Q9 | Too slow for markets | Juries sit at decision points, not in the execution path. Precedent answers in under a second. |
| Q10 | Price falls to cost | Routine rulings get cheap; margin comes from rulings on value at risk. |

### 5.4 Competitors (13)

GenLayer (five-model AI jury, $7.5M seed in Aug 2024 led by North Island Ventures, closest overlap), the Internet Court standard (27 companies), Kleros, UMA, Chainlink, OpenGradient ($9.5M), Ritual, Lagrange DeepProve, EZKL and Inference Labs, FlashProve, CommitLLM, Cournot, and Squads (a channel and a threat). GenLayer's seed predates Verafy (founded January 15, 2025), so it can't be called a copy of Verafy. The honest framing is a convergent competitor.

### 5.5 Market

- **Inputs:** x402 all-time 285.2M transfers and $59.3M; Juniper agentic commerce $8B (2026) to $1.5T (2030); oracle market $1.02B (2026) to $12.5B (2034); Chainlink TVS about $30.8B; Squads over $10B and 450+ teams; about 230 Polymarket disputes in April 2026.
- **Scenarios (modeled):**

  | Scenario | Formula | Revenue a year |
  |---|---|---|
  | Treasury signer | 450 teams x 10% x $500 a month | $270K |
  | Dispute rulings | 3,000 markets x 10 x $1 | $30K |
  | 2030 base | $1.5T x 1% x 1 bp | $1.5M |
  | 2030 bull | $3T x 5% x 5 bp | $75M |

- **Reading:** the serviceable market today is small, and the thesis depends on agentic commerce growing by orders of magnitude.

### 5.6 Defensibility

- **Possible moats:** the precedent corpus, the default standard via SIMDs, the founder's distribution, cost engineering, and multi-lab orchestration with Prompt Guard.
- **Weaknesses:** GenLayer, commoditizing orchestration, no disclosed paying judgment customer, a solo founder, vendor-based proving numbers, and liability and prompt-injection risk.
- **Questions for the jury:** see `claims.json`.

## 6. Sources (`src/products/thesis/sources.ts`)

Ten groups:
- **Cost of inference:** Epoch AI, the live run, the economics model.
- **On-chain fees:** YCharts, BitInfoCharts, VALR, Solana docs.
- **Proving inference:** FlashProve, CommitLLM, DeepProve, EZKL.
- **Smaller, cheaper models:** AlphaSignal on PrismML, the Bonsai 2 whitepaper, Benjamin Marie's post.
- **Do different models fail differently:** Kim et al. ICML 2025, "The Oracle's Fingerprint".
- **Agent payments:** Token Terminal, Bitquery, Juniper.
- **Incidents:** ChangeNOW and Tech Insider on Binance, Bloomberg on Polymarket disputes.
- **Competitors:** GenLayer and Internet Court, GenLayer's seed, Kleros, UMA, Chainlink, OpenGradient, Ritual, Squads.
- **Market size.**
- **Verafy:** the product sites, the repos, SIMD #724, npm.

## 7. Economics calculators (`Economics.tsx`)

All math runs in the browser. The cost model is this repo's `packages/economics`, copied verbatim, so the page and the tests share one implementation. Charts are dependency-free SVG (`charts.tsx`), on log axes where values span orders of magnitude.

1. **What a proven ruling costs.**
   - Inputs: prover (FlashProve on H100, or the `deepprove` preset), contracts per block (10 to 5,000, default 1,000), GPU price (default $4.00), jurors (default 5), prove once, atomize and pack, dedupe (default 49%), fast screen, and screen share (default 50%; fidelity screen share 70%).
   - Outputs: per contract, per block, proofs against unpacked, minutes to seal on one GPU, GB of proofs, and a cost breakdown (proving, verifying, warm-up, fidelity, screen, storage), from `estimate()`.
   - Chart: cost per contract against block size, from `curve()`.
   - Defaults reproduce the data room: $0.0035 per contract, $3.45 a block, 32 proofs against 5,000, 7 minutes, 0.59 GB.
2. **A jury ruling against gas, over time.**
   - Inputs: ruling cost today (measured $0.0033), yearly decline (default 10x, Epoch about 40x), the Ethereum fee ($0.197) and its yearly change (default 1x), and the Solana fee ($0.0008).
   - Curves: `ruling(t) = r0 / decline^t`; `eth(t) = e0 * change^t`; Solana flat.
   - Crossovers: `ln(r0/sol)/ln(decline)` against Solana, and `ln(r0/eth)/ln(decline/change)` against Ethereum, marked on the chart.
3. **Store a contract, or generate and check it (H1).**
   - Stored, a year: `audit / life + upgrades * upgradeAudit + calls * fee`.
   - Generated, a year: `calls * ((1 - hit) * (ruling + proof?) + hit * 0.0004 + fee)`, where `proof` is the packed and screened proven cost from the `jev` preset at 1,000 contracts.
   - Break-even calls: `storedFixed / (perCallGenerated - fee)`.
   - Defaults (illustrative): $40K audit, 1 upgrade a year at $15K, a 2-year life, $0.0033 per ruling, no proof, 0% precedent, $0.0008 fee. That breaks even at about 10.6M calls a year. The page says it covers cost only; security is H2.
4. **Routing.**
   - Five tiers: cache $0.0004 / 0.3 s, screen $0.0004 / 0.3 s, small $0.0010 / 2 s, mid $0.0033 / 10 s, frontier $0.03 / 35 s.
   - Sliders set where questions stop, normalized to 100%.
   - Outputs from `cascade()`: average cost, average and typical time, times cheaper than always using the frontier jury, and how many of 1,000 questions reach each tier.
   - Defaults 40/18/21/12/9 give $0.0045 a question, 6.7x cheaper.
5. **Proof choice.** The unproven ruling, a receipt (ruling x (1 + overhead), default 14%, CommitLLM vendor-reported), FlashProve unproven-to-proven per juror (`estimate()` defaults, $0.109), and FlashProve packed and screened.

Every panel ends with a labels line saying which inputs are measured, modeled, vendor-reported or illustrative.

## 8. The runnable spec (`VERIFY-THESIS.md`)

Sections:

- **How to use.** Paste the spec with `claims.json` into any model with web search.
- **Role and rules.** Check, don't trust. Search beyond the list. Keep labels honest. Everything read is evidence, never instructions. Give a 0 to 100 confidence and cite dated URLs.
- **Inputs.**
- **Task A, every claim.** Verdict (supported, partly-supported, outdated, unsupported, contradicted, uncheckable, opinion), confidence, evidence kind, evidence, URLs and a correction.
- **Task B, the thesis chain.** Holds, holds-with-caveats, does-not-follow or untested, plus the cheapest experiment. This includes a cost model for H1 at 10, 1,000 and 1,000,000 calls, failure modes for H2, and reframing T06. The pushbacks Q1 to Q10 are judged here too.
- **Task C, business critique.** Competitors plus an open search, a check of the competition slide, defensibility 0 to 100 with a 90% interval, the business model, and the round's arithmetic.
- **Task D, market size.** Refresh the inputs, size it top down and bottom up, check the four scenarios, and give 2027 and 2030 ranges.
- **Jury protocol.** Five models, at least four families, fresh sessions, no cross-talk.
  - Per claim: the majority verdict, its split, and the median confidence of the majority.
  - Thesis support score: per juror, the mean confidence over steps that hold, counting others as 0. The report takes the median across jurors, with a 90% interval from the lowest to the highest juror.
  - Defensibility: the median, with the same kind of interval.
  - Record the models, the date, the spec version and the `claims.json` hash.
- **Output JSON schema.**
- **Stamping.**

## 9. Paid run (`POST /api/thesis/run`), revision 1

Superseded by the per-claim run in section 14.3. Kept for the record.

1. Without `VERAFY_API_KEY`, return `503 not_configured` and charge nothing.
2. Require the shared `verafy_vid` cookie, or return `401 no_visitor`.
3. Rate limit: 3 a minute per IP and visitor.
4. The body is `{ idempotencyKey: "thesis:<8 to 80 chars>" }`.
5. Spend 200 credits on the shared balance with `spendCredits`, source `thesis`. Return `402` when short; the client then opens Buy credits through `verafy-credits:open`.
6. For each of the 11 thesis steps, build a query under the Swarm API's 1,000-character limit: the step, the claims it rests on (truncated to fit), and an instruction to search and answer with a verdict, a 0 to 100 confidence and one sourced sentence. POST each to `https://api.verafy.ai/api/v1/public/broadcast-query` with `queryMode: "fact-check"` and `queriesRequested: 5`, in parallel.
7. Return `{ spec, ranAt, jurors, stamped: false, note, steps[] }`. The client fires `verafy-credits:refresh` and shows each step's raw output. Runs are unstamped until Verafy reviews them.

## 10. Stamping

- `combine.mjs` merges five or more juror files per section 8 of the spec. It warns when there are fewer than four families, and writes the report with the `claims.json` hash.
- `stamp.mjs` has no dependencies. It takes the canonical JSON (sorted keys, no whitespace) and its SHA-256, and builds the memo `verafy-thesis/1 <date> sha256:<hash> <url>`. It builds a legacy Solana transaction with one Memo v2 instruction (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`), signs it with Ed25519 from a `--payer` keypair file passed at run time, and sends it to devnet by default.
- `--dry-run` prints the memo without sending.
- The report goes into `reports/index.json` with `date`, `url`, `sha256`, `score`, `interval`, `models`, `tx` and `cluster`.

## 11. Data room

Twelve slides at 1600x900 in Verafy colors, each labeling every number as measured, modeled, vendor-reported or illustrative:

1. Gas got cheap, judgment got cheaper.
2. FlashProve today.
3. What packing is.
4. The packing waterfall.
5. Time and size.
6. Where the cost sits.
7. CommitLLM vs FlashProve.
8. Routing.
9. The precedent funnel.
10. Studio.
11. Studio templates.
12. The jury and the ruling.

Slides 10 to 12 are crops of the VIP-0045 Studio screenshots. Generators are in `assets/VIP-0046/source/dataroom-generators/`:
- `gas_chart.py` builds slide 1.
- `slides.py` builds slides 2 to 7 from `econ.json` (the economics outputs).
- `slide_pack.py` builds slide 3.
- `slides2.py` builds slides 8 and 9.
- `slides3.py` builds slides 10 to 12.

The PDF wraps a cover, a contents page, the slides, the numbers table, a label key and a close, rendered with Playwright, with images saved as JPEG to keep it under 2.3 MB.

## 12. Regenerating

1. Recreate the route group, components and API from sections 3, 4, 7 and 9, using the Verafy tokens.
2. Copy `packages/economics/src/index.js` to `src/products/thesis/economics.js` and add the typed wrappers.
3. Restore `claims.json`, `VERIFY-THESIS.md` and `sources.ts` from `assets/VIP-0046/source/`.
4. Render the logo from `thesis-mark.svg`, and the data room from the generators.
5. Add `thesis` to the header registry, set `VERAFY_API_KEY`, and deploy.
6. Compare against the screenshots in `assets/VIP-0046/`.

## 13. Not done, and next steps

- **No stamped report yet.** A devnet payer key needs Rex's approval.
- **`VERAFY_API_KEY` must be set** on the site for paid runs.
- **Scoring.** The paid run shows raw output per step. It should score each step (verdict and confidence per juror) and compute the support score and interval automatically.
- **Explorer.** Verafy Explorer should index thesis stamps (memos with the `verafy-thesis/1` prefix).
- **Re-run cadence.** Monthly, and on every material change to the decks or the market inputs. Diff each report against the last.
- **Measurements the page promises:** re-run consistency (Q2), the false-evidence red team (Q4), error rates by model family (Q5), and the precedent hit rate (C47).
- **Deck fixes surfaced:** use of funds sums to 97%, the x402 figures are stale, and the competition slide omits GenLayer, the Internet Court and Chainlink.

## 14. Revision 2 (Nov 18, 2026, PRs #63 to #69)

Everything below replaces the matching parts of sections 3, 4, 5, 9 and 10. The current `claims.json`, spec and code are snapshotted in `assets/VIP-0046/source/`.

### 14.1 Two pages

- **`/thesis` is the investor page** (`src/app/(thesis)/thesis/page.tsx`). It is static and server-rendered. The header runs with `credits="off"`. It never shows empty jury data.
- **Its sections, in order:**
  - The hero: "An independent AI co-signer for money that moves on Solana." It carries three proof chips: $0.0033 per measured ruling, 30 of 30 devnet signer checks (scripted jurors), and SIMD #724. Its links are See a ruling, Talk to Rex, Read every claim, and Run the due diligence scan.
  - 1, market size and revenue model (14.6).
  - 2, the problem.
  - 3, how it works (propose, rule, co-sign or block).
  - 4, see a ruling: the latest real jury result, or a link to the devnet rulings on Verafy Explorer.
  - 5, why now: judgment got cheap, and proof of which model ruled exists. It carries one chart.
  - 6, the first buyer: Solana treasuries.
  - 7, the cost per ruling.
  - 8, where Verafy fits: six rows, with suppliers in a footnote.
  - 9, risks, each with its design response and the milestone that proves it.
  - 10, team.
  - 11, what the next 24 months prove, with CTAs.
  - The FAQ: why a blockchain, how a non-deterministic ruling can be trusted, and why no coin.
- **Figures cite their claims** with small superscript links to `/thesis/claims#<id>`.
- **`/thesis/claims` is the ledger** (`src/app/(thesis)/thesis/claims/page.tsx`). It holds:
  - the summary dashboard (14.4) and the due diligence scan (14.7);
  - the jury board: GPT, Claude, Gemini, Grok and DeepSeek, with the line "not affiliated, no endorsement";
  - the claims in nine sections in pitch order (problem, why now, thesis, product, economics, market, competition, risks, team), each claim appearing once;
  - the calculators, objections Q1 to Q10, the FAQ, research and sources, the method, and the data room.
- **Kept off the public site** after the skeptical VC review: per-claim fix notes, hard questions Q11 to Q30, the open fixes A1 to A14, spec v2 notes, withdrawn claims, the weaknesses list, and the round terms. They live in the private `verafy-website` repo at `docs/thesis-private/review-2026-11-18.json`.

### 14.2 Claims data (`claims.json`)

- **`sections`** sets the order. Each claim appears exactly once. A test enforces this, along with no dangling `rests_on` and no two units with the same wording.
- **Every claim and step has an explicit `tier`**: `claims`, `follows` or `proven`. Claims tagged `economics` or `business` in `categories` feed the area scores.
- **Thesis claims A01 to A04** lead the thesis. A05 was unfinished and is not published.
- **Steps:**
  - I2, I3a and I3b.
  - P6 (others already ship AI juries) and P8 (correlated errors and injection are measured risks).
  - H1 (narrowed to low-volume, judgment-heavy contracts), H2a (an independent co-signing key beats fixed limits, at a published false-block rate) and H3.
- **Claims N1 to N6** cover signer losses, prompt-injection drains, correlated errors, GenLayer's Internet Court, Kleros AI jurors, and wallet policy engines.
- **M01 is the default revenue projection** (14.6).
- **Removed as duplicates or cut:** P1 to P5, P7, I1, T01, T04, T05, C03, C32, T09, C61 and C62.
- **New keys:** `executive_summary`, `board`, `research` (areas of papers, with an updated date), and `faq` (F1, why no coin, in Rex's words, labeled opinion).

### 14.3 Per-claim jury run (`POST /api/thesis/run`)

1. The body is `{ claimId, runId?, idempotencyKey: "thesis:<8 to 80 chars>" }`. Without a `runId`, the route opens a run.
2. The question is built from the claim by `questionFor`, at no more than 300 characters, because Swarm rejects longer ones.
3. Spend 5 credits (`THESIS.claimCost`) on the shared balance, then POST to Swarm `broadcast-query` with `queryMode: "fact-check"` and `queriesRequested: 5`.
4. **Refund on any failure** with `refundCredits` in `src/credits/service.ts`. Refunds are idempotent on `<key>:refund` and go back to the balance the spend came from. The failures are: Swarm unreachable, any non-2xx, no juror answers, or a storage error.
5. A `503 question_check_failed` returns `stop: true`, and the page stops the batch there.
6. The page runs claims one at a time. "Run the check with Swarm Explorer (5 credits per claim, N for all)" sits in the upper right of the report, and each claim card has a Recheck button.
7. `POST /api/thesis/finalize { runId }` closes the run (14.5).

### 14.4 Scoring and the dashboard (`score.ts`)

- **Juror score:** confidence times 100 for a yes, 100 minus that for a no, 50 for an abstention. Model names are kept exactly as Swarm returns them.
- **Claim score:** the median juror score. The 90% interval runs from the lowest juror score to the highest. The verdict is the majority vote, and a tie is contested.
- **Overall score:** the score and interval of the weakest "must be proven" claim, named, not an average.
- **Economics and business model validity:** the averages over the tagged claims.
- **The dashboard** reads `GET /api/thesis/report`, which combines the latest version of every claim from every visitor. It shows:
  - the verdict and last scan time in PT;
  - a checked ring split into valid, contested and unsupported;
  - the gauge, the area tiles and the tier bars;
  - the model names, the report sha256 (over the sorted claim, version and report-hash list) and the Merkle root;
  - the stamp badge and the explorer links.
- **The empty state** is "Not scanned yet" with 0 checked, and no numbers.

### 14.5 Stored, versioned and stamped reports

- **Postgres, additive tables only**, created on first use through `DATABASE_URI`:
  - `verafy_thesis_runs`: id, visitor, timestamps, `merkle_root`, `stamp_status`, `stamp_tx`, `stamp_cluster`.
  - `verafy_thesis_claim_reports`: run, claim, version, sha256, report JSON and `merkle_proof`, unique on claim and version.
- **Each report** holds the spec, version, claim, tier, categories, question, answers, score, interval, verdict and timestamp. Its leaf is the SHA-256 of its canonical JSON.
- **Merkle tree** (`merkle.ts`): leaves are ordered by claim, then version. Each parent is the SHA-256 of the left child's bytes followed by the right child's bytes, and an odd node pairs with itself. The root and the proofs are written once.
- **Memo:** `verafy-thesis/1 merkle:<root> run:<id> https://www.verafy.ai/thesis`, on Solana devnet only, signed by `THESIS_SOLANA_PAYER` (a 64-byte JSON array). Without a payer the run is "pending stamp".
- **Rechecks** add a version and never overwrite. `GET /api/thesis/report?claim=<id>` returns every version with its proof.

### 14.6 Market size and revenue model (`revenue.ts`, `RevenueModel.tsx`)

The model covers three revenue lines for 2027 to 2030. Adoption and Verafy's share ramp up evenly from 2027, to the full value in 2030.

- **Treasury subscriptions:** teams in 2026 × (1 + team growth)^(year - 2026) × adoption × monthly fee × 12.
- **Fees on value checked:** value held × growth^(years) × share moved per month × 12 × adoption × fee in basis points.
- **Agent payment checks:** agentic commerce spend (a geometric path from $8B in 2026 to the 2030 figure) × share on chain × share needing a judgment check × Verafy's share × fee in basis points.
- **Revenue pool:** what each line would earn in 2030 if Verafy won every buyer.

The defaults carry labels. Sourced: 450 teams and $10B held (Squads). Vendor-reported: $8B to $1.5T (Juniper). Assumptions: 30% team and value growth, 10% adoption by 2030, $1,500 a month, 10% of value moving monthly, a 1 bp value fee, 5% on chain, 1% needing judgment, 20% Verafy share and a 2 bp agent fee.

Under those defaults, revenue is about $2.7M in 2030, about 10% of a $27M pool, mostly from subscriptions. That is claim M01, which the jury rules on. Its latest ruling shows beside the model, and a test keeps the M01 wording in sync with the defaults.

### 14.7 Automatic due diligence scan (`diligence.ts`, `GET /api/thesis/diligence`)

There are ten checks against public sources, with no AI and no credits. Results are cached for ten minutes. Rescan forces a fresh run, rate limited.

1. **D01:** the products named in the pitch are live.
2. **D02:** the jury service answers. This is Swarm's question check.
3. **D03:** Verafy Harness was pushed recently. The check reads the GitHub API, falling back to the commit feed.
4. **D04:** Verafy Harness has an open-source license. The check reads the GitHub API, falling back to the raw LICENSE file.
5. **D05:** npm downloads in the last 30 days for `@verafy/sdk` and `@verafy/mcp`.
6. **D06:** SIMD discussion #724 exists.
7. **D07:** the founder's record of work is online.
8. **D08:** the cited sources still load. 401, 403, 405 and 429 count as existing but blocking automated requests.
9. **D09:** `claims.json` is consistent and hashed.
10. **D10:** a jury run is fresh and stamped.

### 14.8 Executive summary, board and innovations

- The board copy (Rex's words) and the jury list sit on the ledger.
- The executive summary and the key-innovations box were merged into the investor page's hero and its why-now section after the VC review. The innovations data is kept in the private review file.

### 14.9 Tests

`src/products/thesis/thesis.test.ts` runs in `npm run test:site`. It covers:
- the 300-character cap;
- charging and refunds on every failure path;
- Merkle proofs;
- the weakest-claim headline;
- versioning and the empty state;
- category scores;
- each claim appearing once, in pitch order;
- the diligence scan, both healthy and broken, with the GitHub fallbacks;
- revenue model consistency with M01.

`refundCredits` and the store run against Postgres when `DATABASE_URI` is set.

### 14.10 Open as of Nov 18

- **No jury run is stored.** Swarm's question check returns `503 question_check_failed` because its OpenRouter calls fail. Swarm's claim reader also falls back. The fix is a working `OPENROUTER_API_KEY` in the `testnet-demo` Vercel project, then a redeploy. D02 in the diligence scan reports this live.
- **`THESIS_SOLANA_PAYER` is not set**, so runs will show "pending stamp".
- **The bracketed placeholders from the VC review stay hidden until they are real:** price per ruling by tier, design partners, LOIs or pilots, named team members and advisors, and a link to a recorded ruling.

## 15. Revision 3 (Nov 18, 2026, afternoon: verafy-website #70 and #71, testnet-demo #256, verafy-apis #50)

### 15.1 Per-claim jury distribution (`JuryDistribution.tsx`)

- Every claim card on the ledger, every competitive-advantage row and the revenue projection show the jury's ruling as a percentage (the median juror score). Under it is a 0 to 100 track:
  - one colored dot per juror at its score, with dots that land within 7 points stacked;
  - the 90% interval as a band and the median as a marker;
  - a list of each model, its vote and its score.
- Lab colors match Swarm Explorer: OpenAI `#2f78ff`, Anthropic `#f6233a`, Google `#1ec8a5`, xAI `#e040a0`, DeepSeek `#ffe14a`. Unknown models are grey.
- `JuryLegend` names each lab with "(not endorsed by <lab>)" and the line "These labs do not endorse Verafy." There are no lab logos: the page uses colored dots and names only.
- Rulings for every claim load in one request: `GET /api/thesis/report?claims=<ids>` returns the latest stored report per claim, up to 120 ids.

### 15.2 Competitive advantage (`CompetitiveAdvantage.tsx`, `claims.json` `advantages`)

- **Rows:** GenLayer, Kleros, UMA, Chainlink, wallet policy engines, Squads, and building it in-house.
- **Each row shows** their offer, Verafy's offer, why Verafy wins, the jury distribution, and a Re-verify button (5 credits).
- **Each advantage is a jury claim,** K01 to K07, tier `proven`, label `hypothesis`, in the competition section of the ledger.
- **Placement:** on /thesis, replacing the old six-row table.

### 15.3 The final question (`FinalVerdict.tsx`, unit `V01`)

- **The question:** "Would a skilled pre-seed investor, after weighing every claim, the market, competition, the founder and the economics, invest in Verafy at the stated terms ($1.5M post-money SAFE at a $12M cap)?"
- **The question sent to Swarm** is built by `verdictQuestion()` at run time and stays at 300 characters or fewer. It carries the jury's results so far (claims that hold, of those checked, and the weakest key claim's score). It asks for a rationale in three parts: `INVEST:`, `CONCERNS:` and `AGAINST:`.
- **When it runs:** a full run asks it automatically after the claims, in the same Merkle-stamped run. It can also be asked alone (5 credits). It is never part of the claim scores.
- **Shown large** at the top of the ledger, on /thesis once ruled, and at the top of the PDF report.
- **Reasoning, split into three bars** by `splitRationale()` (`rationale.ts`, browser-safe): why invest, hesitations and objections, and why it might not make sense. Each sentence carries its juror's dot.

### 15.4 PDF investor report (`/thesis/report`)

- **A full investor report**, server-rendered and print-styled (white page, 16 mm and 14 mm margins), with `noindex`.
- **Contents:**
  - the final question;
  - the executive summary and the revenue model table for 2027 to 2030 with the pool;
  - the problem, how it works, why now, costs, competitive advantage and risks;
  - team and the next 24 months;
  - live jury results and live rulings for M01 and K01 to K07;
  - the due diligence scan;
  - FAQ, every claim with its tier, and research.
- **Download PDF** on /thesis and in both page headers opens `/thesis/report?print=1`. That page opens the browser's print dialog once the live data has loaded, where the reader saves a PDF.
- The shared investor copy lives in `content.ts`, so the page and the report do not drift.

### 15.5 Ledger layout

- The ledger opens with the jury board: "Our board: a jury of frontier models", the legend, and one paragraph. That paragraph says Verafy relies on a written spec and a research report validated by a jury of frontier models, that investors can use it to automate every key question, and that a run stamps a certificate on Solana as a permanent benchmark.
- Next come the final question, the dashboard (with the Run button top right) and the due diligence scan.
- **Accordions:**
  - Every claim section opens with its question and one-line summary, and its claims sit in an accordion.
  - The scan shows "N of 10 checks pass" and unfolds to the list.
  - Calculators and objections stay open.
- **Sections, in pitch order:** problem ("legacy smart contracts are incapable of human judgment and lack common sense"), opportunity ("falling inference costs and off-chain inference bring judgment and common sense to smart contracts"), why now, thesis, product, economics, market, competition, risks, team. /thesis has a matching opportunity section.

### 15.6 Runs: gate, limits and pacing

- **The question gate.** Swarm screens every question with a model that has no web search, and it rejected real 2026 events as "no public record" (422).
  - The thesis sends `questionGate: "off"`.
  - api.verafy.ai forwards it (verafy-apis #50).
  - Swarm honors it only when `x-api-key-public` matches `VERAFY_APIS_KEY_SITE` (testnet-demo #256).
- **Per-IP limits.** Every proxied request reaches Swarm from one server address, so the per-IP visitor burst limit (30 an hour) and the visitor credit hold throttled all API customers together (429). Requests with the site key now skip both. api.verafy.ai still bills its own API keys and limits each key to 100 an hour.
- **On the thesis side:**
  - Claims run 1.5 s apart.
  - A 429 stops the batch with a refund.
  - "Insufficient credits" from api.verafy.ai stops the batch with a refund (#71).
  - The browser is given a visitor id through `GET /api/credits/balance` before the first paid call.

### 15.7 Tests

`thesis.test.ts` (18 tests) adds:
- a 429 stops the batch;
- an out-of-credits upstream stops the batch;
- revenue model consistency with M01;
- the final question fits 300 characters, splits its reasoning, and never counts as a claim;
- K, M and N claims are counted as claims.

### 15.8 Open as of Nov 18, afternoon

- **No jury run is stored.** Swarm now answers (the diligence scan's D02 passes), the gate is skipped, and the IP limits are lifted. The remaining blocker: the api.verafy.ai key in `VERAFY_API_KEY` on verafy-website has 4 credits, and a claim costs 5. A full run of 66 claims plus the final question needs about 335. Top up that key's credits on api.verafy.ai.
- **`THESIS_SOLANA_PAYER` is not set,** so runs will be "pending stamp".
- **Placeholders from the VC review stay hidden until real:** price per ruling by tier, design partners, LOIs or pilots, named team and advisors.


## 16. Revision 4 (Nov 18, 2026, evening: verafy-website #72 to #76)

### 16.1 Billing: the visitor's own credits (#74)

- A run spends only the logged-in visitor's website credits (5 a claim, refunded on any failure).
- With `SWARM_SITE_KEY` set, `/api/thesis/run` calls `https://swarm.verafy.ai/api/broadcast-query` directly with the trusted site key. api.verafy.ai's per-key credit ledger is no longer in the path.
- Without `SWARM_SITE_KEY`, it falls back to api.verafy.ai with `VERAFY_API_KEY`.

### 16.2 Full runs with progress (#75)

- Run checks every claim, then the final question (`V01`) last, then finalize.
- The first claim runs alone to open the run; the rest run six at a time.
- The panel shows percent, a bar, time left and the claims in flight, and warns before the page is closed. The report refreshes every 5 claims.
- Measured: a full run of 66 units took about 8 minutes (64 ruled; C63 and H2a hit a transient 503 and can be rechecked).

### 16.3 Five named jurors (#76)

- Every run asks exactly the five board models by Swarm validator id (`selectedLLMIds`): GPT-6.1 Terra Pro, Claude Opus 5.5, Gemini 4 Argon, Grok 4.7, DeepSeek V4 Pro.
- An abstention stays on the card as n/a and is never scored. A claim fails only if no juror voted.

### 16.4 Rulings drawn like Swarm Explorer (#76)

- `model-color.ts` ports Swarm Explorer's model colors, short names and icons (served from swarm.verafy.ai).
- Every ruling uses the Explorer answer card: percent and verdict, a responded and range pill, the slider (track, 90% band, 50% tick, a colored dot per juror, median marker and label, 0% NO to YES 100%) and juror chips with icon, color and score.
- The board legend shows each lab's icon with "not endorsed by" the lab.

### 16.5 Final question reasoning (#76)

- `rationale.ts` parses Swarm's JSON reasoning (`rationale`, `for`, `against`). A yes vote's supporting points go to "Why invest" and its counterpoints to "Why not"; a no vote is the reverse; the summary goes to "Hesitations".
- The page no longer shows raw JSON.

### 16.6 Copy (#72, #73)

- The final question names no round size or cap on the page.
- No claim begins "therefore"; each stands on its own.

### 16.7 Open

- `THESIS_SOLANA_PAYER` is not set, so runs are "pending stamp".
- Stored rulings from before #76 show the models that answered then; the next full run shows the five board models.
