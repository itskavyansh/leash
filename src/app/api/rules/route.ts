import { NextResponse } from "next/server";
import { z } from "zod";
import { getRules, saveRules } from "@/lib/db";
import type { ActionType } from "@/lib/types";

const validActionTypes: [ActionType, ...ActionType[]] = [
  "send_invoice",
  "send_payout",
  "issue_refund",
];

const rulesSchema = z
  .object({
    autoApproveLimit: z
      .number()
      .min(0, "autoApproveLimit must be non-negative"),
    hardLimit: z
      .number()
      .min(0, "hardLimit must be non-negative"),
    dailyCap: z
      .number()
      .positive("dailyCap must be greater than 0"),
    allowedRecipients: z
      .array(z.string().email("Each allowed recipient must be a valid email address")),
    blockedActionTypes: z.array(z.enum(validActionTypes)),
  })
  .refine((data) => data.autoApproveLimit <= data.hardLimit, {
    message: "autoApproveLimit must not exceed hardLimit",
    path: ["autoApproveLimit"],
  });

export async function GET(): Promise<NextResponse> {
  const rules = getRules();
  return NextResponse.json(rules, { status: 200 });
}

export async function PUT(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parseResult = rulesSchema.safeParse(body);
  if (!parseResult.success) {
    const message = parseResult.error.issues
      .map((issue) => issue.message)
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const updatedRules = saveRules(parseResult.data);
  return NextResponse.json(updatedRules, { status: 200 });
}
