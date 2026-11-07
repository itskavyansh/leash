import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseAllowedRecipientsEnv,
  getDefaultAllowedRecipients,
  getDefaultRules,
} from "./defaultRules";
import { resetAll, getRules, saveRules } from "./db";
import { setupTestDb, teardownTestDb } from "./testDb";

describe("Default Allowed Recipients & Rules Configuration", () => {
  const originalEnv = process.env.DEFAULT_ALLOWED_RECIPIENTS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEFAULT_ALLOWED_RECIPIENTS = originalEnv;
    } else {
      delete process.env.DEFAULT_ALLOWED_RECIPIENTS;
    }
  });

  describe("parseAllowedRecipientsEnv()", () => {
    it("handles undefined or empty env var", () => {
      expect(parseAllowedRecipientsEnv(undefined)).toEqual([]);
      expect(parseAllowedRecipientsEnv(null)).toEqual([]);
      expect(parseAllowedRecipientsEnv("")).toEqual([]);
      expect(parseAllowedRecipientsEnv("   ")).toEqual([]);
    });

    it("parses, trims, lowercases, and deduplicates emails", () => {
      const input = "  Alice@Example.com , bob@example.COM,   alice@example.com  ";
      expect(parseAllowedRecipientsEnv(input)).toEqual([
        "alice@example.com",
        "bob@example.com",
      ]);
    });

    it("ignores invalid email addresses and empty items between commas", () => {
      const input = "valid@example.com, not-an-email, , @missing-user.com, foo@bar.org, trailing-comma,";
      expect(parseAllowedRecipientsEnv(input)).toEqual([
        "valid@example.com",
        "foo@bar.org",
      ]);
    });
  });

  describe("getDefaultAllowedRecipients() & getDefaultRules()", () => {
    it("returns base recipients when env is unset", () => {
      delete process.env.DEFAULT_ALLOWED_RECIPIENTS;
      const recipients = getDefaultAllowedRecipients();
      expect(recipients).toEqual(["sb-sub@example.com", "kavyansh@gmail.com"]);

      const rules = getDefaultRules();
      expect(rules.autoApproveLimit).toBe(200);
      expect(rules.hardLimit).toBe(5000);
      expect(rules.dailyCap).toBe(1000);
      expect(rules.allowedRecipients).toEqual(["sb-sub@example.com", "kavyansh@gmail.com"]);
    });

    it("merges base recipients with env recipients without duplicates", () => {
      process.env.DEFAULT_ALLOWED_RECIPIENTS = "SB-SUB@example.com, custom-sandbox@example.com, extra@vendor.com";
      const recipients = getDefaultAllowedRecipients();
      expect(recipients).toEqual([
        "sb-sub@example.com",
        "kavyansh@gmail.com",
        "custom-sandbox@example.com",
        "extra@vendor.com",
      ]);
    });
  });

  describe("Database resetAll() integration", () => {
    beforeEach(async () => {
      await setupTestDb();
    });

    afterEach(async () => {
      await teardownTestDb();
    });

    it("resetAll restores default rules with env recipients included", async () => {
      process.env.DEFAULT_ALLOWED_RECIPIENTS = "my-personal-sandbox@example.com";

      // Mutate rules away from defaults
      await saveRules({
        autoApproveLimit: 999,
        hardLimit: 9999,
        dailyCap: 8888,
        allowedRecipients: ["temporary@example.com"],
        blockedActionTypes: ["send_payout"],
      });

      // Verify they mutated
      const mutated = await getRules();
      expect(mutated.allowedRecipients).toEqual(["temporary@example.com"]);

      // Reset
      await resetAll();

      // Verify restored to full defaults
      const restored = await getRules();
      expect(restored.autoApproveLimit).toBe(200);
      expect(restored.hardLimit).toBe(5000);
      expect(restored.dailyCap).toBe(1000);
      expect(restored.allowedRecipients).toEqual([
        "sb-sub@example.com",
        "kavyansh@gmail.com",
        "my-personal-sandbox@example.com",
      ]);
      expect(restored.blockedActionTypes).toEqual([]);
    });
  });
});
