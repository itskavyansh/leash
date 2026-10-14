import { NextResponse } from "next/server";

export async function GET(): Promise<NextResponse> {
  const demoMode = process.env.DEMO_MODE === "true";
  return NextResponse.json({ demoMode }, { status: 200 });
}
