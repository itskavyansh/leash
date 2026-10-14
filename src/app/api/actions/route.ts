import { NextResponse } from "next/server";
import { getSpentToday, listActions } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const actions = await listActions();
  const spentToday = await getSpentToday();

  return NextResponse.json({ actions, spentToday }, { status: 200 });
}
