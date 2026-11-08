import { NextResponse } from "next/server";
import { resetAll } from "@/lib/db";
import { checkOwnerAuth } from "@/lib/ownerAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = checkOwnerAuth(request);
  if (auth.status === "unconfigured") {
    return NextResponse.json(
      { error: "Owner authentication is not configured on this server." },
      { status: 503 }
    );
  }
  if (!auth.isOwner) {
    return NextResponse.json(
      { error: "Unauthorized. Owner mode required to reset demo data." },
      { status: 401 }
    );
  }

  // Rate limit: 3 per minute per IP
  const ip = getClientIp(request);
  const rateLimitResult = checkRateLimit(`demo-reset:${ip}`, 3, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  await resetAll();
  return NextResponse.json({ message: "Demo data reset successfully" }, { status: 200 });
}
