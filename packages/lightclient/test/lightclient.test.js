import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SolanaReader, EvmReader, HeliosAdapter, sourceChain, fromConfig, checkEndpoints, toRaw, safeError } from '../index.js'
import { ApiRouter, Harness, mockProvider, Outbox, PauseLog, fundingCheck, validate } from '../../core/src/index.js'

// A mocked RPC network: each API id answers with its own handler.
function mockRouter(handlers) {
  const apis = new Map(Object.keys(handlers).map(id => [id, { id, kind: 'data', baseURL: `https://${id}.example.net/rpc` }]))
  const calls = []
  return {
    apis, calls,
    async call(_token, apiId, { body }) {
      calls.push({ apiId, method: body.method })
      const h = handlers[apiId]
      try {
        return { status: 200, body: { jsonrpc: '2.0', id: body.id, result: await h(body.method, body.params, calls.filter(c => c.apiId === apiId).length) } }
      } catch (e) {
        return { status: 200, body: { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: e.message } } }
      }
    },
  }
}

const EP = [
  { id: 'a', operator: 'op-one', api: 'a' },
  { id: 'b', operator: 'op-two', api: 'b' },
  { id: 'c', operator: 'op-three', api: 'c' },
]
const fast = { retryDelayMs: 0, timeoutMs: 1000 }
const PUBKEY = 'Esc111111111111111111111111111111111111111'
const USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'

// An account answer at a slot, with some lamports.
const acct = (slot, lamports, data = 'AAAA') => (method) => {
  if (method !== 'getAccountInfo') throw new Error(`unexpected ${method}`)
  return { context: { slot }, value: { lamports, owner: '11111111111111111111111111111111', executable: false, data: [data, 'base64'], rentEpoch: 0 } }
}
const reader = (handlers, opts = {}) => new SolanaReader({ router: mockRouter(handlers), endpoints: EP, ...fast, ...opts })

test('F4: three endpoints agree, the read is accepted and labeled', async () => {
  const r = await reader({ a: acct(1000, 5), b: acct(1002, 5), c: acct(1001, 5) }).account(PUBKEY)
  assert.equal(r.status, 'agreed')
  assert.equal(r.value.lamports, '5')
  assert.equal(r.slot, 1000, 'the agreed slot is the lowest of the agreeing answers')
  assert.equal(r.commitment, 'finalized')
  assert.equal(r.chain, 'solana')
  assert.deepEqual(r.sources.map(s => [s.id, s.operator, s.origin, s.verdict]), [
    ['a', 'op-one', 'a.example.net', 'agree'], ['b', 'op-two', 'b.example.net', 'agree'], ['c', 'op-three', 'c.example.net', 'agree'],
  ])
  assert.equal(r.attempts, 1)
})

test('F4: a 2 to 1 split is rejected and retried by default, then unknown', async () => {
  const router = mockRouter({ a: acct(1000, 5), b: acct(1000, 5), c: acct(1000, 9) })
  const r = await new SolanaReader({ router, endpoints: EP, ...fast }).account(PUBKEY)
  assert.equal(r.status, 'unknown')
  assert.equal(r.value, null)
  assert.equal(r.attempts, 3, 'one try and two retries')
  assert.equal(router.calls.length, 9)
  assert.match(r.reason, /2 of 3 agree .*policy reject-and-retry needs all 3/)
  assert.equal(r.sources.find(s => s.id === 'c').verdict, 'dissent')
})

test('F4: a split that clears on retry is accepted', async () => {
  const flaky = (method, params, n) => acct(1000, n === 1 ? 9 : 5)(method)
  const r = await reader({ a: acct(1000, 5), b: acct(1000, 5), c: flaky }).account(PUBKEY)
  assert.equal(r.status, 'agreed')
  assert.equal(r.attempts, 2)
})

test('F4: policy accept-majority takes 2 of 3 and records the dissent', async () => {
  const r = await reader({ a: acct(1000, 5), b: acct(1000, 5), c: acct(1000, 9) }, { policy: 'accept-majority' }).account(PUBKEY)
  assert.equal(r.status, 'agreed')
  assert.equal(r.value.lamports, '5')
  assert.equal(r.policy, 'accept-majority')
  assert.deepEqual(r.sources.map(s => s.verdict), ['agree', 'agree', 'dissent'])
})

test('F4: accept-majority still needs the majority to span two operators', async () => {
  const eps = [{ id: 'a', operator: 'same', api: 'a' }, { id: 'b', operator: 'same', api: 'b' }, { id: 'c', operator: 'other', api: 'c' }]
  const r = await new SolanaReader({ router: mockRouter({ a: acct(1, 5), b: acct(1, 5), c: acct(1, 9) }), endpoints: eps, policy: 'accept-majority', ...fast }).account(PUBKEY)
  assert.equal(r.status, 'unknown')
  assert.match(r.reason, /spans 1 operator/)
})

test('F4: all different is unknown at once, never a guess', async () => {
  const router = mockRouter({ a: acct(1000, 1), b: acct(1000, 2), c: acct(1000, 3) })
  const r = await new SolanaReader({ router, endpoints: EP, ...fast }).account(PUBKEY)
  assert.equal(r.status, 'unknown')
  assert.equal(r.value, null)
  assert.equal(r.attempts, 1)
  assert.match(r.reason, /no majority: 3 different answers/)
})

test('F4: a stale slot is rejected, and the read is not accepted on the rest by default', async () => {
  const r = await reader({ a: acct(5000, 5), b: acct(5001, 5), c: acct(4000, 5) }).account(PUBKEY)
  const c = r.sources.find(s => s.id === 'c')
  assert.equal(c.verdict, 'stale')
  assert.match(c.error, /1001 behind the newest answer 5001; the limit is 150/)
  assert.equal(r.status, 'unknown')
})

test('F4: a stale endpoint with a different answer never wins, even under accept-majority', async () => {
  const r = await reader({ a: acct(5000, 5), b: acct(5001, 5), c: acct(10, 999) }, { policy: 'accept-majority' }).account(PUBKEY)
  assert.equal(r.status, 'agreed')
  assert.equal(r.value.lamports, '5')
  assert.equal(r.sources.find(s => s.id === 'c').verdict, 'stale')
})

test('F4: a slot below the floor is rejected', async () => {
  const r = await reader({ a: acct(900, 5), b: acct(901, 5), c: acct(902, 5) }).account(PUBKEY, { minSlot: 1000 })
  assert.equal(r.status, 'unknown')
  assert.ok(r.sources.every(s => s.verdict === 'stale'))
  assert.match(r.reason, /no usable answer: 3 stale/)
})

test('getSlot agrees on freshness and returns the lowest fresh slot', async () => {
  const slot = s => () => s
  const ok = await reader({ a: slot(700), b: slot(705), c: slot(702) }).slot()
  assert.equal(ok.status, 'agreed')
  assert.equal(ok.value, 700)
  const lag = await reader({ a: slot(700), b: slot(705), c: slot(100) }).slot()
  assert.equal(lag.status, 'unknown')
})

test('an endpoint that errors or times out is recorded and not counted', async () => {
  const hang = () => new Promise(() => {})
  const r = await reader({ a: acct(1, 5), b: () => { throw new Error('boom') }, c: hang }, { retries: 0, timeoutMs: 50 }).account(PUBKEY)
  assert.equal(r.status, 'unknown')
  assert.deepEqual(r.sources.map(s => s.verdict), ['agree', 'error', 'error'])
  assert.match(r.sources[2].error, /timed out/)
})

test('endpoint config: three endpoints, two operators, no raw keys', () => {
  assert.throws(() => checkEndpoints(EP.slice(0, 2)), /3 endpoints are required, 2 configured/)
  assert.throws(() => checkEndpoints(EP.map(e => ({ ...e, operator: 'one' }))), /span 1 operator/)
  assert.throws(() => checkEndpoints([{ ...EP[0], apiKey: 'x' }, ...EP.slice(1)]), /holds a raw "apiKey"/)
  const apis = new Map(EP.map(e => [e.api, { baseURL: `https://${e.id}.example.net/?api-key=abc` }]))
  assert.throws(() => checkEndpoints(EP, { apis }), /has a key in its URL/)
  assert.throws(() => checkEndpoints(EP, { apis: new Map() }), /not plugged into the router/)
  assert.equal(checkEndpoints([...EP, { id: 'd', operator: 'op-four', api: 'd' }]).length, 3, 'reads the first n')
})

test('keys come through the API router as env or keyblock references and never reach a result', async () => {
  const SECRET = 'sk_live_this_must_never_appear_0123456789abcdef'
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ url, auth: init.headers.authorization })
    const body = JSON.parse(init.body)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { context: { slot: 10 }, value: null } }), { status: 200 })
  }
  const router = new ApiRouter({
    fetch, env: { PAID_RPC_KEY: SECRET },
    apis: [
      { id: 'pub-a', baseURL: 'https://api.devnet.solana.com' },
      { id: 'pub-b', baseURL: 'https://other.example.org' },
      { id: 'paid', baseURL: 'https://paid.example.com', secretEnv: 'PAID_RPC_KEY', auth: 'query:api-key' },
    ],
  })
  const eps = [{ id: 'pub-a', operator: 'solana', api: 'pub-a' }, { id: 'pub-b', operator: 'other', api: 'pub-b' }, { id: 'paid', operator: 'paid', api: 'paid' }]
  const r = await new SolanaReader({ router, endpoints: eps, ...fast }).account(PUBKEY)
  assert.equal(r.status, 'agreed')
  assert.deepEqual(r.value, { exists: false })
  assert.ok(seen.some(s => s.url.includes(`api-key=${SECRET}`)), 'the router attached the key')
  assert.ok(seen.filter(s => !s.url.includes('paid')).every(s => !s.url.includes('api-key') && !s.auth), 'keyless APIs get no key')
  assert.ok(!JSON.stringify(r).includes(SECRET), 'the key is not in the result')
  assert.ok(!JSON.stringify(router.meter).includes(SECRET), 'the key is not in the meter')
  assert.equal(r.sources[2].origin, 'paid.example.com', 'sources carry the host only')
  assert.equal(safeError(new Error(`fetch failed for https://paid.example.com/?api-key=${SECRET}`)).includes(SECRET), false)
  const missing = new ApiRouter({ fetch, env: {}, apis: [{ id: 'paid', baseURL: 'https://paid.example.com', secretEnv: 'PAID_RPC_KEY' }] })
  await assert.rejects(missing.call(null, 'paid', { body: {} }), /needs PAID_RPC_KEY set/)
})

const tokenAcct = (mint, amount) => () => ({ context: { slot: 50 }, value: { lamports: 2039280, owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', executable: false, data: { program: 'spl-token', parsed: { type: 'account', info: { mint, owner: 'Holder1111111111111111111111111111111111111', state: 'initialized', tokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6 } } } } } })

test('funding: an SPL escrow is funded, short, or the wrong mint', async () => {
  const src = { account: PUBKEY, mint: USDC }
  const funded = await reader({ a: tokenAcct(USDC, '1200000'), b: tokenAcct(USDC, '1200000'), c: tokenAcct(USDC, '1200000') }).checkFunding(src, 1.2)
  assert.equal(funded.status, 'agreed')
  assert.equal(funded.funded, true)
  assert.equal(funded.need, '1200000')
  const short = await reader({ a: tokenAcct(USDC, '1000000'), b: tokenAcct(USDC, '1000000'), c: tokenAcct(USDC, '1000000') }).checkFunding(src, 1.2)
  assert.equal(short.funded, false)
  const wrong = await reader({ a: tokenAcct('Other', '9000000'), b: tokenAcct('Other', '9000000'), c: tokenAcct('Other', '9000000') }).checkFunding(src, 1.2)
  assert.equal(wrong.funded, false)
  assert.match(wrong.reason, /not 4zMMC9/)
  assert.equal(toRaw(1.2, 6), 1200000n)
  assert.equal(toRaw('0.000001', 6), 1n)
})

test('a signature has landed only at the commitment level and without an error', async () => {
  const status = (s) => () => ({ context: { slot: 99 }, value: [s] })
  const fin = { slot: 90, confirmationStatus: 'finalized', err: null }
  const ok = await reader({ a: status(fin), b: status(fin), c: status(fin) }).signature('sig')
  assert.equal(ok.status, 'agreed')
  assert.equal(ok.value.landed, true)
  const conf = { ...fin, confirmationStatus: 'confirmed' }
  const notYet = await reader({ a: status(conf), b: status(conf), c: status(conf) }).signature('sig')
  assert.equal(notYet.value.landed, false)
  const missing = await reader({ a: status(null), b: status(null), c: status(null) }).signature('sig')
  assert.deepEqual(missing.value, { found: false, landed: false })
})

// EVM: a mocked chain with a finalized head per endpoint.
function evmNode({ chainId = 1, head = 100, hashes = {}, balance = '0x10', receipt = null }) {
  return (method, params) => {
    if (method === 'eth_chainId') return `0x${chainId.toString(16)}`
    if (method === 'eth_getBlockByNumber') {
      const n = params[0] === 'finalized' ? head : Number(BigInt(params[0]))
      return { number: `0x${n.toString(16)}`, hash: hashes[n] ?? `0xhash${n}` }
    }
    if (method === 'eth_getBalance' || method === 'eth_call') return balance
    if (method === 'eth_getTransactionReceipt') return receipt
    throw new Error(`unexpected ${method}`)
  }
}
const evm = (handlers, opts = {}) => new EvmReader({ router: mockRouter(handlers), endpoints: EP, chainId: 1, ...fast, ...opts })

test('EVM: three endpoints agree on a pinned finalized block and the balance at it', async () => {
  const r = await evm({ a: evmNode({ head: 100 }), b: evmNode({ head: 102 }), c: evmNode({ head: 101 }) }).balance('0xabc')
  assert.equal(r.status, 'agreed')
  assert.equal(r.value, '16')
  assert.deepEqual(r.block, { number: 100, hash: '0xhash100' })
  assert.equal(r.commitment, 'finalized')
  assert.equal(r.verification, 'multi-rpc')
  assert.equal(r.syncCommittee, 'not configured')
})

test('EVM: a different block hash at the pinned height is a split, and a wrong chain id is an error', async () => {
  const fork = await evm({ a: evmNode({}), b: evmNode({}), c: evmNode({ hashes: { 100: '0xother' } }) }).balance('0xabc')
  assert.equal(fork.status, 'unknown')
  assert.equal(fork.sources.find(s => s.id === 'c').verdict, 'dissent')
  const wrong = await evm({ a: evmNode({}), b: evmNode({}), c: evmNode({ chainId: 8453 }) }, { retries: 0 }).balance('0xabc')
  assert.equal(wrong.status, 'unknown')
  assert.match(wrong.sources.find(s => s.id === 'c').error, /wrong chain: endpoint serves chain id 8453, expected 1/)
})

test('EVM: other chains use the same reader; ERC-20 funding and receipts', async () => {
  const rc = { status: '0x1', blockNumber: '0x5a', blockHash: '0xb' }
  const nodes = { a: evmNode({ chainId: 8453, balance: '0x1312d00', receipt: rc }), b: evmNode({ chainId: 8453, balance: '0x1312d00', receipt: rc }), c: evmNode({ chainId: 8453, balance: '0x1312d00', receipt: rc }) }
  const base = evm(nodes, { chainId: 8453, chain: 'base' })
  const f = await base.checkFunding({ address: '0xescrow', token: '0xusdc', decimals: 6 }, 20)
  assert.equal(f.status, 'agreed')
  assert.equal(f.funded, true, '0x1312d00 is 20000000, 20 USDC')
  const r = await base.receipt('0xtx')
  assert.equal(r.value.landed, true)
  assert.equal(r.chain, 'base')
})

test('Helios absent: the adapter says not installed and mainnet reads still work, labeled multi-rpc', async () => {
  const helios = new HeliosAdapter({ env: { PATH: '/nonexistent' }, fetch: async () => { throw new Error('connection refused') } })
  const s = await helios.status()
  assert.equal(s.installed, false)
  assert.equal(s.running, false)
  assert.match(s.reason, /not installed: no "helios" on PATH/)
  await assert.rejects(helios.start(), /not installed/)
  const r = await evm({ a: evmNode({}), b: evmNode({}), c: evmNode({}) }, { helios }).balance('0xabc')
  assert.equal(r.status, 'agreed')
  assert.equal(r.verification, 'multi-rpc')
  assert.equal(r.syncCommittee, 'not installed')
})

test('Helios sidecar answering (mocked): it joins the sources and must agree too', async () => {
  const node = evmNode({})
  const fetch = async (_url, init) => {
    const b = JSON.parse(init.body)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, result: node(b.method, b.params) }))
  }
  const helios = new HeliosAdapter({ mode: 'sidecar', fetch })
  const r = await evm({ a: evmNode({}), b: evmNode({}), c: evmNode({}) }, { helios }).balance('0xabc')
  assert.equal(r.status, 'agreed')
  assert.equal(r.sources.length, 4)
  assert.equal(r.sources[3].origin, '127.0.0.1:8545')
  assert.equal(r.verification, 'multi-rpc+helios-sync-committee')
})

// Wiring: intake and the outbox.
const ex = n => JSON.parse(readFileSync(new URL(`../../../examples/${n}.json`, import.meta.url), 'utf8'))
const config = JSON.parse(readFileSync(new URL('../../../verafy.config.json', import.meta.url), 'utf8'))
const mock = ex('mock-answers')
const funded = asc => ({ ...asc, payment: { ...asc.payment, source: { account: PUBKEY, mint: USDC } } })

test('F3: with no light client, admit is intake alone and the demo contracts still pass', async () => {
  const asc = ex('market-resolution')
  const h = new Harness({ ...config.pool[0], provider: mockProvider(mock, asc.id, 'mistral') })
  const a = await h.admit(asc)
  assert.equal(a.admitted, true)
  assert.equal(a.funding.checked, false)
  assert.equal(a.funding.reason, 'no light client configured')
  assert.deepEqual(validate(funded(asc)), [])
})

test('F3: intake checks funding through the light client, and disagreement pauses the contract with why', async () => {
  const asc = funded(ex('market-resolution'))
  const ok = new Harness({ ...config.pool[0], provider: null, sourceChain: sourceChain({ solana: reader({ a: tokenAcct(USDC, '1200000'), b: tokenAcct(USDC, '1200000'), c: tokenAcct(USDC, '1200000') }) }) })
  const a = await ok.admit(asc)
  assert.equal(a.admitted, true)
  assert.equal(a.funding.read.commitment, 'finalized')
  assert.equal(a.funding.read.sources.length, 3)

  const short = new Harness({ ...config.pool[0], provider: null, sourceChain: sourceChain({ solana: reader({ a: tokenAcct(USDC, '1'), b: tokenAcct(USDC, '1'), c: tokenAcct(USDC, '1') }) }) })
  const s = await short.admit(asc)
  assert.equal(s.admitted, false)
  assert.match(s.problems[0], /escrow not funded: 1 held, 1200000 needed/)

  const pauses = new PauseLog()
  const split = new Harness({ ...config.pool[0], provider: null, pauses, sourceChain: sourceChain({ solana: reader({ a: tokenAcct(USDC, '1200000'), b: tokenAcct(USDC, '1200000'), c: tokenAcct(USDC, '0') }) }) })
  const p = await split.admit(asc)
  assert.equal(p.admitted, false)
  assert.equal(p.funding.paused, true)
  assert.ok(pauses.isPaused(asc.id))
  assert.equal(pauses.entries[0].stage, 'intake')
  assert.match(pauses.entries[0].reason, /funding unknown: 2 of 3 agree/)
  assert.equal(pauses.entries[0].read.sources.length, 3)
  pauses.resume(asc.id, 'operator re-read after the lagging endpoint caught up')
  assert.equal(pauses.isPaused(asc.id), false)
  assert.equal(pauses.entries.length, 2, 'append-only')

  const noMint = await fundingCheck({ ...asc, payment: { ...asc.payment, source: { account: PUBKEY } } }, { sourceChain: ok.sourceChain })
  assert.equal(noMint.ok, false)
  assert.equal(noMint.paused, false)
  assert.match(noMint.problems[0], /names no mint for USDC/)

  const strict = await fundingCheck(ex('market-resolution'), { sourceChain: sourceChain({}), require: true })
  assert.equal(strict.ok, false)
})

test('F3: the outbox confirms a trigger landed, and pauses the contract when sources disagree', async () => {
  const status = (s) => () => ({ context: { slot: 99 }, value: [s] })
  const fin = { slot: 90, confirmationStatus: 'finalized', err: null }
  const trigger = { type: 'call', chain: 'solana', target: 'market.settle', args: ['NO'] }
  const out = new Outbox({ sourceChain: sourceChain({ solana: reader({ a: status(fin), b: status(fin), c: status(fin) }) }) })
  const sent = out.record({ asc: 'm1', ruling: 'r1', trigger, landed: { chain: 'solana', signature: 'sig' } })
  const c = await out.confirm(sent)
  assert.equal(c.status, 'confirmed')
  assert.equal(c.read.commitment, 'finalized')
  assert.deepEqual(c.read.sources.map(s => s.verdict), ['agree', 'agree', 'agree'])

  const bad = new Outbox({ sourceChain: sourceChain({ solana: reader({ a: status(fin), b: status(null), c: status({ ...fin, err: { InstructionError: [0, 'Custom'] } }) }) }) })
  const u = await bad.confirm(bad.record({ asc: 'm2', ruling: 'r2', trigger, landed: { signature: 'sig' } }))
  assert.equal(u.status, 'unknown')
  assert.ok(bad.pauses.isPaused('m2'))
  assert.equal(bad.pauses.entries[0].stage, 'outbox')

  const off = new Outbox()
  assert.equal((await off.confirm(off.record({ asc: 'm3', ruling: 'r3', trigger, landed: { signature: 'sig' } }))).status, 'unconfirmed')
})

test('fromConfig builds readers from the devnet config through the API router', async () => {
  const lc = JSON.parse(readFileSync(new URL('../../../config/lightclient.devnet.json', import.meta.url), 'utf8')).lightclient
  const fetch = async (_url, init) => {
    const b = JSON.parse(init.body)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, result: b.method === 'getGenesisHash' ? 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' : 1234 }))
  }
  const { solana, router } = fromConfig(lc, { fetch, env: {} })
  assert.equal(solana.endpoints.length, 3)
  assert.equal(new Set(solana.endpoints.map(e => e.operator)).size, 3)
  const g = await solana.genesisHash()
  assert.equal(g.status, 'agreed')
  assert.equal(router.meter.length, 3, "one getGenesisHash per endpoint")
})
