/**
 * The randomness beacon (VIP-0002): jury seeds that no block sealer can steer.
 *
 * Each sealer registers an anchor, the last link of a hash chain it built from a
 * secret: anchor = H^n(secret). Every block it seals reveals the next link back
 * toward the secret, and anyone checks H(reveal) == the previous link. The
 * reveals were fixed when the anchor was registered, long before any contract
 * existed, so a sealer cannot pick a reveal to suit a jury. Its only freedom is
 * to withhold one, which is a slashable fault (`no-beacon-reveal`).
 *
 *   value[h] = sha256(value[h-1] || reveal[h])        value[0] = sha256("verafy.beacon/1:genesis")
 *
 * A contract admitted while the tip is at height a is drawn with value[a + L]
 * (L = `lookahead`, default 1): a value that did not exist when the contract
 * was admitted. The value does not depend on what the block contains, so
 * grinding block contents changes nothing.
 * @module @verafyharness/core/beacon
 */
import { randomBytes } from 'node:crypto'
import { sha256 } from './hash.js'

export const BEACON_KIND = 'verafy.beacon/1'
export const BEACON_GENESIS = sha256(`${BEACON_KIND}:genesis`)
/** Illustrative until Rex sets them (VIP-0002). */
export const BEACON_DEFAULTS = Object.freeze({ lookahead: 1, chainLength: 10_000, label: 'illustrative' })

const link = hex => sha256(Buffer.from(hex, 'hex'))

/**
 * A sealer's hash chain. Keep `secret` private; publish `anchor`.
 * @param {{secret?: string, length?: number}} [options] - a 32-byte hex secret (fresh when omitted) and the chain length.
 * @returns {{secret: string, length: number, anchor: string, reveal: (k: number) => string}} the chain. `reveal(k)` is the k-th reveal, k from 1.
 */
export function beaconChain({ secret = randomBytes(32).toString('hex'), length = BEACON_DEFAULTS.chainLength } = {}) {
  const at = n => { let x = secret; for (let i = 0; i < n; i++) x = link(x); return x }
  let cacheK = -1, cacheV = null
  return {
    secret,
    length,
    anchor: at(length),
    reveal(k) {
      if (!(Number.isInteger(k) && k >= 1 && k <= length)) throw new Error(`beacon chain has reveals 1 to ${length}; asked for ${k}`)
      if (cacheK === k) return cacheV
      cacheK = k; cacheV = at(length - k)
      return cacheV
    },
  }
}

/** The next beacon value. A withheld reveal mixes in a fixed marker, so the chain still advances. */
export function mixBeacon(prev, reveal, height) {
  return sha256(prev + (reveal ?? `withheld:${height}`))
}

/**
 * The beacon fields a block header carries.
 * @param {{beacon?: {value: string}} | null} parent - the parent block (genesis when null or pre-beacon).
 * @param {{sealer: string, reveal: string | null}} entry - the sealer and its reveal for this block, or null when withheld.
 * @param {number} height - this block's height.
 * @returns {{sealer: string, reveal: string | null, value: string}} the header's `beacon`.
 */
export function beaconEntry(parent, { sealer, reveal }, height) {
  return { sealer, reveal: reveal ?? null, value: mixBeacon(parent?.beacon?.value ?? BEACON_GENESIS, reveal, height) }
}

/**
 * Check a chain's beacon entries against the sealers' registered anchors, and
 * list the withheld reveals as faults.
 * @param {object[]} blocks - blocks in height order.
 * @param {Map<string, string> | Record<string, string>} anchors - sealer id to anchor.
 * @returns {{ok: boolean, problems: string[], faults: {sealer: string, height: number, fault: 'no-beacon-reveal'}[]}} the result.
 */
export function verifyBeacon(blocks, anchors) {
  const get = id => (anchors instanceof Map ? anchors.get(id) : anchors?.[id])
  const last = new Map()
  const problems = []
  const faults = []
  let prev = null
  for (const b of blocks) {
    const e = b.beacon
    if (!e) { prev = b; continue }
    const want = mixBeacon(prev?.beacon?.value ?? BEACON_GENESIS, e.reveal, b.height)
    if (e.value !== want) problems.push(`block ${b.height}: beacon value does not follow from its parent and reveal`)
    if (e.reveal === null) faults.push({ sealer: e.sealer, height: b.height, fault: 'no-beacon-reveal' })
    else {
      const expect = last.get(e.sealer) ?? get(e.sealer)
      if (!expect) problems.push(`block ${b.height}: sealer ${e.sealer} has no registered beacon anchor`)
      else if (link(e.reveal) !== expect) problems.push(`block ${b.height}: ${e.sealer}'s reveal is not the next link of its chain`)
      last.set(e.sealer, e.reveal)
    }
    prev = b
  }
  return { ok: problems.length === 0, problems, faults }
}

/**
 * The seed for a jury: the beacon value at `admittedAt + lookahead`.
 * @param {object[]} blocks - the chain, in height order.
 * @param {number} admittedAt - the tip height when the contract was admitted.
 * @param {number} [lookahead] - L.
 * @returns {string | null} the seed, or null if that block is not sealed yet.
 */
export function seedAt(blocks, admittedAt, lookahead = BEACON_DEFAULTS.lookahead) {
  const b = blocks.find(x => x.height === admittedAt + lookahead)
  return b?.beacon?.value ?? null
}
