import { NextResponse } from "next/server";
import { getSpentToday, listActions } from "@/lib/db";
import { reconcilePending } from "@/lib/reconcile-pending";

export async function GET(): Promise<NextResponse> {
  // Trigger background reconciliation with a 3s max wait so the API response is never stalled
  try {
    const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 3000)
    );
    await Promise.race([reconcilePending(), timeoutPromise]);
  } catch (err) {
    console.warn("Background reconcilePending error in GET /api/actions:", err);
  }

  const actions = await listActions();
  const spentToday = await getSpentToday();

  return NextResponse.json({ actions, spentToday }, { status: 200 });
}
