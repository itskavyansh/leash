import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "./route";
import { setupTestDb, teardownTestDb } from "@/lib/testDb";
import { insertAction, updateAction } from "@/lib/db";
import { resetRateLimits } from "@/lib/rateLimit";
import * as wording from "@/lib/briefWording";
import { validateBriefWording } from "@/lib/briefWording";
import { BriefFacts } from "@/lib/briefFacts";
import { LlmProvider, LlmCompletionResult } from "@/lib/ai/provider";

class MockProvider implements LlmProvider {
  constructor(private response: LlmCompletionResult) {}
  async complete(): Promise<LlmCompletionResult> {
    return this.response;
  }
}

const sampleFacts: BriefFacts = {
  actionId: "act-123",
  amount: 450,
  type: "send_payout",
  isFirstPaymentToRecipient: true,
  priorPaymentCount: 0,
  priorTotal: 0,
  averagePayout: 150,
  multipleOfAverage: 3,
  spentToday: 600,
  projectedSpend: 1050,
  dailyCap: 1000,
  wouldExceedCap: true,
  ruleFired: "daily_cap",
  sourceType: "typed",
};

describe("Approval Brief Route & Wording Validation", () => {
  beforeEach(async () => {
    await setupTestDb();
    resetRateLimits();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe("validateBriefWording() pure function", () => {
    it("accepts valid sentence containing known numbers from facts", () => {
      const sentence = "First payment to this recipient for $450; projected spend of $1,050 exceeds your $1,000 cap.";
      expect(validateBriefWording(sentence, sampleFacts)).toBe(true);
    });

    it("rejects sentence with hallucinated or invented numbers", () => {
      const sentence = "First payment of $450; recipient had 99 disputes in the past year.";
      expect(validateBriefWording(sentence, sampleFacts)).toBe(false);
    });

    it("rejects sentence containing URL", () => {
      const sentence = "First payment of $450. Verify details at https://example.com/check";
      expect(validateBriefWording(sentence, sampleFacts)).toBe(false);
    });

    it("rejects sentence containing email address", () => {
      const sentence = "First payment of $450 sent to user@example.com for processing.";
      expect(validateBriefWording(sentence, sampleFacts)).toBe(false);
    });

    it("rejects multiline output or over 160 characters", () => {
      const multi = "Line 1 $450\nLine 2";
      expect(validateBriefWording(multi, sampleFacts)).toBe(false);

      const long = "A".repeat(161);
      expect(validateBriefWording(long, sampleFacts)).toBe(false);
    });
  });

  describe("generateApprovalBrief() with MockProvider", () => {
    it("returns source ai when LLM returns valid wording", async () => {
      const mock = new MockProvider({
        toolName: "word_brief",
        toolInput: {
          sentence: "First payment of $450 to this recipient, 3x your average payout.",
        },
      });

      const res = await wording.generateApprovalBrief(sampleFacts, mock);
      expect(res.source).toBe("ai");
      expect(res.text).toBe("First payment of $450 to this recipient, 3x your average payout.");
    });

    it("falls back to deterministic template when LLM hallucinates numbers or errors", async () => {
      const mock = new MockProvider({
        toolName: "word_brief",
        toolInput: {
          sentence: "Payment of $450 with 888 fake points.",
        },
      });

      const res = await wording.generateApprovalBrief(sampleFacts, mock);
      expect(res.source).toBe("template");
      expect(res.text).toContain("First payment to this recipient");
    });
  });

  describe("GET /api/actions/[id]/brief route", () => {
    it("returns 404 when action does not exist", async () => {
      const req = new Request("http://localhost:3000/api/actions/non-existent-id/brief");
      const res = await GET(req, { params: Promise.resolve({ id: "non-existent-id" }) });
      expect(res.status).toBe(404);
    });

    it("returns 404 when action is not pending_approval (e.g. approved)", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "done payout",
        status: "approved",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
      });

      const req = new Request(`http://localhost:3000/api/actions/${action.id}/brief`);
      const res = await GET(req, { params: Promise.resolve({ id: action.id }) });
      expect(res.status).toBe(404);
    });

    it("returns brief for pending_approval action and caches result", async () => {
      const action = await insertAction({
        type: "send_payout",
        amount: 450,
        currency: "USD",
        recipient: "new@example.com",
        description: "large payout",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "auto limit",
        ruleFired: "auto_limit",
      });

      const req1 = new Request(`http://localhost:3000/api/actions/${action.id}/brief`);
      const res1 = await GET(req1, { params: Promise.resolve({ id: action.id }) });
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.text).toBeDefined();
      expect(["ai", "template"]).toContain(json1.source);

      // Call again: should return cached result
      const req2 = new Request(`http://localhost:3000/api/actions/${action.id}/brief`);
      const res2 = await GET(req2, { params: Promise.resolve({ id: action.id }) });
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.text).toBe(json1.text);
    });
  });
});

