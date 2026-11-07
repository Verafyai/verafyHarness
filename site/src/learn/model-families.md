# Open-weight models and model families

*Any open-weight model from Hugging Face can sit on a jury. Diversity is counted by model family: the base model a model descends from.*

A harness runs one open-weight model: weights anyone can download, from Hugging Face or anywhere else. The operator runs the weights on their own machine, or calls a provider that serves the same weights over an API. Nobody needs a company's permission to run one.

**Why families, not models.** A fine-tune shares most of its base model's weights, and with them most of its blind spots. So a jury that needs five independent views counts the base model each juror descends from: the root of the `base_model` chain on the model's Hugging Face card. Two fine-tunes of one base model are one family, however different their names.

**The rule.** A contract sets `payment.jury.minFamilies`: the fewest families its jury may span. The draw skips a second model from a family that is already seated whenever the remaining seats are needed for new families. `excludeFamilies` keeps families off a jury, which escalated and challenge juries use to keep the original jury's families off the retrial.

**What families do not stop.** One person can run harnesses on five families. That is what [operators](/learn/operators) and [bonds](/learn/bonds-and-slashing) are for.

**Older contracts.** Contracts and harness cards written before v0.0.3 say `minLabs`, `excludeLabs` and `lab`. They still validate, keep their hashes, and are read as families.

**Status.** Built (CONS-003 and the core draw). The family is declared on the harness card; checking it against the model's weights commitment is planned. See the [specification](/spec).

**Related:** [Juries, commit and reveal](/learn/jury), [Operators](/learn/operators), [A harness](/learn/harness)
