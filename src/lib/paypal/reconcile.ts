import { StoredAction } from "../types";
import { updateAction } from "../db";
import { paypalFetch } from "./client";

export type ReconcileFetchFn = typeof paypalFetch;

export interface ReconcileResult {
  changed: boolean;
  paypalStatus?: string;
}

const TERMINAL_PAYOUT_STATUSES = new Set([
  "SUCCESS",
  "FAILED",
  "DENIED",
  "RETURNED",
  "BLOCKED",
  "CANCELED",
  "REFUNDED",
]);

const TERMINAL_INVOICE_STATUSES = new Set([
  "PAID",
  "CANCELLED",
  "REFUNDED",
  "MARKED_AS_PAID",
]);

const TERMINAL_REFUND_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
]);

const PAYOUT_FAILURE_STATUSES = new Set([
  "FAILED",
  "DENIED",
  "RETURNED",
  "BLOCKED",
]);

/**
 * Checks whether an action has already reached a terminal state in PayPal.
 */
export function isTerminalStatus(type: StoredAction["type"], status: string | null | undefined): boolean {
  if (!status) return false;
  const upper = status.toUpperCase();
  switch (type) {
    case "send_payout":
      return TERMINAL_PAYOUT_STATUSES.has(upper);
    case "send_invoice":
      return TERMINAL_INVOICE_STATUSES.has(upper);
    case "issue_refund":
      return TERMINAL_REFUND_STATUSES.has(upper);
    default:
      return false;
  }
}

interface PayoutItemResponse {
  transaction_status?: string;
}

interface PayoutBatchResponse {
  batch_header?: {
    batch_status?: string;
  };
  items?: PayoutItemResponse[];
}

interface InvoiceResponse {
  status?: string;
}

interface RefundResponse {
  status?: string;
}

/**
 * Reconciles the latest PayPal status for a single action.
 *
 * Rules:
 * - Only for actions with status "completed", a non-null paypalId, and a non-terminal paypalStatus.
 * - send_payout: GET /v1/payments/payouts/{paypalId}; reads the first item's transaction_status (falls back to batch_header.batch_status).
 *   Maps SUCCESS -> "SUCCESS", others to their name as-is. If FAILED/DENIED/RETURNED/BLOCKED, also sets errorMessage to a short note.
 * - send_invoice: GET /v2/invoicing/invoices/{paypalId}; reads status. Maps PAID -> "PAID", etc.
 * - issue_refund: GET /v2/payments/refunds/{paypalId}; reads status.
 * - If the new status differs from the stored one, updates the action and returns changed: true.
 * - Never throws: catches errors, console.warns a short message (no secrets/tokens), and returns changed: false.
 */
export async function reconcileAction(
  action: StoredAction,
  fetchFn: ReconcileFetchFn = paypalFetch
): Promise<ReconcileResult> {
  // Candidate check: status must be "completed", paypalId present, non-terminal paypalStatus
  if (action.status !== "completed" || !action.paypalId) {
    return { changed: false };
  }

  if (isTerminalStatus(action.type, action.paypalStatus)) {
    return { changed: false, paypalStatus: action.paypalStatus ?? undefined };
  }

  try {
    let newStatus: string | undefined;
    let errorMessage: string | null | undefined;

    switch (action.type) {
      case "send_payout": {
        const data = await fetchFn<PayoutBatchResponse>(`/v1/payments/payouts/${action.paypalId}`);
        const firstItem = data?.items?.[0];
        const rawStatus = firstItem?.transaction_status || data?.batch_header?.batch_status;

        if (rawStatus) {
          const upper = rawStatus.toUpperCase();
          newStatus = upper === "SUCCESS" ? "SUCCESS" : rawStatus;

          if (PAYOUT_FAILURE_STATUSES.has(upper)) {
            errorMessage = `Payout item ${upper.toLowerCase()}`;
          }
        }
        break;
      }

      case "send_invoice": {
        const data = await fetchFn<InvoiceResponse>(`/v2/invoicing/invoices/${action.paypalId}`);
        if (data?.status) {
          newStatus = data.status.toUpperCase() === "PAID" ? "PAID" : data.status;
        }
        break;
      }

      case "issue_refund": {
        const data = await fetchFn<RefundResponse>(`/v2/payments/refunds/${action.paypalId}`);
        if (data?.status) {
          newStatus = data.status.toUpperCase() === "COMPLETED" ? "COMPLETED" : data.status;
        }
        break;
      }
    }

    if (!newStatus || newStatus === action.paypalStatus) {
      return { changed: false, paypalStatus: action.paypalStatus ?? undefined };
    }

    await updateAction(action.id, {
      paypalStatus: newStatus,
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    });

    return {
      changed: true,
      paypalStatus: newStatus,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reconcileAction] Failed to poll status for action ${action.id}: ${msg}`);
    return { changed: false };
  }
}
