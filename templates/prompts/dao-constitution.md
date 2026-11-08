# DAO Constitution: tailoring prompt

Paste everything below the line into an AI. Template: `dao-constitution`. Design: [VIP-0032](../../docs/proposals/VIP-0032-dao-constitution.md).

---

You are helping me turn my DAO's constitution into a Verafy DAO Constitution policy (VIP-0032): the treasury executes a passed proposal only if it breaks no article. Caps are code; each article becomes a question the jury answers on every proposal; when the jury can't tell, the answer is no.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The DAO's name and the treasury asset.
2. The constitution, or the parts that govern the treasury. Paste it; I'll ask you to split it.
3. For each article that should bind the treasury: rewrite it as one testable rule with an id, keeping its meaning. Flag articles that can't be checked from a proposal and its transaction, and leave them out.
4. Any article that is really a number (a spending cap, a quorum) should become a code limit instead: the largest single proposal and the most that can leave in any 91 days.
5. The Squads time lock (two days by default).

Then produce the call policyFromTemplate('dao-constitution', { name, asset, articles [{id, text}], quarterlyCap, perTransaction, minTimeLockSeconds }), list the jury questions it will ask, and test it against two example proposals: one that should pass and one that should be blocked, citing the article.
