import { NextResponse } from "next/server";
import { listRuns, backend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/runs?limit=24  — recent proven runs, most-verified first.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10) || 24));
    const [runs, store] = await Promise.all([listRuns(limit), backend()]);
    return NextResponse.json({ ok: true, backend: store, count: runs.length, runs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
