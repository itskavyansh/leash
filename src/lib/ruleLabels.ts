/**
 * Canonical mapping from policy rule IDs to human-friendly display labels.
 *
 * Rule IDs produced by evaluate / evaluateHardChecks in policy.ts:
 * - "invalid_amount": Non-positive or non-finite amount
 * - "blocked_action_type": Action type in blockedActionTypes
 * - "recipient_not_allowed": Payout recipient not in allowedRecipients
 * - "hard_limit": Amount exceeds hardLimit
 * - "daily_cap": Projected spend exceeds dailyCap
 * - "auto_limit": Amount exceeds autoApproveLimit
 * - "within_limits": Amount within autoApproveLimit
 */

export const RULE_LABELS: Record<string, string> = {
  invalid_amount: "Invalid amount",
  blocked_action_type: "Action type blocked",
  recipient_not_allowed: "Recipient not allowed",
  hard_limit: "Over hard limit",
  daily_cap: "Daily cap reached",
  auto_limit: "Over auto-approve limit",
  within_limits: "Within your limits",
};

/**
 * Returns a human-friendly label for a given rule ID.
 * If the rule ID is unknown, converts snake_case/kebab-case into a readable label.
 */
export function getRuleLabel(ruleId: string | null | undefined): string {
  if (!ruleId) return "";
  if (RULE_LABELS[ruleId]) {
    return RULE_LABELS[ruleId];
  }
  // Fallback for unknown IDs: "some_rule_id" -> "Some rule id"
  const spaced = ruleId.replace(/[_-]+/g, " ").trim();
  if (!spaced) return ruleId;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

