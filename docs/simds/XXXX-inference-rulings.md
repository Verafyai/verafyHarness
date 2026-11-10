---
simd: 'XXXX'
title: Inference Rulings, Disputes and Challenges
authors:
  - Rex St. John (Verafy)
category: Standard
type: Interface
status: Idea
created: 2026-11-05
feature: (fill in with feature key and github tracking issues once accepted)
---

## Summary

These SIMDs are part of a broader proposal to bring Inference Programs to
Solana natively: [Bringing Inference Programs To Solana](https://blog.verafy.ai/articles/20261105-simd-verifiable-inference).

This proposal defines the **ruling**: the signed decision recorded on chain
when an inference program's evaluators reach quorum. Like a court opinion, it
records the outcome, a summary, the reasoning by hash, the sources used
(checked against what the jury was given), how strongly the models agreed,
every vote's signature, a co-signed sign-off and any dissents. Programs read
it with `ReadRuling` and act on it. A ruling can be **disputed** quickly, or
**challenged** at any later time with new evidence, and **overturned** by a
new ruling that compares itself to the original. It is never erased.

This is one of three companion proposals that bring inference programs to
Solana:

1. **Inference Programs**: natural-language programs on chain, their
   context, and how other programs call and pay for them.
2. **Inference Evaluators and Attestations**: who runs the models, what they
   commit to, and the signed, optionally provable, vote each one casts.
3. **Inference Rulings, Disputes and Challenges**: how votes become a signed
   ruling that programs act on, and how rulings are disputed, challenged and
   overturned.

The motivation, use cases and diagrams for all three are in the
[overview post](https://blog.verafy.ai/articles/20261105-simd-verifiable-inference).

## Motivation

When judgment happens off chain today, the chain records the outcome but not
the reasoning. A ruling closes that gap: anyone can read what was decided,
why, on what sources, and who agreed, and a program can check all of it
before it acts.

No ruling should be final forever. Evidence turns out to be forged, sources
are corrected, rules change. Courts let a later court overturn an earlier
decision, sometimes decades on, while the original stays in the record.
Rulings need the same: a way to re-examine a past decision against new data
and record the result, without rewriting history.

The same record serves predictions. A prediction market can store what
independent models forecast before an event, and resolve the market later
with a second ruling on what happened.

## Dependencies

This proposal depends on the following proposals, submitted together:

- **SIMD-XXXX: Inference Programs**

  Defines the inference program and the RulingRequest a ruling answers.

- **SIMD-XXXX: Inference Evaluators and Attestations**

  Defines the attestations a ruling counts, and the assurance levels it reports.

## New Terminology

- **Ruling request**: An account recording a request to run one inference
  program on one input, with the pinned prompt and context hashes, quorum and
  deadlines.


- **Opinion**: The summary, reasoning and sources of a ruling, written by one
  agreeing evaluator (the rapporteur) and co-signed by the others.


- **Sign-off**: An agreeing evaluator's signature over the opinion, saying it
  fairly states their decision.


- **Dissent**: An optional statement from an evaluator who voted for a
  different outcome, recorded with the ruling.


- **Certainty**: How strongly the models agreed: the share of evaluators that
  agreed, and their self-reported confidence.


- **Challenge**: A request, at any time after a ruling is final, to review
  it against new evidence, new sources or a claimed error. It is decided by a
  new ruling that compares itself to the original.


- **Review status**: What later review has done to a ruling: none, affirmed,
  overturned or superseded. The original ruling is never changed otherwise.


- **Prior ruling**: A past ruling used as context for a new one, the way a
  court cites precedent.


## Detailed Design

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [RFC
2119](https://www.ietf.org/rfc/rfc2119.txt) and [RFC
8174](https://www.ietf.org/rfc/rfc8174.txt).

All integers are little-endian. All hashes are SHA-256 unless stated
otherwise. Account layouts begin with an 8-byte discriminator equal to the
first 8 bytes of `sha256("inference-programs:" || account_name)`.

### Accounts

#### Ruling


A PDA at `["ruling", ruling_request]`, created by `FinalizeRuling` and
completed by `PostOpinion` and `SignOff`.

```text
discriminator        [u8; 8]
ruling_request       Pubkey
inference_program    Pubkey
prompt_hash          [u8; 32]
context_hash         [u8; 32]
ext_context_hash     [u8; 32]
input_hash           [u8; 32]
outcome              u8
assurance            u8         // level actually reached
certainty            Certainty
rapporteur           Pubkey     // evaluator who wrote the opinion
summary_len          u16
summary              [u8; 512]  // UTF-8, the decision in a few sentences
reasoning_hash       [u8; 32]   // sha256 of the full reasoning
reasoning_ref        [u8; 96]   // where the full reasoning can be fetched
source_count         u8
sources              [Source; 16]
signature_count      u8
signatures           [Signature; 16]  // one per counted attestation
signoff_count        u8
signoffs             [Signature; 16]  // agreeing evaluators, over the opinion
dissent_count        u8
dissents             [Dissent; 8]
finalized_slot       u64
status               u8         // 0 awaiting opinion, 1 final,
                                // 2 disputed, 3 overturned, 4 upheld
review_status        u8         // 0 none, 1 affirmed, 2 overturned,
                                // 3 superseded, 4 under review
reviewed_by          Option<Pubkey>  // latest Ruling that reviewed this one
review_count         u16

Certainty:
  agreeing           u8         // evaluators that chose the outcome
  answered           u8         // evaluators that revealed
  confidence_mean    u8         // 0 to 100, over agreeing evaluators
  confidence_min     u8

Source:
  kind               u8         // 0 context entry, 1 evidence item,
                                // 2 prompt, 3 external context entry,
                                // 4 prior ruling
  content_hash       [u8; 32]   // must match a pinned context entry,
                                // evidence hash or the prompt
  locator            [u8; 32]   // e.g. "Art. 2, sec. 3", zero padded

Signature:
  evaluator          Pubkey
  signature          [u8; 64]   // Ed25519, by the evaluator's signing key

Dissent:
  evaluator          Pubkey
  outcome            u8
  statement_hash     [u8; 32]
  statement_ref      [u8; 96]
```

The full reasoning is usually longer than an account should hold, so the
ruling stores a short summary inline and the full text by hash and reference.
Implementations MAY store the reasoning inline in a Content account and point
`reasoning_ref` at it.

#### ReviewPolicy

A PDA at `["review-policy", inference_program]`, set by the program's
authority, and subject to its mutability mode.

```text
discriminator        [u8; 8]
inference_program    Pubkey
dispute_parties      u8         // 0 requester, 1 named parties, 2 anyone
challenge_mode       u8         // 0 none, 1 parties only, 2 anyone
challenge_bond       u64        // lamports a challenger locks
challenge_min_evals  u8         // floor on a challenge's jury size
bond_growth_bps      u16        // bond increase per earlier review
```

Without a ReviewPolicy, disputes are open to the requester only and
challenges are not accepted.

### Finalization

After `reveal_deadline`, `FinalizeRuling` counts revealed
attestations by outcome. If at least `quorum` agree on one outcome, and that
quorum meets the program's family and assurance requirements, the Ruling
records that outcome. Otherwise the Ruling records `default_outcome` with
`certainty.agreeing` below `quorum`. Calling programs MUST treat that as "no
ruling".

### Opinions, sign-off and the returned ruling


A ruling is more than an outcome. Like a court opinion, it says what was
decided, why, on what basis, and who agrees.

1. **Votes.** Each evaluator's full output, in the format of Appendix A,
   contains an outcome, a confidence, a summary, its reasoning and the sources
   it relied on. Its hash is `output_hash`, and the attestation records the
   outcome and confidence.
2. **Rapporteur.** After `FinalizeRuling` counts a quorum, the rapporteur is
   the agreeing evaluator with the lowest `sha256(evaluator || ruling_request)`.
   It calls `PostOpinion` with the summary, the reasoning hash and reference,
   and the sources. If it does not post within `opinion_window` slots, the
   next agreeing evaluator in the same order may.
3. **Sources are checked.** `PostOpinion` MUST reject any source whose
   `content_hash` is not the pinned prompt, an entry of the pinned context set,
   a external-context entry, or an item in the request's evidence. A ruling
   cannot cite a document the jury was not given.
4. **Sign-off.** Each agreeing evaluator calls `SignOff` with an Ed25519
   signature over the opinion message below. The ruling becomes final when
   at least `quorum` evaluators have signed off. An evaluator that disagrees
   with the opinion's wording does not sign off, and if too few sign off
   before `signoff_deadline`, the next rapporteur posts a new opinion.
5. **Dissents.** An evaluator that voted for another outcome MAY call
   `PostDissent` before the ruling is final.

The opinion message is:

```text
"solana-inference-opinion:v1"     // 27 bytes, ASCII, no terminator
ruling                [u8; 32]
outcome               u8
summary_hash          [u8; 32]    // sha256 of the summary bytes
reasoning_hash        [u8; 32]
sources_hash          [u8; 32]    // sha256 over the ordered sources
```

**Wallet signatures.** Each evaluator's `signing_key` is an ordinary Solana
Ed25519 keypair, so every vote and sign-off is a wallet signature, visible
in explorers and checkable by anyone. Evaluators SHOULD also sign the reveal
and sign-off transactions with that key, as fee payer or signer, so the
evaluator's wallet appears on the transaction itself. A wallet signature
proves which operator stands behind a vote. Which model produced it is shown
only by a proof of inference (L2).

**Returning the ruling to a program.** `ReadRuling` checks that a ruling is
final and matches the expected program, hashes and input, then sets Solana
return data to:

```text
ruling                [u8; 32]
outcome               u8
assurance             u8
agreeing              u8
answered              u8
confidence_mean       u8
summary_hash          [u8; 32]
```

A calling program invokes `ReadRuling` by cross-program invocation and reads
the return data, or reads the Ruling account directly.

### Reading a ruling from another program


A calling program reads a Ruling account. It MUST check:

1. The account is owned by the inference programs program.
2. `inference_program`, `prompt_hash` and `context_hash` match the rules it
   intends to apply, and `ext_context_hash` matches what it injected.
3. `input_hash` matches the sha256 of the exact action it is about to take.
4. `certainty.agreeing >= quorum`, `assurance` is at least what it requires,
   and `status` is final or upheld, with any dispute window it cares about
   passed. `review_status` MUST NOT be overturned, and a program acting now
   SHOULD NOT act while it is under review. It MAY also require a minimum
   `certainty.confidence_min`.

Rulings take seconds to minutes, so the pattern is two-phase. In one
transaction, a program or client calls `RequestRuling` with the exact action
encoded as the input. In a later transaction, the program performs the action
only if a valid Ruling exists for that input. Programs SHOULD also enforce
hard limits in their own code, independent of any ruling, and SHOULD allow
only outcomes listed in the prompt to change their behavior.

### Disputes


`OpenDispute` within `dispute_window` sets the Ruling's status to disputed and
references a new RulingRequest against the same pinned hashes and input. That
new request SHOULD use evaluators whose model families do not overlap with the
original quorum. `ResolveDispute` records the second request's outcome. If it
matches, the status becomes upheld. If a different outcome reaches quorum, the
status becomes overturned. If neither, the Ruling falls back to
`default_outcome`.

### Predictions and prediction markets (informative)

A ruling can record a prediction as well as a judgment. The prompt asks
about a future event and lists its outcomes, for example `yes` and `no`, or
ranges of a number. Each evaluator's `confidence` is then its probability for
the outcome it chose, and the ruling's certainty records how many models
agreed and how sure they were. Because the ruling is finalized at a known
slot and votes are committed before they are revealed, it is a public,
timestamped record of what independent models forecast, before the event.

A prediction market uses two inference programs:

1. **Forecast.** Before the market closes, the market program, or anyone,
   requests a forecast with the market's question as the request prompt and
   the available evidence (news, filings, a forum thread, snapshotted) as
   external context. The ruling is stored as a record. A market MAY display
   it, use it to seed prices, or pay for it like any other request.
2. **Resolution.** After the event, the market requests a resolution ruling
   from a resolver program whose internal context holds the market's
   resolution rules: what counts, which sources decide, and what happens if
   they disagree. The external context holds the sources. The market pays out
   only on a final resolution ruling for that market's input, after its
   dispute window, and a later challenge can overturn a resolution on new or
   false evidence.

A program can score forecasts by reading both rulings: the forecast's
outcome and confidences against the resolution's outcome. Scores belong to
the scoring program; this proposal does not define them.

Forecast and resolution SHOULD be different inference programs, and the
resolver's jury SHOULD NOT be told the forecast, so a resolution is not
anchored to it. Models know nothing after their training data unless the
external context supplies it, so forecast requests SHOULD include current
evidence and MUST NOT be treated as more than the models' estimate. Anyone
who controls a linked page can try to move a forecast or a resolution; the
snapshot, injection and challenge rules of these proposals apply.

### Challenges and later review


A dispute is quick: it re-judges a fresh ruling on the same evidence, before
anyone relies on it. A challenge is for later. Facts come out, evidence turns
out to be forged, sources are corrected, or the reasoning looks wrong in
hindsight. Courts handle this by letting a later court overturn an earlier
decision, sometimes decades on, while the original decision stays on the
record. Rulings work the same way.

1. **Opening.** If the program's ReviewPolicy allows it, anyone eligible may
   call `OpenChallenge` on a final ruling at any time, with no window. The
   challenger states its grounds and supplies what is new:
   - `0` new evidence: facts that were not available at the time;
   - `1` false evidence: an item the ruling relied on was wrong or forged;
   - `2` error: the rules were misapplied to the evidence as it stood;
   - `3` changed rules: the program's context has since changed, and the
     question is whether the ruling would stand under the current rules.
   The challenger locks its `challenge_bond` and funds the challenge request,
   like any other request.
2. **What the challenge jury sees.** The challenge is a new RulingRequest
   with `kind = 2` and `reviews` set to the original. It pins the original's
   prompt, context and input hashes, except under grounds 3, where it pins the
   current ones. Its external context holds, in order: the original ruling
   and its full reasoning as a prior-ruling entry, the original evidence, and
   the new material, labeled as new. Old content must still be retrievable,
   which is why revisions SHOULD be stored permanently.
3. **Comparison.** The request prompt asks the jury to compare: does the
   original outcome still stand given what is now known? The challenge
   opinion MUST cite the original ruling, and SHOULD say, for each source the
   original relied on, whether it still holds, and which new source changed
   the result.
4. **The jury.** It MUST have at least the policy's `challenge_min_evals`
   evaluators, and SHOULD share no model family with the original quorum, nor
   with any earlier review of the same ruling.
5. **Result.** `ResolveChallenge` records the outcome on the original ruling:
   - the same outcome reaches quorum: `review_status` becomes affirmed;
   - a different outcome reaches quorum: overturned (grounds 0 to 2) or
     superseded (grounds 3);
   - no quorum: the original stands unchanged.
   The original's `reviewed_by` points to the challenge ruling, and
   `review_count` increases. Nothing else in the original changes, so its
   history can always be read back: first ruling, every challenge, and each
   result.
6. **Bond.** If the ruling is overturned or superseded, the bond is returned.
   If it is affirmed, the bond goes to the program's `refund_to`, or as the
   program specifies, so that challenging is not free.

**Voided votes.** If an attestation counted in a ruling is voided by an
attestation challenge (Evaluators and Attestations proposal), the ruling is
recounted without it. If it keeps its quorum, `assurance` is lowered if
needed and nothing else changes. If it loses its quorum, its `review_status`
becomes under review, programs MUST NOT act on it, and a new request with a
fresh jury decides it like a challenge on grounds 1.

A ruling can be challenged more than once. A later challenge MUST bring
evidence or grounds that no earlier review of the same ruling considered:
`OpenChallenge` MUST reject a challenge whose new evidence hashes were all
already pinned by an earlier review.

**What overturning does.** Past actions are settled on chain and are not
reversed. Overturning changes what the record says and what programs do next.
A calling program decides the remedy in its own code: an insurance program
can pay a claim whose denial was overturned, a governance program can flag a
proposal executed under a ruling later overturned, and any program reading a
ruling for a new action MUST treat an overturned one as no ruling.

**Prior rulings as precedent.** A context set MAY include past rulings as
kind-9 entries, so evaluators can apply earlier decisions to similar cases.
Evaluators MUST be told each prior ruling's `review_status`, so an overturned
decision is never applied as if it stood.

### Instructions

- `FinalizeRuling` (signer: anyone): Counts revealed attestations, records
  the outcome, certainty and vote signatures, and chooses the rapporteur.

- `PostOpinion` (signer: rapporteur): Records the summary, reasoning
  reference and sources, after checking each source against the pinned
  hashes.

- `SignOff` (signer: agreeing evaluator): Adds a signature over the opinion,
  and marks the ruling final at quorum.

- `PostDissent` (signer: dissenting evaluator): Records a dissent.

- `ReadRuling` (signer: none): Checks a final ruling and sets return data.

- `OpenDispute` (signer: requester or a party named by the program): Marks the
  Ruling disputed within the window.

- `ResolveDispute` (signer: anyone): Applies the outcome of a linked second
  request.

- `OpenChallenge` (signer: challenger, per `challenge_mode`): Locks the bond,
  creates a challenge request against a final ruling with the new evidence
  and grounds, and marks the ruling under review.

- `ResolveChallenge` (signer: anyone): Records the challenge ruling's result
  on the original, and settles the bond.

- `SetReviewPolicy` (signer: program authority): Creates or replaces the
  program's ReviewPolicy.

### Edge Cases

- **No quorum.** The Ruling records `default_outcome` with
  `certainty.agreeing < quorum`. Calling programs MUST NOT treat it as an
  approval.

- **No opinion.** If no agreeing evaluator posts an opinion that gathers
  enough sign-offs before the last deadline, the ruling stays in "awaiting
  opinion" and calling programs MUST NOT act on it.

- **Long reasoning.** Summaries are capped at 512 bytes. Full reasoning is
  stored by hash and reference, and evaluators MUST NOT sign off on an
  opinion whose reasoning they cannot fetch.

- **More than 16 sources.** The opinion lists the 16 most relied on. The full
  list stays in the reasoning.

- **Challenge of a ruling under review.** Only one challenge per ruling is
  open at a time. Others wait until it resolves.

- **Challenged content not retrievable.** If the original's pinned content
  or evidence cannot be fetched, the challenge cannot be served and expires,
  and the bond is refunded.

- **Disputes cost money too.** A dispute is a new request, funded by whoever
  opens it.

### Validator Components Affected

None. Each proposal is an interface implemented by an on-chain program using
the existing Ed25519 signature-verification precompile. No runtime, virtual
machine, consensus or networking change is required. RPC providers, indexers
and explorers MAY decode the account layouts defined here.

## Alternatives Considered

- **Optimistic resolution with human disputes.** Optimistic oracles and
  decentralized courts use human voters. They are proven and complementary,
  and could serve as the dispute layer for a ruling. Human resolution is slower
  and harder to scale to every withdrawal or proposal.

- **Editing or deleting overturned rulings.** Simpler to read, but it would
  erase the record that the original decision was made and acted on, and the
  reasoning behind it. Append-only review keeps both.

## Impact

- **Calling programs** get one account to check before acting, with a
  compact return value.
- **Wallets and explorers** can show the decision, reasoning, sources,
  signatures and full review history of any ruling.
- **Parties to a decision** get a standard path to dispute or challenge it.
- **Validators and core contributors** are not affected.

## Security Considerations

- **Models can be wrong or manipulated.** Prompt injection through inputs and
  evidence, forged evidence and shared blind spots across model families are
  real risks. In the author's tests, a forged correction placed in the
  evidence led all ten models tested to the same wrong answer. Calling
  programs MUST keep hard limits in code, MUST restrict effects to listed
  outcomes, and SHOULD require dispute windows for high-value actions.
  Harnesses SHOULD compile untrusted context before a model reads it, so
  text that tries to instruct the reader reaches it only as quoted evidence;
  [Prompt Guard](https://github.com/Verafyai/prompt-guard) is one open
  implementation, with a deterministic record any verifier can recompute.

- **Misleading summaries.** A rapporteur could summarize unfairly. Sign-off
  by a quorum of agreeing evaluators, and dissents, limit this. The full
  reasoning and each vote's output stay available by hash.

- **Made-up sources.** Models can cite documents that do not exist. Sources
  must hash to the pinned prompt, context entries or evidence, so a citation to
  anything else is rejected on chain.

- **Relitigation.** A party that lost can keep challenging, hoping to draw
  a friendlier jury. Bonds, the requirement for new evidence or grounds,
  growing jury floors and distinct families for each review limit this.
  Programs MAY raise the bond with each review of the same ruling.

- **Market manipulation.** A party with a position in a prediction market can
  try to steer its forecast or resolution through the pages it links or the
  sources it supplies. Resolvers SHOULD name their deciding sources in
  internal context, snapshot them at a defined time, and allow challenges.
- **Planted evidence.** A challenge's new evidence can be forged as easily
  as the original's. It is pinned and judged like any other evidence, and
  can itself be challenged.

## Backwards Compatibility

This proposal adds a new program interface and changes nothing existing.

## Conformance

- A reference implementation of these instructions, with tests for quorum
  and no-quorum finalization, opinions, sign-off and dissents, rejection of
  sources outside the pinned hashes, `ReadRuling` return data, disputes that
  uphold and overturn, and challenges on each ground that affirm, overturn
  and supersede, including repeat challenges and rejected duplicates.
- A localnet ledger demonstrating a governance program that executes a
  proposal only after a final ruling against a DAO constitution, and a later
  challenge that overturns it.
