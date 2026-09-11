import { NextResponse } from "next/server";
import { backend } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — is the service up, and which store is active?
export async function GET() {
  const store = await backend();
  return NextResponse.json({ ok: true, service: "verifly", backend: store, ts: Date.now() });
}
