// VERIFLY — persistence layer (server-only).
//
// Stores every proven run so the site has a real, queryable history (the
// "verified runs" leaderboard + the public API). Uses Postgres when
// DATABASE_URL is set; otherwise falls back to an in-process store so the app
// works with zero setup. The fallback is not durable across restarts — set
// DATABASE_URL for production.
//
// NB: import this only from server code (API routes). It lazy-loads `pg`.

import type { ProofBundle } from "./prover";

export interface RunRow {
  seed: number;
  genomeRoot: string;
  transcriptRoot: string;
  startCommit: string;
  endCommit: string;
  ticks: number;
  reached: boolean;
  finalDist: number;
  verifyCount: number;
  createdAt: string;
}

const hasPg = !!process.env.DATABASE_URL;

// ---- in-memory fallback ----------------------------------------------------
// Shared via globalThis so every API route (each its own module instance in
// Next's dev/serverless runtime) reads and writes the SAME map within a process.
const g = globalThis as unknown as { __veriflyMem?: Map<number, RunRow> };
const mem: Map<number, RunRow> = g.__veriflyMem ?? (g.__veriflyMem = new Map());

// ---- postgres --------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
let poolPromise: Promise<any> | null = null;

async function getPool(): Promise<any> {
  if (!hasPg) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS runs (
          seed            BIGINT PRIMARY KEY,
          genome_root     TEXT NOT NULL,
          transcript_root TEXT NOT NULL,
          start_commit    TEXT NOT NULL,
          end_commit      TEXT NOT NULL,
          ticks           INTEGER NOT NULL,
          reached         BOOLEAN NOT NULL,
          final_dist      INTEGER NOT NULL,
          verify_count    INTEGER NOT NULL DEFAULT 0,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      return pool;
    })();
  }
  return poolPromise;
}

function rowFromPg(r: any): RunRow {
  return {
    seed: Number(r.seed),
    genomeRoot: r.genome_root,
    transcriptRoot: r.transcript_root,
    startCommit: r.start_commit,
    endCommit: r.end_commit,
    ticks: r.ticks,
    reached: r.reached,
    finalDist: r.final_dist,
    verifyCount: r.verify_count,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function backend(): Promise<"postgres" | "memory"> {
  if (!hasPg) return "memory";
  try {
    const pool = await getPool();
    await pool.query("SELECT 1");
    return "postgres";
  } catch {
    return "memory";
  }
}

/** Idempotent upsert of a proven run keyed by seed. */
export async function saveRun(seed: number, b: ProofBundle): Promise<RunRow> {
  const row: RunRow = {
    seed,
    genomeRoot: b.genomeRoot,
    transcriptRoot: b.transcriptRoot,
    startCommit: b.startCommit,
    endCommit: b.endCommit,
    ticks: b.ticksUsed,
    reached: b.reached,
    finalDist: b.finalDist,
    verifyCount: mem.get(seed)?.verifyCount ?? 0,
    createdAt: new Date().toISOString(),
  };
  try {
    const pool = await getPool();
    if (pool) {
      const res = await pool.query(
        `INSERT INTO runs (seed, genome_root, transcript_root, start_commit, end_commit, ticks, reached, final_dist)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (seed) DO UPDATE SET
           genome_root=EXCLUDED.genome_root, transcript_root=EXCLUDED.transcript_root,
           start_commit=EXCLUDED.start_commit, end_commit=EXCLUDED.end_commit,
           ticks=EXCLUDED.ticks, reached=EXCLUDED.reached, final_dist=EXCLUDED.final_dist
         RETURNING *`,
        [seed, row.genomeRoot, row.transcriptRoot, row.startCommit, row.endCommit, row.ticks, row.reached, row.finalDist]
      );
      return rowFromPg(res.rows[0]);
    }
  } catch (e) {
    console.error("[db] saveRun postgres failed, using memory:", (e as Error).message);
  }
  mem.set(seed, row);
  return row;
}

export async function getRun(seed: number): Promise<RunRow | null> {
  try {
    const pool = await getPool();
    if (pool) {
      const res = await pool.query("SELECT * FROM runs WHERE seed=$1", [seed]);
      return res.rows[0] ? rowFromPg(res.rows[0]) : null;
    }
  } catch (e) {
    console.error("[db] getRun postgres failed, using memory:", (e as Error).message);
  }
  return mem.get(seed) ?? null;
}

export async function listRuns(limit = 24): Promise<RunRow[]> {
  try {
    const pool = await getPool();
    if (pool) {
      const res = await pool.query(
        "SELECT * FROM runs ORDER BY verify_count DESC, created_at DESC LIMIT $1",
        [limit]
      );
      return res.rows.map(rowFromPg);
    }
  } catch (e) {
    console.error("[db] listRuns postgres failed, using memory:", (e as Error).message);
  }
  return [...mem.values()]
    .sort((a, b) => b.verifyCount - a.verifyCount || (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

/** Record that a run was independently verified (only when it actually matched). */
export async function bumpVerified(seed: number): Promise<number> {
  try {
    const pool = await getPool();
    if (pool) {
      const res = await pool.query(
        "UPDATE runs SET verify_count = verify_count + 1 WHERE seed=$1 RETURNING verify_count",
        [seed]
      );
      return res.rows[0]?.verify_count ?? 0;
    }
  } catch (e) {
    console.error("[db] bumpVerified postgres failed, using memory:", (e as Error).message);
  }
  const r = mem.get(seed);
  if (r) r.verifyCount += 1;
  return r?.verifyCount ?? 0;
}
