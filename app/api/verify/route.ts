import { NextResponse } from "next/server";
import { episodeForSeed, proveEpisode } from "@/lib/prover";
import { getRun, bumpVerified } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSeed(v: unknown): number | null {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
  return n >>> 0;
}

// POST /api/verify  { seed, transcriptRoot?, reached? }
// Independently re-executes the deterministic engine and checks the fresh
// transcript root against the claimed one. This is the on-chain challenger's
// move, done server-side: reproduce the run, compare the receipt.
//
// Stateless by design: pass the claimed `transcriptRoot` (from /api/prove) and
// it is checked directly — no storage required, so verify never dead-ends. If
// the claim is omitted, it falls back to whatever was stored for that seed.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const seed = parseSeed(body?.seed);
    if (seed === null) {
      return NextResponse.json({ ok: false, error: "seed must be an integer in [0, 2^32)" }, { status: 400 });
    }

    let claimedRoot: string | null =
      typeof body?.transcriptRoot === "string" ? body.transcriptRoot : null;
    let claimedReached: boolean | null =
      typeof body?.reached === "boolean" ? body.reached : null;

    // no claim supplied → look up what we stored
    if (claimedRoot === null) {
      const stored = await getRun(seed);
      if (!stored) {
        return NextResponse.json(
          { ok: false, error: "no claim provided and no stored run, call /api/prove first" },
          { status: 404 }
        );
      }
      claimedRoot = stored.transcriptRoot;
      claimedReached = stored.reached;
    }

    const fresh = await proveEpisode(episodeForSeed(seed));
    const rootMatch = fresh.transcriptRoot === claimedRoot;
    const outcomeMatch = claimedReached === null ? true : fresh.reached === claimedReached;
    const ok = rootMatch && outcomeMatch;

    let verifyCount = 0;
    if (ok) verifyCount = await bumpVerified(seed);

    return NextResponse.json({
      ok,
      seed,
      claimedRoot,
      recomputedRoot: fresh.transcriptRoot,
      reachedMatches: outcomeMatch,
      verifyCount,
      reason: ok
        ? "reran the whole thing, commitments match"
        : !rootMatch
        ? "transcript root mismatch, claim does not reproduce"
        : "outcome flag does not match the rerun",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
