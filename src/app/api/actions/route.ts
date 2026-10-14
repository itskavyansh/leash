import { NextResponse } from "next/server";
import { getSpentToday, listActions } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const actions = listActions();
  const spentToday = getSpentToday();

  return NextResponse.json({ actions, spentToday }, { status: 200 });
}
