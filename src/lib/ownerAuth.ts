import crypto from "node:crypto";

export const OWNER_COOKIE_NAME = "leash_owner_session";
const MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours

export interface OwnerConfig {
  isConfigured: boolean;
  ownerPasscode?: string;
  sessionSecret?: string;
  showDemoPasscode: boolean;
}

export function getOwnerConfig(): OwnerConfig {
  const ownerPasscode = process.env.OWNER_PASSCODE?.trim();
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const showDemoPasscode = process.env.SHOW_DEMO_PASSCODE === "true";

  const isConfigured = Boolean(ownerPasscode && sessionSecret);
  return {
    isConfigured,
    ownerPasscode,
    sessionSecret,
    showDemoPasscode,
  };
}

/**
 * Constant-time comparison for strings to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates an HMAC-SHA256 signed token:
 * payload = base64url(JSON.stringify({ v: 1, exp: timestamp_in_ms }))
 * signature = base64url(hmac_sha256(payload, sessionSecret))
 * token = `${payload}.${signature}`
 */
export function createOwnerToken(sessionSecret: string, expiresInMs: number = MAX_AGE_SECONDS * 1000): string {
  const exp = Date.now() + expiresInMs;
  const payloadStr = JSON.stringify({ v: 1, exp });
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies the owner token against the sessionSecret and checks expiry.
 */
export function verifyOwnerToken(token: string | undefined | null, sessionSecret: string): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", sessionSecret)
    .update(payloadB64)
    .digest("base64url");

  if (!constantTimeCompare(signature, expectedSignature)) {
    return false;
  }

  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const parsed = JSON.parse(payloadStr) as { v?: number; exp?: number };
    if (!parsed || typeof parsed.exp !== "number") {
      return false;
    }
    if (Date.now() > parsed.exp) {
      return false; // Expired
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses cookies from a Request header and returns the value of a specific cookie name.
 */
export function getCookieFromRequest(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const [key, ...val] = c.trim().split("=");
    if (key === name) {
      return val.join("=");
    }
  }
  return null;
}

/**
 * Checks whether the request is authorized as the owner.
 * Returns:
 * - { status: "configured_and_valid" } if owner auth is configured and cookie is valid.
 * - { status: "unconfigured" } if OWNER_PASSCODE or SESSION_SECRET is unset (routes should 503).
 * - { status: "unauthorized" } if configured but cookie is missing, tampered, or expired (routes should 401).
 */
export function checkOwnerAuth(request: Request): {
  isOwner: boolean;
  status: "configured_and_valid" | "unconfigured" | "unauthorized";
} {
  const config = getOwnerConfig();
  if (!config.isConfigured || !config.sessionSecret) {
    return { isOwner: false, status: "unconfigured" };
  }

  const token = getCookieFromRequest(request, OWNER_COOKIE_NAME);
  if (!token) {
    return { isOwner: false, status: "unauthorized" };
  }

  const isValid = verifyOwnerToken(token, config.sessionSecret);
  if (!isValid) {
    return { isOwner: false, status: "unauthorized" };
  }

  return { isOwner: true, status: "configured_and_valid" };
}
