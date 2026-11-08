import { describe, it, expect } from "vitest";
import { computeAutonomousDailyLimitSummary } from "./rulesSummary";
import type { Rules } from "./types";

describe("computeAutonomousDailyLimitSummary pure function", () => {
  it("formats summary with default 1000 when rules is null or undefined", () => {
    expect(computeAutonomousDailyLimitSummary(null)).toBe(
      "Most this agent can send without you: $1,000 per day, only to allowed recipients"
    );
    expect(computeAutonomousDailyLimitSummary(undefined)).toBe(
      "Most this agent can send without you: $1,000 per day, only to allowed recipients"
    );
  });

  it("formats summary with specific dailyCap", () => {
    const rules: Rules = {
      autoApproveLimit: 200,
      hardLimit: 5000,
      dailyCap: 2500,
      allowedRecipients: ["sb-sub@example.com"],
      blockedActionTypes: [],
    };
    expect(computeAutonomousDailyLimitSummary(rules)).toBe(
      "Most this agent can send without you: $2,500 per day, only to allowed recipients"
    );
  });

  it("formats summary correctly for small dailyCap values under 1000", () => {
    const rules: Rules = {
      autoApproveLimit: 50,
      hardLimit: 500,
      dailyCap: 500,
      allowedRecipients: [],
      blockedActionTypes: [],
    };
    expect(computeAutonomousDailyLimitSummary(rules)).toBe(
      "Most this agent can send without you: $500 per day, only to allowed recipients"
    );
  });

  it("does not contain any em dashes", () => {
    const text = computeAutonomousDailyLimitSummary({
      autoApproveLimit: 100,
      hardLimit: 1000,
      dailyCap: 1000,
      allowedRecipients: [],
      blockedActionTypes: [],
    });
    expect(text).not.toContain("\u2014");
    expect(text).not.toContain("\u2013");
  });
});
