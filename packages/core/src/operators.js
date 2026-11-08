/**
 * Operator signatures (VIP-0003): a harness card may name the operator that
 * runs it, and the operator signs that claim, so no one can put a harness
 * under someone else's name. Seat caps count operators (network.js); the
 * operator's bond is its harness accounts' bonds in the registry (VIP-0012).
 * @module @verafyharness/core/operators
 */
import { sign as edSign, verify as edVerify, createPublicKey } from 'node:crypto'
import { canonical } from './hash.js'

export const OPERATOR_KIND = 'verafy.operator/1'

/** What an operator signs: this harness, this key, is mine. */
export const operatorMessage = card => ({ kind: OPERATOR_KIND, harness: card.id, publicKey: card.publicKey })

/**
 * Sign a harness card as its operator.
 * @param {{publicKey: string, privateKey: import('node:crypto').KeyObject}} operator - the operator's identity.
 * @param {{id: string, publicKey: string}} card - the harness card.
 * @returns {{key: string, signature: string}} the `operator` value for the harness.
 */
export function signOperator(operator, card) {
  return { key: operator.publicKey, signature: edSign(null, Buffer.from(canonical(operatorMessage(card))), operator.privateKey).toString('base64') }
}

/**
 * Check a card's operator claim.
 * @param {object} card - a harness card or harness.
 * @returns {'none' | 'signed' | 'unsigned' | 'bad'} what the card shows.
 */
export function operatorStatus(card) {
  const c = card.card ?? card
  if (!c.operator) return 'none'
  if (!c.operatorSignature) return 'unsigned'
  try {
    const key = createPublicKey({ key: Buffer.from(c.operator, 'base64'), format: 'der', type: 'spki' })
    return edVerify(null, Buffer.from(canonical(operatorMessage(c))), key, Buffer.from(c.operatorSignature, 'base64')) ? 'signed' : 'bad'
  } catch { return 'bad' }
}
