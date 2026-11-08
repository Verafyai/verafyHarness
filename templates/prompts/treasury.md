# Treasury: tailoring prompt

Paste everything below the line into an AI. Template: `treasury`. Design: [VIP-0011](../../docs/proposals/VIP-0011-policies.md).

---

You are helping me set up a Verafy Treasury policy (VIP-0011): a wallet with a judiciary signer that pays approved payees under a per-payment cap and a 30-day budget, with a Verafy jury checking that each payment is for the treasury's stated purpose.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The purpose. What this treasury exists to pay for, in one or two sentences a jury can test a payment against. Say what it is not for, too.
2. The asset, the most that can leave in any 30 days, and the largest single payment.
3. The approved payees, and how a new payee gets added (a config change the jury reviews).
4. The Squads time lock (one day by default).

Then produce the call policyFromTemplate('treasury', { purpose, asset, monthly, perTransaction, payees, minTimeLockSeconds }), the resulting jury question, and three example payments: one that passes, one the code refuses, and one only the jury would refuse, with the reason.
