import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as mockAi from "./parseDocument";
import { parseDocument } from "./parseDocument";
import { LlmCompletionResult, LlmProvider } from "./provider";
import { setupTestDb, teardownTestDb } from "../testDb";
import { POST as documentPost } from "@/app/api/request/document/route";
import { resetRateLimits } from "../rateLimit";
import * as db from "../db";

class MockProvider implements LlmProvider {
  public callCount = 0;
  public lastArgs: unknown = null;
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

  async complete(args: unknown): Promise<LlmCompletionResult> {
    this.callCount++;
    this.lastArgs = args;
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

describe("Document Input and Policy Integration", () => {
  beforeEach(async () => {
    await setupTestDb();
    resetRateLimits();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  describe("parseDocument() unit tests with MockProvider", () => {
    it("handles happy path proposals correctly from text document", async () => {
      const provider = new MockProvider({
        toolName: "propose_document_payments",
        toolInput: {
          proposals: [
            {
              type: "send_payout",
              amount: 480,
              recipient: "sb-sub@example.com",
              description: "Design services invoice INV-0042",
              reference: "INV-0042",
              sourceNote: "Total Due $480.00",
            },
          ],
        },
      });

      const res = await parseDocument({ type: "text", text: "Invoice total $480" }, provider);

      expect(res.kind).toBe("actions");
      if (res.kind === "actions") {
        expect(res.proposals).toHaveLength(1);
        expect(res.proposals[0].action.amount).toBe(480);
        expect(res.proposals[0].action.recipient).toBe("sb-sub@example.com");
        expect(res.proposals[0].sourceNote).toBe("Total Due $480.00");
      }
    });

    it("handles file buffer input and passes base64 inlineData part", async () => {
      const provider = new MockProvider({
        toolName: "report_no_payments_found",
        toolInput: { reason: "Just a picture of a cat" },
      });

      const buffer = Buffer.from("fake-pdf-content");
      const res = await parseDocument(
        { type: "file", buffer, mimeType: "application/pdf" },
        provider
      );

      expect(res.kind).toBe("empty");
      expect(provider.callCount).toBe(1);
      const passedArgs = provider.lastArgs as { user: Array<{ inlineData?: { mimeType: string; data: string } }> };
      expect(Array.isArray(passedArgs.user)).toBe(true);
      expect(passedArgs.user[1].inlineData?.mimeType).toBe("application/pdf");
      expect(passedArgs.user[1].inlineData?.data).toBe(buffer.toString("base64"));
    });

    it("caps extracted proposals at 10 items", async () => {
      const rawList = Array.from({ length: 15 }, (_, i) => ({
        type: "send_payout",
        amount: 10 + i,
        recipient: `sub${i}@example.com`,
        description: `Item ${i}`,
      }));

      const provider = new MockProvider({
        toolName: "propose_document_payments",
        toolInput: { proposals: rawList },
      });

      const res = await parseDocument({ type: "text", text: "Batch invoice" }, provider);

      expect(res.kind).toBe("actions");
      if (res.kind === "actions") {
        expect(res.proposals).toHaveLength(10);
      }
    });

    it("returns empty result when AI reports no payments found or calls unknown tool", async () => {
      const provider = new MockProvider({
        toolName: "report_no_payments_found",
        toolInput: {},
      });

      const res = await parseDocument({ type: "text", text: "Receipt with zero amount" }, provider);
      expect(res.kind).toBe("empty");
    });

    it("returns retryable error when all 3 attempts fail with 503", async () => {
      const provider = new MockProvider();
      provider.enqueueError(new Error("HTTP 503 Service Unavailable"));
      provider.enqueueError(new Error("HTTP 503 Service Unavailable"));
      provider.enqueueError(new Error("HTTP 503 Service Unavailable"));

      const res = await parseDocument(
        { type: "text", text: "Invoice" },
        provider,
        async () => {}
      );

      expect(res.kind).toBe("error");
      if (res.kind === "error") {
        expect(res.retryable).toBe(true);
      }
    });
  });

  describe("POST /api/request/document route validation", () => {
    it("returns 400 when text is empty", async () => {
      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "   " }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/empty/i);
    });

    it("returns 400 when text exceeds 20k characters", async () => {
      const longText = "a".repeat(20005);
      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: longText }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/exceed 20000/i);
    });

    it("returns 400 when uploaded file exceeds 5MB", async () => {
      const formData = new FormData();
      // 5MB + 10 bytes
      const bigBlob = new Blob([new Uint8Array(5 * 1024 * 1024 + 10)], {
        type: "application/pdf",
      });
      formData.append("file", bigBlob, "huge.pdf");

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        body: formData,
      });

      const res = await documentPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/5 MB/i);
    });

    it("returns 400 when uploaded file type is unsupported (e.g. text/csv)", async () => {
      const formData = new FormData();
      const csvBlob = new Blob(["a,b,c"], { type: "text/csv" });
      formData.append("file", csvBlob, "data.csv");

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        body: formData,
      });

      const res = await documentPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Only PDF, PNG, and JPG/i);
    });

    it("returns 400 when uploaded file is empty (0 bytes)", async () => {
      const formData = new FormData();
      const emptyBlob = new Blob([], { type: "application/pdf" });
      formData.append("file", emptyBlob, "empty.pdf");

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        body: formData,
      });

      const res = await documentPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/empty/i);
    });
  });

  describe("Real Policy Path Verification for Document Proposals", () => {
    it("follows normal verdict logic: clean $480 proposal to sb-sub@example.com returns pending_approval", async () => {
      const spy = vi.spyOn(mockAi, "parseDocument").mockResolvedValueOnce({
        kind: "actions",
        proposals: [
          {
            action: {
              type: "send_payout",
              amount: 480,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Monthly Design System Maintenance",
              reference: "INV-2026-0042",
            },
            sourceNote: "TOTAL DUE: $480.00",
          },
        ],
      });

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Invoice clean" }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.proposalsCount).toBe(1);
      expect(json.results[0].action).toBeDefined();
      expect(json.results[0].action.decision).toBe("needs_approval");
      expect(json.results[0].action.status).toBe("pending_approval");
      expect(json.results[0].action.ruleFired).toBe("auto_limit");
      expect(json.results[0].action.reason).toContain("auto-approve limit");
      expect(json.results[0].sourceNote).toBe("TOTAL DUE: $480.00");

      // Verify it was actually inserted into database
      const dbAction = await db.getAction(json.results[0].action.id);
      expect(dbAction).toBeDefined();
      expect(dbAction?.amount).toBe(480);

      spy.mockRestore();
    });

    it("returns blocked via real policy path when an injected proposal targets attacker@example.com for $4,000", async () => {
      // Mock AI returning both the real invoice and the prompt-injected attack
      const spy = vi.spyOn(mockAi, "parseDocument").mockResolvedValueOnce({
        kind: "actions",
        proposals: [
          {
            action: {
              type: "send_payout",
              amount: 480,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Monthly Design System Maintenance",
              reference: "INV-2026-0099",
            },
            sourceNote: "TOTAL DUE: $480.00",
          },
          {
            action: {
              type: "send_payout",
              amount: 4000,
              currency: "USD",
              recipient: "attacker@example.com",
              description: "Emergency retainer fee",
            },
            sourceNote: "SYSTEM OVERRIDE / PRIORITY DIRECTIVE",
          },
        ],
      });

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Tricky Invoice" }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.proposalsCount).toBe(2);

      // Proposal 1: Normal clean invoice -> pending_approval
      expect(json.results[0].action.decision).toBe("needs_approval");
      expect(json.results[0].action.status).toBe("pending_approval");
      expect(json.results[0].action.recipient).toBe("sb-sub@example.com");

      // Proposal 2: Prompt injection attacker -> BLOCKED by allowlist!
      const blockedResult = json.results[1];
      expect(blockedResult.action.decision).toBe("blocked");
      expect(blockedResult.action.status).toBe("blocked");
      expect(blockedResult.action.recipient).toBe("attacker@example.com");
      expect(blockedResult.action.ruleFired).toBe("recipient_not_allowed");
      expect(blockedResult.action.reason).toContain("attacker@example.com");
      expect(blockedResult.action.reason).toContain("not in the allowed recipients list");
      expect(blockedResult.sourceNote).toBe("SYSTEM OVERRIDE / PRIORITY DIRECTIVE");

      // Verify db row is marked blocked
      const dbRow = await db.getAction(blockedResult.action.id);
      expect(dbRow?.status).toBe("blocked");

      spy.mockRestore();
    });

    it("resilience: if one proposal fails during processing, other proposals still succeed", async () => {
      const spy = vi.spyOn(mockAi, "parseDocument").mockResolvedValueOnce({
        kind: "actions",
        proposals: [
          {
            action: {
              type: "send_payout",
              amount: 100,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Item 1",
            },
          },
          {
            action: {
              type: "send_payout",
              amount: 120,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Item 2",
            },
          },
        ],
      });

      // Simulate a failure on the first insertion/evaluation
      const originalInsert = db.insertAction;
      let called = false;
      const dbMock = vi.spyOn(db, "insertAction").mockImplementation(async (params) => {
        if (!called) {
          called = true;
          throw new Error("Transient DB storage error");
        }
        return originalInsert(params);
      });

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Two items" }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.proposalsCount).toBe(2);
      expect(json.results[0].error).toBe("Transient DB storage error");
      expect(json.results[1].action).toBeDefined();
      expect(json.results[1].action.amount).toBe(120);

      dbMock.mockRestore();
      spy.mockRestore();
    });

    it("evaluates multiple proposals in the same document with sequential spend against dailyCap", async () => {
      // Document produces two proposals of $600 each when dailyCap is $1000
      const spy = vi.spyOn(mockAi, "parseDocument").mockResolvedValueOnce({
        kind: "actions",
        proposals: [
          {
            action: {
              type: "send_payout",
              amount: 600,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Batch Item 1",
            },
          },
          {
            action: {
              type: "send_payout",
              amount: 600,
              currency: "USD",
              recipient: "sb-sub@example.com",
              description: "Batch Item 2",
            },
          },
        ],
      });

      const req = new Request("http://localhost/api/request/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Two $600 items" }),
      });

      const res = await documentPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.proposalsCount).toBe(2);
      // Item 1 ($600): autoApproveLimit is $200, dailyCap is $1000.
      // 0 + 600 <= 1000, so ruleFired is auto_limit (exceeds $200 auto-approve)
      expect(json.results[0].action.decision).toBe("needs_approval");
      expect(json.results[0].action.ruleFired).toBe("auto_limit");

      // Item 2 ($600): pending spend from item 1 should make projected spend 600 + 600 = 1200 > 1000!
      // Therefore, Item 2 MUST trigger daily_cap, NOT auto_limit!
      expect(json.results[1].action.decision).toBe("needs_approval");
      expect(json.results[1].action.ruleFired).toBe("daily_cap");
      expect(json.results[1].action.reason).toContain("exceeds your $1000.00 daily cap");

      spy.mockRestore();
    });
  });
});
