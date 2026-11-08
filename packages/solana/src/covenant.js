/**
 * Client for `verafy_covenant` (VIP-0016): a validator bonds a promise not to
 * raise its commission. Zero dependencies.
 * @module @verafyharness/solana/covenant
 */
import { b58encode, b58decode } from './tx.js'

export const COVENANT_SIZE = 136
export const COVENANT_STATUS = ['empty', 'active', 'broken', 'released']
export const VOTE_PROGRAM = 'Vote111111111111111111111111111111111111111'
export const COVENANT_ERRORS = { 2: 'bad accounts', 6: 'out of bounds', 100: 'wrong state', 101: 'not authorized', 102: 'unreadable vote account', 103: 'too early', 105: 'not broken' }

const k32 = k => Buffer.from(typeof k === 'string' ? b58decode(k) : k)
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const meta = (pubkey, isSigner, isWritable) => ({ pubkey: k32(pubkey), isSigner, isWritable })

export const covenantIx = {
  open: ({ programId, covenant, withdrawer, vote, maxCommission, endSlot, bond, beneficiary }) => ({ programId: k32(programId), keys: [meta(covenant, false, true), meta(withdrawer, true, false), meta(vote, false, false)], data: Buffer.concat([Buffer.from([0, maxCommission]), u64(endSlot), u64(bond), k32(beneficiary)]) }),
  claim: ({ programId, covenant, vote, beneficiary }) => ({ programId: k32(programId), keys: [meta(covenant, false, true), meta(vote, false, false), meta(beneficiary, false, true)], data: Buffer.from([1]) }),
  release: ({ programId, covenant, withdrawer }) => ({ programId: k32(programId), keys: [meta(covenant, false, true), meta(withdrawer, true, true)], data: Buffer.from([2]) }),
}

/** Decode a covenant account. */
export function decodeCovenant(data) {
  const b = Buffer.from(data)
  if (b.subarray(0, 8).toString() !== 'VRFYCOV1') return { status: 'empty' }
  return { status: COVENANT_STATUS[b[8]], maxCommission: b[9], vote: b58encode(b.subarray(16, 48)), withdrawer: b58encode(b.subarray(48, 80)), beneficiary: b58encode(b.subarray(80, 112)), endSlot: Number(b.readBigUInt64LE(112)), openedSlot: Number(b.readBigUInt64LE(120)), rent: Number(b.readBigUInt64LE(128)) }
}

/** The commission a vote account reports, for the layouts the program reads (versions 1 and 2), or null. */
export function voteCommission(data) {
  const b = Buffer.from(data)
  const tag = b.readUInt32LE(0)
  if (tag === 1 || tag === 2) return { withdrawer: b58encode(b.subarray(36, 68)), commission: b[68] }
  // VoteStateV4 (SIMD-0185): basis points at 132, rounded up to whole percent, as the program reads it.
  if (tag === 3 && b.length >= 136) return { withdrawer: b58encode(b.subarray(36, 68)), commission: Math.min(255, Math.ceil(b.readUInt16LE(132) / 100)), commissionBps: b.readUInt16LE(132) }
  return null
}
