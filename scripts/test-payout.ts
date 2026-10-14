/**
 * scripts/test-payout.ts
 *
 * Exercise the PayPal Payouts v1 API:
 *   1. Create a batch payout (5.00 USD to sb-sub@example.com).
 *   2. GET the batch and print batch_status + item transaction_status.
 *
 * Usage:  npm run test:payout
 *
 * NOTE: Payouts must be explicitly enabled on the sandbox app in the
 *       PayPal Developer Dashboard (App → Features → Payouts → Request).
 *       If not enabled, a clear diagnostic message is printed.
 */

import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface PayoutLink {
  href: string;
  rel: string;
  method?: string;
}

interface PayoutCreateResponse {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
  };
  links?: PayoutLink[];
}

interface PayoutItemDetail {
  payout_item_id: string;
  transaction_status: string;
  payout_item: {
    receiver: string;
    amount: {
      currency: string;
      value: string;
    };
  };
  errors?: {
    name?: string;
    message?: string;
  };
}

interface PayoutBatchDetail {
  batch_header: {
    payout_batch_id: string;
    batch_status: string;
    amount?: {
      currency: string;
      value: string;
    };
  };
  items?: PayoutItemDetail[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a paypalFetch error looks like a Payouts-not-enabled error
 * and prints an actionable diagnostic if so.
 */
interface PayoutErrorDetailItem {
  issue?: string;
  description?: string;
  [key: string]: unknown;
}

interface ParsedPayPalError {
  status: string;
  debugId: string;
  rawBody: string;
  bodyObj?: {
    name?: string;
    message?: string;
    details?: PayoutErrorDetailItem[];
    links?: unknown[];
    [key: string]: unknown;
  };
}

function parsePayPalError(err: unknown): ParsedPayPalError | null {
  if (!(err instanceof Error)) return null;

  const raw = err.message;
  const httpMatch = raw.match(/HTTP (\d+)/);
  const debugMatch = raw.match(/debug_id=([^\s|]+)/);

  const bodyMarker = "body=";
  const bodyIdx = raw.indexOf(bodyMarker);
  const rawBody = bodyIdx !== -1 ? raw.slice(bodyIdx + bodyMarker.length) : "";

  let bodyObj: ParsedPayPalError["bodyObj"];
  if (rawBody) {
    try {
      bodyObj = JSON.parse(rawBody);
    } catch {
      // not JSON
    }
  }

  return {
    status: httpMatch?.[1] ?? "unknown",
    debugId: debugMatch?.[1] ?? "unknown",
    rawBody,
    bodyObj,
  };
}

function isPermissionOrAuthorizationError(parsed: ParsedPayPalError): boolean {
  const name = (parsed.bodyObj?.name ?? "").toUpperCase();
  if (name.includes("AUTHORIZATION") || name.includes("NOT_AUTHORIZED") || name.includes("PERMISSION")) {
    return true;
  }

  const details = parsed.bodyObj?.details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const issue = (d.issue ?? "").toUpperCase();
      const desc = (d.description ?? "").toUpperCase();
      if (
        issue.includes("PERMISSION") ||
        issue.includes("NOT_AUTHORIZED") ||
        issue.includes("AUTHORIZATION") ||
        desc.includes("PERMISSION") ||
        desc.includes("NOT_AUTHORIZED") ||
        desc.includes("AUTHORIZATION")
      ) {
        return true;
      }
    }
  }

  return false;
}

function handlePayoutError(label: string, err: unknown): never {
  console.error(`\n❌ ${label}`);
  const parsed = parsePayPalError(err);

  if (!parsed) {
    console.error("   Error:", err);
    process.exit(1);
  }

  console.error(`   HTTP status : ${parsed.status}`);
  console.error(`   debug_id    : ${parsed.debugId}`);
  console.error(
    `   Error body  : ${parsed.bodyObj ? JSON.stringify(parsed.bodyObj, null, 2) : parsed.rawBody || "(none)"}`
  );

  if (isPermissionOrAuthorizationError(parsed)) {
    console.error(
      "\n⚠️  PAYOUTS NOT ENABLED: The error indicates a permission or authorization issue with PayPal Payouts.\n" +
        "   Ensure Payouts feature is enabled in developer.paypal.com for this app/sandbox account."
    );
  }

  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { paypalFetch } = await import("../src/lib/paypal/client");

  console.log("=== PayPal Payout Test ===\n");

  const ts = Date.now();
  const senderBatchId = `leash-batch-${ts}`;
  const senderItemId = `leash-item-${ts}`;

  // ── Step 1: Create batch payout ───────────────────────────────────────────
  console.log("Step 1: Creating batch payout…");
  console.log(`   sender_batch_id : ${senderBatchId}`);
  console.log(`   sender_item_id  : ${senderItemId}`);

  let payoutBatchId: string;

  try {
    const result = await paypalFetch<PayoutCreateResponse>(
      "/v1/payments/payouts",
      {
        method: "POST",
        body: {
          sender_batch_header: {
            sender_batch_id: senderBatchId,
            email_subject: "Leash test payout",
            email_message: "You have received a test payout from Leash.",
          },
          items: [
            {
              recipient_type: "EMAIL",
              receiver: "sb-sub@example.com",
              amount: {
                value: "5.00",
                currency: "USD",
              },
              note: "Milestone 1 payout",
              sender_item_id: senderItemId,
            },
          ],
        },
      }
    );

    if (!result) {
      throw new Error("Payout create returned no body");
    }

    payoutBatchId = result.batch_header.payout_batch_id;

    console.log(`   ✅ Batch payout created`);
    console.log(`   Payout batch ID : ${payoutBatchId}`);
    console.log(`   Batch status    : ${result.batch_header.batch_status}`);
  } catch (err) {
    handlePayoutError("Payout creation failed", err);
  }

  // ── Step 2: GET batch details ─────────────────────────────────────────────
  console.log("\nStep 2: Fetching batch details…");
  console.log(
    "   (PayPal processes payouts asynchronously; status may still be PENDING)\n"
  );

  try {
    const batch = await paypalFetch<PayoutBatchDetail>(
      `/v1/payments/payouts/${payoutBatchId}`
    );

    if (!batch) {
      throw new Error("GET payout batch returned no body");
    }

    console.log(`   ✅ Batch fetched`);
    console.log(`   Payout batch ID : ${batch.batch_header.payout_batch_id}`);
    console.log(`   Batch status    : ${batch.batch_header.batch_status}`);

    if (batch.items && batch.items.length > 0) {
      const item = batch.items[0];
      console.log(`\n   Item [0]`);
      console.log(`     payout_item_id     : ${item.payout_item_id}`);
      console.log(`     transaction_status : ${item.transaction_status}`);
      console.log(`     receiver           : ${item.payout_item.receiver}`);
      console.log(
        `     amount             : ${item.payout_item.amount.value} ${item.payout_item.amount.currency}`
      );
      if (item.errors) {
        console.log(
          `     item error name    : ${item.errors.name ?? "(none)"}`
        );
        console.log(
          `     item error msg     : ${item.errors.message ?? "(none)"}`
        );
      }
    } else {
      console.log(
        "   (No items in response yet — PayPal may still be processing)"
      );
    }
  } catch (err) {
    handlePayoutError("Payout GET failed", err);
  }

  console.log("\n=== Done ===");
}

main();
