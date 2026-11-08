import { NextResponse } from "next/server";
import { OWNER_COOKIE_NAME } from "@/lib/ownerAuth";

export async function POST(): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ success: true }, { status: 200 });

  response.cookies.set(OWNER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
