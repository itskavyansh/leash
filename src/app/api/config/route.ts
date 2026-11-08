import { NextResponse } from "next/server";
import { getOwnerConfig } from "@/lib/ownerAuth";

export async function GET(): Promise<NextResponse> {
  const demoMode = process.env.DEMO_MODE === "true";
  const config = getOwnerConfig();

  return NextResponse.json(
    {
      demoMode,
      showDemoPasscode: config.showDemoPasscode,
      demoPasscode: config.showDemoPasscode ? config.ownerPasscode : undefined,
    },
    { status: 200 }
  );
}
