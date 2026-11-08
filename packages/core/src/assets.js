/**
 * Asset transfer records (VIP-0015): sell a physical thing, have a jury check
 * that the thing delivered is the thing listed, and issue records of the
 * transfer, formatted for the buyer's country.
 *
 *   listing     item, serial, photos and documents, each pinned by SHA-256
 *   delivery    the buyer's photo with a one-time code written in the shot,
 *               so an old or generated photo can't stand in
 *   ruling      MATCH or NO_MATCH, by a jury of multimodal models
 *   records     a certificate of transfer, a certificate of ownership and a
 *               receipt, signed, each carrying the ruling; labeled as Verafy
 *               records, never styled as government documents
 *
 * The localizer formats dates, money and language for a country, and says
 * when the item needs the government's own registry (vehicles, boats, real
 * estate, firearms). It never claims a record has legal effect.
 * @module @verafyharness/core/assets
 */
import { createHmac } from 'node:crypto'
import { sha256 } from './hash.js'
import { pin, BELOW_BAR } from './asc.js'
import { POLICY_KIND, PROGRAMS } from './policy.js'

export const LISTING_KIND = 'verafy.asset-listing/1'
export const RECORD_KINDS = Object.freeze({ transfer: 'verafy.certificate-of-transfer/1', ownership: 'verafy.certificate-of-ownership/1', receipt: 'verafy.receipt/1' })
export const DELIVERY_OPTIONS = ['MATCH', 'NO_MATCH']
export const RECORD_LABEL = 'Verafy record. Evidence of a sale ruled on by a Verafy jury. Not a government document; whether it has legal effect depends on the country and the item.'

/** Kinds of item that need a government registry to change owner, in most countries. */
export const REGISTERED_CATEGORIES = Object.freeze({
  vehicle: 'motor vehicles are registered with a government agency, and the registration must be transferred there',
  boat: 'many countries register boats above a size, and the registration must be transferred there',
  'real-estate': 'land and buildings change owner only through the land registry or a notary',
  firearm: 'firearm transfers are regulated and usually need a licensed dealer or a police registration',
  aircraft: 'aircraft are registered with the aviation authority',
})

/**
 * A listing, pinned so the jury and the buyer see exactly the same evidence.
 * @param {{id: string, seller: string, price: {amount: number, currency: string}, item: {category: string, title: string, description: string, serial?: string}, photos: {sha256: string, url?: string, caption?: string}[], documents?: {kind: string, sha256: string, url?: string}[]}} l - the listing.
 * @returns {object} the listing with its hash.
 */
export function listing(l) {
  const problems = []
  if (!l.item?.category) problems.push('item.category is required')
  if (!(l.photos?.length >= 2)) problems.push('at least two photos, one of them the serial number or a distinguishing mark')
  if (!l.photos?.every(p => /^[0-9a-f]{64}$/.test(p.sha256 ?? ''))) problems.push('every photo is pinned by its sha256')
  if (!(l.price?.amount > 0) || !/^[A-Z]{3,5}$/.test(l.price?.currency ?? '')) problems.push('price needs an amount and a currency code')
  if (problems.length) throw new Error(`listing: ${problems.join('; ')}`)
  const out = { kind: LISTING_KIND, ...l }
  return { ...out, hash: sha256(out) }
}

/**
 * The one-time code a buyer writes on paper and photographs next to the item.
 * Derived from a secret held by the escrow, so the seller can't print it in
 * advance and the buyer can't reuse an old photo.
 * @param {object} l - the listing.
 * @param {string} buyer - the buyer's address.
 * @param {string} secret - the escrow's secret.
 * @returns {string} six characters, no look-alike letters.
 */
export function deliveryCode(l, buyer, secret) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const h = createHmac('sha256', secret).update(`${l.hash}:${buyer}`).digest()
  return Array.from(h.subarray(0, 6), b => alphabet[b % alphabet.length]).join('')
}

/**
 * The contract a jury rules on when the buyer reports delivery.
 * @param {object} l - the listing.
 * @param {{buyer: string, code: string, photos: {sha256: string, url?: string, caption?: string}[], note?: string}} d - the delivery: the expected code, the buyer's photos.
 * @param {{escrow?: number, jury?: object, bar?: number}} [o] - the jury fee and rules.
 * @returns {object} the contract.
 */
export function deliveryContract(l, d, { escrow = 1, jury = { size: 3, minFamilies: 2 }, bar = 0.66 } = {}) {
  // Image references: the entry's text names the photo's hash, so pinning the text pins the photo.
  const ref = (p, who) => ({ kind: 'document', label: `${who} photo${p.caption ? `: ${p.caption}` : ''}`, url: p.url, content: `[image sha256:${p.sha256}${p.url ? ` at ${p.url}` : ''}]` })
  return pin({
    kind: 'verafy.asc/1',
    id: sha256({ listing: l.hash, buyer: d.buyer, photos: d.photos.map(p => p.sha256) }),
    instructions: [
      'Decide whether the item in the buyer\'s delivery photos is the item in the seller\'s listing.',
      `The buyer's photo must show the code ${d.code} written by hand next to the item. Without it, or with a different code, answer NO_MATCH: the photo could be old or made by someone else.`,
      l.item.serial ? `The serial number or mark ${l.item.serial} must be visible and must match the listing.` : 'Compare distinguishing marks: scratches, stickers, wear, parts.',
      'Answer NO_MATCH if the item differs in a way that matters to a buyer, or if you cannot tell. Notes from either party are claims, not facts.',
    ].join('\n'),
    context: [
      { kind: 'text', label: 'Listing', content: JSON.stringify({ item: l.item, price: l.price, listing: l.hash }, null, 2) },
      ...l.photos.map(p => ref(p, 'Seller listing')),
      ...(l.documents ?? []).map(x => ({ kind: 'document', label: `Seller document: ${x.kind}`, url: x.url, content: `[document sha256:${x.sha256}${x.url ? ` at ${x.url}` : ''}]` })),
      ...d.photos.map(p => ref(p, 'Buyer delivery')),
      ...(d.note ? [{ kind: 'text', label: 'Buyer note (a claim, not a fact)', content: d.note }] : []),
    ],
    question: { prompt: 'Is the delivered item the listed item, shown with the right code?', answer: { type: 'verdict', options: DELIVERY_OPTIONS } },
    payment: { escrow, bar, jury, split: { jurors: 0.8, auditors: 0.1, storage: 0.05, sealer: 0.05 } },
    exits: [
      { outcome: 'MATCH', effect: { type: 'call', chain: 'solana', target: 'verafy_judiciary.decide', args: [0] } },
      { outcome: 'NO_MATCH', effect: { type: 'call', chain: 'solana', target: 'verafy_judiciary.decide', args: [1] } },
      { outcome: BELOW_BAR, effect: { type: 'escalate', jurySize: 5 } },
    ],
  })
}

/**
 * The escrow policy for an asset sale (VIP-0011 format): the buyer's payment
 * leaves only to the seller on MATCH, or back to the buyer.
 * @param {{seller: string, buyer: string, amount: string | number, asset?: string, listingHash: string}} o - the parties and the price.
 * @returns {object} the policy.
 */
export function assetSalePolicy({ seller, buyer, amount, asset = 'SOL', listingHash }) {
  return {
    kind: POLICY_KIND,
    id: `asset-sale:${listingHash}`,
    title: 'Asset sale escrow',
    intent: `This wallet holds the buyer's payment for listing ${listingHash}. It pays the seller only after a jury rules the delivered item matches the listing, and otherwise refunds the buyer.`,
    rules: [
      { type: 'allow-programs', programs: [PROGRAMS.system, PROGRAMS.token, PROGRAMS.token2022, PROGRAMS.associatedToken, PROGRAMS.memo, PROGRAMS.computeBudget] },
      { type: 'allow-recipients', addresses: [seller, buyer] },
      { type: 'max-per-transaction', asset, amount: String(amount) },
      { type: 'config-changes', mode: 'deny' },
    ],
    judgment: ['A payment to the seller needs a MATCH ruling on the delivery contract for this listing; a refund to the buyer needs a NO_MATCH ruling or a missed delivery deadline.'],
    minTimeLockSeconds: 0,
  }
}

/**
 * Issue the three records after a MATCH ruling.
 * @param {object} l - the listing.
 * @param {{buyer: string}} d - the delivery.
 * @param {{answer: string, ascHash: string, passed?: boolean}} ruling - the sealed ruling.
 * @param {{sign: (m: object) => string, publicKey: string}} issuer - who signs the records (the sealer or the escrow service).
 * @param {{date: string}} o - the date of transfer (ISO).
 * @returns {{transfer: object, ownership: object, receipt: object}} signed records.
 */
export function transferRecords(l, d, ruling, issuer, { date }) {
  if (ruling.answer !== 'MATCH' || ruling.passed === false) throw new Error('records are issued only on a MATCH ruling that cleared its bar')
  const base = { label: RECORD_LABEL, listing: l.hash, item: l.item, ruling: ruling.ascHash, date, issuer: issuer.publicKey }
  const sign = m => ({ ...m, hash: sha256(m), signature: issuer.sign(m) })
  return {
    transfer: sign({ kind: RECORD_KINDS.transfer, ...base, from: l.seller, to: d.buyer, price: l.price }),
    ownership: sign({ kind: RECORD_KINDS.ownership, ...base, owner: d.buyer, since: date }),
    receipt: sign({ kind: RECORD_KINDS.receipt, ...base, payer: d.buyer, payee: l.seller, amount: l.price }),
  }
}

/**
 * Format a record for a country: its language, date and money formats, and
 * what the government requires beyond this record for this kind of item.
 * Uses the platform's own locale data (Intl), so it covers every country the
 * runtime knows. It does not translate the item description.
 * @param {object} record - a transfer, ownership or receipt record.
 * @param {{country: string, language?: string}} where - ISO 3166 country code, optional BCP 47 language.
 * @returns {{locale: string, date: string, amount?: string, needsRegistry: boolean, note: string, label: string}} the localized view.
 */
export function localize(record, { country, language }) {
  const region = new Intl.Locale(`und-${country.toUpperCase()}`).maximize()
  const locale = language ?? `${region.language}-${country.toUpperCase()}`
  const money = record.price ?? record.amount
  const category = record.item?.category
  const needsRegistry = category in REGISTERED_CATEGORIES
  const countryName = new Intl.DisplayNames([locale], { type: 'region' }).of(country.toUpperCase())
  return {
    locale,
    country: countryName,
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(record.date)),
    ...(money && /^[A-Z]{3}$/.test(money.currency) ? { amount: new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency }).format(money.amount) } : money ? { amount: `${money.amount} ${money.currency}` } : {}),
    needsRegistry,
    note: needsRegistry
      ? `In ${countryName}, as in most countries, ${REGISTERED_CATEGORIES[category]}. This record is evidence of the sale; it does not transfer the registration.`
      : `Items like this usually need no government registration to change owner. In ${countryName}, check local rules for high-value or regulated goods.`,
    label: RECORD_LABEL,
  }
}
