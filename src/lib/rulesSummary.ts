import type { Rules } from "./types";

/**
 * Computes a human-readable summary of the most an agent can autonomously spend
 * without human approval on a given day based on policy rules.
 *
 * Rules:
 * - "Most this agent can send without you: $X per day, only to allowed recipients"
 *   where X is dailyCap formatted with commas if >= 1000.
 */
export function computeAutonomousDailyLimitSummary(rules: Rules | null | undefined): string {
  const dailyCap = rules?.dailyCap ?? 1000;
  const formattedCap = dailyCap.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  return `Most this agent can send without you: $${formattedCap} per day, only to allowed recipients`;
}
