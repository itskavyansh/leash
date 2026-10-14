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
import fs from "fs";
import { config as loadEnv } from "dotenv";

// Load environment variables before importing application modules
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// Use dedicated temp DB file ./data/try-execute.db
const dbFilePath = path.resolve(process.cwd(), "data", "try-execute.db");
if (fs.existsSync(dbFilePath)) {
  fs.unlinkSync(dbFilePath);
}
process.env.LEASH_DB_PATH = dbFilePath;

async function main(): Promise<void> {
  console.log("=== Leash PayPal Executor Test (Real Sandbox) ===\n");
  console.log(`Database : ${dbFilePath}\n`);

  const { insertAction } = await import("../src/lib/db");
  const { executeAction } = await import("../src/lib/executor");

  // ── Step 1: Create and execute approved invoice ─────────────────────────────
  console.log("Step 1: Testing approved send_invoice ($25.00 USD)…");
  const invoiceRow = insertAction({
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
  const payoutRow = insertAction({
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

  console.log(`   Action ID    : ${payoutRow.id}`);
  const executedPayout = await executeAction(payoutRow.id);
  console.log(`   Final Status : ${executedPayout.status}`);
  console.log(`   PayPal ID    : ${executedPayout.paypalId ?? "(none)"}`);
  console.log(`   PayPal Status: ${executedPayout.paypalStatus ?? "(none)"}`);
  if (executedPayout.errorMessage) {
    console.log(`   Error Message: ${executedPayout.errorMessage}`);
  }
  console.log();

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
