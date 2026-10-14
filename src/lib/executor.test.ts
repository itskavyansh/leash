import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { executeAction, approveAction, rejectAction } from "./executor";
import { getAction, insertAction, saveRules, getRules } from "./db";
import { processRequest } from "./orchestrator";
import { LlmCompletionResult, LlmProvider } from "./ai/provider";
import { setupTestDb, teardownTestDb } from "./testDb";

class MockProvider implements LlmProvider {
  constructor(private response: LlmCompletionResult) {}
  async complete() {
    return this.response;
  }
}

describe("Executor, Approval Workflow, and processRequest", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe("executeAction()", () => {
    it("executes an approved action and updates status to completed with paypalId and paypalStatus", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone 1",
        status: "approved",
        decision: "approve",
        reason: "Within limits",
        ruleFired: "within_limits",
      });

      const mockRunner = vi.fn().mockResolvedValue({
        paypalId: "PAYOUT-BATCH-999",
        paypalStatus: "PENDING",
      });

      const result = await executeAction(action.id, {
        run: {
          send_payout: mockRunner,
        },
      });

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("completed");
      expect(result.paypalId).toBe("PAYOUT-BATCH-999");
      expect(result.paypalStatus).toBe("PENDING");
      expect(result.errorMessage).toBeNull();

      // Verify DB row
      const inDb = await getAction(action.id);
      expect(inDb?.status).toBe("completed");
      expect(inDb?.paypalId).toBe("PAYOUT-BATCH-999");
    });

    it("handles PayPal execution failure with safe error message without secrets", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone 1",
        status: "approved",
        decision: "approve",
        reason: "Within limits",
        ruleFired: "within_limits",
      });

      const mockRunner = vi.fn().mockRejectedValue(
        new Error(
          'PayPal API error: HTTP 403 | debug_id=DBG_12345 | body={"name":"AUTHORIZATION_ERROR","message":"Permission denied"}'
        )
      );

      const result = await executeAction(action.id, {
        run: {
          send_payout: mockRunner,
        },
      });

      expect(result.status).toBe("failed");
      expect(result.paypalId).toBeNull();
      expect(result.errorMessage).toContain("Permission denied");
      expect(result.errorMessage).toContain("DBG_12345");
      expect(result.errorMessage).not.toContain("body=");

      const inDb = await getAction(action.id);
      expect(inDb?.status).toBe("failed");
      expect(inDb?.errorMessage).toBe(result.errorMessage);
    });

    it("does nothing when action is not in approved status", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone 1",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Wait for review",
        ruleFired: "auto_limit",
      });

      const mockRunner = vi.fn();
      const result = await executeAction(action.id, {
        run: {
          send_payout: mockRunner,
        },
      });

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.status).toBe("pending_approval");
    });

    it("prevents double execution: concurrent/second execute only calls PayPal once", async () => {
      const action = await insertAction({
        type: "send_invoice",
        amount: 850,
        currency: "USD",
        recipient: "client@example.com",
        description: "Logo",
        status: "approved",
        decision: "approve",
        reason: "Ok",
        ruleFired: "within_limits",
      });

      let resolveRun: (val: { paypalId: string; paypalStatus: string }) => void;
      const delayedPromise = new Promise<{ paypalId: string; paypalStatus: string }>(
        (resolve) => {
          resolveRun = resolve;
        }
      );

      const mockRunner = vi.fn().mockImplementation(() => delayedPromise);

      // Trigger two executions in parallel
      const firstExec = executeAction(action.id, {
        run: { send_invoice: mockRunner },
      });
      const secondExec = executeAction(action.id, {
        run: { send_invoice: mockRunner },
      });

      // Release runner
      resolveRun!({ paypalId: "INV-123", paypalStatus: "SENT" });

      const [res1, res2] = await Promise.all([firstExec, secondExec]);

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(res1.status).toBe("completed");
      expect(res2.status).toMatch(/executing|completed/);
    });
  });

  describe("approveAction() and rejectAction()", () => {
    it("approveAction on a pending row executes it and updates to completed", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 450,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Design package",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Over 200",
        ruleFired: "auto_limit",
      });

      const mockRunner = vi.fn().mockResolvedValue({
        paypalId: "PAYOUT-450",
        paypalStatus: "PENDING",
      });

      const result = await approveAction(action.id, {
        run: { send_payout: mockRunner },
      });

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("completed");
      expect(result.paypalId).toBe("PAYOUT-450");
    });

    it("approveAction re-blocks when recipient was removed from allowlist", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 150,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Payment",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Needs approval",
        ruleFired: "auto_limit",
      });

      // Update rules: remove sb-sub@example.com from allowedRecipients
      const currentRules = await getRules();
      await saveRules({
        ...currentRules,
        allowedRecipients: ["other@example.com"],
      });

      const mockRunner = vi.fn();
      const result = await approveAction(action.id, {
        run: { send_payout: mockRunner },
      });

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.status).toBe("blocked");
      expect(result.decision).toBe("blocked");
      expect(result.ruleFired).toBe("recipient_not_allowed");
    });

    it("approveAction re-blocks when amount exceeds modified hardLimit", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 800,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Payment",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Needs approval",
        ruleFired: "auto_limit",
      });

      // Lower hardLimit to 500
      const currentRules = await getRules();
      await saveRules({
        ...currentRules,
        hardLimit: 500,
      });

      const mockRunner = vi.fn();
      const result = await approveAction(action.id, {
        run: { send_payout: mockRunner },
      });

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.status).toBe("blocked");
      expect(result.decision).toBe("blocked");
      expect(result.ruleFired).toBe("hard_limit");
    });

    it("approveAction on a non-pending row is a no-op", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Payment",
        status: "rejected",
        decision: "needs_approval",
        reason: "Rejected earlier",
        ruleFired: "auto_limit",
      });

      const mockRunner = vi.fn();
      const result = await approveAction(action.id, {
        run: { send_payout: mockRunner },
      });

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.status).toBe("rejected");
    });

    it("rejectAction sets status to rejected, and rejected row cannot be approved", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 300,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Work",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Needs check",
        ruleFired: "auto_limit",
      });

      const rejected = await rejectAction(action.id);
      expect(rejected.status).toBe("rejected");

      const inDb = await getAction(action.id);
      expect(inDb?.status).toBe("rejected");

      // Try to approve rejected row
      const mockRunner = vi.fn();
      const attemptApprove = await approveAction(action.id, {
        run: { send_payout: mockRunner },
      });

      expect(mockRunner).not.toHaveBeenCalled();
      expect(attemptApprove.status).toBe("rejected");
    });
  });

  describe("processRequest()", () => {
    it("auto-executes an approved payout and returns completed action", async () => {
      const mockProvider = new MockProvider({
        toolName: "propose_action",
        toolInput: {
          type: "send_payout",
          amount: 50, // <= autoApproveLimit (200)
          recipient: "sb-sub@example.com",
          description: "Small payout",
        },
      });

      const mockRunner = vi.fn().mockResolvedValue({
        paypalId: "BATCH-AUTO-1",
        paypalStatus: "PENDING",
      });

      const result = await processRequest(
        "Pay Sam $50",
        mockProvider,
        {
          run: { send_payout: mockRunner },
        },
        async () => {}
      );

      expect(mockRunner).toHaveBeenCalledTimes(1);
      expect(result.parse.kind).toBe("action");
      expect(result.action?.status).toBe("completed");
      expect(result.action?.paypalId).toBe("BATCH-AUTO-1");
    });

    it("leaves a needs_approval action as pending_approval without executing", async () => {
      const mockProvider = new MockProvider({
        toolName: "propose_action",
        toolInput: {
          type: "send_payout",
          amount: 450, // > autoApproveLimit (200)
          recipient: "sb-sub@example.com",
          description: "Large package",
        },
      });

      const mockRunner = vi.fn();

      const result = await processRequest(
        "Pay Sam $450",
        mockProvider,
        {
          run: { send_payout: mockRunner },
        },
        async () => {}
      );

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.action?.status).toBe("pending_approval");
      expect(result.action?.decision).toBe("needs_approval");
    });

    it("leaves a blocked action as blocked without executing", async () => {
      const mockProvider = new MockProvider({
        toolName: "propose_action",
        toolInput: {
          type: "send_payout",
          amount: 50,
          recipient: "hacker@evil.com",
          description: "Suspicious",
        },
      });

      const mockRunner = vi.fn();

      const result = await processRequest(
        "Pay hacker@evil.com $50",
        mockProvider,
        {
          run: { send_payout: mockRunner },
        },
        async () => {}
      );

      expect(mockRunner).not.toHaveBeenCalled();
      expect(result.action?.status).toBe("blocked");
      expect(result.action?.decision).toBe("blocked");
    });
  });
});
