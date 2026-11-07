import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BankerService, Ledger, testVenue, toUnits, fromUnits, depositKey, creditPlan, manualCredits, openRouterCredits, advise, jupiterVenue, lifiVenue } from '../src/index.js'

const SOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SCAM = 'Scam1111111111111111111111111111111111111111'
const config = {
  target: { chain: 'solana', token: USDC },
  tokens: { [`solana:${SOL}`]: { symbol: 'SOL', decimals: 9, minUsd: 1 }, [`solana:${USDC}`]: { symbol: 'USDC', decimals: 6, minUsd: 0.5 } },
  caps: { perTxUsd: 5000, perDayUsd: 10000 },
  confirmations: { solana: 1 },
  maxSlippage: 0.01, maxDeviation: 0.02,
}
const price = async t => ({ SOL: 150, USDC: 1 })[t.symbol] ?? null
const venue = (rate = 150 / 1000) => testVenue({ name: 'test', rates: { [`${SOL}/${USDC}`]: rate } }) // 1 lamport -> 0.15 micro-USDC
const dep = (txid, amount, extra = {}) => ({ chain: 'solana', txid, index: 0, token: SOL, amount: toUnits(amount, 9), from: 'payer1', confirmations: 1, agreed: true, ...extra })
const svc = (o = {}) => new BankerService({ config, venues: [venue()], price, ...o })

test('units are exact', () => {
  assert.equal(toUnits('1.5', 9), 1_500_000_000n)
  assert.equal(fromUnits(1_500_000_000n, 9), '1.5')
  assert.equal(fromUnits(5n, 6), '0.000005')
})

test('happy path, dry run: quoted and simulated, nothing sent', async () => {
  const s = svc()
  const d = await s.ingest(dep('t1', '2'))
  assert.equal(d.state, 'SIMULATED')
  assert.equal(d.quote.out, toUnits('300', 6))
  assert.ok(s.ledger.verify())
})

test('with execution on, swaps and sweeps; duplicates and restarts never double-swap', async () => {
  const sent = []
  const v = { ...venue(), swap: async q => { sent.push(q); return { txid: 'x', out: q.out } } }
  const ledger = new Ledger()
  const s = new BankerService({ config, venues: [v], price, execute: true, signer: {}, ledger })
  assert.equal((await s.ingest(dep('t1', '2'))).state, 'SWEPT')
  assert.equal((await s.ingest(dep('t1', '2'))).state, 'SWEPT')
  const restarted = new BankerService({ config, venues: [v], price, execute: true, signer: {}, ledger: new Ledger({ entries: ledger.entries }) })
  assert.equal((await restarted.ingest(dep('t1', '2'))).state, 'SWEPT')
  assert.equal(sent.length, 1)
})

test('policy: unknown token quarantined, dust held, screen freezes, caps hold, disagreement waits', async () => {
  const s = svc({ screen: async a => a === 'bad-actor' })
  assert.equal((await s.ingest({ ...dep('q', '1'), token: SCAM })).state, 'QUARANTINED')
  assert.equal((await s.ingest(dep('dust', '0.001'))).state, 'DUST')
  assert.equal((await s.ingest(dep('f', '1', { from: 'bad-actor' }))).state, 'FROZEN')
  assert.equal((await s.ingest(dep('big', '100'))).state, 'HOLD')
  assert.equal((await s.ingest(dep('u', '1', { agreed: false }))).state, 'UNCONFIRMED')
  assert.equal((await s.ingest(dep('u', '1'))).state, 'SIMULATED', 'an unconfirmed deposit proceeds once sources agree')
})

test('a quote far from the reference price is rejected; a failed simulation is never sent', async () => {
  assert.equal((await svc({ venues: [venue(0.12)] }).ingest(dep('r', '2'))).state, 'REJECTED')
  const failing = testVenue({ name: 'test', rates: { [`${SOL}/${USDC}`]: 0.15 }, simulate: () => ({ ok: false, error: 'insufficient funds' }) })
  const s = new BankerService({ config, venues: [failing], price, execute: true, signer: {} })
  const d = await s.ingest(dep('s', '2'))
  assert.equal(d.state, 'NEEDS_HUMAN')
})

test('kill switch holds everything outbound; service mode refuses to start', async () => {
  const s = svc()
  s.pause('test')
  assert.equal((await s.ingest(dep('k', '2'))).state, 'HOLD')
  assert.throws(() => new BankerService({ config: { ...config, mode: 'service' }, venues: [], price }), /legal review/)
  assert.throws(() => new BankerService({ config, venues: [], price, execute: true }), /signer/)
})

test('conservation: every unit deposited is held or converted', async () => {
  const s = svc()
  let total = 0n
  for (let i = 0; i < 40; i++) {
    const amt = toUnits(String((i % 7) * 0.37 + 0.002), 9)
    total += amt
    await s.ingest({ ...dep(`p${i}`, '0'), amount: amt })
  }
  const t = s.totals()[`solana:${SOL}`]
  assert.equal(t.held + t.converted, total)
  assert.equal(t.in, total)
})

test('the ledger detects tampering', async () => {
  const s = svc()
  await s.ingest(dep('t1', '2'))
  const entries = structuredClone(s.ledger.entries)
  entries[1].why = 'edited'
  assert.throws(() => new Ledger({ entries }), /does not verify/)
})

test('credits: days left and top-ups; the advisor flags what needs a human', async () => {
  const plan = await creditPlan([manualCredits({ provider: 'openrouter', usd: 10 }), manualCredits({ provider: 'together', usd: 300 })], { openrouter: 5, together: 5 })
  assert.equal(plan[0].status, 'low'); assert.equal(plan[0].topUpUsd, 140)
  assert.equal(plan[1].status, 'ok')
  const s = svc({ screen: async () => true })
  await s.ingest(dep('f', '2'))
  const r = advise(s, { credits: plan })
  assert.ok(r.flags.some(f => /frozen/.test(f)))
  assert.ok(r.flags.some(f => /openrouter credits low/.test(f)))
  const or = openRouterCredits({ apiKey: 'k', fetch: async () => ({ ok: true, json: async () => ({ data: { total_credits: 20, total_usage: 5.5 } }) }) })
  assert.deepEqual(await or.balance(), { usd: 14.5, used: 5.5, limit: 20 })
})

test('real venue adapters parse their APIs (recorded responses)', async () => {
  const jup = jupiterVenue({ fetch: async () => ({ ok: true, json: async () => ({ inAmount: '100000000', outAmount: '9014890', otherAmountThreshold: '8969816', priceImpactPct: '0', routePlan: [{ swapInfo: { label: 'GoonFi V2' } }] }) }) })
  const q = await jup.quote({ from: SOL, to: USDC, amount: 100000000n })
  assert.equal(q.out, 9014890n); assert.deepEqual(q.route, ['GoonFi V2'])
  assert.equal((await jup.simulate(q)).ok, false, 'no RPC or owner: simulation refuses rather than passing')
  const lifi = lifiVenue({ fetch: async url => { assert.match(String(url), /fromChain=8453/); return { ok: true, json: async () => ({ tool: 'x', estimate: { toAmount: '22000000', toAmountMin: '21900000', feeCosts: [{ amountUSD: '0.01' }], gasCosts: [] } }) } } })
  const lq = await lifi.quote({ chain: 'base', from: '0x0', to: '0x1', amount: 10n ** 16n })
  assert.equal(lq.out, 22000000n)
  await assert.rejects(jup.swap(q, {}), /scoped Solana signer/)
})

test('deposit keys', () => assert.equal(depositKey({ chain: 'solana', txid: 'a' }), 'solana:a:0'))
