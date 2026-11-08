import { NextResponse } from "next/server";
import { checkOwnerAuth } from "@/lib/ownerAuth";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = checkOwnerAuth(request);
  return NextResponse.json({ owner: auth.isOwner }, { status: 200 });
}
