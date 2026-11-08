/**
 * Just enough Solana to settle a ruling, with no dependencies: base58, Ed25519
 * keypairs (Node's crypto), legacy transactions, and JSON-RPC.
 * @module @verafyharness/solana/tx
 */
import { createPrivateKey, createPublicKey, sign as edSign, generateKeyPairSync } from 'node:crypto'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function b58encode(bytes) {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let s = ''
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s }
  return s
}

export function b58decode(s) {
  let n = 0n
  for (const c of s) { const i = ALPHABET.indexOf(c); if (i < 0) throw new Error(`bad base58: ${c}`); n = n * 58n + BigInt(i) }
  const out = []
  while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n }
  for (const c of s) { if (c !== '1') break; out.unshift(0) }
  return Uint8Array.from(out)
}

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** A keypair from a Solana CLI keypair file's 64 bytes (seed then public key), or a fresh one. */
export function keypair(bytes) {
  let seed
  if (bytes) seed = Buffer.from(bytes).subarray(0, 32)
  else {
    const { privateKey } = generateKeyPairSync('ed25519')
    seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16)
  }
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' })
  const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(12)
  return { publicKey: Uint8Array.from(publicKey), address: b58encode(publicKey), sign: m => Uint8Array.from(edSign(null, Buffer.from(m), privateKey)), secret: Uint8Array.from(Buffer.concat([seed, publicKey])) }
}

export const SYSTEM_PROGRAM = new Uint8Array(32)

function compact(n) {
  const out = []
  for (;;) { let b = n & 0x7f; n >>= 7; if (n) { out.push(b | 0x80) } else { out.push(b); return out } }
}

const key = k => (typeof k === 'string' ? b58decode(k) : k)
const hex = k => Buffer.from(key(k)).toString('hex')

/**
 * Compile and sign a legacy transaction.
 * @param {{programId, keys: {pubkey, isSigner, isWritable}[], data: Uint8Array}[]} instructions
 * @param {object} payer - keypair that pays.
 * @param {object[]} signers - every keypair that signs, payer included.
 * @param {string} blockhash - recent blockhash (base58).
 * @returns {Uint8Array} the wire transaction.
 */
export function buildTx(instructions, payer, signers, blockhash) {
  const metas = new Map()
  const add = (k, s, w) => { const h = hex(k); const m = metas.get(h) ?? { key: key(k), s: false, w: false }; m.s ||= s; m.w ||= w; metas.set(h, m) }
  add(payer.publicKey, true, true)
  for (const ix of instructions) { for (const a of ix.keys) add(a.pubkey, a.isSigner, a.isWritable); add(ix.programId, false, false) }
  const all = [...metas.values()]
  const payerHex = hex(payer.publicKey)
  const rank = m => (m.s ? (m.w ? 0 : 1) : (m.w ? 2 : 3))
  all.sort((a, b) => (hex(a.key) === payerHex ? -1 : hex(b.key) === payerHex ? 1 : rank(a) - rank(b)))
  const index = new Map(all.map((m, i) => [hex(m.key), i]))
  const header = [all.filter(m => m.s).length, all.filter(m => m.s && !m.w).length, all.filter(m => !m.s && !m.w).length]
  const msg = [...header, ...compact(all.length)]
  for (const m of all) msg.push(...m.key)
  msg.push(...b58decode(blockhash))
  msg.push(...compact(instructions.length))
  for (const ix of instructions) {
    msg.push(index.get(hex(ix.programId)), ...compact(ix.keys.length), ...ix.keys.map(a => index.get(hex(a.pubkey))), ...compact(ix.data.length), ...ix.data)
  }
  const message = Uint8Array.from(msg)
  const bySigner = new Map(signers.map(s => [hex(s.publicKey), s]))
  const sigs = all.slice(0, header[0]).map(m => { const s = bySigner.get(hex(m.key)); if (!s) throw new Error(`missing signer ${b58encode(m.key)}`); return s.sign(message) })
  return Uint8Array.from([...compact(sigs.length), ...sigs.flatMap(s => [...s]), ...message])
}

/** System program createAccount. */
export function createAccountIx(from, account, lamports, space, owner) {
  const d = Buffer.alloc(52)
  d.writeUInt32LE(0, 0); d.writeBigUInt64LE(BigInt(lamports), 4); d.writeBigUInt64LE(BigInt(space), 12); Buffer.from(key(owner)).copy(d, 20)
  return { programId: SYSTEM_PROGRAM, keys: [{ pubkey: from.publicKey, isSigner: true, isWritable: true }, { pubkey: account.publicKey, isSigner: true, isWritable: true }], data: Uint8Array.from(d) }
}

/** A JSON-RPC client. */
export function rpc(url, { fetch: f = globalThis.fetch } = {}) {
  let id = 0
  // Public RPC endpoints rate-limit bursts: retry a throttled call with backoff.
  const call = async (method, params = []) => {
    for (let attempt = 0; ; attempt++) {
      const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })
      const throttled = res.status === 429
      const j = throttled ? null : await res.json()
      if ((throttled || /too many requests/i.test(j?.error?.message ?? '')) && attempt < 8) { await new Promise(r => setTimeout(r, 500 * 2 ** attempt)); continue }
      if (throttled) throw new Error(`${method}: rate limited`)
      if (j.error) { const e = new Error(`${method}: ${j.error.message}`); e.data = j.error.data; throw e }
      return j.result
    }
  }
  return {
    call,
    blockhash: async () => (await call('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash,
    rent: space => call('getMinimumBalanceForRentExemption', [space]),
    balance: async addr => (await call('getBalance', [addr, { commitment: 'confirmed' }])).value,
    account: async addr => { const v = (await call('getAccountInfo', [addr, { encoding: 'base64', commitment: 'confirmed' }])).value; return v && { ...v, data: Buffer.from(v.data[0], 'base64') } },
    airdrop: (addr, lamports) => call('requestAirdrop', [addr, lamports]),
    /** Send and wait for confirmation; throws with the program logs on failure. */
    async send(wire, { timeoutMs = 60_000 } = {}) {
      const sig = await call('sendTransaction', [Buffer.from(wire).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }])
      return this.confirm(sig, { timeoutMs })
    },
    async confirm(sig, { timeoutMs = 60_000 } = {}) {
      const end = Date.now() + timeoutMs
      while (Date.now() < end) {
        const s = (await call('getSignatureStatuses', [[sig], { searchTransactionHistory: true }])).value[0]
        if (s?.err) throw Object.assign(new Error(`transaction failed: ${JSON.stringify(s.err)}`), { signature: sig, err: s.err })
        if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return sig
        await new Promise(r => setTimeout(r, 1200))
      }
      throw new Error(`not confirmed in time: ${sig}`)
    },
  }
}

/**
 * A harness's identity as a Solana signer. A harness key is Ed25519, the same
 * curve Solana uses, so a harness signs its own commit and reveal on Solana
 * with the key on its card: the address is that public key in base58.
 * @param {{publicKey: string, privateKey: import('node:crypto').KeyObject}} identity - core's identity.
 */
export function identitySigner(identity) {
  const raw = Buffer.from(identity.publicKey, 'base64').subarray(12)
  return { publicKey: Uint8Array.from(raw), address: b58encode(raw), sign: m => Uint8Array.from(edSign(null, Buffer.from(m), identity.privateKey)) }
}
