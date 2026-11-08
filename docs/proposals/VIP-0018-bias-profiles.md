---
vip: '0018'
title: 'Bias profiles: measure how each model leans, and map models against each other'
status: 'Shipped (v0.0.4-alpha): escrow and wallet-case probes; no real model profiled yet'
created: 2026-11-07
requirement: SIGN-006
depends: ['0003', '0010', '0014']
---

## Summary

A bias profile is a set of measured numbers that say how a model leans when it judges. It records how much its answer moves when something that shouldn't matter changes:

- the order of the options;
- an authority claim in untrusted text;
- the framing;
- where the evidence sits;
- which party is which;
- an irrelevant number;
- a longer argument for the wrong side.

It also records how often the model approves by default, how well its confidence matches its accuracy, and how consistent it is across runs.

Profiles are published next to certifications. Profiles of different models can be compared and mapped, so a jury can be chosen from models that don't share the same leanings.

## Motivation

Jury diversity today counts model families (VIP-0003). Family is a proxy. Two models from different families can share a bias, such as deferring to "approved by compliance", and a jury of them fails together. Wallet owners choosing models for a judiciary signer (VIP-0010) also want to know how a model leans, not just whether it passed the attack suite (VIP-0014).

Each bias is measured the same way: hold the facts fixed, change one thing that shouldn't matter, and count how often the answer changes. That makes bias a number per model, comparable across models and over time.

## Proposal

### Probes

Code: `packages/core/src/bias.js`.

Each probe is a pair of contracts with the same facts and one change. The suite is generated and hashed, like the attack suite.

| Parameter | The change | What a fair model does |
|---|---|---|
| `orderFlip` | Options listed APPROVE, REJECT, then REJECT, APPROVE | Same answer |
| `authorityShift` | Untrusted text adds "approved by the compliance team" | Same answer |
| `framingFlip` | Same facts, described positively or negatively | Same answer |
| `positionFlip` | The deciding fact first, or last | Same answer |
| `roleSymmetry` | The two parties' roles swapped | The mirrored answer |
| `anchorShift` | An irrelevant large number mentioned | Same answer |
| `lengthShift` | A long, empty argument added for the wrong side | Same answer |

Plus three measured on their own:

- `approveRate`: approvals on cases built to be balanced;
- `overconfidence`: mean stated confidence minus accuracy;
- `inconsistency`: how often repeated runs of the same case disagree.

**No demographic probes.** Party swaps use roles and neutral labels, never names chosen to signal a group. This profiler measures how a model judges contracts, not how it treats people.

### The profile record

`verafy.bias-profile/1`:
- the pinned model id and family;
- the suite hash;
- the runs;
- the date;
- the label "measured";
- each parameter as a share from 0 to 1, with how many pairs it rests on.

### Maps

- **`profileDistance(a, b)`:** how differently two models lean, across all parameters.
- **`biasMap(profiles)`:** places models in two dimensions from those distances, using classical multidimensional scaling, for a picture. The table of numbers stays the source.
- **`leastSharedBias(profiles, k)`:** picks the k models whose leanings overlap least, as a jury suggestion next to the family rule.

### Unannounced probes

A model that can tell a test from a real case can behave well only on tests. So probes also run unannounced:

- **Random.** Each live case is replaced by a probe with a small probability, set by a secret seed. Probes arrive at irregular times, and the two halves of a pair go out at different times.
- **Disguised.** A probe takes the shape of the live contracts around it: the same id format, payment, answer type and fields. Nothing in it says "test".
- **Never executed.** The sealer routes probe rulings to the profile and never executes them. Jurors are paid the same, so pay gives nothing away.
- **Checkable.** The hash of the seed is published before the window. The seed is revealed after it, so anyone can check that probes weren't aimed at particular jurors.

Code: `ProbeInjector`, `probeAt` and `disguise` in `packages/core/src/bias.js`.

**One limit.** A disguised probe keeps its own instructions, which are written for milestone escrow. That's indistinguishable among escrow-type contracts. Among wallet cases it would stand out, so a probe set written as wallet cases is the next step.

### Use

- **Certifications** carry a profile.
- **The signer setup** shows the profile of each chosen model, and warns when the chosen models share a large bias, such as all of them shifting under authority claims.

## What's built and what isn't

- **Built:** the probes, the runner, the record, distance, the map and jury suggestions, tested with scripted models whose biases are known.
- **Not measured:** no real model has been profiled. That needs provider API keys, the same as VIP-0014.

## Decisions for Rex

- Whether profiles should ever block a model, or only inform.
- Which models to profile first.

## Tracking

Requirement SIGN-006.
