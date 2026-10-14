import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { POST as requestPost } from "./request/route";
import { GET as actionsGet } from "./actions/route";
import { POST as approvePost } from "./actions/[id]/approve/route";
import { POST as rejectPost } from "./actions/[id]/reject/route";
import { GET as rulesGet, PUT as rulesPut } from "./rules/route";
import { POST as resetPost } from "./demo/reset/route";
import { insertAction, getAction, updateAction, saveRules } from "../../lib/db";
import { setupTestDb, teardownTestDb } from "../../lib/testDb";
import { resetRateLimits } from "../../lib/rateLimit";
import * as orchestrator from "../../lib/orchestrator";
import * as executor from "../../lib/executor";
import type { ProcessRequestResult } from "../../lib/orchestrator";

vi.mock("../../lib/orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof orchestrator>();
  return {
    ...actual,
    processRequest: vi.fn(),
  };
});

vi.mock("@/lib/executor", async (importOriginal) => {
  const actual = await importOriginal<typeof executor>();
  return {
    ...actual,
    approveAction: vi.fn().mockImplementation(async (id: string) => {
      const existing = await getAction(id);
      if (!existing) {
        throw new Error("Action not found");
      }
      return (await updateAction(id, { status: "approved" }))!;
    }),
    executeAction: vi.fn().mockImplementation(async (id: string) => {
      const existing = await getAction(id);
      return existing!;
    }),
  };
});

describe("JSON API Routes", () => {
  beforeEach(async () => {
    await setupTestDb();
    resetRateLimits();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    delete process.env.DEMO_MODE;
    await teardownTestDb();
  });

  describe("POST /api/request", () => {
    it("returns 400 when text is missing or empty", async () => {
      const req = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });

      const res = await requestPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ error: "Text must not be empty" });
    });

    it("returns 200 with result when action is proposed and approved", async () => {
      const mockResult: ProcessRequestResult = {
        parse: {
          kind: "action",
          action: {
            type: "send_payout",
            amount: 50,
            currency: "USD",
            recipient: "sb-sub@example.com",
            description: "Test",
          },
        },
        action: {
          id: "act-1",
          createdAt: new Date().toISOString(),
          type: "send_payout",
          amount: 50,
          currency: "USD",
          recipient: "sb-sub@example.com",
          description: "Test",
          reference: null,
          status: "completed",
          decision: "approve",
          reason: "Within limits",
          ruleFired: "within_limits",
          requestText: "Pay $50",
          paypalId: "PAYOUT-123",
          paypalStatus: "SUCCESS",
          errorMessage: null,
        },
      };

      vi.mocked(orchestrator.processRequest).mockResolvedValue(mockResult);

      const req = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay $50" }),
      });

      const res = await requestPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockResult);
    });

    it("returns 200 when parse requires clarification", async () => {
      vi.mocked(orchestrator.processRequest).mockResolvedValue({
        parse: {
          kind: "clarify",
          question: "What is the recipient email?",
        },
      });

      const req = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay Sam $50" }),
      });

      const res = await requestPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.parse.kind).toBe("clarify");
      expect(json.parse.question).toBe("What is the recipient email?");
    });

    it("returns 503 when parse encounters a retryable AI error", async () => {
      vi.mocked(orchestrator.processRequest).mockResolvedValue({
        parse: {
          kind: "error",
          message: "The AI service is busy right now. Please try again in a moment.",
          retryable: true,
        },
      });

      const req = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay $50" }),
      });

      const res = await requestPost(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe(
        "The AI service is busy right now. Please try again in a moment."
      );
      expect(json.parse.retryable).toBe(true);
    });

    it("returns 500 when parse encounters a non-retryable AI error", async () => {
      vi.mocked(orchestrator.processRequest).mockResolvedValue({
        parse: {
          kind: "error",
          message: "The AI service is not configured correctly.",
          retryable: false,
        },
      });

      const req = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Pay $50" }),
      });

      const res = await requestPost(req);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("The AI service is not configured correctly.");
      expect(json.parse.retryable).toBe(false);
    });

    it("returns 429 when rate limit is exceeded (> 20 requests/min)", async () => {
      vi.mocked(orchestrator.processRequest).mockResolvedValue({
        parse: { kind: "clarify", question: "Which recipient?" },
      });

      for (let i = 0; i < 20; i++) {
        const req = new Request("http://localhost:3000/api/request", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "192.168.1.100" },
          body: JSON.stringify({ text: "test" }),
        });
        const res = await requestPost(req);
        expect(res.status).toBe(200);
      }

      // 21st request should fail with 429
      const req21 = new Request("http://localhost:3000/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "192.168.1.100" },
        body: JSON.stringify({ text: "test" }),
      });
      const res21 = await requestPost(req21);
      expect(res21.status).toBe(429);
      const json21 = await res21.json();
      expect(json21).toEqual({ error: "Rate limit exceeded. Please try again later." });
    });
  });

  describe("GET /api/actions", () => {
    it("returns { actions, spentToday }", async () => {
      await insertAction({
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "a@example.com",
        description: "first",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      const res = await actionsGet();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.actions)).toBe(true);
      expect(json.actions.length).toBe(1);
      expect(json.spentToday).toBe(25);
    });
  });

  describe("POST /api/actions/[id]/approve and reject", () => {
    it("returns 404 if action does not exist", async () => {
      const reqApprove = new Request("http://localhost:3000/api/actions/nonexistent/approve", {
        method: "POST",
      });
      const resApprove = await approvePost(reqApprove, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(resApprove.status).toBe(404);
      expect(await resApprove.json()).toEqual({ error: "Action not found" });

      const reqReject = new Request("http://localhost:3000/api/actions/nonexistent/reject", {
        method: "POST",
      });
      const resReject = await rejectPost(reqReject, {
        params: Promise.resolve({ id: "nonexistent" }),
      });
      expect(resReject.status).toBe(404);
      expect(await resReject.json()).toEqual({ error: "Action not found" });
    });

    it("returns 409 if action is not pending_approval", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "a@example.com",
        description: "already done",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      const reqApprove = new Request(`http://localhost:3000/api/actions/${action.id}/approve`, {
        method: "POST",
      });
      const resApprove = await approvePost(reqApprove, {
        params: Promise.resolve({ id: action.id }),
      });
      expect(resApprove.status).toBe(409);
      expect(await resApprove.json()).toEqual({ error: "Action is not pending approval" });

      const reqReject = new Request(`http://localhost:3000/api/actions/${action.id}/reject`, {
        method: "POST",
      });
      const resReject = await rejectPost(reqReject, {
        params: Promise.resolve({ id: action.id }),
      });
      expect(resReject.status).toBe(409);
      expect(await resReject.json()).toEqual({ error: "Action is not pending approval" });
    });

    it("approves action when pending_approval and returns 200", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "needs approval",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "ok",
        ruleFired: "needs_approval_above_limit",
      });

      const reqApprove = new Request(`http://localhost:3000/api/actions/${action.id}/approve`, {
        method: "POST",
      });
      const resApprove = await approvePost(reqApprove, {
        params: Promise.resolve({ id: action.id }),
      });
      expect(resApprove.status).toBe(200);
      const json = await resApprove.json();
      expect(json.status).toBe("approved");

      const inDb = await getAction(action.id);
      expect(inDb?.status).toBe("approved");
    });

    it("rejects action when pending_approval and returns 200", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "a@example.com",
        description: "needs approval",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "ok",
        ruleFired: "needs_approval_above_limit",
      });

      const reqReject = new Request(`http://localhost:3000/api/actions/${action.id}/reject`, {
        method: "POST",
      });
      const resReject = await rejectPost(reqReject, {
        params: Promise.resolve({ id: action.id }),
      });
      expect(resReject.status).toBe(200);
      const json = await resReject.json();
      expect(json.status).toBe("rejected");

      const inDb = await getAction(action.id);
      expect(inDb?.status).toBe("rejected");
    });
  });

  describe("GET and PUT /api/rules", () => {
    it("GET returns current rules", async () => {
      const res = await rulesGet();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("autoApproveLimit");
      expect(json).toHaveProperty("hardLimit");
      expect(json).toHaveProperty("dailyCap");
    });

    it("PUT validates rules (fails if autoApproveLimit > hardLimit)", async () => {
      const req = new Request("http://localhost:3000/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoApproveLimit: 600,
          hardLimit: 500,
          dailyCap: 1000,
          allowedRecipients: ["test@example.com"],
          blockedActionTypes: ["issue_refund"],
        }),
      });

      const res = await rulesPut(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("autoApproveLimit must not exceed hardLimit");
    });

    it("PUT validates non-negative limits, positive dailyCap, email array, and valid ActionType", async () => {
      const badReq = new Request("http://localhost:3000/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoApproveLimit: -1,
          hardLimit: 500,
          dailyCap: 0,
          allowedRecipients: ["not-an-email"],
          blockedActionTypes: ["invalid_type"],
        }),
      });

      const res = await rulesPut(badReq);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("PUT updates and returns saved rules on valid input", async () => {
      const validRules = {
        autoApproveLimit: 150,
        hardLimit: 600,
        dailyCap: 1500,
        allowedRecipients: ["contractor@example.com"],
        blockedActionTypes: ["issue_refund" as const],
      };

      const req = new Request("http://localhost:3000/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validRules),
      });

      const res = await rulesPut(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.autoApproveLimit).toBe(150);
      expect(json.hardLimit).toBe(600);
      expect(json.allowedRecipients).toEqual(["contractor@example.com"]);
    });
  });

  describe("POST /api/demo/reset", () => {
    it("returns 404 when DEMO_MODE !== 'true'", async () => {
      delete process.env.DEMO_MODE;
      const res = await resetPost();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });

      process.env.DEMO_MODE = "false";
      const res2 = await resetPost();
      expect(res2.status).toBe(404);
      expect(await res2.json()).toEqual({ error: "Not found" });
    });

    it("clears actions, processed events, and resets rules when DEMO_MODE === 'true'", async () => {
      process.env.DEMO_MODE = "true";

      await insertAction({
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "a@example.com",
        description: "demo",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      await saveRules({
        autoApproveLimit: 999,
        hardLimit: 999,
        dailyCap: 999,
        allowedRecipients: [],
        blockedActionTypes: [],
      });

      const res = await resetPost();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("message");

      const actionsRes = await actionsGet();
      const actionsJson = await actionsRes.json();
      expect(actionsJson.actions.length).toBe(0);
      expect(actionsJson.spentToday).toBe(0);

      const rulesRes = await rulesGet();
      const rulesJson = await rulesRes.json();
      expect(rulesJson.autoApproveLimit).toBe(200);
      expect(rulesJson.hardLimit).toBe(5000);
    });
  });
});
