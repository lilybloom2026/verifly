import { NextResponse } from "next/server";
import { episodeForSeed, proveEpisode } from "@/lib/prover";
import { saveRun } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSeed(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
  return n >>> 0;
}

// POST /api/prove  { seed }
// Runs the deterministic engine server-side, seals the proof, persists it.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const seed = parseSeed(body?.seed);
    if (seed === null) {
      return NextResponse.json({ ok: false, error: "seed must be an integer in [0, 2^32)" }, { status: 400 });
    }
    const proof = await proveEpisode(episodeForSeed(seed));
    const run = await saveRun(seed, proof);
    return NextResponse.json({ ok: true, run, proof });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
