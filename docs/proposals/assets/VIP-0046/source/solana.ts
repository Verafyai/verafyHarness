import { createPrivateKey, sign } from 'node:crypto'

/** Devnet only. The thesis never stamps on mainnet from the server. */
export const STAMP_CLUSTER = 'devnet'
const RPC = 'https://api.devnet.solana.com'
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function b58decode(s: string): Uint8Array {
  let n = 0n
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) throw new Error('bad_base58')
    n = n * 58n + BigInt(v)
  }
  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }
  for (const ch of s) {
    if (ch !== '1') break
    bytes.unshift(0)
  }
  return Uint8Array.from(bytes)
}

const compact = (len: number): number[] => {
  const out: number[] = []
  let v = len
  do {
    let b = v & 0x7f
    v >>= 7
    if (v) b |= 0x80
    out.push(b)
  } while (v)
  return out
}

const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

/** Reads THESIS_SOLANA_PAYER: a Solana keypair as a JSON array of 64 bytes. Returns null when unset or malformed. */
export function payerFromEnv(raw = process.env.THESIS_SOLANA_PAYER): Uint8Array | null {
  if (!raw?.trim()) return null
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr) || arr.length !== 64 || !arr.every((x) => Number.isInteger(x) && x >= 0 && x < 256)) return null
    return Uint8Array.from(arr as number[])
  } catch {
    return null
  }
}

export function memoFor(root: string, runId: string): string {
  return `verafy-thesis/1 merkle:${root} run:${runId} https://www.verafy.ai/thesis`
}

type Rpc = (method: string, params: unknown[]) => Promise<unknown>

const defaultRpc: Rpc = async (method, params) => {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await res.json()) as { result?: unknown; error?: unknown }
  if (body.error) throw new Error(`rpc_error ${JSON.stringify(body.error).slice(0, 200)}`)
  return body.result
}

/** Writes one memo transaction to Solana devnet and returns its signature. */
export async function stampMemo(memo: string, secret: Uint8Array, rpc: Rpc = defaultRpc): Promise<string> {
  const seed = secret.slice(0, 32)
  const payer = secret.slice(32, 64)
  const latest = (await rpc('getLatestBlockhash', [{ commitment: 'finalized' }])) as { value: { blockhash: string } }
  const data = new TextEncoder().encode(memo)
  const message = Uint8Array.from([
    1, 0, 1,
    ...compact(2), ...payer, ...b58decode(MEMO),
    ...b58decode(latest.value.blockhash),
    ...compact(1), 1, ...compact(1), 0, ...compact(data.length), ...data,
  ])
  const key = createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seed)]),
    format: 'der',
    type: 'pkcs8',
  })
  const signature = sign(null, message, key)
  const tx = Buffer.from([...compact(1), ...signature, ...message]).toString('base64')
  return String(await rpc('sendTransaction', [tx, { encoding: 'base64', preflightCommitment: 'confirmed' }]))
}
