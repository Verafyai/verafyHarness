/**
 * Client for `verafy_registry` (VIP-0012): register a harness on chain, and
 * discover every registered harness with one RPC call, as cards the
 * scheduler can draw from. Zero dependencies.
 * @module @verafyharness/solana/registry
 */
import { b58encode, b58decode, SYSTEM_PROGRAM } from './tx.js'
import { findPda } from './squads.js'

export const HARNESS_SIZE = 392
export const HARNESS_STATUS = ['empty', 'active', 'retired']
/** Slots a retired harness waits before it may withdraw its bond (illustrative). */
export const UNBOND_SLOTS = 864_000
export const REGISTRY_ERRORS = { 1: 'bad input', 2: 'bad accounts', 6: 'out of bounds', 100: 'wrong state', 101: 'not authorized', 103: 'too early' }

const k32 = k => Buffer.from(typeof k === 'string' ? b58decode(k) : k)
const fixed = (s, n) => { const b = Buffer.alloc(n); const v = Buffer.from(String(s ?? ''), 'utf8'); if (v.length > n) throw new Error(`"${s}" is longer than ${n} bytes`); v.copy(b); return b }
const hex32 = h => (h ? Buffer.from(h, 'hex') : Buffer.alloc(32))
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const meta = (pubkey, isSigner, isWritable) => ({ pubkey: k32(pubkey), isSigner, isWritable })
const text = b => b.toString('utf8').replace(/\0+$/, '')

/** The registry account for a harness key. */
export const harnessAccount = (harnessKey, programId) => findPda(['harness', k32(harnessKey)], programId)

export const registryIx = {
  /** `lamports` is rent plus any opening bond. */
  register: ({ programId, harnessKey, operator, lamports, family, model, modelCommitment, endpoint, price = 0, attestationHash }) => ({
    programId: k32(programId),
    keys: [meta(harnessAccount(harnessKey, programId).address, false, true), meta(harnessKey, true, false), meta(operator, true, true), meta(SYSTEM_PROGRAM, false, false)],
    data: Buffer.concat([Buffer.from([0]), u64(lamports), fixed(family, 32), fixed(model, 64), hex32(modelCommitment), fixed(endpoint, 128), u64(price), hex32(attestationHash)]),
  }),
  update: ({ programId, harnessKey, operator, endpoint, price, attestationHash }) => ({
    programId: k32(programId), keys: [meta(harnessAccount(harnessKey, programId).address, false, true), meta(operator, true, false)],
    data: Buffer.concat([Buffer.from([1]), fixed(endpoint, 128), u64(price), hex32(attestationHash)]),
  }),
  retire: ({ programId, harnessKey, operator }) => ({ programId: k32(programId), keys: [meta(harnessAccount(harnessKey, programId).address, false, true), meta(operator, true, false)], data: Buffer.from([2]) }),
  withdraw: ({ programId, harnessKey, operator, lamports }) => ({ programId: k32(programId), keys: [meta(harnessAccount(harnessKey, programId).address, false, true), meta(operator, true, true)], data: Buffer.concat([Buffer.from([3]), u64(lamports)]) }),
}

/**
 * Decode a harness account.
 * @param {Uint8Array} data - the account data.
 * @param {number} [lamports] - the account's balance, to report the bond.
 * @param {number} [rent] - rent-exempt minimum for HARNESS_SIZE.
 * @returns {object} the registration.
 */
export function decodeHarness(data, lamports = 0, rent = 0) {
  const b = Buffer.from(data)
  if (b.subarray(0, 8).toString() !== 'VRFYHRN1') return { status: 'empty' }
  const zero = x => x.every(v => v === 0)
  return {
    status: HARNESS_STATUS[b[8]], harnessKey: b58encode(b.subarray(16, 48)), operator: b58encode(b.subarray(48, 80)),
    family: text(b.subarray(80, 112)), model: text(b.subarray(112, 176)),
    modelCommitment: zero(b.subarray(176, 208)) ? null : b.subarray(176, 208).toString('hex'),
    endpoint: text(b.subarray(208, 336)), price: Number(b.readBigUInt64LE(336)),
    attestationHash: zero(b.subarray(344, 376)) ? null : b.subarray(344, 376).toString('hex'),
    registeredSlot: Number(b.readBigUInt64LE(376)), retiredSlot: Number(b.readBigUInt64LE(384)),
    bond: Math.max(0, lamports - rent),
  }
}

/**
 * Every active harness in the registry, as harness cards: the same shape
 * `verafy.config.json` pools use, so the scheduler draws from them unchanged.
 * The bond is reported in SOL.
 * @param {ReturnType<import('./tx.js').rpc>} rpc - RPC client.
 * @param {string} programId - the registry program.
 * @param {{includeRetired?: boolean}} [o] - options.
 * @returns {Promise<object[]>} cards, newest registration last.
 */
export async function discoverHarnesses(rpc, programId, { includeRetired = false } = {}) {
  const rent = await rpc.rent(HARNESS_SIZE)
  const accounts = await rpc.call('getProgramAccounts', [programId, { encoding: 'base64', commitment: 'confirmed', filters: [{ dataSize: HARNESS_SIZE }, { memcmp: { offset: 0, bytes: b58encode(Buffer.from('VRFYHRN1')) } }] }])
  return accounts
    .map(a => ({ address: a.pubkey, ...decodeHarness(Buffer.from(a.account.data[0], 'base64'), a.account.lamports, rent) }))
    .filter(h => includeRetired || h.status === 'active')
    .sort((x, y) => x.registeredSlot - y.registeredSlot)
    .map(h => ({
      id: `${h.family}:${h.harnessKey.slice(0, 8)}`, family: h.family, model: h.model, bond: h.bond / 1e9, operator: h.operator,
      solanaKey: h.harnessKey, endpoint: h.endpoint, pricePerSeat: h.price, registry: h.address,
      ...(h.modelCommitment ? { modelCommitment: h.modelCommitment } : {}), ...(h.attestationHash ? { attestationHash: h.attestationHash } : {}),
    }))
}
