import { paypalFetch } from "./client";
import { StoredAction } from "../types";

export interface ExecutionResult {
  paypalId: string;
  paypalStatus: string;
}

interface InvoiceCreateResponse {
  href?: string;
}

interface InvoiceDetail {
  id: string;
  status: string;
}

interface PayoutCreateResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
  };
}

interface RefundResponse {
  id: string;
  status: string;
}

/**
 * Creates a draft invoice, sends it to the recipient, and fetches its final status.
 */
export async function createAndSendInvoice(
  action: StoredAction,
  requestId: string
): Promise<ExecutionResult> {
  // Step 1: Create Draft Invoice
  const createReqId = `${requestId}-create`;
  const created = await paypalFetch<InvoiceCreateResponse>(
    "/v2/invoicing/invoices",
    {
      method: "POST",
      requestId: createReqId,
      body: {
        detail: {
          currency_code: "USD",
          payment_term: {
            term_type: "DUE_ON_RECEIPT",
          },
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: action.recipient,
            },
          },
        ],
        items: [
          {
            name: action.description,
            quantity: "1",
            unit_amount: {
              currency_code: "USD",
              value: action.amount.toFixed(2),
            },
            unit_of_measure: "QUANTITY",
          },
        ],
      },
    }
  );

  const href = created?.href;
  if (!href) {
    throw new Error(
      `Invoice creation did not return href: ${JSON.stringify(created)}`
    );
  }

  const invoiceId = href.split("/").pop();
  if (!invoiceId) {
    throw new Error(`Could not extract invoice ID from href: ${href}`);
  }

  // Step 2: Send Invoice
  const sendReqId = `${requestId}-send`;
  await paypalFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    requestId: sendReqId,
    body: {
      send_to_recipient: true,
      send_to_invoicer: false,
    },
  });

  // Step 3: GET Invoice
  const invoice = await paypalFetch<InvoiceDetail>(
    `/v2/invoicing/invoices/${invoiceId}`,
    {
      method: "GET",
    }
  );

  if (!invoice) {
    throw new Error(`Failed to fetch created invoice ${invoiceId}`);
  }

  return {
    paypalId: invoice.id,
    paypalStatus: invoice.status,
  };
}

/**
 * Sends a single payout batch item via PayPal Payouts v1.
 */
export async function sendPayout(
  action: StoredAction,
  requestId: string
): Promise<ExecutionResult> {
  const senderBatchId = `leash-${requestId.slice(0, 20)}-${Date.now()}`;
  const senderItemId = `item-${requestId.slice(0, 20)}`;

  const result = await paypalFetch<PayoutCreateResponse>(
    "/v1/payments/payouts",
    {
      method: "POST",
      requestId,
      body: {
        sender_batch_header: {
          sender_batch_id: senderBatchId,
          email_subject: "Payout from Leash",
          email_message: action.description,
        },
        items: [
          {
            recipient_type: "EMAIL",
            receiver: action.recipient,
            amount: {
              value: action.amount.toFixed(2),
              currency: "USD",
            },
            note: action.description,
            sender_item_id: senderItemId,
          },
        ],
      },
    }
  );

  if (!result?.batch_header?.payout_batch_id) {
    throw new Error(`Payout creation returned unexpected response: ${JSON.stringify(result)}`);
  }

  return {
    paypalId: result.batch_header.payout_batch_id,
    paypalStatus: result.batch_header.batch_status,
  };
}

/**
 * Issues a partial or full refund on a captured payment.
 */
export async function issueRefund(
  action: StoredAction,
  requestId: string
): Promise<ExecutionResult> {
  if (!action.reference) {
    throw new Error("Missing required reference (capture ID) for refund.");
  }

  const result = await paypalFetch<RefundResponse>(
    `/v2/payments/captures/${action.reference}/refund`,
    {
      method: "POST",
      requestId,
      body: {
        amount: {
          value: action.amount.toFixed(2),
          currency_code: "USD",
        },
        note_to_payer: action.description,
      },
    }
  );

  if (!result?.id) {
    throw new Error(`Refund returned unexpected response: ${JSON.stringify(result)}`);
  }

  return {
    paypalId: result.id,
    paypalStatus: result.status,
  };
}
