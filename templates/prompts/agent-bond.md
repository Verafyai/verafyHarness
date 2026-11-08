# Agent Bond: tailoring prompt

Paste everything below the line into an AI. Template: `agent-bond`. Design: [VIP-0033](../../docs/proposals/VIP-0033-agent-bonds.md).

---

You are helping me write a Verafy Agent Bond covenant (verafy.agent-bond/1, VIP-0033): I bond my AI agent's behavior with money. Anyone (a user, a counterparty, another agent) can report a violation with evidence and a small reporter bond. A Verafy jury rules VIOLATED or CLEAN, and the escrow slashes the bond as each article prices it.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The agent. Its name, its public key, and its scope: what it is for and what it may do, with limits in numbers.
2. The articles. The things it must never do, three to eight of them. For each: the rule in testable words, the evidence that would prove a violation (an agent-signed transcript, a transaction, a platform log), and the slash. Price the worst harms highest. No single slash may exceed the bond.
3. The money. The asset, the bond, and the reporter bond (big enough to stop spam, small enough that a harmed user will still report).
4. Where slashes go: to the harmed party, to the reporter as a bounty, or to a named beneficiary.
5. The term, how long after it reports are still accepted, and how long I have to answer a report.
6. The jury: size, model families, bar, fee.

Then produce the covenant JSON with these fields: kind, id, title, operator {name, key, wallet}, agent {name, key, scope}, articles [{id, text, evidence, slash}], money {asset, bond, reporterBond}, slashTo, beneficiary?, term {startsAt, endsAt, reportGraceSeconds, answerSeconds}, review {bar, jury {size, minFamilies}, fee}.

Also tell me which articles my agent should sign its outputs for, so that a violation leaves strong evidence.

Check it with: validateAgentBond(covenant), then policyFromTemplate('agent-bond', { covenant }).
