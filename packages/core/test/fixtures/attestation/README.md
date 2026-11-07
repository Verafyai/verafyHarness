# Test attestation chain

A certificate chain made with OpenSSL for tests only: `ark.pem` signs `ask.pem`,
which signs `vcek.pem`, all ECDSA P-384, the same shape as AMD's SEV-SNP chain.
None of it is AMD's. `vcek.key` is kept so the tests can sign a report the way
an AMD chip would. Never trust these certificates outside the tests.
