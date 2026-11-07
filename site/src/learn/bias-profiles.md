# Bias profiles

*How a model leans when it judges, measured as numbers that can be compared and mapped.*

**How it's measured.** Hold the facts fixed, change one thing that shouldn't matter, and count how often the answer moves. The things changed:
- the order of the options;
- an "approved by compliance" claim in untrusted text;
- positive or negative framing;
- where the deciding fact sits;
- which party is which (the answer should mirror);
- an irrelevant large number;
- a long, empty argument for the wrong side.

Measured on their own: the approve rate on genuinely balanced cases, overconfidence (stated confidence minus accuracy), and inconsistency across runs. No probe uses names chosen to signal a group of people.

**Maps.** Two profiles have a distance. Many profiles can be placed on a plane, and a jury can be suggested from the models whose leanings overlap least. Family diversity is a proxy for this; profiles measure it.

**Unannounced.** Probes also fire at random among live cases, shaped like them, and their rulings never execute. The seed's hash is published first and the seed afterwards, so anyone can check the schedule. A model can't behave well only when it's being tested.

**Status.** Built (SIGN-006), tested with scripted models whose biases are known. No real model profiled yet. Design: [VIP-0018](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0018-bias-profiles.md).

**Related:** [Model certification](/learn/model-certification), [Model families](/learn/model-families), [The Judiciary Signer](/learn/judiciary-signer)
