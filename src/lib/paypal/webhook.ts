import { paypalFetch } from "./client";
import {
  findActionByPaypalId,
  isEventProcessed,
  recordProcessedEvent,
  updateAction,
} from "../db";

export interface WebhookEventPayload {
  id: string;
  event_type: string;
  resource: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WebhookApplyResult {
  handled: boolean;
  actionId?: string;
  note: string;
}

interface WebhookVerifyResponse {
  verification_status?: string;
}

/**
 * Case-insensitive lookup for headers.
 */
function getHeaderCaseInsensitive(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return val;
    }
  }
  return undefined;
}

export type WebhookFetchFn = <T = unknown>(
  path: string,
  options?: { method?: string; body?: Record<string, unknown>; requestId?: string }
) => Promise<T | null>;

let hasWarnedProdSkip = false;

/**
 * Verifies PayPal webhook signature headers against PayPal's verification endpoint.
 */
export async function verifyWebhook(
  headers: Record<string, string | undefined>,
  rawBody: string,
  fetchFn: WebhookFetchFn = paypalFetch
): Promise<boolean> {
  const isProd = process.env.NODE_ENV === "production";

  if (process.env.WEBHOOK_SKIP_VERIFY === "true") {
    if (isProd) {
      if (!hasWarnedProdSkip) {
        console.warn("⚠️ WEBHOOK_SKIP_VERIFY=true was ignored because NODE_ENV === 'production'. Verifying webhook signature normally.");
        hasWarnedProdSkip = true;
      }
    } else {
      console.warn("⚠️ WEBHOOK_SKIP_VERIFY=true: skipping PayPal webhook signature verification.");
      return true;
    }
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    throw new Error(
      "Missing required environment variable PAYPAL_WEBHOOK_ID. Cannot verify webhook signature."
    );
  }

  const authAlgo = getHeaderCaseInsensitive(headers, "paypal-auth-algo");
  const certUrl = getHeaderCaseInsensitive(headers, "paypal-cert-url");
  const transmissionId = getHeaderCaseInsensitive(headers, "paypal-transmission-id");
  const transmissionSig = getHeaderCaseInsensitive(headers, "paypal-transmission-sig");
  const transmissionTime = getHeaderCaseInsensitive(headers, "paypal-transmission-time");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(rawBody);
  } catch {
    return false;
  }

  try {
    const response = await fetchFn<WebhookVerifyResponse>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: webhookEvent,
        },
      }
    );

    return response?.verification_status === "SUCCESS";
  } catch (err) {
    console.error("PayPal webhook verification error:", err);
    return false;
  }
}

/**
 * Applies a webhook event to local state and updates matching actions.
 * Idempotent via processed_events table: only events that are successfully handled
 * are recorded as processed, so unhandled/unmatched events can be retried.
 */
export function applyWebhookEvent(
  event: WebhookEventPayload
): WebhookApplyResult {
  if (!event || typeof event !== "object" || !event.id) {
    return { handled: false, note: "invalid_event" };
  }

  if (isEventProcessed(event.id)) {
    return { handled: true, note: "duplicate" };
  }

  const { event_type: eventType, resource } = event;
  if (!eventType || !resource || typeof resource !== "object") {
    return { handled: false, note: "malformed_event" };
  }

  // 1. PAYMENT.PAYOUTS-ITEM.*
  if (eventType.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const payoutBatchId =
      typeof resource.payout_batch_id === "string"
        ? resource.payout_batch_id
        : undefined;

    if (!payoutBatchId) {
      return { handled: false, note: "missing_payout_batch_id" };
    }

    const action = findActionByPaypalId(payoutBatchId);
    if (!action) {
      return { handled: false, note: `no_action_for_batch_${payoutBatchId}` };
    }

    if (eventType === "PAYMENT.PAYOUTS-ITEM.SUCCEEDED") {
      updateAction(action.id, { paypalStatus: "SUCCESS" });
      recordProcessedEvent(event.id);
      return { handled: true, actionId: action.id, note: "payout_item_succeeded" };
    }

    const failureMatch = eventType.match(
      /^PAYMENT\.PAYOUTS-ITEM\.(FAILED|DENIED|RETURNED|BLOCKED|CANCELED|HELD|REFUNDED)$/
    );

    if (failureMatch) {
      const statusName = failureMatch[1];
      const needsErrorMessage = [
        "FAILED",
        "DENIED",
        "RETURNED",
        "BLOCKED",
        "CANCELED",
      ].includes(statusName);

      const errorNote = needsErrorMessage
        ? `Payout item ${statusName.toLowerCase()}`
        : undefined;

      updateAction(action.id, {
        paypalStatus: statusName,
        ...(errorNote ? { errorMessage: errorNote } : {}),
      });

      recordProcessedEvent(event.id);
      return { handled: true, actionId: action.id, note: `payout_item_${statusName.toLowerCase()}` };
    }
  }

  // 2. PAYMENT.PAYOUTSBATCH.SUCCESS / .DENIED
  if (eventType === "PAYMENT.PAYOUTSBATCH.SUCCESS" || eventType === "PAYMENT.PAYOUTSBATCH.DENIED") {
    const batchHeader = resource.batch_header as Record<string, unknown> | undefined;
    const batchId =
      typeof batchHeader?.payout_batch_id === "string"
        ? batchHeader.payout_batch_id
        : typeof resource.payout_batch_id === "string"
        ? resource.payout_batch_id
        : undefined;

    if (!batchId) {
      return { handled: false, note: "missing_batch_id" };
    }

    const action = findActionByPaypalId(batchId);
    if (!action) {
      return { handled: false, note: `no_action_for_batch_${batchId}` };
    }

    const status = eventType === "PAYMENT.PAYOUTSBATCH.SUCCESS" ? "SUCCESS" : "DENIED";
    updateAction(action.id, { paypalStatus: status });
    recordProcessedEvent(event.id);
    return { handled: true, actionId: action.id, note: `payout_batch_${status.toLowerCase()}` };
  }

  // 3. INVOICING.INVOICE.*
  if (
    eventType === "INVOICING.INVOICE.PAID" ||
    eventType === "INVOICING.INVOICE.CANCELLED" ||
    eventType === "INVOICING.INVOICE.REFUNDED"
  ) {
    const invoiceObj = resource.invoice as Record<string, unknown> | undefined;
    const invoiceId =
      typeof invoiceObj?.id === "string"
        ? invoiceObj.id
        : typeof resource.id === "string"
        ? resource.id
        : undefined;

    if (!invoiceId) {
      return { handled: false, note: "missing_invoice_id" };
    }

    const action = findActionByPaypalId(invoiceId);
    if (!action) {
      return { handled: false, note: `no_action_for_invoice_${invoiceId}` };
    }

    let status = "PAID";
    if (eventType === "INVOICING.INVOICE.CANCELLED") status = "CANCELLED";
    if (eventType === "INVOICING.INVOICE.REFUNDED") status = "REFUNDED";

    updateAction(action.id, { paypalStatus: status });
    recordProcessedEvent(event.id);
    return { handled: true, actionId: action.id, note: `invoice_${status.toLowerCase()}` };
  }

  // 4. PAYMENT.CAPTURE.REFUNDED
  if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
    const refundId = typeof resource.id === "string" ? resource.id : undefined;
    if (!refundId) {
      return { handled: false, note: "missing_refund_id" };
    }

    const action = findActionByPaypalId(refundId);
    if (!action) {
      return { handled: false, note: `no_action_for_refund_${refundId}` };
    }

    updateAction(action.id, { paypalStatus: "COMPLETED" });
    recordProcessedEvent(event.id);
    return { handled: true, actionId: action.id, note: "refund_completed" };
  }

  return { handled: false, note: `unhandled_event_${eventType}` };
}
