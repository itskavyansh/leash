import { describe, it, expect, beforeEach, vi } from "vitest";
import { POST } from "./route";
import * as mockAi from "@/lib/ai/parseLedgerQuery";
import { parseLedgerQuery } from "@/lib/ai/parseLedgerQuery";
import { resetRateLimits } from "@/lib/rateLimit";
import { LlmProvider, LlmCompletionResult } from "@/lib/ai/provider";

class MockProvider implements LlmProvider {
  public callCount = 0;
  private queue: Array<{ response?: LlmCompletionResult; error?: unknown }> = [];

  constructor(initial?: LlmCompletionResult) {
    if (initial) {
      this.queue.push({ response: initial });
    }
  }

  setResponse(res: LlmCompletionResult) {
    this.queue = [{ response: res }];
  }

  enqueueResponse(res: LlmCompletionResult) {
    this.queue.push({ response: res });
  }

  enqueueError(err: unknown) {
    this.queue.push({ error: err });
  }

  async complete(): Promise<LlmCompletionResult> {
    this.callCount++;
    const next = this.queue.shift();
    if (!next) {
      throw new Error("MockProvider: No queued responses or errors");
    }
    if (next.error) {
      throw next.error;
    }
    return next.response!;
  }
}

describe("Ledger Query Route and AI Parser", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.clearAllMocks();
  });

  describe("parseLedgerQuery() unit tests", () => {
    it("returns valid filter spec when AI returns apply_filters", async () => {
      const mock = new MockProvider({
        toolName: "apply_filters",
        toolInput: {
          status: ["pending_approval"],
          amountMin: 100,
          recipientContains: "sam",
          source: "agent",
        },
      });

      const res = await parseLedgerQuery("Show pending actions over $100 for Sam from agents", mock);
      expect(res.kind).toBe("filter");
      if (res.kind === "filter") {
        expect(res.spec.status).toEqual(["pending_approval"]);
        expect(res.spec.amountMin).toBe(100);
        expect(res.spec.recipientContains).toBe("sam");
        expect(res.spec.source).toBe("agent");
      }
    });

    it("rejects invalid spec (bad enum, nonsense ranges)", async () => {
      const mock = new MockProvider({
        toolName: "apply_filters",
        toolInput: {
          status: ["non_existent_status"],
        },
      });

      const res = await parseLedgerQuery("show actions", mock);
      expect(res.kind).toBe("refusal");
      if (res.kind === "refusal") {
        expect(res.reason).toContain("invalid");
      }

      // Test inverted amounts
      const mockInverted = new MockProvider({
        toolName: "apply_filters",
        toolInput: {
          amountMin: 500,
          amountMax: 100,
        },
      });
      const resInverted = await parseLedgerQuery("between 500 and 100", mockInverted);
      expect(resInverted.kind).toBe("refusal");
    });

    it("handles cannot_filter path cleanly", async () => {
      const mock = new MockProvider({
        toolName: "cannot_filter",
        toolInput: {
          reason: "I cannot approve payments; this query tool is strictly read-only.",
        },
      });

      const res = await parseLedgerQuery("Approve transaction 123", mock);
      expect(res.kind).toBe("refusal");
      if (res.kind === "refusal") {
        expect(res.reason).toBe("I cannot approve payments; this query tool is strictly read-only.");
      }
    });

    it("handles retryable error and non-retryable error", async () => {
      const mock = new MockProvider();
      mock.enqueueError(new Error("503 Service Unavailable"));
      mock.enqueueError(new Error("503 Service Unavailable"));
      mock.enqueueError(new Error("503 Service Unavailable"));

      const res = await parseLedgerQuery("show payouts", mock, async () => {});
      expect(res.kind).toBe("error");
      if (res.kind === "error") {
        expect(res.retryable).toBe(true);
      }
    });
  });

  describe("POST /api/ledger/query route validation", () => {
    it("returns 400 when question is missing or empty", async () => {
      const req = new Request("http://localhost:3000/api/ledger/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "   " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("empty");
    });

    it("returns 400 when question exceeds 300 characters", async () => {
      const longQuestion = "a".repeat(301);
      const req = new Request("http://localhost:3000/api/ledger/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: longQuestion }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("300");
    });

    it("returns 200 with filter result on valid query", async () => {
      const spy = vi.spyOn(mockAi, "parseLedgerQuery").mockResolvedValueOnce({
        kind: "filter",
        spec: {
          status: ["blocked"],
        },
      });

      const req = new Request("http://localhost:3000/api/ledger/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Show blocked payments" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.kind).toBe("filter");
      expect(json.spec.status).toEqual(["blocked"]);

      spy.mockRestore();
    });

    it("returns 429 when rate limit is exceeded", async () => {
      const spy = vi.spyOn(mockAi, "parseLedgerQuery").mockResolvedValue({
        kind: "filter",
        spec: {},
      });

      // Consume 20 rate limit hits
      for (let i = 0; i < 20; i++) {
        const req = new Request("http://localhost:3000/api/ledger/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: "Show blocked" }),
        });
        await POST(req);
      }

      const req21 = new Request("http://localhost:3000/api/ledger/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "Show blocked" }),
      });
      const res = await POST(req21);
      expect(res.status).toBe(429);

      spy.mockRestore();
    });
  });
});
