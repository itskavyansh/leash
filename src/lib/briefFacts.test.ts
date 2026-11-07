import { describe, it, expect } from "vitest";
import { buildBriefFacts, buildTemplateBrief } from "./briefFacts";
import { Rules, StoredAction } from "./types";

const mockRules: Rules = {
  autoApproveLimit: 200,
  hardLimit: 5000,
  dailyCap: 1000,
  allowedRecipients: ["vendor@example.com"],
  blockedActionTypes: [],
};

function makeAction(partial: Partial<StoredAction>): StoredAction {
  return {
    id: "act-1",
    createdAt: new Date().toISOString(),
    type: "send_payout",
    amount: 150,
    currency: "USD",
    recipient: "vendor@example.com",
    description: "test",
    reference: null,
    status: "pending_approval",
    decision: "needs_approval",
    reason: "Exceeds auto-approve",
    ruleFired: "auto_limit",
    paypalId: null,
    paypalStatus: null,
    errorMessage: null,
    requestText: "Pay vendor $150",
    source: "typed",
    ...partial,
  };
}

describe("Brief Facts & Template Generation", () => {
  it("computes facts for first payment to recipient", () => {
    const action = makeAction({ amount: 450, recipient: "new-vendor@example.com" });
    const history: StoredAction[] = [
      makeAction({ id: "h1", recipient: "other@example.com", status: "completed", amount: 100 }),
    ];

    const facts = buildBriefFacts(action, history, 100, mockRules);
    expect(facts.isFirstPaymentToRecipient).toBe(true);
    expect(facts.priorPaymentCount).toBe(0);
    expect(facts.priorTotal).toBe(0);
    expect(facts.wouldExceedCap).toBe(false);
    expect(facts.sourceType).toBe("typed");

    const template = buildTemplateBrief(facts);
    expect(template).toContain("First payment to this recipient");
    expect(template.length).toBeLessThanOrEqual(160);
  });

  it("computes facts for repeat payment to recipient", () => {
    const action = makeAction({ amount: 300, recipient: "vendor@example.com" });
    const history: StoredAction[] = [
      makeAction({ id: "h1", recipient: "vendor@example.com", status: "completed", amount: 200 }),
      makeAction({ id: "h2", recipient: "vendor@example.com", status: "approved", amount: 150 }),
      makeAction({ id: "h3", recipient: "vendor@example.com", status: "rejected", amount: 500 }), // excluded
      makeAction({ id: "h4", recipient: "vendor@example.com", status: "blocked", amount: 6000 }), // excluded
    ];

    const facts = buildBriefFacts(action, history, 200, mockRules);
    expect(facts.isFirstPaymentToRecipient).toBe(false);
    expect(facts.priorPaymentCount).toBe(2);
    expect(facts.priorTotal).toBe(350);

    const template = buildTemplateBrief(facts);
    expect(template).toContain("Paid 2 times prior ($350)");
    expect(template.length).toBeLessThanOrEqual(160);
  });

  it("computes multiple of average payout when at least 3 completed payouts exist", () => {
    const action = makeAction({ amount: 800, recipient: "vendor@example.com" });
    const history: StoredAction[] = [
      makeAction({ id: "p1", status: "completed", amount: 100 }),
      makeAction({ id: "p2", status: "completed", amount: 200 }),
      makeAction({ id: "p3", status: "completed", amount: 300 }),
      makeAction({ id: "p4", status: "failed", amount: 900 }), // excluded
    ];

    // Completed payouts avg = (100+200+300)/3 = 200. Multiple = 800/200 = 4.0
    const facts = buildBriefFacts(action, history, 0, mockRules);
    expect(facts.averagePayout).toBe(200);
    expect(facts.multipleOfAverage).toBe(4);

    const template = buildTemplateBrief(facts);
    expect(template).toContain("4x your average payout");
  });

  it("leaves multipleOfAverage null when fewer than 3 completed payouts exist", () => {
    const action = makeAction({ amount: 800 });
    const history: StoredAction[] = [
      makeAction({ id: "p1", status: "completed", amount: 100 }),
      makeAction({ id: "p2", status: "completed", amount: 200 }),
    ];

    const facts = buildBriefFacts(action, history, 0, mockRules);
    expect(facts.multipleOfAverage).toBeNull();
  });

  it("computes over-cap status accurately", () => {
    const action = makeAction({ amount: 600, ruleFired: "daily_cap" });
    const facts = buildBriefFacts(action, [], 700, mockRules); // 700 + 600 = 1300 > 1000
    expect(facts.spentToday).toBe(700);
    expect(facts.projectedSpend).toBe(1300);
    expect(facts.wouldExceedCap).toBe(true);

    const template = buildTemplateBrief(facts);
    expect(template).toContain("exceeds $1,000 daily cap ($1,300 projected)");
  });

  it("normalizes source types correctly", () => {
    expect(buildBriefFacts(makeAction({ source: "agent: procurement" }), [], 0, mockRules).sourceType).toBe("agent");
    expect(buildBriefFacts(makeAction({ source: "document" }), [], 0, mockRules).sourceType).toBe("document");
    expect(buildBriefFacts(makeAction({ source: "typed" }), [], 0, mockRules).sourceType).toBe("typed");
  });
});

