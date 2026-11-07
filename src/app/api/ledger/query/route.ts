import { NextResponse } from "next/server";
import { z } from "zod";
import { parseLedgerQuery } from "@/lib/ai/parseLedgerQuery";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

const MAX_QUESTION_LENGTH = 300;

const LedgerQueryBodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Question must not be empty")
    .max(
      MAX_QUESTION_LENGTH,
      `Question must not exceed ${MAX_QUESTION_LENGTH} characters`
    ),
});

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = LedgerQueryBodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? "Invalid question" },
      { status: 400 }
    );
  }

  const { question } = parseResult.data;
  const result = await parseLedgerQuery(question);

  if (result.kind === "error") {
    const statusCode = result.retryable ? 503 : 500;
    return NextResponse.json({ error: result.message }, { status: statusCode });
  }

  return NextResponse.json(result, { status: 200 });
}
