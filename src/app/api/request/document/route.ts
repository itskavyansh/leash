import { NextResponse } from "next/server";
import { z } from "zod";
import { parseDocument, DocumentInput } from "@/lib/ai/parseDocument";
import { processProposedAction } from "@/lib/orchestrator";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import type { ActionRecord } from "@/lib/db";
import type { ProposedAction } from "@/lib/types";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TEXT_LENGTH = 20_000;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const JsonTextSchema = z.object({
  text: z.string().trim().min(1, "Text must not be empty").max(MAX_TEXT_LENGTH, `Text must not exceed ${MAX_TEXT_LENGTH} characters`),
});

export interface DocumentItemResult {
  proposal: ProposedAction;
  sourceNote?: string;
  action?: ActionRecord;
  error?: string;
}

export interface DocumentResponsePayload {
  proposalsCount: number;
  results: DocumentItemResult[];
  message?: string;
  error?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429 }
    );
  }

  const contentType = request.headers.get("content-type") || "";
  let documentInput: DocumentInput;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file");
    const textEntry = formData.get("text");

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const blob = file as Blob;
      if (blob.size === 0) {
        return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
      }
      if (blob.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File exceeds maximum size of 5 MB" },
          { status: 400 }
        );
      }
      if (!ALLOWED_MIME_TYPES.includes(blob.type as AllowedMimeType)) {
        return NextResponse.json(
          { error: "Unsupported file type. Only PDF, PNG, and JPG are supported." },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      documentInput = {
        type: "file",
        buffer,
        mimeType: blob.type as AllowedMimeType,
      };
    } else if (typeof textEntry === "string") {
      const parsed = JsonTextSchema.safeParse({ text: textEntry });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid text input" },
          { status: 400 }
        );
      }
      documentInput = { type: "text", text: parsed.data.text };
    } else {
      return NextResponse.json(
        { error: "Request must include either a file or text" },
        { status: 400 }
      );
    }
  } else if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = JsonTextSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 }
      );
    }
    documentInput = { type: "text", text: parsed.data.text };
  } else {
    return NextResponse.json(
      { error: "Unsupported Content-Type. Expected multipart/form-data or application/json" },
      { status: 400 }
    );
  }

  const parseResult = await parseDocument(documentInput);

  if (parseResult.kind === "error") {
    const statusCode = parseResult.retryable ? 503 : 500;
    return NextResponse.json(
      { error: parseResult.message, proposalsCount: 0, results: [] },
      { status: statusCode }
    );
  }

  if (parseResult.kind === "empty") {
    return NextResponse.json(
      {
        proposalsCount: 0,
        results: [],
        message: parseResult.message,
      },
      { status: 200 }
    );
  }

  // Process proposals through the existing orchestrator flow
  const results: DocumentItemResult[] = [];
  let extraSpentToday = 0;

  for (const item of parseResult.proposals) {
    try {
      const requestText =
        documentInput.type === "text"
          ? documentInput.text.slice(0, 500)
          : `Extracted from document (${item.sourceNote ?? "file"})`;

      const action = await processProposedAction(
        item.action,
        requestText,
        undefined,
        extraSpentToday,
        "document"
      );

      // If this action was not immediately executed into db-tracked spend ('approved', 'executing', 'completed'),
      // but is staged in the same document as pending_approval for a spending action,
      // subsequent proposals in this document must account for it against dailyCap.
      if (
        action.type !== "send_invoice" &&
        action.status === "pending_approval"
      ) {
        extraSpentToday += action.amount;
      }

      results.push({
        proposal: item.action,
        sourceNote: item.sourceNote,
        action,
      });
    } catch (err) {
      console.error("[Document Proposal Processing Error]:", err);
      results.push({
        proposal: item.action,
        sourceNote: item.sourceNote,
        error: err instanceof Error ? err.message : "Failed to process proposal",
      });
    }
  }

  return NextResponse.json(
    {
      proposalsCount: results.length,
      results,
    },
    { status: 200 }
  );
}

