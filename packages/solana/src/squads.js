/**
 * Squads v4, read and written with no dependencies: program addresses (PDAs),
 * the multisig, proposal, vault-transaction and config-transaction accounts,
 * and the instructions a judiciary signer and its tests need.
 *
 * Layouts follow the Squads v4 program source (Anchor, Borsh). Every account
 * starts with an 8-byte Anchor discriminator; vectors carry a u32 length.
 * @module @verafyharness/solana/squads
 */
import { createHash } from 'node:crypto'
import { b58encode, b58decode, SYSTEM_PROGRAM } from './tx.js'

/** The Squads v4 program on mainnet and devnet. */
export const SQUADS_PROGRAM = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf'
export const PERMISSION = Object.freeze({ initiate: 1, vote: 2, execute: 4, all: 7 })
export const PROPOSAL_STATUS = ['draft', 'active', 'rejected', 'approved', 'executing', 'executed', 'cancelled']
const PERIODS = ['one-time', 'day', 'week', 'month']

const key = k => (typeof k === 'string' ? b58decode(k) : Uint8Array.from(k))
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return new Uint8Array(h.digest()) }

// ---- Program addresses ------------------------------------------------------

const P = 2n ** 255n - 19n
const D = (-121665n * inv(121666n)) % P
function mod(a) { const r = a % P; return r < 0n ? r + P : r }
function pow(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n } return r }
function inv(a) { return pow(a, P - 2n) }

/**
 * Whether 32 bytes decode to a point on the ed25519 curve. A program address
 * must not, so no private key can ever sign for it.
 * @param {Uint8Array} bytes - a candidate address.
 * @returns {boolean} true when the bytes are a curve point.
 */
export function onCurve(bytes) {
  const b = Uint8Array.from(bytes)
  b[31] &= 0x7f
  let y = 0n
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i])
  if (y >= P) return false
  const y2 = mod(y * y)
  const x2 = mod((y2 - 1n) * inv(mod(D * y2 + 1n)))
  if (x2 === 0n) return true
  return pow(x2, (P - 1n) / 2n) === 1n
}

/**
 * Find a program address and its bump, as `find_program_address` does.
 * @param {(Uint8Array | string)[]} seeds - seeds; strings are UTF-8.
 * @param {string | Uint8Array} programId - the owning program.
 * @returns {{address: string, bytes: Uint8Array, bump: number}} the address.
 */
export function findPda(seeds, programId) {
  const pid = key(programId)
  const raw = seeds.map(s => (typeof s === 'string' ? new TextEncoder().encode(s) : Uint8Array.from(s)))
  for (let bump = 255; bump >= 0; bump--) {
    const bytes = sha(...raw, Uint8Array.of(bump), pid, new TextEncoder().encode('ProgramDerivedAddress'))
    if (!onCurve(bytes)) return { address: b58encode(bytes), bytes, bump }
  }
  throw new Error('no program address found')
}

const u64le = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b }
const u32le = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b }
const u16le = n => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b }

/** Squads PDAs. */
export const squadsPda = {
  multisig: (createKey, program = SQUADS_PROGRAM) => findPda(['multisig', 'multisig', key(createKey)], program),
  vault: (multisig, index = 0, program = SQUADS_PROGRAM) => findPda(['multisig', key(multisig), 'vault', Uint8Array.of(index)], program),
  transaction: (multisig, index, program = SQUADS_PROGRAM) => findPda(['multisig', key(multisig), 'transaction', u64le(index)], program),
  proposal: (multisig, index, program = SQUADS_PROGRAM) => findPda(['multisig', key(multisig), 'transaction', u64le(index), 'proposal'], program),
  programConfig: (program = SQUADS_PROGRAM) => findPda(['multisig', 'program_config'], program),
}

// ---- Decoding ---------------------------------------------------------------

class Cursor {
  constructor(bytes) { this.b = Uint8Array.from(bytes); this.v = new DataView(this.b.buffer); this.at = 0 }
  u8() { return this.b[this.at++] }
  u16() { const x = this.v.getUint16(this.at, true); this.at += 2; return x }
  u32() { const x = this.v.getUint32(this.at, true); this.at += 4; return x }
  i64() { const x = this.v.getBigInt64(this.at, true); this.at += 8; return x }
  u64() { const x = this.v.getBigUint64(this.at, true); this.at += 8; return x }
  key() { const k = b58encode(this.b.subarray(this.at, this.at + 32)); this.at += 32; return k }
  bytes(n) { const x = this.b.slice(this.at, this.at + n); this.at += n; return x }
  vec(f) { const n = this.u32(); const out = []; for (let i = 0; i < n; i++) out.push(f()); return out }
  option(f) { return this.u8() ? f() : null }
}

/** The Anchor discriminator for an account or instruction name. */
export const discriminator = (namespace, name) => sha(new TextEncoder().encode(`${namespace}:${name}`)).subarray(0, 8)

/**
 * Decode a Squads multisig account.
 * @param {Uint8Array} data - the account data.
 * @returns {object} create key, config authority, threshold, time lock (seconds), indexes and members.
 */
export function decodeMultisig(data) {
  const c = new Cursor(data)
  c.at = 8
  return {
    createKey: c.key(), configAuthority: c.key(), threshold: c.u16(), timeLock: c.u32(),
    transactionIndex: Number(c.u64()), staleTransactionIndex: Number(c.u64()),
    rentCollector: c.option(() => c.key()), bump: c.u8(),
    members: c.vec(() => { const k = c.key(); const mask = c.u8(); return { key: k, mask, initiate: !!(mask & 1), vote: !!(mask & 2), execute: !!(mask & 4) } }),
  }
}

/**
 * Decode a Squads proposal account.
 * @param {Uint8Array} data - the account data.
 * @returns {object} multisig, transaction index, status and the votes cast.
 */
export function decodeProposal(data) {
  const c = new Cursor(data)
  c.at = 8
  const multisig = c.key(), transactionIndex = Number(c.u64())
  const s = c.u8()
  const timestamp = s === 4 ? null : Number(c.i64())
  return { multisig, transactionIndex, status: PROPOSAL_STATUS[s], timestamp, bump: c.u8(), approved: c.vec(() => c.key()), rejected: c.vec(() => c.key()), cancelled: c.vec(() => c.key()) }
}

/**
 * Decode a vault transaction: the message the vault would sign, with each
 * instruction's program and accounts resolved to addresses. Accounts loaded
 * through address lookup tables cannot be resolved from the account alone;
 * they are reported in `lookups` and a policy should refuse them.
 * @param {Uint8Array} data - the account data.
 * @returns {object} the transaction.
 */
export function decodeVaultTransaction(data) {
  const c = new Cursor(data)
  c.at = 8
  const t = { kind: 'vault', multisig: c.key(), creator: c.key(), index: Number(c.u64()), bump: c.u8(), vaultIndex: c.u8(), vaultBump: c.u8(), ephemeralSignerBumps: [...c.bytes(c.u32())] }
  const numSigners = c.u8(), numWritableSigners = c.u8(), numWritableNonSigners = c.u8()
  const keys = c.vec(() => c.key())
  const compiled = c.vec(() => ({ programIdIndex: c.u8(), accountIndexes: [...c.bytes(c.u32())], data: c.bytes(c.u32()) }))
  const lookups = c.vec(() => ({ accountKey: c.key(), writableIndexes: [...c.bytes(c.u32())], readonlyIndexes: [...c.bytes(c.u32())] }))
  const name = i => keys[i] ?? `lookup:${i - keys.length}`
  t.message = { numSigners, numWritableSigners, numWritableNonSigners, accountKeys: keys }
  t.instructions = compiled.map(ix => ({ program: name(ix.programIdIndex), accounts: ix.accountIndexes.map(name), data: Buffer.from(ix.data).toString('hex') }))
  t.lookups = lookups
  return t
}

/**
 * Decode a config transaction: changes to members, threshold, time lock or
 * spending limits.
 * @param {Uint8Array} data - the account data.
 * @returns {object} the transaction and its actions.
 */
export function decodeConfigTransaction(data) {
  const c = new Cursor(data)
  c.at = 8
  const t = { kind: 'config', multisig: c.key(), creator: c.key(), index: Number(c.u64()), bump: c.u8() }
  t.actions = c.vec(() => {
    const tag = c.u8()
    switch (tag) {
      case 0: { const k = c.key(); const mask = c.u8(); return { type: 'add-member', key: k, mask } }
      case 1: return { type: 'remove-member', key: c.key() }
      case 2: return { type: 'change-threshold', threshold: c.u16() }
      case 3: return { type: 'set-time-lock', timeLock: c.u32() }
      case 4: return { type: 'add-spending-limit', createKey: c.key(), vaultIndex: c.u8(), mint: c.key(), amount: c.u64().toString(), period: PERIODS[c.u8()], members: c.vec(() => c.key()), destinations: c.vec(() => c.key()) }
      case 5: return { type: 'remove-spending-limit', spendingLimit: c.key() }
      case 6: return { type: 'set-rent-collector', rentCollector: c.option(() => c.key()) }
      default: return { type: 'unknown', tag }
    }
  })
  return t
}

/**
 * Decode either kind of Squads transaction account by its discriminator.
 * @param {Uint8Array} data - the account data.
 * @returns {object} the decoded transaction.
 */
export function decodeTransaction(data) {
  const d = Buffer.from(data.subarray(0, 8))
  if (d.equals(Buffer.from(discriminator('account', 'VaultTransaction')))) return decodeVaultTransaction(data)
  if (d.equals(Buffer.from(discriminator('account', 'ConfigTransaction')))) return decodeConfigTransaction(data)
  throw new Error('not a Squads vault or config transaction')
}

// ---- Instructions -----------------------------------------------------------

const meta = (pubkey, isSigner, isWritable) => ({ pubkey: key(pubkey), isSigner, isWritable })
const anchorIx = (program, name, keys, args) => ({ programId: key(program), keys, data: Buffer.concat([Buffer.from(discriminator('global', name)), Buffer.from(args ?? new Uint8Array())]) })
const memberBytes = m => Buffer.concat([key(m.key), Uint8Array.of(m.mask ?? PERMISSION.all)])
const vec = (items, f) => Buffer.concat([u32le(items.length), ...items.map(f)])
const opt = (x, f) => (x == null ? Uint8Array.of(0) : Buffer.concat([Uint8Array.of(1), f(x)]))

/** Squads instructions, for setting up and driving a multisig. */
export const squadsIx = {
  /** `multisig_create_v2`: needs the program config account and its treasury. */
  multisigCreate({ program = SQUADS_PROGRAM, programConfig, treasury, creator, createKey, members, threshold, timeLock = 0, configAuthority = null, rentCollector = null, memo = null }) {
    const ms = squadsPda.multisig(createKey, program).address
    const args = Buffer.concat([opt(configAuthority, key), u16le(threshold), vec(members, memberBytes), u32le(timeLock), opt(rentCollector, key), opt(memo, s => vec([...Buffer.from(s)], b => Uint8Array.of(b)))])
    return anchorIx(program, 'multisig_create_v2', [meta(programConfig, false, false), meta(treasury, false, true), meta(ms, false, true), meta(createKey, true, false), meta(creator, true, true), meta(SYSTEM_PROGRAM, false, false)], args)
  },
  /** `config_transaction_create` with a list of actions (see decodeConfigTransaction for the shapes). */
  configTransactionCreate({ program = SQUADS_PROGRAM, multisig, index, creator, rentPayer = creator, actions }) {
    const tx = squadsPda.transaction(multisig, index, program).address
    const action = a => {
      switch (a.type) {
        case 'add-member': return Buffer.concat([Uint8Array.of(0), memberBytes(a)])
        case 'remove-member': return Buffer.concat([Uint8Array.of(1), key(a.key)])
        case 'change-threshold': return Buffer.concat([Uint8Array.of(2), u16le(a.threshold)])
        case 'set-time-lock': return Buffer.concat([Uint8Array.of(3), u32le(a.timeLock)])
        default: throw new Error(`action ${a.type} is not supported here`)
      }
    }
    return anchorIx(program, 'config_transaction_create', [meta(multisig, false, true), meta(tx, false, true), meta(creator, true, false), meta(rentPayer, true, true), meta(SYSTEM_PROGRAM, false, false)], Buffer.concat([vec(actions, action), Uint8Array.of(0)]))
  },
  /** `vault_transaction_create` from a list of instructions the vault will sign. */
  vaultTransactionCreate({ program = SQUADS_PROGRAM, multisig, index, creator, rentPayer = creator, vaultIndex = 0, instructions }) {
    const tx = squadsPda.transaction(multisig, index, program).address
    const vault = squadsPda.vault(multisig, vaultIndex, program).address
    const message = compileVaultMessage(vault, instructions)
    const args = Buffer.concat([Uint8Array.of(vaultIndex), Uint8Array.of(0), u32le(message.length), message, Uint8Array.of(0)])
    return anchorIx(program, 'vault_transaction_create', [meta(multisig, false, true), meta(tx, false, true), meta(creator, true, false), meta(rentPayer, true, true), meta(SYSTEM_PROGRAM, false, false)], args)
  },
  proposalCreate({ program = SQUADS_PROGRAM, multisig, index, creator, rentPayer = creator, draft = false }) {
    const p = squadsPda.proposal(multisig, index, program).address
    return anchorIx(program, 'proposal_create', [meta(multisig, false, false), meta(p, false, true), meta(creator, true, false), meta(rentPayer, true, true), meta(SYSTEM_PROGRAM, false, false)], Buffer.concat([u64le(index), Uint8Array.of(draft ? 1 : 0)]))
  },
  proposalApprove({ program = SQUADS_PROGRAM, multisig, index, member }) {
    return anchorIx(program, 'proposal_approve', [meta(multisig, false, false), meta(member, true, true), meta(squadsPda.proposal(multisig, index, program).address, false, true)], Uint8Array.of(0))
  },
  vaultTransactionExecute({ program = SQUADS_PROGRAM, multisig, index, member, remaining }) {
    return anchorIx(program, 'vault_transaction_execute', [meta(multisig, false, false), meta(squadsPda.proposal(multisig, index, program).address, false, true), meta(squadsPda.transaction(multisig, index, program).address, false, false), meta(member, true, false), ...remaining], new Uint8Array())
  },
  configTransactionExecute({ program = SQUADS_PROGRAM, multisig, index, member, rentPayer }) {
    return anchorIx(program, 'config_transaction_execute', [meta(multisig, false, true), meta(member, true, false), meta(squadsPda.proposal(multisig, index, program).address, false, true), meta(squadsPda.transaction(multisig, index, program).address, false, false), meta(rentPayer ?? member, true, true), meta(SYSTEM_PROGRAM, false, false)], new Uint8Array())
  },
}

/**
 * Compile instructions into the message format Squads stores, with the vault
 * as the only signer. Returns the Borsh `TransactionMessage` bytes
 * (u8-length "small vectors", as `vault_transaction_create` expects).
 * @param {string} vault - the vault address (the signer).
 * @param {{programId: Uint8Array | string, keys: {pubkey: Uint8Array | string, isSigner: boolean, isWritable: boolean}[], data: Uint8Array}[]} instructions - what the vault signs.
 * @returns {Uint8Array} the message bytes.
 */
export function compileVaultMessage(vault, instructions) {
  const v = b58encode(key(vault))
  const metas = new Map([[v, { signer: true, writable: true }]])
  const add = (k, signer, writable) => { const a = b58encode(key(k)); const m = metas.get(a) ?? { signer: false, writable: false }; metas.set(a, { signer: m.signer || signer, writable: m.writable || writable }) }
  for (const ix of instructions) { for (const k of ix.keys) add(k.pubkey, k.isSigner, k.isWritable); add(ix.programId, false, false) }
  const all = [...metas.entries()]
  const order = [...all.filter(([, m]) => m.signer && m.writable), ...all.filter(([, m]) => m.signer && !m.writable), ...all.filter(([, m]) => !m.signer && m.writable), ...all.filter(([, m]) => !m.signer && !m.writable)]
  const index = new Map(order.map(([k], i) => [k, i]))
  const small = (arr, f) => Buffer.concat([Uint8Array.of(arr.length), ...arr.map(f)])
  return Buffer.concat([
    Uint8Array.of(order.filter(([, m]) => m.signer).length, order.filter(([, m]) => m.signer && m.writable).length, order.filter(([, m]) => !m.signer && m.writable).length),
    small(order, ([k]) => b58decode(k)),
    small(instructions, ix => Buffer.concat([
      Uint8Array.of(index.get(b58encode(key(ix.programId)))),
      small(ix.keys, k => Uint8Array.of(index.get(b58encode(key(k.pubkey))))),
      Buffer.concat([u16le(ix.data.length), Buffer.from(ix.data)]),
    ])),
    Uint8Array.of(0),
  ])
}
