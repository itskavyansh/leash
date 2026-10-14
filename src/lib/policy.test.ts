import { describe, it, expect } from "vitest";
import { evaluate } from "./policy";
import { ProposedAction, Rules } from "./types";

describe("Policy Engine - evaluate()", () => {
  const baseRules: Rules = {
    autoApproveLimit: 200,
    hardLimit: 5000,
    dailyCap: 1000,
    allowedRecipients: ["sb-sub@example.com"],
    blockedActionTypes: [],
  };

  const validPayout: ProposedAction = {
    type: "send_payout",
    amount: 150,
    currency: "USD",
    recipient: "sb-sub@example.com",
    description: "Milestone payout",
  };

  const validInvoice: ProposedAction = {
    type: "send_invoice",
    amount: 150,
    currency: "USD",
    recipient: "client@example.com",
    description: "Client design invoice",
  };

  const validRefund: ProposedAction = {
    type: "issue_refund",
    amount: 50,
    currency: "USD",
    recipient: "buyer@example.com",
    description: "Return refund",
    reference: "CAPTURE-123",
  };

  describe("Invalid amounts", () => {
    it("rejects zero amount", () => {
      const res = evaluate({ ...validPayout, amount: 0 }, baseRules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("invalid_amount");
      expect(res.reason).toContain("invalid");
    });

    it("rejects negative amount", () => {
      const res = evaluate({ ...validPayout, amount: -50 }, baseRules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("invalid_amount");
    });

    it("rejects NaN or non-finite numbers", () => {
      const resNaN = evaluate({ ...validPayout, amount: NaN }, baseRules, 0);
      expect(resNaN.decision).toBe("blocked");
      expect(resNaN.ruleFired).toBe("invalid_amount");

      const resInf = evaluate({ ...validPayout, amount: Infinity }, baseRules, 0);
      expect(resInf.decision).toBe("blocked");
      expect(resInf.ruleFired).toBe("invalid_amount");
    });
  });

  describe("Rule a: Blocked action types", () => {
    it("blocks when action type is in blockedActionTypes", () => {
      const rules: Rules = { ...baseRules, blockedActionTypes: ["send_payout"] };
      const res = evaluate(validPayout, rules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("blocked_action_type");
      expect(res.reason).toContain("send_payout");
    });

    it("takes precedence over hard limit, allowlist, and daily cap", () => {
      const rules: Rules = { ...baseRules, blockedActionTypes: ["send_payout"] };
      // Even with invalid recipient and exceeding hard limit, blockedActionType fires first
      const action: ProposedAction = {
        ...validPayout,
        recipient: "not-allowed@example.com",
        amount: 10000,
      };
      const res = evaluate(action, rules, 900);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("blocked_action_type");
    });
  });

  describe("Rule b: Payout recipient allowlist (case-insensitive)", () => {
    it("allows payout when recipient matches case-insensitively", () => {
      const action: ProposedAction = {
        ...validPayout,
        recipient: "SB-SUB@EXAMPLE.COM",
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });

    it("blocks payout when recipient is not in allowedRecipients", () => {
      const action: ProposedAction = {
        ...validPayout,
        recipient: "stranger@example.com",
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("recipient_not_allowed");
      expect(res.reason).toContain("stranger@example.com");
    });

    it("does not enforce allowlist on invoices", () => {
      const action: ProposedAction = {
        ...validInvoice,
        recipient: "anybody@example.com",
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });

    it("does not enforce allowlist on refunds", () => {
      const action: ProposedAction = {
        ...validRefund,
        recipient: "anybody@example.com",
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });

    it("takes precedence over hard limit and daily cap", () => {
      const action: ProposedAction = {
        ...validPayout,
        recipient: "unlisted@example.com",
        amount: 6000, // above hardLimit of 5000
      };
      const res = evaluate(action, baseRules, 950);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("recipient_not_allowed");
    });
  });

  describe("Rule c: Hard limit", () => {
    it("blocks amount strictly greater than hardLimit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 5000.01,
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("hard_limit");
      expect(res.reason).toContain("$5000.01 exceeds your $5000.00 hard limit");
    });

    it("does NOT block amount exactly equal to hardLimit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 5000,
      };
      // 5000 is > autoApproveLimit (200), and with dailyCap 1000 it triggers daily_cap
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("needs_approval");
      expect(res.ruleFired).toBe("daily_cap");
    });

    it("takes precedence over daily cap and auto limit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 5001,
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("blocked");
      expect(res.ruleFired).toBe("hard_limit");
    });
  });

  describe("Rule d: Daily cap", () => {
    it("requires approval when spentToday + amount > dailyCap", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 150, // <= autoApproveLimit
      };
      // spentToday 900 + 150 = 1050 > 1000
      const res = evaluate(action, baseRules, 900);
      expect(res.decision).toBe("needs_approval");
      expect(res.ruleFired).toBe("daily_cap");
      expect(res.reason).toContain("daily cap");
      expect(res.reason).toContain("$1050.00");
    });

    it("allows when spentToday + amount is exactly equal to dailyCap and <= autoApproveLimit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 100,
      };
      // 900 + 100 = 1000 === dailyCap
      const res = evaluate(action, baseRules, 900);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });

    it("skips daily cap completely for send_invoice", () => {
      const action: ProposedAction = {
        ...validInvoice,
        amount: 150, // <= autoApproveLimit
      };
      // Even with 950 spent today (950 + 150 = 1100 > 1000 dailyCap)
      const res = evaluate(action, baseRules, 950);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });
  });

  describe("Rule e: Auto-approve limit", () => {
    it("requires approval when amount > autoApproveLimit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 200.01,
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("needs_approval");
      expect(res.ruleFired).toBe("auto_limit");
      expect(res.reason).toContain("$200.01 exceeds your $200.00 auto-approve limit");
    });

    it("approves when amount is exactly equal to autoApproveLimit", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 200,
      };
      const res = evaluate(action, baseRules, 0);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
      expect(res.reason).toContain("is within your $200.00 auto-approve limit");
    });
  });

  describe("Rule f: Within limits (Approve)", () => {
    it("approves action well below limits", () => {
      const action: ProposedAction = {
        ...validPayout,
        amount: 25,
      };
      const res = evaluate(action, baseRules, 100);
      expect(res.decision).toBe("approve");
      expect(res.ruleFired).toBe("within_limits");
    });
  });
});
