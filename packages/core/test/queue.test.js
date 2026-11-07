/**
 * Batching fields and the encrypted queue (MASTER_SPEC Part C, the core half).
 * The chain's devnet tests cover the release-after-draw rule and the block close.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validate, ascHash, splitSecret, combineSecret, createQueueKey, sealContract, openShare, openContract,
  openWithKey, queueId, queueMeta, envelopeProblems, contractTokens, canonical,
} from '../src/index.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

// Hashes of the example contracts on main before the batching fields existed.
const HASHES = {
  'market-resolution': '595232d4a4ba556bc6d43f1e1d65a1c22842462b649020dd45365aa230f47d5e',
  'fact-check': 'a6f64dc02727257fd81c77c1dedb9e24155e15b7cc02bf8f843c2586776ff1ad',
  forecast: '0fff4eed4ceb9431ec351f4c6df058bc5bc25e1e7681bfd849f0bd90ea5a45cb',
  'delay-cover': 'df77fbc0585ce36a07b13ccb88bb9c52629dd49ec0ed6680d625095f6858ff87',
  'fact-check-escalation': '93cee3b79b06407de87caf5cb0ba96910ea99f1b48abd6a3bfaa321011b4a6b3',
}

test('batching fields are optional: every existing example validates and keeps its hash', () => {
  for (const [name, h] of Object.entries(HASHES)) {
    const asc = read(`packages/core/test/fixtures/v0.0.2/${name}.json`)
    assert.equal(asc.payment.minBatch, undefined)
    assert.equal(asc.payment.maxWaitSeconds, undefined)
    assert.deepEqual(validate(asc), [], name)
    assert.equal(ascHash(asc), h, `${name} keeps its hash`)
  }
})

test('minBatch and maxWaitSeconds validate when set, and are refused when malformed', () => {
  const asc = read('examples/market-resolution.json')
  const withBoth = { ...asc, payment: { ...asc.payment, minBatch: 12, maxWaitSeconds: 1800 } }
  assert.deepEqual(validate(withBoth), [])
  assert.notEqual(ascHash(withBoth), ascHash(asc), 'setting a field is a different contract')
  for (const minBatch of [0, 1.5, '3']) assert.match(validate({ ...asc, payment: { ...asc.payment, minBatch } }).join(), /minBatch/)
  for (const maxWaitSeconds of [0, -5, '60']) assert.match(validate({ ...asc, payment: { ...asc.payment, maxWaitSeconds } }).join(), /maxWaitSeconds/)
})

test('Shamir: any t of n shares rebuild the secret; t - 1 do not', () => {
  const secret = Buffer.from('a'.repeat(64), 'hex')
  const shares = splitSecret(secret, 5, 3)
  assert.equal(shares.length, 5)
  for (const pick of [[0, 1, 2], [0, 2, 4], [1, 3, 4], [4, 3, 2, 1, 0]]) assert.deepEqual(combineSecret(pick.map(i => shares[i])), secret)
  assert.notDeepEqual(combineSecret([shares[0], shares[1]]), secret)
  assert.throws(() => splitSecret(secret, 3, 4), /threshold/)
})

const committee = () => ['node-1', 'node-2', 'node-3'].map(id => ({ id, ...createQueueKey() }))

test('sealed contract: only the escrow reference and payment metadata are in the clear', () => {
  const asc = read('examples/market-resolution.json')
  const nodes = committee()
  const env = sealContract(asc, nodes.map(({ id, publicKey }) => ({ id, encryptionKey: publicKey })), { t: 2, escrowRef: 'solana:escrow/demo-1' })
  assert.deepEqual(envelopeProblems(env, { nodes: nodes.map(n => n.id), t: 2 }), [])
  const text = canonical(env)
  for (const secret of [asc.id, asc.question.prompt, asc.context[0].content.slice(0, 40), asc.context[0].sha256, asc.exits[0].outcome === 'YES' ? 'market.settle' : asc.exits[0].outcome, ascHash(asc)]) {
    assert.ok(!text.includes(secret), `"${secret.slice(0, 30)}" must not appear in the envelope`)
  }
  assert.deepEqual(Object.keys(env.meta).sort(), ['chain', 'currency', 'escrow', 'escrowRef', 'jury', 'maxValuePerVote', 'maxWaitSeconds', 'minBatch', 'tokens'].filter(k => env.meta[k] !== undefined).sort())
  assert.equal(env.meta.escrow, 1.2)
  assert.equal(env.meta.tokens, contractTokens(asc))
})

test('sealed contract: two of three node shares open it; one share, or a node reading another node\'s share, does not', () => {
  const asc = read('examples/fact-check.json')
  const nodes = committee()
  const env = sealContract(asc, nodes.map(({ id, publicKey }) => ({ id, encryptionKey: publicKey })), { t: 2, escrowRef: 'solana:escrow/demo-2' })
  const shares = nodes.map(n => openShare(env, n.id, n.privateKey))
  const opened = openContract(env, [shares[0], shares[2]])
  assert.equal(ascHash(opened.asc), ascHash(asc))
  assert.equal(ascHash(openWithKey(env, opened.key)), ascHash(asc), 'a released key opens it for every node')
  assert.throws(() => openContract(env, [shares[1]]), /need 2 shares/)
  assert.throws(() => openContract(env, [shares[1], { ...shares[0], y: shares[2].y }]), /does not decrypt/)
  assert.throws(() => openShare(env, 'node-1', nodes[1].privateKey), /unable to authenticate|Unsupported state/i)
  const juror = createQueueKey()
  assert.throws(() => openShare(env, 'node-2', juror.privateKey), /unable to authenticate|Unsupported state/i, 'a harness key opens nothing')
})

test('sealed contract: tampered metadata, or a declared size below the contract, is refused', () => {
  const asc = read('examples/forecast.json')
  const nodes = committee()
  const cards = nodes.map(({ id, publicKey }) => ({ id, encryptionKey: publicKey }))
  assert.throws(() => sealContract(asc, cards, { t: 2, escrowRef: 'x', tokens: 3 }), /declared 3 tokens/)
  const env = sealContract(asc, cards, { t: 2, escrowRef: 'solana:escrow/demo-3' })
  const shares = nodes.slice(0, 2).map(n => openShare(env, n.id, n.privateKey))
  const raised = { ...env, meta: { ...env.meta, escrow: 99 } }
  assert.notEqual(queueId(raised), queueId(env))
  assert.throws(() => openShare(raised, 'node-1', nodes[0].privateKey), /unable to authenticate|Unsupported state/i, 'metadata is bound to every share')
  assert.throws(() => openContract(raised, shares), /does not decrypt/, 'and to the ciphertext')
  assert.deepEqual(queueMeta(asc, { escrowRef: 'r' }).jury.size, 5)
})
