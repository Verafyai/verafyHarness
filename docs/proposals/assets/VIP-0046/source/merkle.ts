import { createHash } from 'node:crypto'

/** One step of a Merkle proof: the sibling hash and which side it sits on. */
export type ProofStep = { sibling: string; side: 'left' | 'right' }

function hashPair(left: string, right: string): string {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]))
    .digest('hex')
}

/**
 * SHA-256 Merkle tree over hex leaves, in the order given. An odd node at any level is paired with itself.
 * Each leaf is the sha256 of a per-claim report's canonical JSON.
 */
export function merkleTree(leaves: string[]): { root: string; proofs: ProofStep[][] } {
  if (!leaves.length) throw new Error('merkle_empty')
  for (const l of leaves) if (!/^[0-9a-f]{64}$/.test(l)) throw new Error('merkle_bad_leaf')
  const proofs: ProofStep[][] = leaves.map(() => [])
  let level = leaves.map((hash, i) => ({ hash, members: [i] }))
  while (level.length > 1) {
    const next: typeof level = []
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!
      const right = level[i + 1] ?? left
      for (const m of left.members) proofs[m]!.push({ sibling: right.hash, side: 'right' })
      if (right !== left) for (const m of right.members) proofs[m]!.push({ sibling: left.hash, side: 'left' })
      next.push({ hash: hashPair(left.hash, right.hash), members: right === left ? left.members : [...left.members, ...right.members] })
    }
    level = next
  }
  return { root: level[0]!.hash, proofs }
}

/** Recomputes the root from one leaf and its proof. */
export function verifyProof(leaf: string, proof: ProofStep[], root: string): boolean {
  let h = leaf
  for (const step of proof) h = step.side === 'right' ? hashPair(h, step.sibling) : hashPair(step.sibling, h)
  return h === root
}
