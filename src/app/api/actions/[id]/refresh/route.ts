import { NextResponse } from "next/server";
import { getAction } from "@/lib/db";
import { reconcileAction } from "@/lib/paypal/reconcile";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(ip);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  const { id } = await ctx.params;

  const existing = await getAction(id);
  if (!existing) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  // Call reconcileAction directly on this action regardless of throttle
  await reconcileAction(existing);

  // Return fresh updated row
  const updated = (await getAction(id)) ?? existing;
  return NextResponse.json(updated, { status: 200 });
}
