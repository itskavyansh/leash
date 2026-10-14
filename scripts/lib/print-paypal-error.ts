/**
 * scripts/lib/print-paypal-error.ts
 *
 * Shared error-printing helper for PayPal test scripts.
 *
 * Parses the structured Error thrown by paypalFetch() and prints:
 *   - HTTP status
 *   - PayPal debug_id
 *   - name / message / details from the error body
 *
 * Never prints tokens or secrets.
 */

export interface PayPalApiErrorBody {
  name?: string;
  message?: string;
  details?: unknown;
  [key: string]: unknown;
}

/**
 * Extracts structured fields from an Error thrown by paypalFetch().
 *
 * paypalFetch throws messages of the form:
 *   "PayPal API error: HTTP {status} | debug_id={id} | body={json}"
 */
export function printPayPalError(label: string, err: unknown): void {
  console.error(`\n❌ ${label}`);

  if (!(err instanceof Error)) {
    console.error("   Unknown error:", err);
    return;
  }

  const raw = err.message;

  // Extract HTTP status
  const httpMatch = raw.match(/HTTP (\d+)/);
  console.error(`   HTTP status : ${httpMatch?.[1] ?? "unknown"}`);

  // Extract debug_id (no s-flag needed — debug_id is always on one segment)
  const debugMatch = raw.match(/debug_id=([^\s|]+)/);
  console.error(`   debug_id    : ${debugMatch?.[1] ?? "unknown"}`);

  // Extract body — slice from "body=" to end of string (no regex dotall needed)
  const bodyMarker = "body=";
  const bodyIdx = raw.indexOf(bodyMarker);
  const bodyStr = bodyIdx !== -1 ? raw.slice(bodyIdx + bodyMarker.length) : "";

  if (bodyStr) {
    try {
      const body = JSON.parse(bodyStr) as PayPalApiErrorBody;
      console.error(`   name        : ${body.name ?? "(none)"}`);
      console.error(`   message     : ${body.message ?? "(none)"}`);
      if (body.details !== undefined) {
        console.error(
          `   details     : ${JSON.stringify(body.details, null, 2)}`
        );
      }
    } catch {
      // Body wasn't valid JSON — print raw
      console.error(`   body        : ${bodyStr}`);
    }
  }
}
