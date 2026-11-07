---
vip: '0013'
title: 'Hardware attestation: prove a harness runs a known build inside an enclave'
status: Building
created: 2026-11-07
requirement: NET-002
depends: ['0012']
---

## Summary

A harness can prove it runs inside a hardware enclave, on a known harness build, with its voting key generated inside that enclave. The first enclave supported is AMD SEV-SNP: confidential VMs on AMD EPYC servers, offered by the major clouds.

The proof is the enclave's attestation report:
- signed by a key that chains to AMD's root certificate;
- carrying the VM's launch measurement;
- carrying 64 bytes the harness chooses, used to bind in its key.

A jury can require attested harnesses.

## Motivation

You can't inspect someone else's machine. Today the harness makes cheating unprofitable instead: signed commit-reveal, bonds and slashing, random audits, and inference proofs. Those catch a wrong answer after the fact. They don't stop an operator from running modified code that, say, leaks a juror's vote before the reveal, or swaps the model on cases it cares about.

An enclave changes what can be checked. The CPU measures the VM image at launch and signs that measurement. If the measurement is a published harness build, and the voting key was made inside, then the key votes only as that build decides. The operator can't read its memory or change its code without changing the measurement.

## Proposal

### The attestation record

Code: `packages/core/src/attestation.js`. The record carries:

- **`kind`:** `sev-snp`, or `dev` for tests. A `dev` record is never accepted as hardware.
- **`report`:** the raw report, base64. 1184 bytes for SEV-SNP.
- **`certChain`:** PEM certificates from the chip's VCEK up to AMD's root (ASK, then ARK).
- **`binding`:** `report_data` must equal `sha256(harness public key) || sha256(harness build hash)`.

### Verification

`verifyAttestation(record, {roots, builds, harnessKey, buildHash})` checks:

1. **Certificates.** The chain verifies: VCEK signed by ASK, ASK by ARK, and ARK is one of the trusted AMD roots.
2. **Signature.** The report's ECDSA P-384 signature verifies with the VCEK key over the first 0x2A0 bytes.
3. **Debug off.** The guest policy has debug disabled. A debuggable VM can be read by its host.
4. **Measurement.** The launch measurement is on the published allowlist of harness builds (`config/attested-builds.json`).
5. **Key binding.** The report data binds this harness key and this build.

**The build hash.** `harnessBuildHash()` is `sha256` over the harness source files, sorted. Anyone can recompute it from a checkout.

### Using it

- **On the card.** A harness card may carry `attestation`. The registry (VIP-0012) stores its hash, so a client fetches the record and checks it against the hash.
- **In juries.** Jury rules may set `attested: true`. `eligibleJurors` then seats only harnesses whose attestation verifies.

## What's built and what isn't

| Part | State |
|---|---|
| Record format, binding, build hash | Built |
| SEV-SNP report parsing, P-384 signature, certificate chain | Built; tested with a test chain made in the test |
| AMD root certificates | Not bundled. Fetched from AMD's key distribution service and pinned by hash, by the operator |
| A harness actually running in an SEV-SNP VM | Not done. Needs a confidential VM on a cloud that offers SEV-SNP |
| Reproducible VM image, so the measurement can be published | Not done. Without it the allowlist has nothing real to list |
| Intel TDX, NVIDIA confidential GPUs | Not started. Same record, a different verifier |

**About GPUs.** Large models run on GPUs. A CPU enclave alone doesn't cover inference on a GPU outside it, so full coverage needs NVIDIA confidential computing on the GPU as well.

## Decisions for Rex

- **Which cloud first.** Azure, GCP and AWS all offer SEV-SNP VMs.
- **GPU attestation.** Whether to require it for jury seats, or accept CPU-only attestation with proofs (VIP-0009).

## Tracking

Requirement NET-002.
