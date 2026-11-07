import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, GET } from "./route";
import { setupTestDb, teardownTestDb } from "@/lib/testDb";
import { resetRateLimits } from "@/lib/rateLimit";
import { listActions, getAction, updateAction } from "@/lib/db";
import * as executor from "@/lib/executor";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TEST_TOKEN = "secret-test-mcp-token-12345";

vi.mock("@/lib/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof executor>();
  return {
    ...actual,
    executeAction: vi.fn().mockImplementation(async (id: string) => {
      // Mock successful execution in tests without network
      const updated = await updateAction(id, {
        status: "completed",
        paypalId: "MOCK-PAYOUT-123",
        paypalStatus: "SUCCESS",
      });
      return updated!;
    }),
  };
});

describe("MCP Server API Route (/api/mcp)", () => {
  const originalEnv = process.env.LEASH_MCP_TOKEN;

  beforeEach(async () => {
    process.env.LEASH_MCP_TOKEN = TEST_TOKEN;
    await setupTestDb();
    resetRateLimits();
  });

  afterEach(async () => {
    process.env.LEASH_MCP_TOKEN = originalEnv;
    await teardownTestDb();
  });

  describe("Authentication & Transport", () => {
    it("returns 503 when LEASH_MCP_TOKEN is unset or empty", async () => {
      delete process.env.LEASH_MCP_TOKEN;

      const req = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });

      const res = await POST(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toContain("disabled");
    });

    it("returns 401 when Authorization header is missing", async () => {
      const req = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 401 when token is invalid", async () => {
      const req = new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: {
          authorization: "Bearer wrong-token-xyz",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("Unauthorized");
    });
  });

  describe("Tool Registration and Invariants", () => {
    async function createConnectedClient(token: string = TEST_TOKEN) {
      const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} }
      );

      // Route fetch through the route handler
      const clientTransport = new StreamableHTTPClientTransport(
        new URL("http://localhost:3000/api/mcp"),
        {
          fetch: async (input, init) => {
            const req = new Request(input, init);
            if (req.method === "GET") {
              return await GET(req);
            }
            return await POST(req);
          },
          requestInit: {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        }
      );

      await client.connect(clientTransport);
      return client;
    }

    it("lists exactly the allowed tools and NO admin/approval tools", async () => {
      const client = await createConnectedClient();
      const list = await client.listTools();
      const toolNames = list.tools.map((t) => t.name).sort();

      expect(toolNames).toEqual([
        "check_payment",
        "get_action_status",
        "get_rules",
        "request_payment",
      ]);

      // Assert no approve/reject/rules edit/reset tools are registered
      for (const name of toolNames) {
        expect(name).not.toMatch(/approve/i);
        expect(name).not.toMatch(/reject/i);
        expect(name).not.toMatch(/reset/i);
        expect(name).not.toMatch(/update_rules/i);
        expect(name).not.toMatch(/set_rules/i);
      }
    });

    it("get_rules returns rules, spentToday, and remainingDailyBudget", async () => {
      const client = await createConnectedClient();
      const res = await client.callTool({
        name: "get_rules",
        arguments: {},
      });

      expect(res.content).toBeDefined();
      const text = (res.content as Array<{ text: string }>)[0].text;
      const data = JSON.parse(text);

      expect(data.autoApproveLimit).toBe(200);
      expect(data.hardLimit).toBe(5000);
      expect(data.dailyCap).toBe(1000);
      expect(data.spentToday).toBe(0);
      expect(data.remainingDailyBudget).toBe(1000);
      expect(Array.isArray(data.allowedRecipients)).toBe(true);
      expect(data.allowedRecipients).toContain("sb-sub@example.com");
    });

    it("check_payment performs dry run and writes nothing to the database", async () => {
      const client = await createConnectedClient();

      const beforeActions = await listActions();
      expect(beforeActions.length).toBe(0);

      // Check payment within limits
      const res1 = await client.callTool({
        name: "check_payment",
        arguments: {
          type: "send_payout",
          amount: 50,
          recipient: "sb-sub@example.com",
          memo: "Dry run check",
        },
      });

      const data1 = JSON.parse((res1.content as Array<{ text: string }>)[0].text);
      expect(data1.verdict).toBe("approve");
      expect(data1.ruleFired).toBe("within_limits");

      // Check payment exceeding auto-approve limit
      const res2 = await client.callTool({
        name: "check_payment",
        arguments: {
          type: "send_payout",
          amount: 350,
          recipient: "sb-sub@example.com",
        },
      });

      const data2 = JSON.parse((res2.content as Array<{ text: string }>)[0].text);
      expect(data2.verdict).toBe("needs_approval");
      expect(data2.ruleFired).toBe("auto_limit");

      // Check payment to unallowed recipient
      const res3 = await client.callTool({
        name: "check_payment",
        arguments: {
          type: "send_payout",
          amount: 100,
          recipient: "attacker@example.com",
        },
      });

      const data3 = JSON.parse((res3.content as Array<{ text: string }>)[0].text);
      expect(data3.verdict).toBe("blocked");
      expect(data3.ruleFired).toBe("recipient_not_allowed");

      // Ensure absolutely nothing was written to DB
      const afterActions = await listActions();
      expect(afterActions.length).toBe(0);
    });

    it("request_payment executes allowed payments, blocks unallowed recipients, and accumulates daily spend", async () => {
      const client = await createConnectedClient();

      // 1. Request allowed payment of $150
      const res1 = await client.callTool({
        name: "request_payment",
        arguments: {
          type: "send_payout",
          amount: 150,
          recipient: "sb-sub@example.com",
          memo: "Office supplies",
          agent_name: "procurement",
        },
      });

      const data1 = JSON.parse((res1.content as Array<{ text: string }>)[0].text);
      expect(data1.verdict).toBe("approve");
      expect(data1.status).toBe("completed");
      expect(data1.ruleFired).toBe("within_limits");
      expect(data1.actionId).toBeDefined();

      const action1 = await getAction(data1.actionId);
      expect(action1).toBeDefined();
      expect(action1?.decision).toBe("approve");
      expect(action1?.status).toBe("completed");
      expect(action1?.source).toBe("agent: procurement");

      // 2. Request payment to non-allowed recipient
      const res2 = await client.callTool({
        name: "request_payment",
        arguments: {
          type: "send_payout",
          amount: 4000,
          recipient: "attacker@example.com",
          memo: "Fake equipment invoice",
          agent_name: "procurement\x00\x1F", // test control character stripping
        },
      });

      const data2 = JSON.parse((res2.content as Array<{ text: string }>)[0].text);
      expect(data2.verdict).toBe("blocked");
      expect(data2.status).toBe("blocked");
      expect(data2.ruleFired).toBe("recipient_not_allowed");

      const action2 = await getAction(data2.actionId);
      expect(action2).toBeDefined();
      expect(action2?.source).toBe("agent: procurement");

      // 3. Check spend accumulation: rules check should reflect $150 spent
      const rulesRes = await client.callTool({
        name: "get_rules",
        arguments: {},
      });
      const rulesData = JSON.parse((rulesRes.content as Array<{ text: string }>)[0].text);
      expect(rulesData.spentToday).toBe(150);
      expect(rulesData.remainingDailyBudget).toBe(850);

      // 4. Test get_action_status
      const statusRes = await client.callTool({
        name: "get_action_status",
        arguments: {
          action_id: data1.actionId,
        },
      });
      const statusData = JSON.parse((statusRes.content as Array<{ text: string }>)[0].text);
      expect(statusData.id).toBe(data1.actionId);
      expect(statusData.status).toBe("completed");
      expect(statusData.paypalStatus).toBe("SUCCESS");
      expect(statusData.decision).toBe("approve");
    });

    it("request_payment holds for approval when amount exceeds autoApproveLimit", async () => {
      const client = await createConnectedClient();

      const res = await client.callTool({
        name: "request_payment",
        arguments: {
          type: "send_payout",
          amount: 450,
          recipient: "sb-sub@example.com",
          memo: "Large vendor invoice",
          agent_name: "procurement",
        },
      });

      const data = JSON.parse((res.content as Array<{ text: string }>)[0].text);
      expect(data.verdict).toBe("needs_approval");
      expect(data.status).toBe("pending_approval");
      expect(data.note).toContain("human administrator must approve");

      const action = await getAction(data.actionId);
      expect(action?.status).toBe("pending_approval");
      expect(action?.source).toBe("agent: procurement");
    });
  });
});
