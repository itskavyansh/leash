/**
 * scripts/try-execute.ts
 *
 * Exercises the PayPal executor against the real PayPal sandbox:
 *  1. Inserts and executes an approved send_invoice ($25.00 to sb-customer@example.com).
 *  2. Inserts and executes an approved send_payout ($5.00 to sb-sub@example.com).
 *
 * Prints the resulting status, paypalId, paypalStatus, and errorMessage for each.
 * Does NOT invoke the LLM.
 *
 * Usage: npm run try:execute
 */

import path from "path";
import { config as loadEnv } from "dotenv";

// Load environment variables before importing application modules
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function main(): Promise<void> {
  console.log("=== Leash PayPal Executor Test (Real Sandbox) ===\n");
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Please set DATABASE_URL in .env.local.");
    process.exit(1);
  }

  const { insertAction, getSqlClient } = await import("../src/lib/db");
  const { executeAction } = await import("../src/lib/executor");

  const createdActionIds: string[] = [];

  try {
    // ── Step 1: Create and execute approved invoice ─────────────────────────────
    console.log("Step 1: Testing approved send_invoice ($25.00 USD)…");
    const invoiceRow = await insertAction({
      type: "send_invoice",
      amount: 25.0,
      currency: "USD",
      recipient: "sb-customer@example.com",
      description: "Try execute test invoice",
      status: "approved",
      decision: "approve",
      reason: "Pre-approved test invoice",
      ruleFired: "within_limits",
      requestText: "Invoice $25 to sb-customer@example.com",
    });
    createdActionIds.push(invoiceRow.id);

    console.log(`   Action ID    : ${invoiceRow.id}`);
    const executedInvoice = await executeAction(invoiceRow.id);
    console.log(`   Final Status : ${executedInvoice.status}`);
    console.log(`   PayPal ID    : ${executedInvoice.paypalId ?? "(none)"}`);
    console.log(`   PayPal Status: ${executedInvoice.paypalStatus ?? "(none)"}`);
    if (executedInvoice.errorMessage) {
      console.log(`   Error Message: ${executedInvoice.errorMessage}`);
    }
    console.log();

    // ── Step 2: Create and execute approved payout ──────────────────────────────
    console.log("Step 2: Testing approved send_payout ($5.00 USD)…");
    const payoutRow = await insertAction({
      type: "send_payout",
      amount: 5.0,
      currency: "USD",
      recipient: "sb-sub@example.com",
      description: "Try execute test payout",
      status: "approved",
      decision: "approve",
      reason: "Pre-approved test payout",
      ruleFired: "within_limits",
      requestText: "Pay $5 to sb-sub@example.com",
    });
    createdActionIds.push(payoutRow.id);

    console.log(`   Action ID    : ${payoutRow.id}`);
    const executedPayout = await executeAction(payoutRow.id);
    console.log(`   Final Status : ${executedPayout.status}`);
    console.log(`   PayPal ID    : ${executedPayout.paypalId ?? "(none)"}`);
    console.log(`   PayPal Status: ${executedPayout.paypalStatus ?? "(none)"}`);
    if (executedPayout.errorMessage) {
      console.log(`   Error Message: ${executedPayout.errorMessage}`);
    }
    console.log();
  } finally {
    if (createdActionIds.length > 0) {
      console.log("Cleaning up created test rows from database…");
      const client = getSqlClient();
      for (const id of createdActionIds) {
        await client.query(`DELETE FROM actions WHERE id = $1`, [id]);
      }
      console.log("Cleanup complete.");
    }
  }

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
