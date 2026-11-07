import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { checkRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { getRules, getSpentToday, getAction } from "@/lib/db";
import { evaluate } from "@/lib/policy";
import { processProposedAction } from "@/lib/orchestrator";
import type { ProposedAction } from "@/lib/types";

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function sanitizeAgentName(name: string): string {
  return name.trim().replace(/[\x00-\x1F\x7F]/g, "").slice(0, 40);
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "leash",
    version: "0.1.0",
  });

  // Tool 1: get_rules
  server.tool(
    "get_rules",
    "Returns current payment policy rules, today's spending, remaining daily budget, allowed recipients, and blocked action types.",
    {},
    async () => {
      const rules = await getRules();
      const spentToday = await getSpentToday();
      const remainingDailyBudget = Math.max(0, rules.dailyCap - spentToday);

      const data = {
        autoApproveLimit: rules.autoApproveLimit,
        hardLimit: rules.hardLimit,
        dailyCap: rules.dailyCap,
        spentToday,
        remainingDailyBudget,
        allowedRecipients: rules.allowedRecipients,
        blockedActionTypes: rules.blockedActionTypes,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // Tool 2: check_payment
  server.tool(
    "check_payment",
    "Dry-run payment evaluation without writing to the database. Checks whether an action would be approved, need human approval, or be blocked under current policy rules and daily spend.",
    {
      type: z.enum(["send_payout", "send_invoice"]).describe("Payment action type"),
      amount: z.number().positive().describe("Payment amount in USD"),
      recipient: z.string().email().describe("Recipient email address"),
      memo: z.string().optional().describe("Optional note or description"),
    },
    async ({ type, amount, recipient, memo }) => {
      const rules = await getRules();
      const spentToday = await getSpentToday();

      const proposed: ProposedAction = {
        type,
        amount,
        currency: "USD",
        recipient,
        description: memo ?? `Check ${type} for ${recipient}`,
      };

      const result = evaluate(proposed, rules, spentToday);

      const data = {
        verdict: result.decision,
        reason: result.reason,
        ruleFired: result.ruleFired,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // Tool 3: request_payment
  server.tool(
    "request_payment",
    "Submits a payment request on behalf of an AI agent. The request is evaluated against Leash policies. If within auto-approve limits, it executes automatically; otherwise, it is held for human approval or blocked. Refunds are not supported via MCP.",
    {
      type: z.enum(["send_payout", "send_invoice"]).describe("Payment action type"),
      amount: z.number().positive().describe("Payment amount in USD"),
      recipient: z.string().email().describe("Recipient email address"),
      memo: z.string().min(1).describe("Required description/memo explaining the payment purpose"),
      agent_name: z.string().min(1).describe("Name or identifier of the requesting agent (max 40 chars)"),
    },
    async ({ type, amount, recipient, memo, agent_name }) => {
      const sanitizedName = sanitizeAgentName(agent_name) || "unknown";
      const source = `agent: ${sanitizedName}`;

      const proposed: ProposedAction = {
        type,
        amount,
        currency: "USD",
        recipient,
        description: memo,
      };

      const action = await processProposedAction(
        proposed,
        memo,
        undefined,
        0,
        source
      );

      const data: {
        actionId: string;
        verdict: string;
        status: string;
        reason: string;
        ruleFired: string;
        note?: string;
      } = {
        actionId: action.id,
        verdict: action.decision,
        status: action.status,
        reason: action.reason,
        ruleFired: action.ruleFired,
      };

      if (action.decision === "needs_approval") {
        data.note = "Action is pending approval. A human administrator must approve it before it can execute.";
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  // Tool 4: get_action_status
  server.tool(
    "get_action_status",
    "Retrieves the current status of a previously requested action by its UUID.",
    {
      action_id: z.string().uuid().describe("The UUID of the action"),
    },
    async ({ action_id }) => {
      const action = await getAction(action_id);
      if (!action) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Action ${action_id} not found` }),
            },
          ],
          isError: true,
        };
      }

      const data = {
        id: action.id,
        status: action.status,
        paypalStatus: action.paypalStatus ?? null,
        decision: action.decision,
        reason: action.reason,
        errorMessage: action.errorMessage ?? null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  return server;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const serverToken = process.env.LEASH_MCP_TOKEN;
  if (!serverToken || serverToken.trim() === "") {
    return new NextResponse(
      JSON.stringify({ error: "MCP server is disabled" }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedToken = match ? match[1].trim() : "";

  if (!providedToken || !constantTimeEqual(providedToken, serverToken)) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Rate limiting by provided token or client IP
  const clientIp = getClientIp(request);
  const rateLimitKey = `mcp:${providedToken || clientIp}`;
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  return await transport.handleRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

