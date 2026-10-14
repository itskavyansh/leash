import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { applyWebhookEvent, verifyWebhook, WebhookEventPayload, WebhookFetchFn } from "./webhook";
import { getDb, getAction, insertAction, resetDb } from "../db";

describe("PayPal Webhook Verification & Status Reconciliation", () => {
  beforeEach(() => {
    process.env.LEASH_DB_PATH = ":memory:";
    resetDb();
    getDb(":memory:");
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SKIP_VERIFY;
    delete process.env.PAYPAL_WEBHOOK_ID;
  });

  describe("verifyWebhook()", () => {
    it("returns true when WEBHOOK_SKIP_VERIFY is 'true'", async () => {
      process.env.WEBHOOK_SKIP_VERIFY = "true";
      const res = await verifyWebhook({}, "{}");
      expect(res).toBe(true);
    });

    it("throws clear error when PAYPAL_WEBHOOK_ID is missing and WEBHOOK_SKIP_VERIFY is not true", async () => {
      process.env.WEBHOOK_SKIP_VERIFY = "false";
      delete process.env.PAYPAL_WEBHOOK_ID;

      await expect(verifyWebhook({}, "{}")).rejects.toThrow(
        "Missing required environment variable PAYPAL_WEBHOOK_ID"
      );
    });

    it("returns false if any required signature header is missing", async () => {
      process.env.WEBHOOK_SKIP_VERIFY = "false";
      process.env.PAYPAL_WEBHOOK_ID = "WH-12345";

      const headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
        // missing transmission-id, sig, time
      };

      const res = await verifyWebhook(headers, "{}");
      expect(res).toBe(false);
    });

    it("calls PayPal verification endpoint with headers and raw JSON body and returns true on SUCCESS", async () => {
      process.env.WEBHOOK_SKIP_VERIFY = "false";
      process.env.PAYPAL_WEBHOOK_ID = "WH-999";

      const headers = {
        "PAYPAL-AUTH-ALGO": "SHA256withRSA",
        "PayPal-Cert-Url": "https://api.sandbox.paypal.com/cert.pem",
        "paypal-transmission-id": "trans-1",
        "paypal-transmission-sig": "sig-abc",
        "paypal-transmission-time": "2026-10-14T10:00:00Z",
      };

      const mockFetch: WebhookFetchFn = vi.fn().mockResolvedValue({
        verification_status: "SUCCESS",
      });

      const res = await verifyWebhook(headers, '{"event_type":"TEST"}', mockFetch);

      expect(res).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/v1/notifications/verify-webhook-signature",
        expect.objectContaining({
          method: "POST",
          body: {
            auth_algo: "SHA256withRSA",
            cert_url: "https://api.sandbox.paypal.com/cert.pem",
            transmission_id: "trans-1",
            transmission_sig: "sig-abc",
            transmission_time: "2026-10-14T10:00:00Z",
            webhook_id: "WH-999",
            webhook_event: { event_type: "TEST" },
          },
        })
      );
    });

    it("returns false when PayPal verification endpoint returns FAILURE", async () => {
      process.env.WEBHOOK_SKIP_VERIFY = "false";
      process.env.PAYPAL_WEBHOOK_ID = "WH-999";

      const headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
        "paypal-transmission-id": "trans-1",
        "paypal-transmission-sig": "sig-bad",
        "paypal-transmission-time": "2026-10-14T10:00:00Z",
      };

      const mockFetch: WebhookFetchFn = vi.fn().mockResolvedValue({
        verification_status: "FAILURE",
      });

      const res = await verifyWebhook(headers, "{}", mockFetch);
      expect(res).toBe(false);
    });

    it("ignores WEBHOOK_SKIP_VERIFY in production and warns", async () => {
      const origEnv = process.env.NODE_ENV;
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      try {
        (process.env as Record<string, string | undefined>).NODE_ENV = "production";
        process.env.WEBHOOK_SKIP_VERIFY = "true";
        delete process.env.PAYPAL_WEBHOOK_ID;

        // In production, WEBHOOK_SKIP_VERIFY should be ignored and missing PAYPAL_WEBHOOK_ID should throw
        await expect(verifyWebhook({}, "{}")).rejects.toThrow(
          "Missing required environment variable PAYPAL_WEBHOOK_ID"
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("WEBHOOK_SKIP_VERIFY=true was ignored")
        );
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = origEnv;
        warnSpy.mockRestore();
      }
    });
  });

  describe("applyWebhookEvent()", () => {
    it("does NOT record unhandled or unknown events into processed_events so retries can succeed", () => {
      const unhandledEvent: WebhookEventPayload = {
        id: "EV-UNHANDLED-1",
        event_type: "CUSTOM.UNKNOWN.EVENT",
        resource: { id: "123" },
      };

      const res1 = applyWebhookEvent(unhandledEvent);
      expect(res1.handled).toBe(false);

      // Verify that event is NOT recorded as duplicate when called again
      const res2 = applyWebhookEvent(unhandledEvent);
      expect(res2.handled).toBe(false);
      expect(res2.note).not.toBe("duplicate");

      // Now test unmatched action
      const unmatchedEvent: WebhookEventPayload = {
        id: "EV-UNMATCHED-1",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource: { payout_batch_id: "BATCH-LATER-INSERTED" },
      };

      const res3 = applyWebhookEvent(unmatchedEvent);
      expect(res3.handled).toBe(false);
      expect(res3.note).toContain("no_action");

      // Insert action later and retry the same event id!
      insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Late batch",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-LATER-INSERTED",
        paypalStatus: "PENDING",
      });

      const res4 = applyWebhookEvent(unmatchedEvent);
      expect(res4.handled).toBe(true);
      expect(res4.note).not.toBe("duplicate");
    });

    it("updates PAYMENT.PAYOUTS-ITEM.SUCCEEDED to SUCCESS", () => {
      const action = insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-100",
        paypalStatus: "PENDING",
      });

      const event: WebhookEventPayload = {
        id: "EV-001",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource: {
          payout_batch_id: "BATCH-100",
          transaction_status: "SUCCESS",
        },
      };

      const result = applyWebhookEvent(event);
      expect(result.handled).toBe(true);
      expect(result.actionId).toBe(action.id);

      const inDb = getAction(action.id);
      expect(inDb?.paypalStatus).toBe("SUCCESS");
    });

    it("updates PAYMENT.PAYOUTS-ITEM.FAILED to FAILED and adds errorMessage", () => {
      const action = insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Milestone",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-101",
        paypalStatus: "PENDING",
      });

      const event: WebhookEventPayload = {
        id: "EV-002",
        event_type: "PAYMENT.PAYOUTS-ITEM.FAILED",
        resource: {
          payout_batch_id: "BATCH-101",
        },
      };

      const result = applyWebhookEvent(event);
      expect(result.handled).toBe(true);

      const inDb = getAction(action.id);
      expect(inDb?.paypalStatus).toBe("FAILED");
      expect(inDb?.errorMessage).toContain("Payout item failed");
    });

    it("updates PAYMENT.PAYOUTSBATCH.SUCCESS to SUCCESS", () => {
      const action = insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Batch",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-200",
        paypalStatus: "PENDING",
      });

      const event: WebhookEventPayload = {
        id: "EV-003",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
        resource: {
          batch_header: {
            payout_batch_id: "BATCH-200",
          },
        },
      };

      const result = applyWebhookEvent(event);
      expect(result.handled).toBe(true);

      const inDb = getAction(action.id);
      expect(inDb?.paypalStatus).toBe("SUCCESS");
    });

    it("updates INVOICING.INVOICE.PAID to PAID (matching resource.invoice.id or resource.id)", () => {
      const action1 = insertAction({
        type: "send_invoice",
        amount: 850,
        currency: "USD",
        recipient: "client@example.com",
        description: "Invoice 1",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "INV-1",
        paypalStatus: "SENT",
      });

      const action2 = insertAction({
        type: "send_invoice",
        amount: 250,
        currency: "USD",
        recipient: "client2@example.com",
        description: "Invoice 2",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "INV-2",
        paypalStatus: "SENT",
      });

      // event 1 uses resource.invoice.id
      const res1 = applyWebhookEvent({
        id: "EV-INV-1",
        event_type: "INVOICING.INVOICE.PAID",
        resource: {
          invoice: { id: "INV-1" },
        },
      });
      expect(res1.handled).toBe(true);
      expect(getAction(action1.id)?.paypalStatus).toBe("PAID");

      // event 2 uses fallback resource.id
      const res2 = applyWebhookEvent({
        id: "EV-INV-2",
        event_type: "INVOICING.INVOICE.CANCELLED",
        resource: {
          id: "INV-2",
        },
      });
      expect(res2.handled).toBe(true);
      expect(getAction(action2.id)?.paypalStatus).toBe("CANCELLED");
    });

    it("updates PAYMENT.CAPTURE.REFUNDED to COMPLETED", () => {
      const action = insertAction({
        type: "issue_refund",
        amount: 30,
        currency: "USD",
        recipient: "buyer@example.com",
        description: "Refund",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "REFUND-999",
        paypalStatus: "PENDING",
      });

      const res = applyWebhookEvent({
        id: "EV-REF-1",
        event_type: "PAYMENT.CAPTURE.REFUNDED",
        resource: {
          id: "REFUND-999",
        },
      });

      expect(res.handled).toBe(true);
      expect(getAction(action.id)?.paypalStatus).toBe("COMPLETED");
    });

    it("returns handled: false for unknown event types", () => {
      const res = applyWebhookEvent({
        id: "EV-UNKNOWN",
        event_type: "CUSTOM.UNKNOWN.EVENT",
        resource: { id: "123" },
      });
      expect(res.handled).toBe(false);
      expect(res.note).toContain("unhandled");
    });

    it("returns handled: false when no action matches the paypalId", () => {
      const res = applyWebhookEvent({
        id: "EV-NO-MATCH",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource: { payout_batch_id: "BATCH-DOES-NOT-EXIST" },
      });
      expect(res.handled).toBe(false);
      expect(res.note).toContain("no_action");
    });

    it("ignores duplicate event IDs (idempotency)", () => {
      const action = insertAction({
        type: "send_payout",
        amount: 50,
        currency: "USD",
        recipient: "sb-sub@example.com",
        description: "Batch",
        status: "completed",
        decision: "approve",
        reason: "ok",
        ruleFired: "within_limits",
        paypalId: "BATCH-300",
        paypalStatus: "PENDING",
      });

      const event: WebhookEventPayload = {
        id: "EV-DUP-1",
        event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
        resource: { payout_batch_id: "BATCH-300" },
      };

      const first = applyWebhookEvent(event);
      expect(first.handled).toBe(true);
      expect(getAction(action.id)?.paypalStatus).toBe("SUCCESS");

      // Set DB status back to PENDING manually to test idempotency
      const second = applyWebhookEvent(event);
      expect(second.handled).toBe(true);
      expect(second.note).toBe("duplicate");
    });

    it("does not throw on malformed or empty resource shapes", () => {
      expect(() =>
        applyWebhookEvent({
          id: "EV-MALFORMED-1",
          event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
          resource: null as unknown as Record<string, unknown>,
        })
      ).not.toThrow();

      expect(() =>
        applyWebhookEvent({
          id: "EV-MALFORMED-2",
          event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
          resource: {},
        })
      ).not.toThrow();
    });
  });
});
