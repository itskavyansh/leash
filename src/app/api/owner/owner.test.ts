import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as loginPOST } from "./login/route";
import { POST as logoutPOST } from "./logout/route";
import { GET as meGET } from "./me/route";
import { POST as approvePOST } from "../actions/[id]/approve/route";
import { POST as rejectPOST } from "../actions/[id]/reject/route";
import { PUT as rulesPUT } from "../rules/route";
import { POST as resetPOST } from "../demo/reset/route";
import { setupTestDb, teardownTestDb } from "@/lib/testDb";
import { resetAll, insertAction } from "@/lib/db";
import { resetRateLimits } from "@/lib/rateLimit";
import { createOwnerToken, OWNER_COOKIE_NAME } from "@/lib/ownerAuth";

describe("Owner Authentication and Protected Routes", () => {
  const originalEnv = { ...process.env };
  const secret = "test-session-secret-that-is-very-long-and-secure-32";
  const passcode = "passcode123";

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.OWNER_PASSCODE = passcode;
    process.env.SESSION_SECRET = secret;
    process.env.DEMO_MODE = "true";
    resetRateLimits();
    await setupTestDb();
    await resetAll();
  });

  afterEach(async () => {
    await teardownTestDb();
    process.env = originalEnv;
  });

  describe("POST /api/owner/login", () => {
    it("returns 503 when OWNER_PASSCODE or SESSION_SECRET is unset", async () => {
      delete process.env.OWNER_PASSCODE;
      const req = new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const res = await loginPOST(req);
      expect(res.status).toBe(503);
    });

    it("returns 400 on missing or invalid passcode", async () => {
      const req = new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await loginPOST(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 on incorrect passcode", async () => {
      const req = new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: "wrongpass" }),
      });
      const res = await loginPOST(req);
      expect(res.status).toBe(401);
    });

    it("returns 200 and sets httpOnly session cookie on success", async () => {
      const req = new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const res = await loginPOST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.owner).toBe(true);
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain(`${OWNER_COOKIE_NAME}=`);
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    });

    it("rate limits to 5 attempts per minute per IP", async () => {
      for (let i = 0; i < 5; i++) {
        const req = new Request("http://localhost/api/owner/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
          body: JSON.stringify({ passcode: "wrong" }),
        });
        const res = await loginPOST(req);
        expect(res.status).toBe(401);
      }

      // 6th attempt should be rate limited
      const req6 = new Request("http://localhost/api/owner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
        body: JSON.stringify({ passcode }),
      });
      const res6 = await loginPOST(req6);
      expect(res6.status).toBe(429);
    });
  });

  describe("POST /api/owner/logout", () => {
    it("clears the cookie with maxAge 0", async () => {
      const res = await logoutPOST();
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain(`${OWNER_COOKIE_NAME}=;`);
      expect(setCookie?.toLowerCase()).toContain("max-age=0");
    });
  });

  describe("GET /api/owner/me", () => {
    it("returns { owner: false } when not logged in", async () => {
      const req = new Request("http://localhost/api/owner/me");
      const res = await meGET(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ owner: false });
    });

    it("returns { owner: true } when valid cookie is present", async () => {
      const token = createOwnerToken(secret);
      const req = new Request("http://localhost/api/owner/me", {
        headers: { cookie: `${OWNER_COOKIE_NAME}=${token}` },
      });
      const res = await meGET(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ owner: true });
    });

    it("returns { owner: false } when cookie is tampered or expired", async () => {
      const expiredToken = createOwnerToken(secret, -5000);
      const req = new Request("http://localhost/api/owner/me", {
        headers: { cookie: `${OWNER_COOKIE_NAME}=${expiredToken}` },
      });
      const res = await meGET(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ owner: false });
    });
  });

  describe("Protected routes enforcement", () => {
    let pendingActionId: string;

    beforeEach(async () => {
      const inserted = await insertAction({
        type: "send_payout",
        recipient: "sb-sub@example.com",
        amount: 250,
        currency: "USD",
        status: "pending_approval",
        decision: "needs_approval",
        reason: "Over limit",
        ruleFired: "auto_limit",
        description: "Test pending item",
        reference: null,
      });
      pendingActionId = inserted.id;
    });

    it("returns 503 on approve, reject, rules PUT, reset when owner auth is unconfigured", async () => {
      delete process.env.OWNER_PASSCODE;

      const approveRes = await approvePOST(new Request("http://localhost"), {
        params: Promise.resolve({ id: pendingActionId }),
      });
      expect(approveRes.status).toBe(503);

      const rejectRes = await rejectPOST(new Request("http://localhost"), {
        params: Promise.resolve({ id: pendingActionId }),
      });
      expect(rejectRes.status).toBe(503);

      const rulesRes = await rulesPUT(new Request("http://localhost", { method: "PUT" }));
      expect(rulesRes.status).toBe(503);

      const resetRes = await resetPOST(new Request("http://localhost", { method: "POST" }));
      expect(resetRes.status).toBe(503);
    });

    it("returns 401 on approve, reject, rules PUT, reset when owner cookie is missing or tampered", async () => {
      const approveRes = await approvePOST(new Request("http://localhost"), {
        params: Promise.resolve({ id: pendingActionId }),
      });
      expect(approveRes.status).toBe(401);

      const rejectRes = await rejectPOST(new Request("http://localhost"), {
        params: Promise.resolve({ id: pendingActionId }),
      });
      expect(rejectRes.status).toBe(401);

      const rulesRes = await rulesPUT(new Request("http://localhost", { method: "PUT" }));
      expect(rulesRes.status).toBe(401);

      const resetRes = await resetPOST(new Request("http://localhost", { method: "POST" }));
      expect(resetRes.status).toBe(401);
    });

    it("allows approve, reject, rules PUT, reset when owner cookie is valid", async () => {
      const token = createOwnerToken(secret);
      const headers = { cookie: `${OWNER_COOKIE_NAME}=${token}` };

      // PUT rules
      const rulesReq = new Request("http://localhost/api/rules", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          autoApproveLimit: 300,
          hardLimit: 1500,
          dailyCap: 2000,
          allowedRecipients: ["sb-sub@example.com"],
          blockedActionTypes: [],
        }),
      });
      const rulesRes = await rulesPUT(rulesReq);
      expect(rulesRes.status).toBe(200);

      // Reset
      const resetReq = new Request("http://localhost/api/demo/reset", {
        method: "POST",
        headers,
      });
      const resetRes = await resetPOST(resetReq);
      expect(resetRes.status).toBe(200);
    });

    it("rate limits demo reset to 3 per minute per IP", async () => {
      const token = createOwnerToken(secret);
      const headers = { cookie: `${OWNER_COOKIE_NAME}=${token}`, "x-forwarded-for": "9.9.9.9" };

      for (let i = 0; i < 3; i++) {
        const resetReq = new Request("http://localhost/api/demo/reset", {
          method: "POST",
          headers,
        });
        const res = await resetPOST(resetReq);
        expect(res.status).toBe(200);
      }

      const resetReq4 = new Request("http://localhost/api/demo/reset", {
        method: "POST",
        headers,
      });
      const res4 = await resetPOST(resetReq4);
      expect(res4.status).toBe(429);
    });
  });
});
