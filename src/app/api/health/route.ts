import { NextResponse } from "next/server";
import { getSqlClient } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const client = getSqlClient();
    await client.query("SELECT 1");
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Health check database query failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
