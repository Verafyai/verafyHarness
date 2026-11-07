/**
 * Client for `verafy_judiciary` (VIP-0010): attach a judiciary signer to a
 * Squads multisig, register a proposal as a case, and vote as the sealed
 * ruling says. Zero dependencies.
 * @module @verafyharness/solana/judiciary
 */
import { createHash } from 'node:crypto'
import { b58encode, b58decode, SYSTEM_PROGRAM } from './tx.js'
import { findPda, SQUADS_PROGRAM, squadsPda } from './squads.js'

export const CONFIG_SIZE = 448
export const CASE_SIZE = 160
export const MAX_JURORS = 8
export const CASE_STATUS = ['empty', 'registered', 'approved', 'rejected', 'escaped']
export const JUDICIARY_ERRORS = { 1: 'bad input', 2: 'bad accounts', 3: 'small account', 4: 'overflow', 6: 'out of bounds', 100: 'wrong state', 101: 'wrong account', 102: 'bad ruling', 103: 'too early', 104: 'transaction changed' }
/** Ruling answers the signer acts on: index 0 approves, index 1 rejects. */
export const OPTIONS = ['APPROVE', 'REJECT']

const k32 = k => (typeof k === 'string' ? (/^[0-9a-f]{64}$/.test(k) ? Buffer.from(k, 'hex') : Buffer.from(b58decode(k))) : Buffer.from(k))
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b }
const meta = (pubkey, isSigner, isWritable) => ({ pubkey: k32(pubkey), isSigner, isWritable })

/** The member address Squads sees: no key exists for it. */
export const authorityOf = (config, programId) => findPda(['authority', k32(config)], programId)
/** The case account for one proposal. */
export const caseOf = (config, proposal, programId) => findPda(['case', k32(config), k32(proposal)], programId)

/**
 * The hash a ruling must carry as its contract hash to act on this case:
 * sha256("verafy-judiciary/1" || config || proposal || sha256(transaction account data)).
 * @param {string} config - the signer config address.
 * @param {string} proposal - the Squads proposal address.
 * @param {Uint8Array} transactionData - the Squads transaction account's data.
 * @returns {string} hex.
 */
export function caseHash(config, proposal, transactionData) {
  const tx = createHash('sha256').update(transactionData).digest()
  return createHash('sha256').update('verafy-judiciary/1').update(k32(config)).update(k32(proposal)).update(tx).digest('hex')
}

export const judiciaryEncode = {
  attach: ({ barPpm, multisig, policyHash, modelsHash, rulingProgram, challengeSlots, escapeSlots = 0, jurors }) => {
    if (!(jurors.length >= 1 && jurors.length <= MAX_JURORS)) throw new Error(`a judiciary signer seats 1 to ${MAX_JURORS} jurors`)
    return Buffer.concat([Buffer.from([0]), u32(barPpm), k32(multisig), k32(policyHash), k32(modelsHash), k32(rulingProgram), u64(challengeSlots), u64(escapeSlots), Buffer.from([jurors.length]), ...jurors.map(k32)])
  },
  register: lamports => Buffer.concat([Buffer.from([1]), u64(lamports)]),
  decide: () => Buffer.from([2]),
  escape: () => Buffer.from([3]),
}

/** Instructions for the judiciary program. */
export const judiciaryIx = {
  attach: ({ programId, config, creator, ...args }) => ({ programId: k32(programId), keys: [meta(config, false, true), meta(creator, true, false)], data: judiciaryEncode.attach(args) }),
  register: ({ programId, config, multisig, index, payer, lamports, squads = SQUADS_PROGRAM }) => {
    const proposal = squadsPda.proposal(multisig, index, squads).address
    const tx = squadsPda.transaction(multisig, index, squads).address
    return { programId: k32(programId), keys: [meta(config, false, false), meta(caseOf(config, proposal, programId).address, false, true), meta(multisig, false, false), meta(proposal, false, false), meta(tx, false, false), meta(payer, true, true), meta(SYSTEM_PROGRAM, false, false)], data: judiciaryEncode.register(lamports) }
  },
  decide: ({ programId, config, ruling, multisig, index, squads = SQUADS_PROGRAM }) => {
    const proposal = squadsPda.proposal(multisig, index, squads).address
    const tx = squadsPda.transaction(multisig, index, squads).address
    return { programId: k32(programId), keys: [meta(config, false, false), meta(caseOf(config, proposal, programId).address, false, true), meta(ruling, false, false), meta(multisig, false, false), meta(proposal, false, true), meta(tx, false, false), meta(authorityOf(config, programId).address, false, true), meta(squads, false, false)], data: judiciaryEncode.decide() }
  },
  escape: ({ programId, config, multisig, index, squads = SQUADS_PROGRAM }) => {
    const proposal = squadsPda.proposal(multisig, index, squads).address
    return { programId: k32(programId), keys: [meta(config, false, false), meta(caseOf(config, proposal, programId).address, false, true), meta(multisig, false, false), meta(proposal, false, true), meta(authorityOf(config, programId).address, false, true), meta(squads, false, false)], data: judiciaryEncode.escape() }
  },
}

/**
 * Decode a signer config account.
 * @param {Uint8Array} data - the account data.
 * @returns {object} the config.
 */
export function decodeSignerConfig(data) {
  const b = Buffer.from(data)
  if (b.subarray(0, 8).toString() !== 'VRFYJUD1') return { status: 'empty' }
  const n = b[9]
  const jurors = []
  for (let i = 0; i < n; i++) jurors.push(b58encode(b.subarray(192 + 32 * i, 224 + 32 * i)))
  return {
    status: 'attached', seats: n, barPpm: b.readUInt32LE(12), multisig: b58encode(b.subarray(16, 48)), policyHash: b.subarray(48, 80).toString('hex'),
    modelsHash: b.subarray(80, 112).toString('hex'), rulingProgram: b58encode(b.subarray(112, 144)), creator: b58encode(b.subarray(144, 176)),
    challengeSlots: Number(b.readBigUInt64LE(176)), escapeSlots: Number(b.readBigUInt64LE(184)), jurors,
  }
}

/**
 * Decode a case account.
 * @param {Uint8Array} data - the account data.
 * @returns {object} the case.
 */
export function decodeCase(data) {
  const b = Buffer.from(data)
  if (b.subarray(0, 8).toString() !== 'VRFYCAS1') return { status: 'empty' }
  return { status: CASE_STATUS[b[8]], config: b58encode(b.subarray(16, 48)), proposal: b58encode(b.subarray(48, 80)), transactionHash: b.subarray(80, 112).toString('hex'), caseHash: b.subarray(112, 144).toString('hex'), registeredSlot: Number(b.readBigUInt64LE(144)), decidedSlot: Number(b.readBigUInt64LE(152)) }
}

/**
 * Explain a judiciary program error.
 * @param {unknown} err - an RPC or simulation error.
 * @returns {string | null} the meaning, or null when it is not one of ours.
 */
export function judiciaryError(err) {
  const m = /custom program error: 0x([0-9a-f]+)/i.exec(String(err?.message ?? err))
  return m ? JUDICIARY_ERRORS[parseInt(m[1], 16)] ?? null : null
}
