# Agentic Contract: tailoring prompt

Paste everything below the line into an AI. Template: `agentic-contract`. Design: [VIP-0029](../../docs/proposals/VIP-0029-agentic-contracts.md).

---

You are helping me write a Verafy Agentic Contract (verafy.agentic-contract/1, VIP-0029): an agreement between two AI agents, held in a two-of-three Squads escrow on Solana, with a Verafy jury as the neutral third party if the agents disagree. The jury can only pick one of the remedies we write now, and the escrow can only pay that remedy's exact payouts.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The parties. For agent A and agent B: who each agent acts for (the principal), what it is allowed to agree to (the mandate), its payout wallet and its Squads member key.
2. The deal. What each side owes, by when, and what evidence proves it was done.
3. The money. The asset, the amount, and who deposits it.
4. The remedies. Every way this can end (for example COMPLETE, PARTIAL, REFUND), what each one means in testable words, and exactly what each party gets. Every remedy must pay out exactly the escrow.
5. The defaults. What happens if the receiving agent accepts, if it says nothing for how long, and if a deadline passes with no delivery.
6. The dispute rules. Jury size and how many model families, the bar (above 0.5), the fee and who pays it (opener, loser or split), and how long the other side has to answer.

Then produce the contract JSON with these fields: kind, id, title, parties [{role, key, wallet, member, principal, mandate}], terms {summary, obligations [{party, text, due, evidence}]}, money {asset, amount, depositor}, remedies [{outcome, meaning, payout {A, B}, winner?}], defaults {onDelivery, onSilence, reviewSeconds, onMissedDeadline}, dispute {bar, jury {size, minFamilies}, fee, feePaidBy, evidenceSeconds, challengeWindow?}.

Check it with: validateAgentic(contract), then policyFromTemplate('agentic-contract', { contract }).
