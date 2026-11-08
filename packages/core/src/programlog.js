/**
 * Signed, hash-chained event logs for programs with many participants
 * (super grants, VIP-0030; hackathon grants, VIP-0031), and the payout check
 * their escrows share.
 *
 * Each event names the program hash and the hash of the event before it, and
 * is signed by whoever made it. A participant's key is introduced by the event
 * that enrolls it (an application or a submission), signed by that same key.
 * @module @verafyharness/core/programlog
 */
import { sha256 } from './hash.js'
import { signMessage, verifyMessage } from './signer.js'
import { ascHash } from './asc.js'
import { verifyRuling } from './network.js'

const safe = f => { try { return f() } catch { return false } }
const eventHash = ev => sha256(ev)

/** A participant's id: the first 16 hex characters of SHA-256 over its public key. */
export const participantId = key => sha256({ participant: key }).slice(0, 16)

/**
 * Append a signed event.
 * @param {object[]} log - the events so far.
 * @param {string} programHash - the program the log belongs to.
 * @param {string} domain - the signing domain, such as `verafy.super-grant-event/1`.
 * @param {object} e - the event: `type`, `time`, and `by` (a participant id or the owner role).
 * @param {import('node:crypto').KeyObject} privateKey - the signer.
 * @returns {object[]} the new log.
 */
export function appendSigned(log, programHash, domain, e, privateKey) {
  const body = { ...e, program: programHash, prev: log.length ? eventHash(log[log.length - 1]) : null, seq: log.length }
  return [...log, { ...body, signature: signMessage(privateKey, { domain, ...body }) }]
}

/**
 * Check the chain, the order, and each event's signature.
 * @param {object[]} log - the events.
 * @param {string} programHash - the program.
 * @param {string} domain - the signing domain.
 * @param {(ev: object, keys: Map<string, string>) => string | null} keyFor - the public key that must have signed `ev`.
 * @param {(ev: object) => string | null} enrolls - for an enrolling event, the key it introduces.
 * @returns {{ok: boolean, problems: string[], keys: Map<string, string>, upTo: number}} the check; `upTo` is how many events passed.
 */
export function checkChain(log, programHash, domain, keyFor, enrolls) {
  const problems = []
  const keys = new Map()
  let i = 0
  for (; i < log.length; i++) {
    const ev = log[i]
    const { signature, ...body } = ev
    if (ev.program !== programHash) { problems.push(`event ${i}: for another program`); break }
    if (ev.seq !== i || ev.prev !== (i ? eventHash(log[i - 1]) : null)) { problems.push(`event ${i}: breaks the hash chain`); break }
    if (i && ev.time < log[i - 1].time) { problems.push(`event ${i}: earlier than the event before it`); break }
    const introduced = enrolls(ev)
    if (introduced) {
      if (participantId(introduced) !== ev.by) { problems.push(`event ${i}: participant id does not match its key`); break }
      if (!keys.has(ev.by)) keys.set(ev.by, introduced)
      else if (keys.get(ev.by) !== introduced) { problems.push(`event ${i}: ${ev.by} changed its key`); break }
    }
    const key = keyFor(ev, keys)
    if (!key) { problems.push(`event ${i}: unknown participant ${ev.by}`); break }
    if (!safe(() => verifyMessage(key, { domain, ...body }, signature))) { problems.push(`event ${i}: signature does not match ${ev.by}'s key`); break }
  }
  return { ok: problems.length === 0, problems, keys, upTo: i }
}

/**
 * Check rulings for a program: each one must be on a contract the caller
 * rebuilds from the log, and its sealed round must verify.
 * @param {{asc: object, ruling: object}[]} rulings - the rulings handed in.
 * @param {(asc: object) => object | null} rebuild - rebuilds the contract this asc claims to be, from the log, or null.
 * @param {{cards?: object, pool?: object[], seed?: string}} o - what to check the jury against.
 * @returns {{verified: Map<string, {asc: object, answer: string, agreement: number}>, problems: string[]}} verified rulings by asc id.
 */
export function checkRulings(rulings, rebuild, { cards, pool, seed } = {}) {
  const verified = new Map()
  const problems = []
  for (const [i, x] of (rulings ?? []).entries()) {
    const again = safe(() => rebuild(x.asc))
    if (!again) { problems.push(`ruling ${i}: its contract is not one this program's log produces`); continue }
    if (ascHash(again) !== ascHash(x.asc)) { problems.push(`ruling ${i}: its contract differs from the one the terms and the log produce`); continue }
    const sealed = x.ruling?.ruling ?? x.ruling
    const v = verifyRuling(x.asc, sealed, { cards, pool, seed })
    if (!v.ok) { problems.push(...v.problems.map(p => `ruling ${i}: ${p}`)); continue }
    if (sealed.passed === false) continue // below the bar: it escalates, it decides nothing
    verified.set(x.asc.id, { asc: x.asc, answer: sealed.answer, agreement: sealed.agreement })
  }
  return { verified, problems }
}

/**
 * The payout check a program escrow's judiciary signer runs: the transfers in
 * this transaction must be exactly the entitlements the proof names, each one
 * earned under the ledger and none paid before (by the signer's own case log).
 * @param {{id: string, to: string, amount: string}[]} earned - entitlements the ledger shows.
 * @param {string[]} pay - entitlement ids this transaction pays.
 * @param {object} fx - effects from `effectsOf`.
 * @param {object[]} history - the signer's case log; each entry may list `entitlements` it paid.
 * @returns {string[]} violations.
 */
export function checkEntitlements(earned, pay, fx, history = []) {
  const v = []
  const byId = new Map(earned.map(e => [e.id, e]))
  const paid = new Set(history.flatMap(h => h.entitlements ?? []))
  if (!Array.isArray(pay) || pay.length === 0) { if (fx.transfers.length) v.push('moves funds without naming the entitlements it pays'); return v }
  if (new Set(pay).size !== pay.length) v.push('names an entitlement twice')
  const want = {}
  for (const id of pay) {
    const e = byId.get(id)
    if (!e) { v.push(`${id} is not earned under the program's terms and log`); continue }
    if (paid.has(id)) { v.push(`${id} was already paid`); continue }
    want[e.to] = (want[e.to] ?? 0n) + BigInt(e.amount)
  }
  const got = {}
  for (const t of fx.transfers) got[t.to] = (got[t.to] ?? 0n) + BigInt(t.amount)
  for (const [to, amt] of Object.entries(want)) if ((got[to] ?? 0n) !== amt) v.push(`pays ${got[to] ?? 0n} to ${to}; the named entitlements pay ${amt}`)
  for (const to of Object.keys(got)) if (!(to in want)) v.push(`pays ${to}, who is owed nothing in this transaction`)
  return v
}
