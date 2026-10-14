/**
 * scripts/test-refund.ts
 *
 * Exercise the PayPal Orders v2 + Payments v2 APIs end-to-end:
 *   1. Create an order (CAPTURE intent, 10.00 USD) and print the approve link.
 *   2. Pause — prompt the user to approve the order in a sandbox buyer account.
 *   3. Capture the order, print capture_id + status.
 *   4. Refund the capture, print refund_id + status.
 *
 * Usage:  npm run test:refund
 *
 * You need a sandbox PERSONAL buyer account to approve the payment.
 * Create one at developer.paypal.com → Sandbox → Accounts.
 */

import path from "path";
import readline from "readline";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface OrderLink {
  href: string;
  rel: string;
  method?: string;
}

interface CaptureDetail {
  id: string;
  status: string;
  amount?: {
    currency_code: string;
    value: string;
  };
}

interface PurchaseUnit {
  payments?: {
    captures?: CaptureDetail[];
  };
}

interface OrderCreateResponse {
  id: string;
  status: string;
  links?: OrderLink[];
}

interface OrderCaptureResponse {
  id: string;
  status: string;
  purchase_units?: PurchaseUnit[];
}

interface RefundResponse {
  id: string;
  status: string;
  amount?: {
    currency_code: string;
    value: string;
  };
  note_to_payer?: string;
}

// ---------------------------------------------------------------------------
// Readline helper
// ---------------------------------------------------------------------------

function prompt(question: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Dynamic imports ensure env vars are loaded before modules initialise.
  const { paypalFetch } = await import("../src/lib/paypal/client");
  const { printPayPalError } = await import("./lib/print-paypal-error");

  console.log("=== PayPal Refund Test ===\n");

  // ── Step 1: Create order ──────────────────────────────────────────────────
  console.log("Step 1: Creating order (CAPTURE intent, 10.00 USD)…");

  let orderId: string;

  try {
    const order = await paypalFetch<OrderCreateResponse>(
      "/v2/checkout/orders",
      {
        method: "POST",
        body: {
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: "10.00",
              },
              description: "Leash test deposit",
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
                landing_page: "LOGIN",
                user_action: "PAY_NOW",
                return_url: "https://example.com/return",
                cancel_url: "https://example.com/cancel",
              },
            },
          },
        },
      }
    );

    if (!order) {
      throw new Error("Order create returned no body");
    }

    orderId = order.id;
    const payerActionObj = order.links?.find((l) => l.rel === "payer-action");
    const approveObj = order.links?.find((l) => l.rel === "approve");
    const buyerLink = payerActionObj?.href ?? approveObj?.href;

    console.log(`   ✅ Order created`);
    console.log(`   Order ID     : ${orderId}`);
    console.log(`   Order status : ${order.status}`);

    if (buyerLink) {
      console.log(`\n   Buyer link : ${buyerLink}`);
    } else {
      console.error("\n❌ Could not find buyer link ('payer-action' or 'approve') in response links.");
      console.error("   Full links array:", JSON.stringify(order.links, null, 2));
      console.error("   Full response JSON:", JSON.stringify(order, null, 2));
      process.exit(1);
    }
  } catch (err) {
    printPayPalError("Order creation failed", err);
    process.exit(1);
  }

  // ── Step 2: Wait for user approval ───────────────────────────────────────
  console.log(
    "\nAction required: Open the link above in a browser, log in with a PayPal sandbox personal buyer account, and click Continue/Pay. Then press Enter here to continue...\n"
  );

  await prompt("Press Enter once approved… ");

  // ── Step 3: Capture the order ─────────────────────────────────────────────
  console.log("\nStep 3: Capturing the order…");

  let captureId: string;

  try {
    const captured = await paypalFetch<OrderCaptureResponse>(
      `/v2/checkout/orders/${orderId}/capture`,
      {
        method: "POST",
        // PayPal requires a POST body (can be empty object) for capture.
        body: {},
      }
    );

    if (!captured) {
      throw new Error("Order capture returned no body");
    }

    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];

    if (!capture) {
      throw new Error(
        `No capture found in response: ${JSON.stringify(captured)}`
      );
    }

    captureId = capture.id;

    console.log(`   ✅ Order captured`);
    console.log(`   Capture ID     : ${captureId}`);
    console.log(`   Capture status : ${capture.status}`);
    if (capture.amount) {
      console.log(
        `   Captured amount: ${capture.amount.value} ${capture.amount.currency_code}`
      );
    }
  } catch (err) {
    printPayPalError("Order capture failed", err);
    process.exit(1);
  }

  // ── Step 4: Refund part of the capture ───────────────────────────────────
  console.log("\nStep 4: Refunding part of the capture (3.00 USD)…");

  try {
    const refund = await paypalFetch<RefundResponse>(
      `/v2/payments/captures/${captureId}/refund`,
      {
        method: "POST",
        body: {
          amount: {
            value: "3.00",
            currency_code: "USD",
          },
          note_to_payer: "Partial refund test",
        },
      }
    );

    if (!refund) {
      throw new Error("Refund returned no body (expected 201 with id+status)");
    }

    console.log(`   ✅ Refund initiated`);
    console.log(`   Refund ID       : ${refund.id}`);
    console.log(`   Refund status   : ${refund.status}`);
    console.log(
      `   Refunded amount : ${refund.amount?.value ?? "3.00"} ${refund.amount?.currency_code ?? "USD"}`
    );
  } catch (err) {
    printPayPalError("Refund failed", err);
    process.exit(1);
  }

  console.log("\n=== Done ===");
}

main();
