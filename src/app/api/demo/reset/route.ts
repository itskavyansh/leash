import { NextResponse } from "next/server";
import { resetAll } from "@/lib/db";

export async function POST(): Promise<NextResponse> {
  if (process.env.DEMO_MODE !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await resetAll();
  return NextResponse.json({ message: "Demo data reset successfully" }, { status: 200 });
}
