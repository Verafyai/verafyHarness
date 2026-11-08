# Super Grant: tailoring prompt

Paste everything below the line into an AI. Template: `super-grant`. Design: [VIP-0030](../../docs/proposals/VIP-0030-super-grants.md).

---

You are helping me design a Verafy Super Grant (verafy.super-grant/1, VIP-0030): a foundation issues a Request for Ideas, pays each admitted developer a base grant to respond, has a Verafy jury check every response against the terms, and pays outcome tranches (for example revenue) only after a jury verifies each outcome. The escrow pays only what was earned and returns the rest to the foundation when the program ends.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The Request for Ideas. The problem I want ideas for, in two or three sentences, and who it's for.
2. The terms every response must meet. Three to six, each testable from the response's evidence (for example: public repository, open-source license, a transaction signature on devnet).
3. The agent terms. What the grantee's AI must and must not do while running under this grant (custody, logging, data use, that the Verafy review is final).
4. The money. Asset, base grant, how many grantees at most, and the total budget (it must cover every grantee earning every tranche).
5. The outcome tranches. For each: the outcome (Revenue, Users, Integration...), exactly what counts with a number, what evidence proves it, the amount, and how long after admission it can be claimed. For revenue, say which money doesn't count (self-paid, from the foundation, round-tripped).
6. The response window (two weeks is the default), the application deadline and the program end.
7. Follow-on: none, a post-money SAFE, a revenue share or a right of first refusal, with its terms in plain words.
8. The review jury: size, model families, bar, fee.

Then produce the program JSON with these fields: kind, id, title, foundation {name, key, wallet}, request {summary, terms [{id, text}], responseSeconds, responseEvidence}, agentTerms {text}, money {asset, budget, baseGrant, maxGrantees}, tranches [{id, outcome, text, evidence, amount, claimSeconds}], followOn {instrument, text}, window {applyUntil, endsAt}, review {bar, jury {size, minFamilies}, fee}.

Check it with: validateGrant(program), then policyFromTemplate('super-grant', { program }).
