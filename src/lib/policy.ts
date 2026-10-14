import { PolicyResult, ProposedAction, Rules } from "./types";

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Pure evaluation function for policy rules.
 *
 * Evaluation order:
 * 1. Invalid amount: non-positive or non-finite -> blocked, "invalid_amount"
 * 2. action.type in blockedActionTypes -> blocked, "blocked_action_type"
 * 3. send_payout recipient not in allowedRecipients (case-insensitive) -> blocked, "recipient_not_allowed"
 * 4. amount > hardLimit -> blocked, "hard_limit"
 * 5. (if not send_invoice) spentToday + amount > dailyCap -> needs_approval, "daily_cap"
 * 6. amount > autoApproveLimit -> needs_approval, "auto_limit"
 * 7. otherwise -> approve, "within_limits"
 */
export function evaluate(
  action: ProposedAction,
  rules: Rules,
  spentToday: number
): PolicyResult {
  // Reject non-positive or non-finite amounts first
  if (!Number.isFinite(action.amount) || action.amount <= 0) {
    return {
      decision: "blocked",
      ruleFired: "invalid_amount",
      reason: `Amount ${action.amount} is invalid. Amounts must be positive finite numbers.`,
    };
  }

  // a. action.type in blockedActionTypes
  if (rules.blockedActionTypes.includes(action.type)) {
    return {
      decision: "blocked",
      ruleFired: "blocked_action_type",
      reason: `Action type "${action.type}" is blocked by policy.`,
    };
  }

  // b. send_payout recipient not in allowedRecipients (case-insensitive)
  if (action.type === "send_payout") {
    const targetRecipient = action.recipient.trim().toLowerCase();
    const isAllowed = rules.allowedRecipients.some(
      (r) => r.trim().toLowerCase() === targetRecipient
    );
    if (!isAllowed) {
      return {
        decision: "blocked",
        ruleFired: "recipient_not_allowed",
        reason: `Recipient "${action.recipient}" is not in the allowed recipients list for payouts.`,
      };
    }
  }

  // c. amount > hardLimit
  if (action.amount > rules.hardLimit) {
    return {
      decision: "blocked",
      ruleFired: "hard_limit",
      reason: `${formatUSD(action.amount)} exceeds your ${formatUSD(rules.hardLimit)} hard limit.`,
    };
  }

  // d. spentToday + amount > dailyCap (invoices do not spend money, so skip for send_invoice)
  if (action.type !== "send_invoice") {
    const projectedSpend = spentToday + action.amount;
    if (projectedSpend > rules.dailyCap) {
      return {
        decision: "needs_approval",
        ruleFired: "daily_cap",
        reason: `Projected spend of ${formatUSD(projectedSpend)} (${formatUSD(spentToday)} spent today + ${formatUSD(action.amount)}) exceeds your ${formatUSD(rules.dailyCap)} daily cap.`,
      };
    }
  }

  // e. amount > autoApproveLimit
  if (action.amount > rules.autoApproveLimit) {
    return {
      decision: "needs_approval",
      ruleFired: "auto_limit",
      reason: `${formatUSD(action.amount)} exceeds your ${formatUSD(rules.autoApproveLimit)} auto-approve limit.`,
    };
  }

  // f. otherwise -> approve
  return {
    decision: "approve",
    ruleFired: "within_limits",
    reason: `${formatUSD(action.amount)} is within your ${formatUSD(rules.autoApproveLimit)} auto-approve limit.`,
  };
}
