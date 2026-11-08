# Hardware attestation

*Prove a harness runs a known build inside an enclave, with its voting key made inside it.*

**Why.** You can't inspect someone else's machine. Bonds, audits and proofs catch a wrong answer after the fact. An enclave changes what can be checked before: the CPU measures the VM at launch and signs that measurement, and the operator can't read the VM's memory or change its code without changing it.

**AMD SEV-SNP first.** A harness asks its enclave for a report whose 64 bytes of report data are `sha256(harness key) || sha256(build hash)`. Verification checks:

- the AMD certificate chain up to a root the operator pinned;
- the report's P-384 signature;
- that debugging is off;
- that the launch measurement is a published harness build;
- that the report binds this key and this build.

Juries can then require `attested: true`.

**What isn't done.** No harness runs in a real enclave yet; that needs a confidential VM on a cloud that offers SEV-SNP. Publishing a measurement needs a reproducible VM image. GPU inference needs NVIDIA confidential computing as well.

**Status.** Verification built and tested with a test certificate chain (NET-002). Design: [VIP-0013](https://github.com/Verafyai/verafyHarness/blob/main/docs/proposals/VIP-0013-hardware-attestation.md).

**Related:** [The harness registry](/learn/harness-registry), [Proof of inference](/learn/proof-of-inference)
