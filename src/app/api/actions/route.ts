import { NextResponse } from "next/server";
import { getSpentToday, listActions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const actions = listActions();
  const spentToday = getSpentToday();

  return NextResponse.json({ actions, spentToday }, { status: 200 });
}
