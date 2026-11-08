/**
 * The encoder (VIP-0019): put the full text of a policy, contract,
 * certification or bias profile on Solana, and read it back checked against
 * its hash. Readers always recompute the hash, so a storage backend can lose
 * data but never pass off a different text.
 *
 * Backends:
 *   iq     IQ Labs Code-In (`@iqlabs-official/solana-sdk`, loaded only when used):
 *          the default until a data-availability SIMD exists.
 *   memo   chunks in Memo program instructions, each linked to the previous
 *          transaction. No third-party program and no dependencies.
 * @module @verafyharness/solana/encoder
 */
import { createHash } from 'node:crypto'
import { canonical, sha256 } from '../../core/src/hash.js'
import { buildTx, b58decode } from './tx.js'

export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111'
/** The Memo program checks every byte is UTF-8, which costs more compute than the default limit allows for a full chunk. */
const computeLimit = units => { const d = Buffer.alloc(5); d[0] = 2; d.writeUInt32LE(units, 1); return { programId: b58decode(COMPUTE_BUDGET), keys: [], data: d } }
const TAG = 'vfy1'
/** Base64 characters per memo; keeps each transaction well under the packet size. */
const CHUNK = 760

/** The bytes an object is stored as, and the hash readers check: the harness's canonical JSON. */
export function encodedForm(obj) {
  return { text: canonical(obj), hash: sha256(obj) }
}

/**
 * A backend that stores chunks in Memo program instructions. Each chunk names
 * the object's hash, its index and the previous chunk's signature, so a reader
 * walks back from the last one.
 * @param {{rpc: ReturnType<import('./tx.js').rpc>, payer: object}} o - RPC client and the paying keypair.
 */
export function memoBackend({ rpc, payer }) {
  return {
    name: 'memo',
    async put(text, hash) {
      const b64 = Buffer.from(text, 'utf8').toString('base64')
      const parts = []
      for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK))
      let prev = '-'
      for (const [i, p] of parts.entries()) {
        const memo = `${TAG}|${hash}|${i}/${parts.length}|${prev}|${p}`
        const ix = { programId: b58decode(MEMO_PROGRAM), keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, 'utf8') }
        prev = await rpc.send(buildTx([computeLimit(1_400_000), ix], payer, [payer], await rpc.blockhash()))
      }
      return prev
    },
    async get(locator) {
      const parts = []
      let sig = locator, hash = null
      while (sig !== '-') {
        const t = await rpc.call('getTransaction', [sig, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }])
        if (!t) throw new Error(`transaction ${sig} not found`)
        const keys = t.transaction.message.accountKeys
        const ix = t.transaction.message.instructions.find(x => keys[x.programIdIndex] === MEMO_PROGRAM)
        if (!ix) throw new Error(`transaction ${sig} carries no memo`)
        const [tag, h, pos, prev, data] = Buffer.from(b58decode(ix.data)).toString('utf8').split('|')
        if (tag !== TAG) throw new Error(`transaction ${sig} is not an encoder chunk`)
        if (hash && h !== hash) throw new Error('chunks from two different objects')
        hash = h
        parts[Number(pos.split('/')[0])] = data
        sig = prev
      }
      return Buffer.from(parts.join(''), 'base64').toString('utf8')
    },
  }
}

/**
 * A backend on IQ Labs Code-In. The SDK is loaded only when this backend is
 * used, so the rest of the harness keeps no dependencies.
 * @param {{connection: object, signer: object, sdk?: object}} o - a @solana/web3.js Connection and Signer, as the SDK expects; `sdk` to inject one.
 */
export function iqBackend({ connection, signer, sdk }) {
  const load = async () => sdk ?? (await import('@iqlabs-official/solana-sdk').catch(() => { throw new Error('the iq backend needs @iqlabs-official/solana-sdk: npm install @iqlabs-official/solana-sdk') })).default
  return {
    name: 'iq',
    async put(text, hash) { return (await load()).writer.codeIn({ connection, signer }, text, `${hash}.json`, 0, 'application/json') },
    async get(locator) { const r = await (await load()).reader.readCodeIn(locator); if (r?.data == null) throw new Error(`nothing stored at ${locator}`); return r.data },
  }
}

/**
 * Store an object.
 * @param {object} obj - a policy, contract, certification or profile.
 * @param {{put: Function, name: string}} backend - where to store it.
 * @returns {Promise<{hash: string, backend: string, locator: string, bytes: number}>} where it is.
 */
export async function encodeObject(obj, backend) {
  const { text, hash } = encodedForm(obj)
  const locator = await backend.put(text, hash)
  return { hash, backend: backend.name, locator, bytes: Buffer.byteLength(text) }
}

/**
 * Read an object back and check it against the hash the chain already holds.
 * @param {string} locator - where it was stored.
 * @param {{get: Function}} backend - the backend.
 * @param {string} expectedHash - the hash from the signer config, ruling or registry.
 * @returns {Promise<object>} the object.
 */
export async function decodeObject(locator, backend, expectedHash) {
  const text = await backend.get(locator)
  const obj = JSON.parse(text)
  const got = sha256(obj)
  if (got !== expectedHash) throw new Error(`stored text hashes to ${got}, not ${expectedHash}; refusing it`)
  if (createHash('sha256').update(canonical(obj)).digest('hex') !== got) throw new Error('not canonical')
  return obj
}
