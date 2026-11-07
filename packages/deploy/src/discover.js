/**
 * Build a jury pool from the on-chain harness registry (VIP-0012): every
 * active harness, reachable at the endpoint it registered, shaped like a
 * Harness so the scheduler and `rule` use it unchanged.
 * @module @verafyharness/deploy/discover
 */
import { rpc as rpcClient, discoverHarnesses } from '../../solana/src/index.js'
import { remote } from './testnet.js'
import { markAttested } from '../../core/src/index.js'

/**
 * @param {object} o
 * @param {string} o.rpc - Solana RPC URL.
 * @param {string} o.registry - the registry program address.
 * @param {{roots?: string[], builds?: object[], attestations?: Record<string, object>}} [o.attestation] -
 *   trusted roots and the build allowlist, plus attestation records fetched by hash, to mark attested harnesses.
 * @returns {Promise<object[]>} remote harnesses.
 */
export async function discoverPool({ rpc, registry, attestation }) {
  const cards = await discoverHarnesses(rpcClient(rpc), registry)
  const withRecords = cards.map(c => (c.attestationHash && attestation?.attestations?.[c.attestationHash] ? { ...c, attestation: attestation.attestations[c.attestationHash] } : c))
  const marked = attestation ? markAttested(withRecords, attestation) : withRecords
  return marked.map(c => remote(c, c.endpoint.replace(/\/$/, '')))
}
