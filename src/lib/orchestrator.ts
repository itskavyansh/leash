import { ActionRecord, getRules, getSpentToday, insertAction } from "./db";
import { evaluate } from "./policy";
import { DelayFn, parseRequest, ParseResult } from "./ai/parse";
import { LlmProvider } from "./ai/provider";
import { ActionStatus } from "./types";

export interface HandleRequestResult {
  parse: ParseResult;
  action?: ActionRecord;
}

/**
 * Maps policy decision to stored action status:
 * - approve -> "approved"
 * - needs_approval -> "pending_approval"
 * - blocked -> "blocked"
 */
function mapDecisionToStatus(decision: "approve" | "needs_approval" | "blocked"): ActionStatus {
  switch (decision) {
    case "approve":
      return "approved";
    case "needs_approval":
      return "pending_approval";
    case "blocked":
      return "blocked";
  }
}

/**
 * Orchestrator: parses natural language request, evaluates policy if an action was extracted,
 * and records the action in the database.
 */
export async function handleRequest(
  text: string,
  provider?: LlmProvider,
  delayFn?: DelayFn
): Promise<HandleRequestResult> {
  const parse = await parseRequest(text, provider, delayFn);

  if (parse.kind !== "action") {
    return { parse };
  }

  const rules = getRules();
  const spentToday = getSpentToday();
  const policyResult = evaluate(parse.action, rules, spentToday);

  const status = mapDecisionToStatus(policyResult.decision);

  const storedAction = insertAction({
    type: parse.action.type,
    amount: parse.action.amount,
    currency: parse.action.currency,
    recipient: parse.action.recipient,
    description: parse.action.description,
    reference: parse.action.reference ?? null,
    status,
    decision: policyResult.decision,
    reason: policyResult.reason,
    ruleFired: policyResult.ruleFired,
    requestText: text,
  });

  return {
    parse,
    action: storedAction,
  };
}
