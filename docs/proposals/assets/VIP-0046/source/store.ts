import { randomUUID } from 'node:crypto'

import { getPool, withTransaction } from '@/credits/db'

import { canonical, sha256Hex } from './canonical'
import { merkleTree, type ProofStep } from './merkle'
import type { ClaimReport, StoredReport } from './score'

// Additive only: new tables, never a change to an existing one. Reports are inserted once and never
// rewritten; a recheck is a new version. A run's Merkle root and each report's proof are written once.
const THESIS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS verafy_thesis_runs (
  id uuid PRIMARY KEY,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  merkle_root text,
  stamp_status text NOT NULL DEFAULT 'open',
  stamp_tx text,
  stamp_cluster text,
  stamp_error text
);

CREATE TABLE IF NOT EXISTS verafy_thesis_claim_reports (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES verafy_thesis_runs (id),
  claim_id text NOT NULL,
  version integer NOT NULL,
  sha256 text NOT NULL,
  report jsonb NOT NULL,
  merkle_proof jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verafy_thesis_claim_version UNIQUE (claim_id, version)
);

CREATE INDEX IF NOT EXISTS verafy_thesis_claim_reports_run ON verafy_thesis_claim_reports (run_id);
`

let ready: Promise<void> | null = null

export async function ensureThesisSchema(): Promise<void> {
  if (!ready) {
    ready = withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(714210, 1)')
      await client.query(THESIS_SCHEMA_SQL)
    }).catch((error) => {
      ready = null
      throw error
    })
  }
  await ready
}

/** Opens a run for one visitor. Returns its id. */
export async function createRun(visitorId: string): Promise<string> {
  await ensureThesisSchema()
  const id = randomUUID()
  await getPool().query(`INSERT INTO verafy_thesis_runs (id, visitor_id) VALUES ($1, $2)`, [id, visitorId])
  return id
}

/** True when the run exists, belongs to the visitor and has not been finalized. */
export async function runIsOpen(runId: string, visitorId: string): Promise<boolean> {
  await ensureThesisSchema()
  const r = await getPool().query(
    `SELECT 1 FROM verafy_thesis_runs WHERE id = $1 AND visitor_id = $2 AND finalized_at IS NULL`,
    [runId, visitorId],
  )
  return Boolean(r.rows[0])
}

/** Inserts the next version of a claim's report. The builder receives the version number it will be stored at. */
export async function saveReport(runId: string, claimId: string, build: (version: number) => ClaimReport): Promise<StoredReport> {
  await ensureThesisSchema()
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(714211, hashtext($1))', [claimId])
    const v = await client.query<{ v: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM verafy_thesis_claim_reports WHERE claim_id = $1`,
      [claimId],
    )
    const version = Number(v.rows[0]?.v ?? 1)
    const report = build(version)
    const sha256 = sha256Hex(canonical(report))
    await client.query(
      `INSERT INTO verafy_thesis_claim_reports (id, run_id, claim_id, version, sha256, report) VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), runId, claimId, version, sha256, JSON.stringify(report)],
    )
    return { ...report, sha256, runId, merkleRoot: null, stampTx: null, stampCluster: null }
  })
}

export type FinalizedRun = {
  runId: string
  merkleRoot: string
  leaves: { claimId: string; version: number; sha256: string; proof: ProofStep[] }[]
}

/** Builds the run's Merkle tree over its reports (ordered by claim id, then version) and writes root and proofs once. */
export async function finalizeRun(runId: string, visitorId: string): Promise<FinalizedRun | null> {
  await ensureThesisSchema()
  return withTransaction(async (client) => {
    const run = await client.query<{ merkle_root: string | null }>(
      `SELECT merkle_root FROM verafy_thesis_runs WHERE id = $1 AND visitor_id = $2 FOR UPDATE`,
      [runId, visitorId],
    )
    const current = run.rows[0]
    if (!current) return null
    const rows = await client.query<{ id: string; claim_id: string; version: number; sha256: string; merkle_proof: ProofStep[] | null }>(
      `SELECT id, claim_id, version, sha256, merkle_proof FROM verafy_thesis_claim_reports WHERE run_id = $1 ORDER BY claim_id, version`,
      [runId],
    )
    if (!rows.rows.length) return null
    const tree = merkleTree(rows.rows.map((r) => r.sha256))
    if (!current.merkle_root) {
      await client.query(
        `UPDATE verafy_thesis_runs SET merkle_root = $2, finalized_at = now(), stamp_status = 'pending' WHERE id = $1 AND merkle_root IS NULL`,
        [runId, tree.root],
      )
      for (let i = 0; i < rows.rows.length; i++) {
        await client.query(
          `UPDATE verafy_thesis_claim_reports SET merkle_proof = $2 WHERE id = $1 AND merkle_proof IS NULL`,
          [rows.rows[i]!.id, JSON.stringify(tree.proofs[i])],
        )
      }
    }
    return {
      runId,
      merkleRoot: current.merkle_root ?? tree.root,
      leaves: rows.rows.map((r, i) => ({ claimId: r.claim_id, version: r.version, sha256: r.sha256, proof: r.merkle_proof ?? tree.proofs[i] ?? [] })),
    }
  })
}

/** Records the stamp outcome. A stamped run is never changed again. */
export async function recordStamp(runId: string, outcome: { status: 'stamped' | 'pending'; tx?: string; cluster?: string; error?: string }) {
  await getPool().query(
    `UPDATE verafy_thesis_runs SET stamp_status = $2, stamp_tx = $3, stamp_cluster = $4, stamp_error = $5
     WHERE id = $1 AND stamp_status <> 'stamped'`,
    [runId, outcome.status, outcome.tx ?? null, outcome.cluster ?? null, outcome.error?.slice(0, 300) ?? null],
  )
}

type Row = {
  report: ClaimReport
  sha256: string
  run_id: string
  merkle_root: string | null
  stamp_tx: string | null
  stamp_cluster: string | null
}

function stored(r: Row): StoredReport {
  return { ...r.report, sha256: r.sha256, runId: r.run_id, merkleRoot: r.merkle_root, stampTx: r.stamp_tx, stampCluster: r.stamp_cluster }
}

/** The latest stored version of every claim, with its run's root and stamp. */
export async function latestReports(): Promise<StoredReport[]> {
  await ensureThesisSchema()
  const r = await getPool().query<Row>(`
    SELECT DISTINCT ON (c.claim_id) c.report, c.sha256, c.run_id, r.merkle_root, r.stamp_tx, r.stamp_cluster
    FROM verafy_thesis_claim_reports c JOIN verafy_thesis_runs r ON r.id = c.run_id
    ORDER BY c.claim_id, c.version DESC`)
  return r.rows.map(stored)
}

/** Every version of one claim, newest first, with its Merkle proof. */
export async function claimHistory(claimId: string): Promise<(StoredReport & { proof: ProofStep[] | null })[]> {
  await ensureThesisSchema()
  const r = await getPool().query<Row & { merkle_proof: ProofStep[] | null }>(
    `SELECT c.report, c.sha256, c.run_id, c.merkle_proof, r.merkle_root, r.stamp_tx, r.stamp_cluster
     FROM verafy_thesis_claim_reports c JOIN verafy_thesis_runs r ON r.id = c.run_id
     WHERE c.claim_id = $1 ORDER BY c.version DESC LIMIT 50`,
    [claimId],
  )
  return r.rows.map((row) => ({ ...stored(row), proof: row.merkle_proof }))
}

/** Recent finalized runs, newest first. */
export async function recentRuns(limit = 10) {
  await ensureThesisSchema()
  const r = await getPool().query<{
    id: string
    finalized_at: string
    merkle_root: string
    stamp_status: string
    stamp_tx: string | null
    stamp_cluster: string | null
    claims: number
  }>(
    `SELECT r.id, r.finalized_at, r.merkle_root, r.stamp_status, r.stamp_tx, r.stamp_cluster,
            (SELECT COUNT(*)::int FROM verafy_thesis_claim_reports c WHERE c.run_id = r.id) AS claims
     FROM verafy_thesis_runs r WHERE r.merkle_root IS NOT NULL ORDER BY r.finalized_at DESC LIMIT $1`,
    [limit],
  )
  return r.rows.map((x) => ({
    runId: x.id,
    finalizedAt: new Date(x.finalized_at).toISOString(),
    merkleRoot: x.merkle_root,
    stampStatus: x.stamp_status,
    stampTx: x.stamp_tx,
    stampCluster: x.stamp_cluster,
    claims: x.claims,
  }))
}

/** Finalized runs whose Merkle root is not on chain yet, newest first. */
export async function pendingStampRuns(limit = 5): Promise<{ runId: string; merkleRoot: string }[]> {
  await ensureThesisSchema()
  const r = await getPool().query<{ id: string; merkle_root: string }>(
    `SELECT id, merkle_root FROM verafy_thesis_runs
     WHERE merkle_root IS NOT NULL AND stamp_status <> 'stamped'
     ORDER BY finalized_at DESC LIMIT $1`,
    [limit],
  )
  return r.rows.map((x) => ({ runId: x.id, merkleRoot: x.merkle_root }))
}
