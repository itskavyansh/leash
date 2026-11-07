import { ActionRecord, getRules, getSpentToday, insertAction } from "./db";
import { evaluate } from "./policy";
import { DelayFn, parseRequest, ParseResult } from "./ai/parse";
import { LlmProvider } from "./ai/provider";
import { ActionStatus } from "./types";

export interface HandleRequestResult {
  parse: ParseResult;
  action?: ActionRecord;
}

export type ProcessRequestResult = HandleRequestResult;

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

  const rules = await getRules();
  const spentToday = await getSpentToday();
  const policyResult = evaluate(parse.action, rules, spentToday);

  const status = mapDecisionToStatus(policyResult.decision);

  const storedAction = await insertAction({
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
    source: "typed",
  });

  return {
    parse,
    action: storedAction,
  };
}

/**
 * Evaluates an already-extracted proposed action against policy, inserts it into the database,
 * and if approved, immediately executes it via executeAction and returns the final row.
 */
export async function processProposedAction(
  action: import("./types").ProposedAction,
  requestText?: string,
  deps?: import("./executor").ExecutorDeps,
  extraSpentToday: number = 0,
  source: string = "typed"
): Promise<ActionRecord> {
  const rules = await getRules();
  const dbSpentToday = await getSpentToday();
  const spentToday = dbSpentToday + extraSpentToday;
  const policyResult = evaluate(action, rules, spentToday);

  const status = mapDecisionToStatus(policyResult.decision);

  const storedAction = await insertAction({
    type: action.type,
    amount: action.amount,
    currency: action.currency,
    recipient: action.recipient,
    description: action.description,
    reference: action.reference ?? null,
    status,
    decision: policyResult.decision,
    reason: policyResult.reason,
    ruleFired: policyResult.ruleFired,
    requestText: requestText ?? null,
    source,
  });

  if (storedAction.status === "approved") {
    const { executeAction } = await import("./executor");
    return await executeAction(storedAction.id, deps);
  }

  return storedAction;
}

/**
 * Parses natural language request, evaluates policy, stores the action, and if the action
 * was approved, immediately executes it via executeAction and returns the final row.
 */
export async function processRequest(
  text: string,
  provider?: LlmProvider,
  deps?: import("./executor").ExecutorDeps,
  delayFn?: DelayFn
): Promise<HandleRequestResult> {
  const parse = await parseRequest(text, provider, delayFn);

  if (parse.kind !== "action") {
    return { parse };
  }

  const action = await processProposedAction(parse.action, text, deps);
  return {
    parse,
    action,
  };
}
