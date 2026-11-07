import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verify, createPublicKey } from 'node:crypto'
import { b58encode, b58decode, keypair, buildTx, identitySigner, rulingCommitment, encode, decodeRuling, RULING_SIZE, programError } from '../src/index.js'
import { createIdentity } from '../../core/src/index.js'

test('base58 round-trips, leading zeros kept', () => {
  for (const b of [new Uint8Array([0, 0, 1, 2, 255]), new Uint8Array(32), Uint8Array.from({ length: 32 }, (_, i) => i * 7)]) assert.deepEqual(b58decode(b58encode(b)), b)
  assert.equal(b58encode(new Uint8Array(32)), '11111111111111111111111111111111')
})

test('a harness identity signs as a Solana key', () => {
  const id = createIdentity()
  const s = identitySigner(id)
  assert.equal(b58decode(s.address).length, 32)
  const msg = Buffer.from('hello')
  assert.ok(verify(null, msg, createPublicKey({ key: Buffer.from(id.publicKey, 'base64'), format: 'der', type: 'spki' }), s.sign(msg)))
})

test('keypairs reload from the CLI file format', () => {
  const k = keypair()
  assert.equal(keypair(k.secret).address, k.address)
})

test('transactions: payer first, signatures over the message', () => {
  const payer = keypair(), juror = keypair(), program = keypair()
  const ruling = keypair()
  const tx = buildTx([{ programId: program.publicKey, keys: [{ pubkey: ruling.publicKey, isSigner: false, isWritable: true }, { pubkey: juror.publicKey, isSigner: true, isWritable: false }], data: new Uint8Array([3, 0, 0]) }], payer, [payer, juror], b58encode(new Uint8Array(32).fill(9)))
  assert.equal(tx[0], 2)
  const message = tx.subarray(1 + 128)
  assert.deepEqual([...message.subarray(0, 3)], [2, 1, 1])
  assert.deepEqual(message.subarray(4, 36), payer.publicKey)
  assert.throws(() => buildTx([{ programId: program.publicKey, keys: [{ pubkey: juror.publicKey, isSigner: true, isWritable: false }], data: new Uint8Array() }], payer, [payer], b58encode(new Uint8Array(32))), /missing signer/)
})

test('commitments bind every field; encoders and the layout agree', () => {
  const h = 'ab'.repeat(32), r = 'cd'.repeat(32), s = 'ef'.repeat(32)
  const c = rulingCommitment(h, 0, 1, r, s)
  assert.notDeepEqual(c, rulingCommitment(h, 0, 2, r, s))
  assert.notDeepEqual(c, rulingCommitment(h, 1, 1, r, s))
  assert.equal(encode.open(h, 800000, [keypair().publicKey]).length, 70)
  assert.equal(encode.reveal(0, 1, r, s).length, 67)
  assert.throws(() => encode.seal('x'.repeat(513)))
  const acct = Buffer.alloc(RULING_SIZE)
  acct.write('VRFYRUL1', 0, 'latin1'); acct[8] = 2; acct[9] = 1; acct[10] = 1; acct[11] = 1; acct.writeUInt32LE(800000, 12)
  acct[80 + 97] = 2; acct.writeUInt16LE(2, 912); acct.write('ok', 914)
  const d = decodeRuling(acct)
  assert.equal(d.status, 'sealed'); assert.equal(d.jurors[0].state, 'revealed'); assert.equal(d.summary, 'ok')
  assert.deepEqual(programError({ err: { InstructionError: [0, { Custom: 102 }] } }), { code: 102, name: 'bad reveal' })
  // v0.0.3: optional reveal and challenge windows at open, and the slots they set on the account.
  assert.equal(encode.open(h, 800000, [keypair().publicKey], { revealWindow: 20, challengeWindow: 150 }).length, 78)
  acct.writeBigUInt64LE(1234n, 1426); acct.writeBigUInt64LE(5678n, 1434); acct.writeUInt32LE(150, 1442)
  const w = decodeRuling(acct)
  assert.deepEqual([w.revealDeadlineSlot, w.releasableAfterSlot, w.challengeWindow], [1234, 5678, 150])
  assert.equal(RULING_SIZE, 1450)
})
