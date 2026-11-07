import { Rules, StoredAction } from "./types";

export interface BriefFacts {
  actionId: string;
  amount: number;
  type: string;
  isFirstPaymentToRecipient: boolean;
  priorPaymentCount: number;
  priorTotal: number;
  averagePayout: number | null;
  multipleOfAverage: number | null;
  spentToday: number;
  projectedSpend: number;
  dailyCap: number;
  wouldExceedCap: boolean;
  ruleFired: string;
  sourceType: "typed" | "document" | "agent";
}

/**
 * Normalizes the action's source string into the 3 known source types.
 */
export function normalizeSourceType(source?: string | null): "typed" | "document" | "agent" {
  if (!source) return "typed";
  const s = source.trim().toLowerCase();
  if (s.startsWith("agent")) return "agent";
  if (s.startsWith("document")) return "document";
  return "typed";
}

/**
 * Computes pure brief facts from an action, action history, spentToday, and policy rules.
 *
 * Rules:
 * - isFirstPaymentToRecipient: true if no earlier approved/executing/completed action exists for that recipient (case-insensitive).
 * - priorPaymentCount: count of earlier approved/executing/completed actions to that recipient.
 * - priorTotal: sum of amount of earlier approved/executing/completed actions to that recipient.
 * - averagePayout: average amount of prior COMPLETED payouts across the entire system (excluding blocked, rejected, failed, pending).
 * - multipleOfAverage: (action.amount / averagePayout) rounded to 1 decimal place if prior completed payouts count >= 3; otherwise null.
 * - spentToday: current today's spend.
 * - projectedSpend: spentToday + (action.type !== 'send_invoice' ? action.amount : 0).
 * - wouldExceedCap: projectedSpend > rules.dailyCap (for non-invoices).
 * - ruleFired: action.ruleFired.
 * - sourceType: 'typed' | 'document' | 'agent'.
 */
export function buildBriefFacts(
  action: StoredAction,
  history: StoredAction[],
  spentToday: number,
  rules: Rules
): BriefFacts {
  const recipientTarget = action.recipient.trim().toLowerCase();

  // Exclude the current action itself from prior history if present
  const priorHistory = history.filter((h) => h.id !== action.id);

  // Valid successful statuses that count as real historical payments to this recipient
  const qualifyingStatuses = new Set(["approved", "executing", "completed"]);

  const priorToRecipient = priorHistory.filter(
    (h) =>
      h.recipient.trim().toLowerCase() === recipientTarget &&
      qualifyingStatuses.has(h.status)
  );

  const priorPaymentCount = priorToRecipient.length;
  const priorTotal = priorToRecipient.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
  const isFirstPaymentToRecipient = priorPaymentCount === 0;

  // Completed payouts in the system for average calculations
  const completedPayouts = priorHistory.filter(
    (h) => h.type === "send_payout" && h.status === "completed"
  );

  let averagePayout: number | null = null;
  let multipleOfAverage: number | null = null;

  if (completedPayouts.length >= 3) {
    const totalPayoutsAmt = completedPayouts.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
    const avg = totalPayoutsAmt / completedPayouts.length;
    averagePayout = Math.round(avg * 100) / 100;
    if (avg > 0) {
      multipleOfAverage = Math.round((action.amount / avg) * 10) / 10;
    }
  }

  const isMoneyMoving = action.type !== "send_invoice";
  const projectedSpend = spentToday + (isMoneyMoving ? action.amount : 0);
  const wouldExceedCap = isMoneyMoving && projectedSpend > rules.dailyCap;

  return {
    actionId: action.id,
    amount: action.amount,
    type: action.type,
    isFirstPaymentToRecipient,
    priorPaymentCount,
    priorTotal: Math.round(priorTotal * 100) / 100,
    averagePayout,
    multipleOfAverage,
    spentToday: Math.round(spentToday * 100) / 100,
    projectedSpend: Math.round(projectedSpend * 100) / 100,
    dailyCap: rules.dailyCap,
    wouldExceedCap,
    ruleFired: action.ruleFired,
    sourceType: normalizeSourceType(action.source),
  };
}

/**
 * Builds a deterministic human-readable sentence from BriefFacts.
 * Always <= 160 characters.
 */
export function buildTemplateBrief(facts: BriefFacts): string {
  const parts: string[] = [];

  // First payment vs repeat payment
  if (facts.isFirstPaymentToRecipient) {
    parts.push("First payment to this recipient");
  } else {
    parts.push(
      `Paid ${facts.priorPaymentCount} time${facts.priorPaymentCount === 1 ? "" : "s"} prior ($${facts.priorTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })})`
    );
  }

  // Multiple of average if present
  if (facts.multipleOfAverage !== null && facts.multipleOfAverage >= 2.0) {
    parts.push(`${facts.multipleOfAverage}x your average payout`);
  }

  // Over cap warning vs within spend
  if (facts.wouldExceedCap) {
    parts.push(
      `exceeds $${facts.dailyCap.toLocaleString()} daily cap ($${facts.projectedSpend.toLocaleString()} projected)`
    );
  } else if (facts.ruleFired === "auto_limit") {
    parts.push("exceeds auto-approve limit");
  }

  const sentence = parts.join("; ") + ".";
  if (sentence.length > 160) {
    return sentence.slice(0, 157) + "...";
  }
  return sentence;
}

