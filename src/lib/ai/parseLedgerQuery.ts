import { z } from "zod";
import { ActionStatus, ActionType } from "../types";
import { getProvider, LlmProvider, ToolDef } from "./provider";
import { classifyProviderError, DelayFn } from "./parse";

export const ACTION_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "blocked",
  "executing",
  "completed",
  "failed",
] as const;

export const ACTION_TYPES = [
  "send_payout",
  "send_invoice",
  "issue_refund",
] as const;

export const SOURCES = ["typed", "document", "agent"] as const;

export const FilterSpecSchema = z
  .object({
    status: z.array(z.enum(ACTION_STATUSES)).optional(),
    type: z.array(z.enum(ACTION_TYPES)).optional(),
    source: z.enum(SOURCES).optional(),
    agentNameContains: z.string().trim().min(1).optional(),
    amountMin: z.number().nonnegative().optional(),
    amountMax: z.number().positive().optional(),
    recipientContains: z.string().trim().min(1).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Must be an ISO date (YYYY-MM-DD)")
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "Must be an ISO date (YYYY-MM-DD)")
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (
        data.amountMin !== undefined &&
        data.amountMax !== undefined &&
        data.amountMin > data.amountMax
      ) {
        return false;
      }
      return true;
    },
    {
      message: "amountMin cannot exceed amountMax",
      path: ["amountMin"],
    }
  )
  .refine(
    (data) => {
      if (data.dateFrom && data.dateTo && data.dateFrom > data.dateTo) {
        return false;
      }
      return true;
    },
    {
      message: "dateFrom cannot be later than dateTo",
      path: ["dateFrom"],
    }
  );

export type FilterSpec = z.infer<typeof FilterSpecSchema>;

export type LedgerQueryResult =
  | { kind: "filter"; spec: FilterSpec }
  | { kind: "refusal"; reason: string }
  | { kind: "error"; message: string; retryable: boolean };

const CannotFilterSchema = z.object({
  reason: z.string().min(1),
});

const LEDGER_TOOLS: ToolDef[] = [
  {
    name: "apply_filters",
    description:
      "Translate the user query into structured audit ledger filter specifications. Use this whenever the question asks to find, list, show, or filter transactions, amounts, recipients, statuses, types, or dates.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "pending_approval",
              "approved",
              "rejected",
              "blocked",
              "executing",
              "completed",
              "failed",
            ],
          },
          description: "List of transaction statuses to filter by.",
        },
        type: {
          type: "array",
          items: {
            type: "string",
            enum: ["send_payout", "send_invoice", "issue_refund"],
          },
          description: "List of transaction types to filter by.",
        },
        source: {
          type: "string",
          enum: ["typed", "document", "agent"],
          description: "Source channel of the action.",
        },
        agentNameContains: {
          type: "string",
          description: "Sub-string match for the specific agent name when source is 'agent'.",
        },
        amountMin: {
          type: "number",
          description: "Minimum amount in USD (inclusive).",
        },
        amountMax: {
          type: "number",
          description: "Maximum amount in USD (inclusive).",
        },
        recipientContains: {
          type: "string",
          description: "Text or email snippet contained in the recipient field.",
        },
        dateFrom: {
          type: "string",
          description: "Start date in ISO format YYYY-MM-DD (inclusive).",
        },
        dateTo: {
          type: "string",
          description: "End date in ISO format YYYY-MM-DD (inclusive).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cannot_filter",
    description:
      "Call this tool when the query is unrelated to ledger filtering or asks to modify/create transactions or cannot be represented by filters.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief, helpful explanation why this cannot be filtered.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export function buildLedgerSystemPrompt(todayIso: string): string {
  return `You are an AI ledger query assistant for Leash, a financial policy system.
Your job is to translate natural language questions about transactions into structured filter parameters for the audit ledger table.
Today's date is: ${todayIso}. Use this reference date to accurately compute relative dates such as "today", "yesterday", "this week", or "this month" in YYYY-MM-DD format.

You must call ONE of two tools:
1. apply_filters: Translate queries into structured filters (status, type, source, amountMin, amountMax, recipientContains, dateFrom, dateTo).
2. cannot_filter: If the query is conversational greetings, requests to create/approve payments, change rules, or unrelated to searching the transaction history.

CRITICAL INSTRUCTIONS:
- You are strictly read-only. Never attempt to create, approve, reject, or execute payments.
- Map user terms accurately:
  - "pending", "inbox", "waiting for me", "needs approval" -> status: ["pending_approval"]
  - "blocked", "stopped", "rejected by policy" -> status: ["blocked"]
  - "successful", "sent", "done", "paid" -> status: ["completed"]
  - "payouts" -> type: ["send_payout"]
  - "invoices" -> type: ["send_invoice"]
  - "refunds" -> type: ["issue_refund"]
  - "from documents" or "invoices uploaded" -> source: "document"
  - "from agents" or "ai agent" -> source: "agent"
- Always return dates as YYYY-MM-DD strings.
- Never output raw AG Grid filter models.`;
}

export async function parseLedgerQuery(
  question: string,
  provider?: LlmProvider,
  delayFn: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date = new Date()
): Promise<LedgerQueryResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "refusal",
      reason: "Please enter a question to filter the ledger.",
    };
  }

  const todayIso = now.toISOString().slice(0, 10);
  const systemPrompt = buildLedgerSystemPrompt(todayIso);

  const activeProvider = provider || (await getProvider());

  const delays = [0, 500, 1000];
  let lastClassified: { message: string; retryable: boolean } | null = null;
  let result: import("./provider").LlmCompletionResult | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await activeProvider.complete({
        system: systemPrompt,
        user: trimmed,
        tools: LEDGER_TOOLS,
      });
      lastClassified = null;
      break;
    } catch (err) {
      const classified = classifyProviderError(err);
      lastClassified = classified;

      if (!classified.retryable) {
        break;
      }

      await delayFn(delays[attempt]);
    }
  }

  if (lastClassified) {
    return {
      kind: "error",
      message: lastClassified.message,
      retryable: lastClassified.retryable,
    };
  }

  if (!result || !("toolName" in result)) {
    return {
      kind: "refusal",
      reason: "Could not translate that question into a ledger filter.",
    };
  }

  if (result.toolName === "cannot_filter") {
    const parse = CannotFilterSchema.safeParse(result.toolInput);
    return {
      kind: "refusal",
      reason: parse.success
        ? parse.data.reason
        : "Cannot filter ledger with this query.",
    };
  }

  if (result.toolName === "apply_filters") {
    const parse = FilterSpecSchema.safeParse(result.toolInput);
    if (!parse.success) {
      return {
        kind: "refusal",
        reason: "The generated filter was invalid. Try phrasing your question differently.",
      };
    }

    return {
      kind: "filter",
      spec: parse.data,
    };
  }

  return {
    kind: "refusal",
    reason: "Unsupported query response.",
  };
}
