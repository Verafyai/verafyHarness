// Asset transfer records (VIP-0015), with a scripted multimodal jury.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Harness, rule, drawJury, validate, createIdentity, signMessage, verifyMessage, sha256,
  listing, deliveryCode, deliveryContract, assetSalePolicy, validatePolicy, transferRecords, localize, RECORD_LABEL } from '../src/index.js'

const photo = n => ({ sha256: sha256(`photo ${n}`), url: `https://example.org/${n}.jpg` })
const bike = listing({ id: 'bike-1', seller: 'SellerAddr', price: { amount: 450, currency: 'USD' }, item: { category: 'bicycle', title: 'Steel road bike, 56 cm', description: 'Blue frame, scratch on the top tube.', serial: 'WTU123456' }, photos: [photo('side'), photo('serial')] })

// A scripted juror: MATCH only when the delivery names the expected code.
const juror = code => ({ async complete({ user }) { return JSON.stringify({ answer: user.includes(`code ${code}`) && /Buyer delivery photo: with code/.test(user) ? 'MATCH' : 'NO_MATCH', confidence: 0.9, reasoning: 'Compared the serial and the code.', sources: [] }) } })

test('a listing must pin its photos; the delivery code is unguessable and bound to buyer and listing', () => {
  assert.throws(() => listing({ ...bike, photos: [photo('one')] }), /two photos/)
  const code = deliveryCode(bike, 'BuyerAddr', 'escrow-secret')
  assert.match(code, /^[A-Z2-9]{6}$/)
  assert.notEqual(code, deliveryCode(bike, 'OtherBuyer', 'escrow-secret'))
  assert.notEqual(code, deliveryCode(bike, 'BuyerAddr', 'other-secret'))
  assert.deepEqual(validatePolicy(assetSalePolicy({ seller: 'SellerAddr', buyer: 'BuyerAddr', amount: 450e6, asset: 'USDC', listingHash: bike.hash })), [])
})

test('a jury rules the delivery; records are issued only on MATCH, signed, labeled, and localized', async () => {
  const code = deliveryCode(bike, 'BuyerAddr', 'escrow-secret')
  const delivery = { buyer: 'BuyerAddr', code, photos: [{ ...photo('delivered'), caption: 'with code' }] }
  const asc = deliveryContract(bike, delivery)
  assert.deepEqual(validate(asc), [])
  const pool = ['a', 'b', 'c'].map(f => new Harness({ id: `h-${f}`, family: f, model: `m-${f}`, bond: 1, provider: juror(code) }))
  const jury = drawJury(pool, asc.payment.jury, 'seed')
  const r = await rule(asc, jury, jury[0], { seed: 'seed' })
  assert.equal(r.answer, 'MATCH')

  const wrong = deliveryContract(bike, { ...delivery, photos: [photo('old photo')] })
  const r2 = await rule(wrong, jury, jury[0], { seed: 'seed' })
  assert.equal(r2.answer, 'NO_MATCH')

  const id = createIdentity()
  const issuer = { publicKey: id.publicKey, sign: m => signMessage(id.privateKey, m) }
  assert.throws(() => transferRecords(bike, delivery, r2, issuer, { date: '2026-11-07' }), /only on a MATCH/)
  const rec = transferRecords(bike, delivery, r, issuer, { date: '2026-11-07' })
  for (const k of ['transfer', 'ownership', 'receipt']) {
    const { hash, signature, ...m } = rec[k]
    assert.equal(hash, sha256(m))
    assert.ok(verifyMessage(id.publicKey, m, signature))
    assert.equal(rec[k].label, RECORD_LABEL)
    assert.equal(rec[k].ruling, r.ascHash)
  }
  assert.equal(rec.ownership.owner, 'BuyerAddr')

  const jp = localize(rec.transfer, { country: 'JP' })
  assert.equal(jp.locale, 'ja-JP')
  assert.match(jp.amount, /450/)
  assert.equal(jp.needsRegistry, false)
  const de = localize({ ...rec.transfer, item: { ...bike.item, category: 'vehicle' } }, { country: 'DE' })
  assert.equal(de.locale, 'de-DE')
  assert.equal(de.needsRegistry, true)
  assert.match(de.note, /does not transfer the registration/)
})
