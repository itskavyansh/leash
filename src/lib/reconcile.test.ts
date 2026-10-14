import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupTestDb, teardownTestDb } from "./testDb";
import { insertAction, getAction } from "./db";
import { reconcileAction, ReconcileFetchFn } from "./paypal/reconcile";
import { reconcilePending, _resetThrottleForTests } from "./reconcile-pending";
import { POST as refreshPost } from "../app/api/actions/[id]/refresh/route";

describe("Status Reconciliation and Polling Fallback", () => {
  beforeEach(async () => {
    await setupTestDb();
    _resetThrottleForTests();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe("reconcileAction()", () => {
    it("updates payout from PENDING to SUCCESS", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone",
        status: "completed",
        decision: "approve",
        reason: "Within limits",
        ruleFired: "within_limits",
        paypalId: "BATCH-POLL-1",
        paypalStatus: "PENDING",
      });

      const mockFetch: ReconcileFetchFn = vi.fn().mockResolvedValue({
        items: [
          {
            transaction_status: "SUCCESS",
          },
        ],
      });

      const result = await reconcileAction(action, mockFetch);
      expect(result.changed).toBe(true);
      expect(result.paypalStatus).toBe("SUCCESS");
      expect(mockFetch).toHaveBeenCalledWith("/v1/payments/payouts/BATCH-POLL-1");

      const inDb = await getAction(action.id);
      expect(inDb?.paypalStatus).toBe("SUCCESS");
    });

    it("skips already-terminal rows without calling PayPal", async () => {
      const terminalAction = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Terminal Payout",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-ALREADY-DONE",
        paypalStatus: "SUCCESS", // terminal for payout
      });

      const mockFetch: ReconcileFetchFn = vi.fn();
      const result = await reconcileAction(terminalAction, mockFetch);

      expect(result.changed).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();

      // Test invoice terminal
      const invoiceAction = await insertAction({
        type: "send_invoice",
        amount: 100,
        currency: "USD",
        recipient: "client@example.com",
        description: "Terminal Invoice",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "INV-PAID-1",
        paypalStatus: "PAID", // terminal for invoice
      });

      const resultInv = await reconcileAction(invoiceAction, mockFetch);
      expect(resultInv.changed).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("catches PayPal error, logs warning, returns changed: false, and does not throw", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone",
        status: "completed",
        decision: "approve",
        reason: "Within limits",
        ruleFired: "within_limits",
        paypalId: "BATCH-ERROR-1",
        paypalStatus: "PENDING",
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const mockFetch: ReconcileFetchFn = vi.fn().mockRejectedValue(
        new Error("PayPal API error: HTTP 500")
      );

      const result = await reconcileAction(action, mockFetch);
      expect(result.changed).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();

      // DB remains unchanged
      const inDb = await getAction(action.id);
      expect(inDb?.paypalStatus).toBe("PENDING");
    });
  });

  describe("reconcilePending() throttle and filtering", () => {
    it("throttle prevents a second run within 10s", async () => {
      let currentTime = 100_000;
      const fakeNow = () => currentTime;

      await insertAction({
        createdAt: new Date(currentTime - 20_000).toISOString(), // 20s old (> 10s)
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone",
        status: "completed",
        decision: "approve",
        reason: "Within limits",
        ruleFired: "within_limits",
        paypalId: "BATCH-THROTTLE-1",
        paypalStatus: "PENDING",
      });

      const mockFetch: ReconcileFetchFn = vi.fn().mockResolvedValue({
        items: [{ transaction_status: "SUCCESS" }],
      });

      // First run at t=100s
      const first = await reconcilePending({ fetchFn: mockFetch, now: fakeNow });
      expect(first.ran).toBe(true);
      expect(first.checkedCount).toBe(1);
      expect(first.changedCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second run at t=105s (5s later -> throttled!)
      currentTime = 105_000;
      const second = await reconcilePending({ fetchFn: mockFetch, now: fakeNow });
      expect(second.ran).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1); // not called again

      // Third run at t=111s (11s later -> allowed!)
      currentTime = 111_000;
      const third = await reconcilePending({ fetchFn: mockFetch, now: fakeNow });
      expect(third.ran).toBe(true);
    });
  });

  describe("POST /api/actions/[id]/refresh", () => {
    it("returns 404 for unknown action ids", async () => {
      const req = new Request("http://localhost:3000/api/actions/nonexistent-id/refresh", {
        method: "POST",
      });

      const res = await refreshPost(req, {
        params: Promise.resolve({ id: "nonexistent-id" }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json).toEqual({ error: "Action not found" });
    });

    it("refreshes status for valid action regardless of throttle and returns updated row", async () => {
      const action = await insertAction({
        type: "send_invoice",
        amount: 150,
        currency: "USD",
        recipient: "client@example.com",
        description: "Design invoice",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "INV-REFRESH-1",
        paypalStatus: "SENT",
      });

      // Mock paypalFetch on client module
      const client = await import("./paypal/client");
      const fetchSpy = vi.spyOn(client, "paypalFetch").mockResolvedValue({
        status: "PAID",
      });

      const req = new Request(`http://localhost:3000/api/actions/${action.id}/refresh`, {
        method: "POST",
      });

      const res = await refreshPost(req, {
        params: Promise.resolve({ id: action.id }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(action.id);
      expect(json.paypalStatus).toBe("PAID");

      const inDb = await getAction(action.id);
      expect(inDb?.paypalStatus).toBe("PAID");

      fetchSpy.mockRestore();
    });
  });
});
