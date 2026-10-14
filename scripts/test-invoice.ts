/**
 * scripts/test-invoice.ts
 *
 * Exercise the PayPal Invoicing v2 API:
 *   1. Create a DRAFT invoice (Logo design, 850.00 USD).
 *   2. Send the invoice to the recipient.
 *   3. GET the invoice and print its status.
 *
 * Usage:  npm run test:invoice
 */

import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// PayPal Invoicing v2 response shapes (minimal — only fields we care about)
// ---------------------------------------------------------------------------

interface InvoiceLink {
  href: string;
  rel: string;
  method?: string;
}

interface InvoiceCreateResponse {
  /** PayPal returns 201 with body { href: "…/v2/invoicing/invoices/{id}" } */
  href?: string;
}

interface InvoiceDetail {
  id: string;
  status: string;
  detail?: {
    invoice_number?: string;
    currency_code?: string;
    metadata?: {
      recipient_view_url?: string;
      invoicer_view_url?: string;
      [key: string]: unknown;
    };
  };
  links?: InvoiceLink[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Dynamic imports ensure env vars are loaded before modules initialise.
  const { paypalFetch } = await import("../src/lib/paypal/client");
  const { printPayPalError } = await import("./lib/print-paypal-error");

  console.log("=== PayPal Invoice Test ===\n");

  // ── Step 1: Create DRAFT invoice ─────────────────────────────────────────
  console.log("Step 1: Creating DRAFT invoice…");

  let invoiceId: string;

  try {
    const created = await paypalFetch<InvoiceCreateResponse>(
      "/v2/invoicing/invoices",
      {
        method: "POST",
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
                email_address: "sb-customer@example.com",
              },
            },
          ],
          items: [
            {
              name: "Logo design",
              quantity: "1",
              unit_amount: {
                currency_code: "USD",
                value: "850.00",
              },
              unit_of_measure: "QUANTITY",
            },
          ],
        },
      }
    );

    // PayPal returns 201 with body { href: "…/v2/invoicing/invoices/{id}" }
    const href = created?.href;
    if (!href) {
      throw new Error(
        `Invoice creation returned unexpected body: ${JSON.stringify(created)}`
      );
    }

    // Extract invoice ID from the URL
    invoiceId = href.split("/").pop() ?? "";
    if (!invoiceId) {
      throw new Error(`Could not extract invoice ID from href: ${href}`);
    }

    console.log(`   ✅ Invoice created`);
    console.log(`   Invoice ID  : ${invoiceId}`);
  } catch (err) {
    printPayPalError("Invoice creation failed", err);
    process.exit(1);
  }

  // ── Step 2: Send the invoice ──────────────────────────────────────────────
  console.log("\nStep 2: Sending invoice to recipient…");

  try {
    // POST /v2/invoicing/invoices/{id}/send  →  202 Accepted (no body)
    await paypalFetch(`/v2/invoicing/invoices/${invoiceId}/send`, {
      method: "POST",
      body: {
        send_to_recipient: true,
        send_to_invoicer: false,
      },
    });

    console.log(`   ✅ Invoice sent (202 Accepted)`);
  } catch (err) {
    printPayPalError("Invoice send failed", err);
    process.exit(1);
  }

  // ── Step 3: GET invoice and print status ──────────────────────────────────
  console.log("\nStep 3: Fetching invoice details…");

  try {
    const invoice = await paypalFetch<InvoiceDetail>(
      `/v2/invoicing/invoices/${invoiceId}`
    );

    if (!invoice) {
      throw new Error("GET invoice returned no body");
    }

    console.log(`   ✅ Invoice fetched`);
    console.log(`   Invoice ID     : ${invoice.id}`);
    console.log(`   Status         : ${invoice.status}`);
    if (invoice.status === "SENT") {
      console.log(`   Status check   : Verified as SENT ✅`);
    } else {
      console.warn(`   Status check   : ⚠️ Expected status "SENT", got "${invoice.status}"`);
    }

    const recipientViewUrl = invoice.detail?.metadata?.recipient_view_url ?? "(missing)";
    const invoicerViewUrl = invoice.detail?.metadata?.invoicer_view_url ?? "(missing)";
    console.log(`   recipient_view_url : ${recipientViewUrl}`);
    console.log(`   invoicer_view_url  : ${invoicerViewUrl}`);
  } catch (err) {
    printPayPalError("Invoice GET failed", err);
    process.exit(1);
  }

  console.log("\n=== Done ===");
}

main();
