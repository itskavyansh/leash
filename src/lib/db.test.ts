import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb } from "./testDb";
import {
  getRules,
  saveRules,
  insertAction,
  updateAction,
  getAction,
  listActions,
  getSpentToday,
  claimForExecution,
  recordProcessedEvent,
  isEventProcessed,
  resetAll,
  findActionByPaypalId,
} from "./db";
import { Rules } from "./types";

describe("Database layer (Postgres via PGlite)", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe("Seeding and Rules", () => {
    it("seeds default rules on empty database", async () => {
      const rules = await getRules();
      expect(rules.autoApproveLimit).toBe(200);
      expect(rules.hardLimit).toBe(5000);
      expect(rules.dailyCap).toBe(1000);
      expect(rules.allowedRecipients).toEqual(["sb-sub@example.com"]);
      expect(rules.blockedActionTypes).toEqual([]);
    });

    it("saves and updates rules", async () => {
      const customRules: Rules = {
        autoApproveLimit: 300,
        hardLimit: 6000,
        dailyCap: 1500,
        allowedRecipients: ["partner@example.com", "contractor@example.com"],
        blockedActionTypes: ["issue_refund"],
      };

      await saveRules(customRules);
      const fetched = await getRules();
      expect(fetched).toEqual(customRules);
    });
  });

  describe("Actions CRUD", () => {
    it("inserts, fetches, updates, and lists actions", async () => {
      const inserted = await insertAction({
        type: "send_payout",
        amount: 150,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone payment",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Auto limit reached",
        ruleFired: "auto_limit",
        requestText: "Pay sb-sub $150",
      });

      expect(inserted.id).toBeDefined();
      expect(inserted.status).toBe("pending_approval");
      expect(inserted.reference).toBeNull();

      // getAction
      const fetched = await getAction(inserted.id);
      expect(fetched).toEqual(inserted);

      // updateAction
      const updated = await updateAction(inserted.id, {
        status: "completed",
        paypalId: "PAYOUT-12345",
        paypalStatus: "SUCCESS",
      });

      expect(updated?.status).toBe("completed");
      expect(updated?.paypalId).toBe("PAYOUT-12345");
      expect(updated?.paypalStatus).toBe("SUCCESS");

      // findActionByPaypalId
      const byPaypal = await findActionByPaypalId("PAYOUT-12345");
      expect(byPaypal?.id).toBe(inserted.id);

      // listActions
      const all = await listActions();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(inserted.id);
    });
  });

  describe("claimForExecution concurrency", () => {
    it("allows exactly one concurrent claim to succeed", async () => {
      const inserted = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Concurrent claim test",
        status: "approved",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // Launch multiple concurrent claims
      const results = await Promise.all([
        claimForExecution(inserted.id),
        claimForExecution(inserted.id),
        claimForExecution(inserted.id),
      ]);

      const trueCount = results.filter((r) => r === true).length;
      const falseCount = results.filter((r) => r === false).length;

      expect(trueCount).toBe(1);
      expect(falseCount).toBe(2);

      const action = await getAction(inserted.id);
      expect(action?.status).toBe("executing");
    });
  });

  describe("recordProcessedEvent idempotency", () => {
    it("calling recordProcessedEvent twice does not throw and marks event processed", async () => {
      const eventId = "WH-EVENT-IDEMPOTENT-123";

      expect(await isEventProcessed(eventId)).toBe(false);

      await recordProcessedEvent(eventId);
      expect(await isEventProcessed(eventId)).toBe(true);

      // Second call should not throw due to ON CONFLICT DO NOTHING
      await expect(recordProcessedEvent(eventId)).resolves.not.toThrow();
      expect(await isEventProcessed(eventId)).toBe(true);
    });
  });

  describe("resetAll", () => {
    it("clears actions and processed events and restores default rules", async () => {
      // Modify rules
      await saveRules({
        autoApproveLimit: 999,
        hardLimit: 9999,
        dailyCap: 5000,
        allowedRecipients: ["other@example.com"],
        blockedActionTypes: ["send_payout"],
      });

      // Insert action
      await insertAction({
        type: "send_invoice",
        amount: 100,
        currency: "USD",
        recipient: "test@example.com",
        description: "Test invoice",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // Record processed event
      await recordProcessedEvent("EVENT-TO-RESET");

      expect((await listActions()).length).toBe(1);
      expect(await isEventProcessed("EVENT-TO-RESET")).toBe(true);

      // Perform resetAll
      await resetAll();

      // Check actions and events cleared
      expect((await listActions()).length).toBe(0);
      expect(await isEventProcessed("EVENT-TO-RESET")).toBe(false);

      // Check rules restored to default
      const rules = await getRules();
      expect(rules.autoApproveLimit).toBe(200);
      expect(rules.hardLimit).toBe(5000);
      expect(rules.dailyCap).toBe(1000);
      expect(rules.allowedRecipients).toEqual(["sb-sub@example.com"]);
      expect(rules.blockedActionTypes).toEqual([]);
    });
  });

  describe("getSpentToday()", () => {
    it("calculates spent amount today only for qualifying statuses and types", async () => {
      const now = new Date().toISOString();

      // 1. Qualifying: send_payout, approved, created today -> $100
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 100,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "payout 1",
        status: "approved",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // 2. Qualifying: issue_refund, completed, created today -> $50
      await insertAction({
        createdAt: now,
        type: "issue_refund",
        amount: 50,
        currency: "USD",
        recipient: "buyer@example.com",
        description: "refund 1",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // 3. Qualifying: send_payout, executing, created today -> $25
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 25,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "payout executing",
        status: "executing",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // 4. Non-qualifying status: pending_approval -> should NOT count
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 200,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "pending payout",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "wait",
        ruleFired: "auto_limit",
      });

      // 5. Non-qualifying status: rejected -> should NOT count
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 300,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "rejected payout",
        status: "rejected",
        decision: "needs_approval",
        reason: "denied by user",
        ruleFired: "auto_limit",
      });

      // 6. Non-qualifying status: blocked -> should NOT count
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 10000,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "blocked payout",
        status: "blocked",
        decision: "blocked",
        reason: "hard limit",
        ruleFired: "hard_limit",
      });

      // 7. Non-qualifying status: failed -> should NOT count
      await insertAction({
        createdAt: now,
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "failed payout",
        status: "failed",
        decision: "approve",
        reason: "paypal error",
        ruleFired: "within_limits",
      });

      // 8. Non-qualifying type: send_invoice (invoices do not spend money) -> should NOT count
      await insertAction({
        createdAt: now,
        type: "send_invoice",
        amount: 850,
        currency: "USD",
        recipient: "client@example.com",
        description: "client invoice",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // 9. Created yesterday in UTC -> should NOT count
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      await insertAction({
        createdAt: yesterday,
        type: "send_payout",
        amount: 500,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "yesterday payout",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      // Sum of qualifying: 100 + 50 + 25 = 175
      const spent = await getSpentToday();
      expect(spent).toBe(175);
    });
  });
});
