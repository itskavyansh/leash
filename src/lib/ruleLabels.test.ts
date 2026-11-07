import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { RULE_LABELS, getRuleLabel } from "./ruleLabels";

describe("Rule labels mapping", () => {
  it("has a friendly label for every rule id returned by policy.ts", () => {
    // Read policy.ts source to extract all ruleFired strings
    const policyPath = path.resolve(__dirname, "policy.ts");
    const policySource = fs.readFileSync(policyPath, "utf-8");

    // Match all ruleFired: "xyz" or ruleFired: 'xyz'
    const matches = Array.from(policySource.matchAll(/ruleFired:\s*["']([^"']+)["']/g));
    const policyRuleIds = Array.from(new Set(matches.map((m) => m[1])));

    expect(policyRuleIds.length).toBeGreaterThan(0);

    for (const id of policyRuleIds) {
      expect(
        RULE_LABELS[id],
        `Rule ID "${id}" from policy.ts is missing a friendly label in RULE_LABELS`
      ).toBeDefined();
      expect(RULE_LABELS[id].length).toBeGreaterThan(0);
      // Ensure no em dashes in labels
      expect(RULE_LABELS[id]).not.toContain("—");
      expect(RULE_LABELS[id]).not.toContain("–");
    }
  });

  it("getRuleLabel returns known label for mapped id", () => {
    expect(getRuleLabel("within_limits")).toBe("Within your limits");
    expect(getRuleLabel("auto_limit")).toBe("Over auto-approve limit");
    expect(getRuleLabel("daily_cap")).toBe("Daily cap reached");
    expect(getRuleLabel("recipient_not_allowed")).toBe("Recipient not allowed");
    expect(getRuleLabel("hard_limit")).toBe("Over hard limit");
    expect(getRuleLabel("blocked_action_type")).toBe("Action type blocked");
    expect(getRuleLabel("invalid_amount")).toBe("Invalid amount");
  });

  it("getRuleLabel falls back to a readable title for unknown ids", () => {
    expect(getRuleLabel("custom_new_rule")).toBe("Custom new rule");
    expect(getRuleLabel("already readable")).toBe("Already readable");
    expect(getRuleLabel("")).toBe("");
    expect(getRuleLabel(undefined)).toBe("");
  });
});

