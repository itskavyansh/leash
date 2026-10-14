/**
 * PayPal API client utilities.
 *
 * Exports:
 *  - getAccessToken(): fetches / returns a cached OAuth2 access token.
 *  - paypalFetch():    authenticated wrapper around the PayPal REST API.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Epoch ms at which the token should be considered expired (expires_in - 60s). */
  expiresAt: number;
}

interface PayPalErrorBody {
  debug_id?: string;
  message?: string;
  [key: string]: unknown;
}

interface PayPalFetchOptions {
  method?: string;
  body?: Record<string, unknown>;
  /** Idempotency key.  A UUID v4 is generated if omitted. */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the PayPal API base URL based on PAYPAL_ENV. */
function getBaseUrl(): string {
  return process.env.PAYPAL_ENV === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

/** Generates a pseudo-random UUID v4 without external dependencies. */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

let cachedToken: TokenResponse | null = null;

// ---------------------------------------------------------------------------
// getAccessToken
// ---------------------------------------------------------------------------

/**
 * Returns a valid PayPal OAuth2 access token.
 *
 * Tokens are cached in memory and refreshed ~60 seconds before expiry so
 * concurrent callers always get a token that is valid for at least 60 s.
 */
export async function getAccessToken(): Promise<TokenResponse> {
  const now = Date.now();

  if (cachedToken !== null && now < cachedToken.expiresAt) {
    return cachedToken;
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing required environment variables: PAYPAL_CLIENT_ID and/or PAYPAL_CLIENT_SECRET"
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new Error(
      `PayPal token request failed: HTTP ${response.status} — ${JSON.stringify(errorBody)}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    // Cache for (expires_in - 60) seconds; convert to ms and add to now.
    expiresAt: now + (data.expires_in - 60) * 1_000,
  };

  return cachedToken;
}

// ---------------------------------------------------------------------------
// paypalFetch
// ---------------------------------------------------------------------------

/**
 * Authenticated fetch wrapper for the PayPal REST API.
 *
 * - Attaches a Bearer token (calls getAccessToken()).
 * - Sets Content-Type / Accept JSON headers.
 * - Adds a PayPal-Request-Id header for idempotency.
 * - Returns parsed JSON, or null for 204 No Content.
 * - Throws a descriptive Error on non-2xx responses.
 */
export async function paypalFetch<T = unknown>(
  path: string,
  options: PayPalFetchOptions = {}
): Promise<T | null> {
  const { method = "GET", body, requestId } = options;

  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "PayPal-Request-Id": requestId ?? generateUUID(),
  };

  const fetchInit: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, fetchInit);

  // 204 No Content — no body to parse.
  if (response.status === 204) {
    return null;
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const errorBody = responseBody as PayPalErrorBody | null;
    const debugId = errorBody?.debug_id ?? "unknown";
    throw new Error(
      `PayPal API error: HTTP ${response.status} | debug_id=${debugId} | body=${JSON.stringify(responseBody)}`
    );
  }

  return responseBody as T;
}
