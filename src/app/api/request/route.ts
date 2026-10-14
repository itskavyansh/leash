import { NextResponse } from "next/server";
import { z } from "zod";
import { processRequest } from "@/lib/orchestrator";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

const RequestBodySchema = z.object({
  text: z.string().trim().min(1, "Text must not be empty").max(500, "Text must not exceed 500 characters"),
});

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = RequestBodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 }
    );
  }

  const { text } = parseResult.data;
  const result = await processRequest(text);

  if (result.parse.kind === "error") {
    const statusCode = result.parse.retryable ? 503 : 500;
    return NextResponse.json(
      { error: result.parse.message, ...result },
      { status: statusCode }
    );
  }

  return NextResponse.json(result, { status: 200 });
}
