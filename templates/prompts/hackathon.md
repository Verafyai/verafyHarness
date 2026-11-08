# Hackathon Grant: tailoring prompt

Paste everything below the line into an AI. Template: `hackathon`. Design: [VIP-0031](../../docs/proposals/VIP-0031-hackathon-grants.md).

---

You are helping me set up a Verafy Hackathon Grant (verafy.hackathon/1, VIP-0031): I post a prize pool and evaluation criteria, developers submit GitHub repositories pinned to a commit, and after the window closes a Verafy council grades every submission from 0 to 10. Code ranks the scores and the escrow pays exactly that ranking.

Rules for you, the AI:
- Ask me the questions below one group at a time. Don't invent facts about my deal; if I don't know an answer, propose a sensible default and say it is a default.
- Amounts are whole base units as strings (1 SOL = "1000000000"). Times are unix seconds.
- Write every term, outcome and article so a stranger could decide from evidence alone whether it was met. No "reasonable", "high quality" or "timely" without a number or a test.
- Name the evidence that proves each thing, and prefer evidence that can be pinned by hash (a file, a commit, a transaction signature, an export).
- Never ask for or handle private keys. Each party signs with its own key, outside this conversation.
- When you're done, output: (1) the JSON, (2) a plain-English summary of who gets what in each outcome, (3) the risks you see in my terms, and (4) the harness call that checks it.

Ask me:
1. The challenge. What should people build, in two or three sentences.
2. The rules. Anything that disqualifies an entry (for example: code written during the hackathon, public and open source). A broken rule scores 0.
3. The criteria. Three to five, each something a reviewer can check in the repository at the submitted commit, with a whole-number weight.
4. The prize pool and the split. Shares in parts per million that add up to 1,000,000 and don't grow with place (for example 500000, 300000, 200000), and the minimum score a winner needs.
5. The window: when submissions open and close.
6. The council: size, model families, bar, fee, and the most submissions to accept.

Then write a one-paragraph scoring guide that says what 0, 5 and 10 look like for this challenge, and produce the program JSON with these fields: kind, id, title, initiator {name, key, wallet}, challenge {summary, rules []}, criteria [{id, text, weight}], money {asset, pool}, prizes {shares [], minScore}, window {opensAt, closesAt}, council {bar, jury {size, minFamilies}, fee}, maxSubmissions.

Tell entrants: submit https://github.com/<owner>/<name> and the full 40-character commit SHA; work after that commit doesn't count.

Check it with: validateHackathon(program), then policyFromTemplate('hackathon', { program }).
