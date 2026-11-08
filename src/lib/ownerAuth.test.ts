import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  constantTimeCompare,
  createOwnerToken,
  verifyOwnerToken,
  checkOwnerAuth,
  OWNER_COOKIE_NAME,
} from "./ownerAuth";

describe("ownerAuth unit tests", () => {
  const originalEnv = { ...process.env };
  const secret = "test-session-secret-at-least-32-chars-long";

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("constantTimeCompare", () => {
    it("returns true for matching strings", () => {
      expect(constantTimeCompare("secret123", "secret123")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(constantTimeCompare("secret123", "secret456")).toBe(false);
    });

    it("returns false for different lengths", () => {
      expect(constantTimeCompare("secret", "secrets")).toBe(false);
    });
  });

  describe("createOwnerToken & verifyOwnerToken", () => {
    it("creates a token that verifies successfully before expiry", () => {
      const token = createOwnerToken(secret, 60_000);
      expect(verifyOwnerToken(token, secret)).toBe(true);
    });

    it("rejects token verified with wrong secret", () => {
      const token = createOwnerToken(secret, 60_000);
      expect(verifyOwnerToken(token, "wrong-secret")).toBe(false);
    });

    it("rejects expired token", () => {
      const expiredToken = createOwnerToken(secret, -1000);
      expect(verifyOwnerToken(expiredToken, secret)).toBe(false);
    });

    it("rejects tampered signature", () => {
      const token = createOwnerToken(secret, 60_000);
      const [payload, sig] = token.split(".");
      const tamperedSig = sig.slice(0, -1) + (sig.slice(-1) === "a" ? "b" : "a");
      expect(verifyOwnerToken(`${payload}.${tamperedSig}`, secret)).toBe(false);
    });

    it("rejects tampered payload", () => {
      const token = createOwnerToken(secret, 60_000);
      const [, sig] = token.split(".");
      const tamperedPayload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + 99999 })).toString("base64url");
      expect(verifyOwnerToken(`${tamperedPayload}.${sig}`, secret)).toBe(false);
    });
  });

  describe("checkOwnerAuth", () => {
    it("returns status 'unconfigured' when OWNER_PASSCODE or SESSION_SECRET is unset", () => {
      delete process.env.OWNER_PASSCODE;
      delete process.env.SESSION_SECRET;
      const req = new Request("http://localhost/api/rules");
      const res = checkOwnerAuth(req);
      expect(res.status).toBe("unconfigured");
      expect(res.isOwner).toBe(false);
    });

    it("returns status 'unauthorized' when configured but cookie missing", () => {
      process.env.OWNER_PASSCODE = "supersecret";
      process.env.SESSION_SECRET = secret;
      const req = new Request("http://localhost/api/rules");
      const res = checkOwnerAuth(req);
      expect(res.status).toBe("unauthorized");
      expect(res.isOwner).toBe(false);
    });

    it("returns status 'configured_and_valid' when valid cookie provided", () => {
      process.env.OWNER_PASSCODE = "supersecret";
      process.env.SESSION_SECRET = secret;
      const token = createOwnerToken(secret, 60_000);
      const req = new Request("http://localhost/api/rules", {
        headers: { cookie: `${OWNER_COOKIE_NAME}=${token}` },
      });
      const res = checkOwnerAuth(req);
      expect(res.status).toBe("configured_and_valid");
      expect(res.isOwner).toBe(true);
    });
  });
});
