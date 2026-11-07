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

// ---- v0.0.4: Squads, the judiciary signer and the registry (offline) ----------
import { findPda, onCurve, squadsPda, discriminator, decodeVaultTransaction, compileVaultMessage, judiciaryEncode, caseHash, authorityOf, caseOf, decodeCase, decodeSignerConfig, CONFIG_SIZE, CASE_SIZE, registryIx, decodeHarness, harnessAccount, spki, HARNESS_SIZE } from '../src/index.js'

test('program addresses match Squads on mainnet and are never on the curve', () => {
  assert.equal(squadsPda.programConfig().address, 'BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr')
  const p = findPda(['authority', new Uint8Array(32)], 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf')
  assert.equal(onCurve(p.bytes), false)
  assert.equal(onCurve(keypair().publicKey), true, 'a real public key is a curve point')
})

test('a compiled vault message decodes back to the same instructions', () => {
  const vault = squadsPda.vault(keypair().address).address
  const to = keypair()
  const data = Buffer.from([2, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0])
  const msg = compileVaultMessage(vault, [{ programId: new Uint8Array(32), keys: [{ pubkey: b58decode(vault), isSigner: true, isWritable: true }, { pubkey: to.publicKey, isSigner: false, isWritable: true }], data }])
  // VaultTransaction account: discriminator, multisig, creator, index, bump, vault index, vault bump, ephemeral bumps (vec), then the message with u32 vectors.
  const small = Buffer.from(msg)
  const nKeys = small[3]
  const keys = small.subarray(4, 4 + 32 * nKeys)
  let at = 4 + 32 * nKeys
  const nIx = small[at++]
  const ixs = []
  for (let i = 0; i < nIx; i++) {
    const prog = small[at++]; const na = small[at++]; const accs = small.subarray(at, at + na); at += na
    const dl = small.readUInt16LE(at); at += 2; const d = small.subarray(at, at + dl); at += dl
    ixs.push(Buffer.concat([Buffer.from([prog]), Buffer.from(Uint32Array.of(na).buffer), accs, Buffer.from(Uint32Array.of(dl).buffer), d]))
  }
  const acct = Buffer.concat([discriminator('account', 'VaultTransaction'), Buffer.alloc(64), Buffer.alloc(8), Buffer.from([255, 0, 254]), Buffer.from(Uint32Array.of(0).buffer), small.subarray(0, 3), Buffer.from(Uint32Array.of(nKeys).buffer), keys, Buffer.from(Uint32Array.of(nIx).buffer), ...ixs, Buffer.from(Uint32Array.of(0).buffer)])
  const t = decodeVaultTransaction(acct)
  assert.equal(t.message.accountKeys[0], vault)
  assert.equal(t.instructions[0].program, '11111111111111111111111111111111')
  assert.deepEqual(t.instructions[0].accounts, [vault, to.address])
  assert.equal(t.instructions[0].data, data.toString('hex'))
})

test('judiciary: the case hash binds config, proposal and transaction bytes; layouts decode', () => {
  const config = keypair().address, proposal = keypair().address
  const h = caseHash(config, proposal, Buffer.from('tx'))
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, caseHash(config, proposal, Buffer.from('tx2')))
  assert.notEqual(h, caseHash(config, keypair().address, Buffer.from('tx')))
  assert.equal(judiciaryEncode.attach({ barPpm: 1, multisig: config, policyHash: 'ab'.repeat(32), modelsHash: 'cd'.repeat(32), rulingProgram: config, challengeSlots: 1, escapeSlots: 2, jurors: [config, proposal] }).length, 1 + 4 + 32 * 4 + 8 + 8 + 1 + 64)
  assert.throws(() => judiciaryEncode.attach({ jurors: [] }), /1 to 8/)
  assert.notEqual(authorityOf(config, proposal).address, caseOf(config, proposal, proposal).address)
  assert.equal(decodeSignerConfig(Buffer.alloc(CONFIG_SIZE)).status, 'empty')
  const c = Buffer.alloc(CASE_SIZE); c.write('VRFYCAS1'); c[8] = 2; c.writeBigUInt64LE(30_000_000n, 160)
  assert.deepEqual([decodeCase(c).status, decodeCase(c).fee, decodeCase(c).paid], ['approved', 30_000_000, false])
})

test('registry: register encodes every field; a harness account decodes to a card', () => {
  const programId = keypair().address, harness = keypair(), operator = keypair()
  const ix = registryIx.register({ programId, harnessKey: harness.address, operator: operator.address, lamports: 5, family: 'gemma', model: 'google/gemma-3-27b-it', endpoint: 'https://h.example/cases', price: 7 })
  assert.equal(ix.data.length, 1 + 8 + 32 + 64 + 32 + 128 + 8 + 32)
  assert.throws(() => registryIx.register({ programId, harnessKey: harness.address, operator: operator.address, lamports: 5, family: 'x'.repeat(33), model: 'm', endpoint: 'e' }), /longer than 32/)
  const b = Buffer.alloc(HARNESS_SIZE); b.write('VRFYHRN1'); b[8] = 1; Buffer.from(harness.publicKey).copy(b, 16); b.write('gemma', 80); b.write('https://h.example/cases', 208); b.writeBigUInt64LE(7n, 336)
  const h = decodeHarness(b, 2e9, 1e9)
  assert.deepEqual([h.status, h.harnessKey, h.family, h.endpoint, h.price, h.bond, h.attestationHash], ['active', harness.address, 'gemma', 'https://h.example/cases', 7, 1e9, null])
  assert.equal(Buffer.from(spki(harness.address), 'base64').length, 44)
  assert.ok(harnessAccount(harness.address, programId).address)
})
