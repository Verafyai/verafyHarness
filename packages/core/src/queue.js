/**
 * The encrypted queue: a contract waits for its block sealed to the node set,
 * so nobody reads it before its jury is drawn. That stops front-running,
 * pre-bribing likely jurors, and copying a question into a competing market.
 *
 *   sealContract   the author encrypts the contract under a fresh AES-256-GCM
 *                  key and splits that key t of n (Shamir) across the nodes,
 *                  each share encrypted to one node's X25519 key
 *   openShare      a node decrypts its own share (the chain node releases it
 *                  only after the jury is drawn from the parent block hash)
 *   openContract   any t shares rebuild the key and decrypt the contract
 *
 * Only the escrow reference and the payment metadata needed to check funding,
 * draw a jury and close a block travel in the clear (`queueMeta`). They are
 * bound to the ciphertext as AES-GCM associated data, and checked against the
 * plaintext when it opens.
 *
 * What this is not:
 *   - Not distributed key generation. The author deals the shares for its own
 *     contract (it knows the plaintext anyway). Real DKG for a standing node
 *     key, and verifiable shares, are planned (ROADMAP.md).
 *   - Not privacy from the prover. A proving machine sees the plaintext it
 *     proves. Encryption protects the queue, not the prover.
 *   - Not privacy for funds. The escrow stays on the source chain, where its
 *     amount is public unless that chain supports confidential amounts.
 *
 * Built only on `node:crypto`; core stays at zero dependencies.
 * @module @verafyharness/core/queue
 */
import {
  createCipheriv, createDecipheriv, createPublicKey, createPrivateKey, diffieHellman,
  generateKeyPairSync, hkdfSync, randomBytes, KeyObject,
} from 'node:crypto'
import { canonical, sha256 } from './hash.js'
import { validate } from './asc.js'

export const SEALED_KIND = 'verafy.sealed/1'

/** The Mersenne prime 2^521 - 1: the field for Shamir shares of a 256-bit key. */
export const SHAMIR_PRIME = (1n << 521n) - 1n

// ---- Shamir secret sharing over GF(p) ----------------------------------------

const mod = (a, p = SHAMIR_PRIME) => ((a % p) + p) % p

function modPow(base, exp, p = SHAMIR_PRIME) {
  let r = 1n, b = mod(base, p), e = exp
  while (e > 0n) {
    if (e & 1n) r = (r * b) % p
    b = (b * b) % p
    e >>= 1n
  }
  return r
}

const inverse = a => modPow(a, SHAMIR_PRIME - 2n)
const toBig = buf => BigInt('0x' + (Buffer.from(buf).toString('hex') || '0'))
const randomField = () => mod(toBig(randomBytes(72)))

/**
 * Split a secret into n shares, any t of which rebuild it.
 * @param {Buffer} secret - up to 64 bytes.
 * @param {number} n - shares to make.
 * @param {number} t - shares needed to rebuild.
 * @returns {{x: number, y: string}[]} shares; `y` is hex.
 */
export function splitSecret(secret, n, t) {
  if (!(Number.isInteger(n) && Number.isInteger(t) && t >= 1 && t <= n && n <= 255)) throw new Error(`threshold must satisfy 1 <= t <= n <= 255 (got t=${t}, n=${n})`)
  if (secret.length > 64) throw new Error('secret is longer than 64 bytes')
  const coeffs = [toBig(secret), ...Array.from({ length: t - 1 }, randomField)]
  return Array.from({ length: n }, (_, i) => {
    const x = BigInt(i + 1)
    let y = 0n
    for (let k = coeffs.length - 1; k >= 0; k--) y = mod(y * x + coeffs[k])
    return { x: i + 1, y: y.toString(16) }
  })
}

/**
 * Rebuild a secret from shares by Lagrange interpolation at zero. With fewer
 * than t shares, or a wrong share, the result is a wrong secret, not an error:
 * the AES-GCM tag is what catches it.
 * @param {{x: number, y: string}[]} shares - distinct shares.
 * @param {number} [bytes] - the secret's length.
 * @returns {Buffer} the secret.
 */
export function combineSecret(shares, bytes = 32) {
  const xs = shares.map(s => BigInt(s.x))
  if (new Set(xs.map(String)).size !== xs.length) throw new Error('shares must have distinct x')
  let s = 0n
  shares.forEach((share, i) => {
    let num = 1n, den = 1n
    xs.forEach((xj, j) => { if (j !== i) { num = mod(num * xj); den = mod(den * (xj - xs[i])) } })
    s = mod(s + BigInt('0x' + share.y) * num * inverse(den))
  })
  const hex = s.toString(16).padStart(bytes * 2, '0')
  if (hex.length > bytes * 2) return Buffer.alloc(bytes) // not a valid secret; decryption will fail
  return Buffer.from(hex, 'hex')
}

// ---- Node encryption keys (X25519) -----------------------------------------

/**
 * A node's queue key: X25519, separate from its Ed25519 signing identity.
 * @returns {{publicKey: string, privateKey: import('node:crypto').KeyObject}} the public key as base64 DER.
 */
export function createQueueKey() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  return { publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), privateKey }
}

const pub = b64 => createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' })
const priv = k => k instanceof KeyObject ? k : createPrivateKey(String(k))

function gcmSeal(key, plaintext, aad) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') }
}

function gcmOpen(key, box, aad) {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'))
  d.setAAD(Buffer.from(aad, 'utf8'))
  d.setAuthTag(Buffer.from(box.tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(box.ct, 'base64')), d.final()]).toString('utf8')
}

function shareKey(secret, epk, node, x) {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.from(epk, 'base64'), `${SEALED_KIND} share ${node} ${x}`, 32))
}

// ---- Contract envelopes -----------------------------------------------------

/**
 * A rough token count for a contract: about four characters per token over
 * its instructions, question and context, the same rule as packages/pack.
 * Used to check the size an author declares in the clear.
 * @param {object} asc - a contract with its context bytes.
 * @returns {number} tokens (rough).
 */
export function contractTokens(asc) {
  const text = canonical({ instructions: asc.instructions ?? '', question: asc.question, context: (asc.context ?? []).map(c => c.content ?? '') })
  return Math.ceil(text.length / 4)
}

/**
 * The fields of a contract that travel in the clear: what a node needs to
 * check funding, draw a jury and decide when the block closes. Nothing about
 * the question, its context or its exits.
 * @param {object} asc - the contract.
 * @param {{escrowRef: string, tokens?: number}} options - where the escrow sits on the source chain, and the declared size.
 * @returns {object} the clear metadata.
 */
export function queueMeta(asc, { escrowRef, tokens } = {}) {
  const p = asc.payment
  const { size, minFamilies, minLabs, quorum, assurance, excludeFamilies, excludeLabs, excludeHarnesses } = p.jury
  return JSON.parse(JSON.stringify({
    escrowRef,
    escrow: p.escrow,
    currency: p.currency,
    chain: p.chain,
    maxValuePerVote: p.maxValuePerVote,
    jury: { size, minFamilies, minLabs, quorum, assurance, excludeFamilies, excludeLabs, excludeHarnesses },
    minBatch: p.minBatch,
    maxWaitSeconds: p.maxWaitSeconds,
    tokens: tokens ?? contractTokens(asc),
  }))
}

/**
 * Where the opened contract disagrees with the metadata it was queued under.
 * @param {object} asc - the opened contract.
 * @param {object} meta - the clear metadata.
 * @returns {string[]} problems; empty when they agree.
 */
export function metaProblems(asc, meta) {
  const p = []
  const expected = queueMeta(asc, { escrowRef: meta.escrowRef, tokens: meta.tokens })
  for (const k of ['escrow', 'currency', 'chain', 'maxValuePerVote', 'jury', 'minBatch', 'maxWaitSeconds']) {
    if (canonical(expected[k] ?? null) !== canonical(meta[k] ?? null)) p.push(`clear ${k} does not match the contract`)
  }
  const counted = contractTokens(asc)
  if (!(meta.tokens >= counted)) p.push(`declared ${meta.tokens} tokens; the contract has about ${counted}`)
  return p
}

const aadFor = env => canonical({ kind: env.kind, meta: env.meta, committee: env.committee })

/**
 * Seal a contract to the node set, t of n.
 * @param {object} asc - a valid contract, with its context bytes.
 * @param {{id: string, encryptionKey: string}[]} committee - every node's id and X25519 public key.
 * @param {{t: number, escrowRef: string, tokens?: number}} options - shares needed, the escrow reference, the declared size.
 * @returns {object} the sealed envelope, safe to publish.
 */
export function sealContract(asc, committee, { t, escrowRef, tokens } = {}) {
  const problems = validate(asc)
  if (problems.length) throw new Error(`contract rejected: ${problems.join('; ')}`)
  if (!escrowRef) throw new Error('escrowRef is required: where the escrow sits on the source chain')
  if (asc.context.some(c => typeof c.content !== 'string')) throw new Error('seal the contract with its context bytes; they are revealed with it')
  const nodes = [...committee].sort((a, b) => a.id.localeCompare(b.id))
  const n = nodes.length
  const meta = queueMeta(asc, { escrowRef, tokens })
  const metaProblem = metaProblems(asc, meta)
  if (metaProblem.length) throw new Error(metaProblem.join('; '))
  const env = { kind: SEALED_KIND, meta, committee: { t, n, nodes: nodes.map(m => m.id) } }
  const key = randomBytes(32)
  const shares = splitSecret(key, n, t)
  env.cipher = { alg: 'aes-256-gcm', ...gcmSeal(key, canonical(asc), aadFor(env)) }
  env.shares = nodes.map((m, i) => {
    const eph = generateKeyPairSync('x25519')
    const epk = eph.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
    const secret = diffieHellman({ privateKey: eph.privateKey, publicKey: pub(m.encryptionKey) })
    const box = gcmSeal(shareKey(secret, epk, m.id, shares[i].x), shares[i].y, aadFor(env))
    return { node: m.id, x: shares[i].x, epk, ...box }
  })
  return env
}

/**
 * The envelope's id: SHA-256 of its canonical JSON.
 * @param {object} env - a sealed envelope.
 * @returns {string} hex.
 */
export function queueId(env) {
  return sha256(env)
}

/**
 * Structural checks a node runs before queueing an envelope.
 * @param {object} env - the envelope.
 * @param {{nodes?: string[], t?: number}} [expect] - the node set and threshold the chain requires.
 * @returns {string[]} problems.
 */
export function envelopeProblems(env, { nodes, t } = {}) {
  const p = []
  if (env?.kind !== SEALED_KIND) p.push(`kind must be "${SEALED_KIND}"`)
  const m = env?.meta
  if (!m?.escrowRef) p.push('meta.escrowRef is required')
  if (!(m?.escrow > 0)) p.push('meta.escrow must be positive')
  if (!(m?.jury?.size >= 1 && (m.jury.minFamilies ?? m.jury.minLabs) >= 1 && (m.jury.minFamilies ?? m.jury.minLabs) <= m.jury.size)) p.push('meta.jury needs size and minFamilies')
  if (!(Number.isInteger(m?.tokens) && m.tokens > 0)) p.push('meta.tokens must be a positive integer')
  const c = env?.committee
  if (!(c?.t >= 1 && c.t <= c.n && c.nodes?.length === c.n)) p.push('committee needs t <= n and n node ids')
  if (t !== undefined && c?.t !== t) p.push(`the chain requires t = ${t}`)
  if (nodes && canonical([...nodes].sort()) !== canonical(c?.nodes ?? [])) p.push('committee is not this chain\'s node set')
  if (!env?.cipher?.ct || env.cipher.alg !== 'aes-256-gcm') p.push('cipher must be aes-256-gcm')
  if (canonical((env?.shares ?? []).map(s => s.node)) !== canonical(c?.nodes ?? [])) p.push('one share per committee node, in order')
  return p
}

/**
 * A node decrypts its own share. The chain node decides when to release it.
 * @param {object} env - the envelope.
 * @param {string} nodeId - this node's id.
 * @param {import('node:crypto').KeyObject | string} privateKey - this node's X25519 private key.
 * @returns {{x: number, y: string}} the share.
 */
export function openShare(env, nodeId, privateKey) {
  const s = env.shares.find(x => x.node === nodeId)
  if (!s) throw new Error(`no share for ${nodeId}`)
  const secret = diffieHellman({ privateKey: priv(privateKey), publicKey: pub(s.epk) })
  return { x: s.x, y: gcmOpen(shareKey(secret, s.epk, nodeId, s.x), s, aadFor(env)) }
}

/**
 * Open a contract from its content key: decrypt, parse, and check the clear
 * metadata against the plaintext.
 * @param {object} env - the envelope.
 * @param {Buffer | string} key - the 32-byte content key (or hex).
 * @returns {object} the contract.
 */
export function openWithKey(env, key) {
  let text
  try { text = gcmOpen(Buffer.isBuffer(key) ? key : Buffer.from(String(key), 'hex'), env.cipher, aadFor(env)) } catch { throw new Error('could not open the contract: the key does not decrypt it') }
  const asc = JSON.parse(text)
  const problems = [...validate(asc), ...metaProblems(asc, env.meta)]
  if (problems.length) throw new Error(`opened contract rejected: ${problems.join('; ')}`)
  return asc
}

/**
 * Open a contract from t or more shares.
 * @param {object} env - the envelope.
 * @param {{x: number, y: string}[]} shares - released shares.
 * @returns {{asc: object, key: string}} the contract and its content key (hex), which may then be published.
 */
export function openContract(env, shares) {
  const distinct = [...new Map(shares.map(s => [s.x, s])).values()]
  if (distinct.length < env.committee.t) throw new Error(`need ${env.committee.t} shares to open, have ${distinct.length}`)
  const key = combineSecret(distinct.slice(0, env.committee.t))
  return { asc: openWithKey(env, key), key: key.toString('hex') }
}
