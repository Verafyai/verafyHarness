# Verafy style guide

How Verafy writes: every site, README, blog post, VIP, demo and sales page. The loop scores copy against this file. A rule here that a repo's own `CLAUDE.md` contradicts loses to the repo's rule for that repo, and the conflict is reported.

## The voice in one paragraph

Verafy writes like a good hardware datasheet with a point of view: plain, specific, checkable. Every claim can be traced to code, a transaction, a measurement or a source. Readers are developers, protocol teams and people who pay for outcomes. They are busy and suspicious of crypto marketing, and they are right to be. We earn trust by naming the thing, showing the evidence and saying what is not done yet.

## Structure of a page or post

1. **Context first, never the middle of the solution.** Open with how the field got here, then the problem or opportunity nobody has addressed, then what changed that makes a new approach possible, then the advantages. "Here is a banana" openings are banned.
2. **One headline, one concrete thing.** A headline names a product, an action or a result. Not a mood.
3. **Show it working.** A screenshot of the current product, a transaction link, a code block that runs, or a demo. Placed above the fold on landing pages.
4. **Say what is real.** Every page that describes a product says what is live, recorded, scripted or modeled. Devnet is labelled devnet. Scripted jurors are labelled scripted.
5. **One call to action per screen.** The primary button names the action ("Post a task", "Run a scan", "Read the spec", "View on GitHub").

## Words

**Use:** jury, juror, harness, ruling, bar, bond, slash, challenge, escrow, settle, Actually Smart Contract, proof, receipt, evidence, devnet, mainnet.

**Name things the same way everywhere:**

| Write | Not |
|---|---|
| Verafy | Verify, VeriFy, VERAFY |
| Actually Smart Contract (ASC) | AI smart contract, intelligent contract |
| Verafy Harness | the harness thing, SwarmHarness (old name) |
| Verafy Chain | Swarm Chain (old name) |
| jury ruling | AI verdict, oracle answer |
| devnet | testnet, unless it is the testnet |

**Banned outright.** The loop flags each as an error. Case-insensitive.

- unlock, unleash, seamless, revolutionize, game changer, game-changing, cutting-edge, next-generation, state-of-the-art, best-in-class, world-class
- harness the power, elevate, empower, supercharge, delve, tapestry, embark, testament to, pivotal, crucial, holistic, myriad, intricate, synergy, paradigm, future-proof
- in today's fast-paced, in the age of, ever-evolving, where X meets Y, the future of, look no further, at your fingertips, dive in, it's not just, imagine (as an opener), whether you're a X or a Y, one-stop shop, from day one, the ultimate X, the perfect X
- magic, magical, effortless, frictionless, blazing fast, robust, leverage, democratize
- trustless (say what is trusted instead), web3-native, to the moon, wagmi, alpha (except release names)
- "AI-powered" as an adjective on anything. Say what the model does.
- Em dashes and en dashes, anywhere. Use a period, a colon, a comma or parentheses.
- Exclamation marks at the end of a sentence.

**Banned claims.**

- "Safe", "secure", "audited" or "guaranteed" about anything Verafy scores or certifies. The word is "survived", with tier and date.
- Any number without a label: **measured**, **modeled**, **illustrative**, **vendor-reported**, or **target**.
- Invented numbers on public pages. A missing number is a placeholder, `[AMOUNT]`, or the sentence goes.
- "Decentralized" without saying who runs the pieces today.
- Any Verafy token, presale, airdrop or points program. There is no token, ever.
- Describing a person's experience as a duration ("decade", "veteran", "seasoned"), or dating Rex's work.

## Sentences

- Under 25 words. Paragraphs of three sentences or fewer.
- Active voice, present tense: "The jury scores each submission", not "Submissions will be scored".
- Numbers as digits with units: 5 jurors, 48 hours, 1,000 credits.
- One idea per sentence. Lists only for parallel items.
- No hedging stacks ("may potentially help to"). Say it or cut it.
- No rhetorical questions as headings.
- Plain words over jargon. When a term is necessary, define it once in the sentence that first uses it.

## Code, docs and samples

- Every sample runs as written against devnet, with real AI calls, unless it says in its first line that it is a mock. A mock returns `"mock": true` in JSON and says "Mock data" in the UI.
- Every sample shows the settlement: the ruling account or the transaction, with a Solana Explorer link.
- A quickstart reaches a first ruling in five commands or fewer.
- Keys come from the environment. No secret, key or token in a sample, ever.

## Visual

Dark ground #0B0D10, surfaces #10151A and #12161B, borders #232A33. Text #E8EAED and muted #B8C0C8 / #9AA3AD. One accent, teal #4FD1B5, plus amber #F5B84B for status, orange #FF8A3D and red #FF5A5F for warnings and failures. Space Grotesk for headings, Inter for body, JetBrains Mono for labels and addresses. Cards with a 1px border and radius 10 to 20. The shared Verafy header on every product site. No gradient washes, no glowing orbs, no stock photos of robots or handshakes, no emoji in UI.

## Machine-written copy

Copy may be drafted by an agent. It may not read like it. The loop flags:

- Triplets of adjectives and "not X, but Y" constructions used more than once per page
- Openers that restate the headline
- Closers that summarize what the reader just read
- Any sentence that would fit any product unchanged ("built for developers who care about quality")

The test for every sentence: would it be false, or meaningless, on a competitor's site? If it would still be true there, it says nothing about Verafy. Rewrite it with a name, a number or a mechanism.
