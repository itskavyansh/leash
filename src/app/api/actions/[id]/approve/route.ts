import { NextResponse } from "next/server";
import { getAction } from "@/lib/db";
import { approveAction } from "@/lib/executor";
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

  if (existing.status !== "pending_approval") {
    return NextResponse.json(
      { error: "Action is not pending approval" },
      { status: 409 }
    );
  }

  const updated = await approveAction(id);
  return NextResponse.json(updated, { status: 200 });
}
