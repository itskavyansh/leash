import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  getDb,
  resetDb,
  getRules,
  saveRules,
  insertAction,
  updateAction,
  getAction,
  listActions,
  getSpentToday,
} from "./db";
import { Rules } from "./types";

describe("Database layer (in-memory SQLite)", () => {
  let db: Database.Database;

  beforeEach(() => {
    resetDb();
    db = getDb(":memory:");
  });

  describe("Seeding and Rules", () => {
    it("seeds default rules on empty database", () => {
      const rules = getRules(db);
      expect(rules.autoApproveLimit).toBe(200);
      expect(rules.hardLimit).toBe(5000);
      expect(rules.dailyCap).toBe(1000);
      expect(rules.allowedRecipients).toEqual(["sb-sub@example.com"]);
      expect(rules.blockedActionTypes).toEqual([]);
    });

    it("saves and updates rules", () => {
      const customRules: Rules = {
        autoApproveLimit: 300,
        hardLimit: 6000,
        dailyCap: 1500,
        allowedRecipients: ["partner@example.com", "contractor@example.com"],
        blockedActionTypes: ["issue_refund"],
      };

      saveRules(customRules, db);
      const fetched = getRules(db);
      expect(fetched).toEqual(customRules);
    });
  });

  describe("Actions CRUD", () => {
    it("inserts, fetches, updates, and lists actions", () => {
      const inserted = insertAction(
        {
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
        },
        db
      );

      expect(inserted.id).toBeDefined();
      expect(inserted.status).toBe("pending_approval");
      expect(inserted.reference).toBeNull();

      // getAction
      const fetched = getAction(inserted.id, db);
      expect(fetched).toEqual(inserted);

      // updateAction
      const updated = updateAction(
        inserted.id,
        {
          status: "completed",
          paypalId: "PAYOUT-12345",
          paypalStatus: "SUCCESS",
        },
        db
      );

      expect(updated?.status).toBe("completed");
      expect(updated?.paypalId).toBe("PAYOUT-12345");
      expect(updated?.paypalStatus).toBe("SUCCESS");

      // listActions
      const all = listActions(db);
      expect(all.length).toBe(1);
      expect(all[0].id).toBe(inserted.id);
    });
  });

  describe("getSpentToday()", () => {
    it("calculates spent amount today only for qualifying statuses and types", () => {
      const now = new Date().toISOString();

      // 1. Qualifying: send_payout, approved, created today -> $100
      insertAction(
        {
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
        },
        db
      );

      // 2. Qualifying: issue_refund, completed, created today -> $50
      insertAction(
        {
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
        },
        db
      );

      // 3. Qualifying: send_payout, executing, created today -> $25
      insertAction(
        {
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
        },
        db
      );

      // 4. Non-qualifying status: pending_approval -> should NOT count
      insertAction(
        {
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
        },
        db
      );

      // 5. Non-qualifying status: rejected -> should NOT count
      insertAction(
        {
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
        },
        db
      );

      // 6. Non-qualifying status: blocked -> should NOT count
      insertAction(
        {
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
        },
        db
      );

      // 7. Non-qualifying status: failed -> should NOT count
      insertAction(
        {
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
        },
        db
      );

      // 8. Non-qualifying type: send_invoice (invoices do not spend money) -> should NOT count
      insertAction(
        {
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
        },
        db
      );

      // 9. Created yesterday in UTC -> should NOT count
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      insertAction(
        {
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
        },
        db
      );

      // Sum of qualifying: 100 + 50 + 25 = 175
      const spent = getSpentToday(db);
      expect(spent).toBe(175);
    });
  });
});
