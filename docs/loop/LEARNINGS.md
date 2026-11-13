# What we learned

Lessons from building and shipping Verafy's projects. The loop reads this before every run and appends to it after. Each lesson has the rule it produced. Newest sections at the top.

## Product and positioning

- **Lead with the gap a contract cannot close.** Smart contracts settle what code can see: balances and signatures. NEAR Intents, UniswapX and every oracle-based market inherit that limit. Verafy's edge is settling outcomes that need judgment. Rule: every product page names the outcome a plain contract could not settle.
- **"No token, ever" is a feature, not a footnote.** It removes the main reason readers distrust crypto products. Rule: say it on every product that moves money.
- **Fresh wallets do not give privacy.** Funding links them, and amount plus timing links a fronted payment to its reimbursement. Privacy needs a large shielded pool (Zcash Orchard) and selective disclosure. Rule: never claim "untraceable"; say what each party can see.
- **"I don't know" is a valid ruling.** Markets and tasks need an Unresolvable outcome that refunds, or the jury is forced to guess. Rule: every jury-settled product has an honest no-answer path.
- **The jury must never see the money.** In Predictions the jury never sees pools or odds; in Tasks it never sees who posted. Rule: jury prompts are built without price, pool or identity fields, and a test proves it.
- **Prediction markets are a legal question before a product question.** Rule: play money on devnet until a lawyer signs off.
- **Developer relations work sells when it is evidence.** Hiring managers and buyers respond to receipts: repos, transactions, counts. Rule: every claim on a page links to its proof.

## Copy

- **Context before solution.** Rex's standing rule: field history, the unaddressed problem, what changed, then advantages.
- **Numbers carry labels.** Measured, modeled, illustrative, vendor-reported, target. A number without one is removed.
- **No dashes.** Em and en dashes read as machine-written and are banned across Verafy copy.
- **No duration or dates on Rex's own experience or work.** They work against him in hiring.
- **Cut sub-products that split attention.** DevRadar was better as one all-in-one scan than nine sub-apps. Rule: one product, one primary action per site.
- **Screenshots go stale fast.** Several READMEs and blog posts showed old UIs. Rule: the loop re-captures screenshots on every run and diffs them.

## Building and shipping

- **`npm test` can stop at the first failing runner and hide the rest.** In testnet-demo it stopped at Playwright and hid 209 passing tsx tests; an earlier report of "139/140" was wrong. Rule: run each suite directly and report counts per suite.
- **A failing suite is reported with its name and whether it fails without the change.** In verafyHarness the dual-runtime suite fails 8 tests independently of docs changes. Rule: never claim a pre-existing failure without running main.
- **Vercel's Ignored Build Step and production branch can silently skip deploys.** Looper's main builds were ignored and the domain served a stale build. Rule: after every merge, fetch the live page and check a string from the change.
- **A repo folder can collide with a site route.** DevRadar's `docs/` folder clashed with its `/docs` page. Rule: design files live in `design/`; `.vercelignore` keeps tests, scripts and design off the site.
- **Verification scripts must target the element they mean.** DevRadar's check matched the header button, not the hero button. Rule: selectors are scoped to a section.
- **Model calls need a pinned tool engine.** Native web search on one provider timed out past 38 seconds; pinning Exa fixed it. Rule: pin the search engine, set a kill switch (`SWARM_WEB_SEARCH=off`), retry without tools on a 4xx other than 429.
- **Gates must not block.** Swarm Explorer's future-question filter and its clarify step refused legitimate forecasting questions. Rule: a gate may ask for a date or a source; it blocks only refused categories (harm to people, private individuals).
- **Public RPCs lack history.** A Bitget rescan came back shallow on a public endpoint. Rule: history-dependent scans need an archive RPC, and say so when they do not have one.
- **GitHub GraphQL is unavailable from agent sessions.** Rule: use the REST API for PRs and merges.
- **Shell heredocs break on nested quotes.** Rule: write edit scripts to a file and run the file.
- **Disk fills.** The working disk sat near 96% full. Rule: work in place, delete only your own scratch files, and check free space before large builds.
- **Agents should not invent private data handling.** rexstjohn.com keeps no reader data, so analytics there need Rex's call. Rule: a repo's `CLAUDE.md` overrides the loop.

## Process

- **One branch and one PR per scope.** Merges are Rex's on repos that say so (lineage-api). Elsewhere the loop merges docs-only PRs and opens PRs for code.
- **VIPs are the design record.** An idea goes to a VIP before code, with use cases, edge cases, test cases and "Decisions only Rex can make".
- **Write decisions down, do not guess them.** When a VIP needs Rex's call, the loop lists it and builds the parts that do not depend on it.
