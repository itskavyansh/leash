/**
 * Verifies PayPal sandbox authentication by fetching an access token.
 *
 * Prints: success/failure, token type, expires_in, and the first 8 chars
 * of the token.  Never prints the full token or secret.
 *
 * Usage:
 *   npm run test:auth
 */

import path from "path";
import { config as loadEnv } from "dotenv";

// Load .env.local BEFORE any PayPal code reads process.env.
// Static imports are hoisted by the JS engine, so we use a dynamic import
// below for the PayPal client to guarantee env vars are present first.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function main(): Promise<void> {
  // Dynamic import ensures the PayPal client module is evaluated AFTER dotenv
  // has populated process.env (static imports are hoisted and run first).
  const { getAccessToken } = await import("../src/lib/paypal/client");

  console.log("Testing PayPal sandbox authentication…\n");

  try {
    const token = await getAccessToken();

    console.log("✅ Success");
    console.log(`   Token type : ${token.token_type}`);
    console.log(`   Expires in : ${token.expires_in}s`);
    console.log(
      `   Token (first 8 chars) : ${token.access_token.slice(0, 8)}…`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Failure");
    console.error(`   Error: ${message}`);
    process.exit(1);
  }
}

main();
