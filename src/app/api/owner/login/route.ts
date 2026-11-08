import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import {
  getOwnerConfig,
  constantTimeCompare,
  createOwnerToken,
  OWNER_COOKIE_NAME,
} from "@/lib/ownerAuth";

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  // Rate limit: 5 requests per minute per IP
  const rateLimitResult = checkRateLimit(`owner-login:${ip}`, 5, 60_000);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  const config = getOwnerConfig();
  if (!config.isConfigured || !config.ownerPasscode || !config.sessionSecret) {
    return NextResponse.json(
      { error: "Owner authentication is not configured on this server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("passcode" in body)) {
    return NextResponse.json({ error: "Missing passcode" }, { status: 400 });
  }

  const { passcode } = body as { passcode: unknown };
  if (typeof passcode !== "string") {
    return NextResponse.json({ error: "Invalid passcode format" }, { status: 400 });
  }

  // Constant-time compare, never log the passcode
  const isMatch = constantTimeCompare(passcode, config.ownerPasscode);
  if (!isMatch) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 401 });
  }

  // Set 12 hour session token
  const token = createOwnerToken(config.sessionSecret, 12 * 60 * 60 * 1000);
  const isProd = process.env.NODE_ENV === "production";

  const response = NextResponse.json({ success: true, owner: true }, { status: 200 });
  response.cookies.set(OWNER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  return response;
}
