/**
 * scripts/simulate-webhook.ts
 *
 * Simulates an incoming PayPal webhook event and POSTs it to the local Next.js
 * webhook route (http://localhost:3000/api/webhooks/paypal).
 *
 * Usage:
 *   npm run sim:webhook <eventType> <paypalId>
 *
 * Example:
 *   npm run sim:webhook PAYMENT.PAYOUTS-ITEM.SUCCEEDED UYY9C5953H9X8
 *   npm run sim:webhook INVOICING.INVOICE.PAID INV2-F7T8-TDAE-V8C8-E57J
 */

import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

function buildSampleEvent(
  eventType: string,
  paypalId: string
): Record<string, unknown> {
  const eventId = `WH-SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  if (eventType.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    return {
      id: eventId,
      event_type: eventType,
      create_time: new Date().toISOString(),
      resource_type: "payouts_item",
      resource: {
        payout_batch_id: paypalId,
        payout_item_id: `ITEM-${Date.now()}`,
        transaction_status: eventType.split(".").pop(),
      },
    };
  }

  if (eventType.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    return {
      id: eventId,
      event_type: eventType,
      create_time: new Date().toISOString(),
      resource_type: "payouts",
      resource: {
        batch_header: {
          payout_batch_id: paypalId,
          batch_status: eventType.split(".").pop(),
        },
      },
    };
  }

  if (eventType.startsWith("INVOICING.INVOICE.")) {
    return {
      id: eventId,
      event_type: eventType,
      create_time: new Date().toISOString(),
      resource_type: "invoices",
      resource: {
        invoice: {
          id: paypalId,
          status: eventType.split(".").pop(),
        },
      },
    };
  }

  if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
    return {
      id: eventId,
      event_type: eventType,
      create_time: new Date().toISOString(),
      resource_type: "refund",
      resource: {
        id: paypalId,
        status: "COMPLETED",
      },
    };
  }

  // Generic fallback
  return {
    id: eventId,
    event_type: eventType,
    create_time: new Date().toISOString(),
    resource: {
      id: paypalId,
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const eventType = args[0];
  const paypalId = args[1];

  if (!eventType || !paypalId) {
    console.error("Usage: npm run sim:webhook <eventType> <paypalId>");
    console.error("Example: npm run sim:webhook PAYMENT.PAYOUTS-ITEM.SUCCEEDED UYY9C5953H9X8");
    process.exit(1);
  }

  const eventPayload = buildSampleEvent(eventType, paypalId);
  const targetUrl = process.env.WEBHOOK_SIM_URL || "http://localhost:3000/api/webhooks/paypal";

  console.log("=== Simulating PayPal Webhook Event ===");
  console.log(`URL        : ${targetUrl}`);
  console.log(`Event Type : ${eventType}`);
  console.log(`PayPal ID  : ${paypalId}`);
  console.log(`Payload    : ${JSON.stringify(eventPayload, null, 2)}\n`);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert.pem",
        "paypal-transmission-id": `sim-${Date.now()}`,
        "paypal-transmission-sig": "simulated_signature",
        "paypal-transmission-time": new Date().toISOString(),
      },
      body: JSON.stringify(eventPayload),
    });

    const status = response.status;
    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "(empty)";
    }

    console.log(`Response Status: ${status}`);
    console.log(`Response Body  : ${bodyText}`);
  } catch (err) {
    console.error(`Failed to send request to ${targetUrl}:`, err);
    process.exit(1);
  }
}

main();
