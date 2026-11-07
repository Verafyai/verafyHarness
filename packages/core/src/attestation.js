/**
 * Hardware attestation (VIP-0013): a harness proves it runs a known harness
 * build inside a hardware enclave, with its voting key bound into the
 * enclave's signed report. The first enclave is AMD SEV-SNP.
 *
 *   report_data (64 bytes) = sha256(harness public key) || sha256(build hash)
 *
 * so a report proves this key, this build. The launch measurement must be on
 * the published allowlist of harness builds, and the chip's key must chain to
 * a trusted AMD root. A `dev` record exists for tests and local runs and is
 * never accepted as hardware.
 * @module @verafyharness/core/attestation
 */
import { X509Certificate, createHash, verify as edVerify } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const ATTESTATION_KINDS = ['sev-snp', 'dev']
export const SNP_REPORT_SIZE = 0x4a0
const SNP_SIGNED = 0x2a0
const SNP_DEBUG_BIT = 1n << 19n

/**
 * The harness build hash: sha256 over every harness source file (path and
 * content), sorted, so anyone can recompute it from a checkout.
 * @param {string} root - the repository root.
 * @param {string[]} [dirs] - the source directories that make up the harness.
 * @returns {string} hex.
 */
export function harnessBuildHash(root, dirs = ['packages/core/src', 'packages/daemon/src']) {
  const files = []
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|json)$/.test(n)) files.push(p) } }
  for (const d of dirs) walk(join(root, d))
  const h = createHash('sha256')
  for (const f of files.map(f => relative(root, f).split('\\').join('/')).sort()) h.update(f).update('\0').update(createHash('sha256').update(readFileSync(join(root, f))).digest()).update('\0')
  return h.digest('hex')
}

/**
 * The 64 bytes a harness asks the enclave to put in its report.
 * @param {string} harnessKey - the harness public key (base64 DER, as on its card).
 * @param {string} buildHash - the harness build hash (hex).
 * @returns {Buffer} 64 bytes.
 */
export function reportData(harnessKey, buildHash) {
  return Buffer.concat([createHash('sha256').update(harnessKey).digest(), createHash('sha256').update(Buffer.from(buildHash, 'hex')).digest()])
}

/**
 * Read the fields of an SEV-SNP attestation report that verification needs.
 * @param {Buffer} r - the 1184-byte report.
 * @returns {object} version, policy, signature algorithm, report data, measurement, chip id and signature.
 */
export function parseSnpReport(r) {
  if (r.length !== SNP_REPORT_SIZE) throw new Error(`an SEV-SNP report is ${SNP_REPORT_SIZE} bytes, not ${r.length}`)
  const le = b => Buffer.from(b).reverse()
  return {
    version: r.readUInt32LE(0x00),
    guestSvn: r.readUInt32LE(0x04),
    policy: r.readBigUInt64LE(0x08),
    vmpl: r.readUInt32LE(0x30),
    signatureAlgo: r.readUInt32LE(0x34),
    reportData: r.subarray(0x50, 0x90),
    measurement: r.subarray(0x90, 0xc0).toString('hex'),
    hostData: r.subarray(0xc0, 0xe0).toString('hex'),
    chipId: r.subarray(0x1a0, 0x1e0).toString('hex'),
    // r and s are 72-byte little-endian fields; P-384 uses the low 48 bytes.
    signature: Buffer.concat([le(r.subarray(0x2a0, 0x2a0 + 48)), le(r.subarray(0x2e8, 0x2e8 + 48))]),
    signed: r.subarray(0, SNP_SIGNED),
  }
}

/**
 * Verify an attestation record.
 * @param {{kind: string, report?: string, certChain?: string[], harnessKey: string, buildHash: string, measurement?: string, signature?: string}} rec - the record.
 * @param {{roots: string[], builds: {measurement: string, buildHash: string}[], harnessKey: string, devKeys?: string[], allowDev?: boolean}} o -
 *   `roots`: PEM certificates of the trusted AMD roots (ARK), pinned by the operator;
 *   `builds`: the published allowlist of harness builds and their launch measurements;
 *   `harnessKey`: the key on the card this record claims to attest.
 * @returns {{ok: boolean, kind: string, hardware: boolean, problems: string[], measurement?: string}} the result.
 */
export function verifyAttestation(rec, { roots = [], builds = [], harnessKey, allowDev = false } = {}) {
  const problems = []
  const kind = rec?.kind
  if (!ATTESTATION_KINDS.includes(kind)) return { ok: false, kind, hardware: false, problems: [`kind must be one of ${ATTESTATION_KINDS.join(', ')}`] }
  if (rec.harnessKey !== harnessKey) problems.push('the record attests a different harness key')
  const build = builds.find(b => b.buildHash === rec.buildHash)
  if (!build) problems.push(`build ${String(rec.buildHash).slice(0, 12)} is not on the published allowlist`)

  if (kind === 'dev') {
    if (!allowDev) problems.push('a dev attestation is not hardware; it is accepted only when allowDev is set, for tests and local runs')
    return { ok: problems.length === 0, kind, hardware: false, problems }
  }

  let report
  try { report = parseSnpReport(Buffer.from(rec.report ?? '', 'base64')) } catch (e) { return { ok: false, kind, hardware: true, problems: [...problems, e.message] } }
  // 1. The chain: VCEK signed by ASK, ASK by ARK, ARK one of the pinned roots.
  let vcek
  try {
    const [v, ask, ark] = (rec.certChain ?? []).map(p => new X509Certificate(p))
    if (!v || !ask || !ark) throw new Error('certChain must be [VCEK, ASK, ARK]')
    if (!v.verify(ask.publicKey)) problems.push('the VCEK is not signed by the ASK')
    if (!ask.verify(ark.publicKey)) problems.push('the ASK is not signed by the ARK')
    if (!ark.verify(ark.publicKey)) problems.push('the ARK is not self-signed')
    if (!roots.map(p => new X509Certificate(p).fingerprint256).includes(ark.fingerprint256)) problems.push('the ARK is not one of the trusted roots')
    vcek = v
  } catch (e) { problems.push(`certificate chain: ${e.message}`) }
  // 2. The report's signature, by the VCEK, over its first 0x2A0 bytes.
  if (report.signatureAlgo !== 1) problems.push(`signature algorithm ${report.signatureAlgo} is not ECDSA P-384 with SHA-384`)
  if (vcek && !edVerify('sha384', report.signed, { key: vcek.publicKey, dsaEncoding: 'ieee-p1363' }, report.signature)) problems.push('the report signature does not verify with the VCEK')
  // 3. Debug off: a debuggable VM can be read by its host.
  if (report.policy & SNP_DEBUG_BIT) problems.push('the guest policy allows debugging')
  // 4. The launch measurement is the allowlisted build's.
  if (build && build.measurement !== report.measurement) problems.push('the launch measurement is not the allowlisted measurement for this build')
  // 5. The report binds this harness key and this build.
  if (!report.reportData.equals(reportData(harnessKey, rec.buildHash ?? ''))) problems.push('the report data does not bind this harness key and build')
  return { ok: problems.length === 0, kind, hardware: true, problems, measurement: report.measurement }
}

/**
 * Whether a harness or card may sit on an attested jury: its record was
 * verified by whoever built the pool (see `markAttested`). Dev records never count.
 * @param {object} h - a harness or card.
 * @returns {boolean} true when attested by hardware.
 */
export const attested = h => h?.attestationStatus === 'verified' && h?.attestation?.kind !== 'dev'

/**
 * Verify every card's attestation and mark the ones that pass, so jury
 * rules with `attested: true` can seat them.
 * @param {object[]} pool - harnesses or cards, each with `publicKey` and optionally `attestation`.
 * @param {object} o - the verification options (roots and build allowlist).
 * @returns {object[]} the pool, each with `attestationStatus` set.
 */
export function markAttested(pool, o) {
  return pool.map(h => {
    if (!h.attestation) return Object.assign(h, { attestationStatus: 'none' })
    const r = verifyAttestation(h.attestation, { ...o, harnessKey: h.publicKey ?? h.card?.publicKey })
    return Object.assign(h, { attestationStatus: r.ok && r.hardware ? 'verified' : 'failed', attestationProblems: r.problems })
  })
}


