import {
  claimForExecution,
  getAction,
  getRules,
  updateAction,
} from "./db";
import { evaluateHardChecks } from "./policy";
import {
  createAndSendInvoice,
  issueRefund,
  sendPayout,
  ExecutionResult,
} from "./paypal/actions";
import { StoredAction } from "./types";

export type ActionRunner = (
  action: StoredAction,
  requestId: string
) => Promise<ExecutionResult>;

export interface ExecutorDeps {
  run?: {
    send_invoice?: ActionRunner;
    send_payout?: ActionRunner;
    issue_refund?: ActionRunner;
  };
}

const DEFAULT_RUNNERS: Record<StoredAction["type"], ActionRunner> = {
  send_invoice: createAndSendInvoice,
  send_payout: sendPayout,
  issue_refund: issueRefund,
};

/**
 * Extracts a safe error message and PayPal debug_id without exposing secrets.
 */
function extractSafeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Unknown execution error";
  }

  const raw = err.message;
  const debugMatch = raw.match(/debug_id=([^\s|]+)/);
  const debugId = debugMatch ? debugMatch[1] : null;

  // Extract body name/message if JSON
  const bodyMarker = "body=";
  const bodyIdx = raw.indexOf(bodyMarker);
  let safeDetail = "";

  if (bodyIdx !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(bodyIdx + bodyMarker.length));
      if (parsed && typeof parsed === "object") {
        if (parsed.message) {
          safeDetail = String(parsed.message);
        } else if (parsed.name) {
          safeDetail = String(parsed.name);
        }
      }
    } catch {
      // not JSON
    }
  }

  const base = safeDetail || "PayPal API execution failed";
  return debugId ? `${base} (debug_id: ${debugId})` : base;
}

/**
 * Executes an approved action.
 * If status is not "approved", returns an error without doing anything.
 * Uses atomic claimForExecution to prevent double execution.
 */
export async function executeAction(
  id: string,
  deps?: ExecutorDeps
): Promise<StoredAction> {
  const action = await getAction(id);
  if (!action) {
    throw new Error(`Action not found: ${id}`);
  }

  if (action.status !== "approved") {
    return action;
  }

  // Atomically claim the action for execution
  const claimed = await claimForExecution(id);
  if (!claimed) {
    // Already claimed or status changed concurrently
    const current = await getAction(id);
    return current!;
  }

  const runner =
    deps?.run?.[action.type] ?? DEFAULT_RUNNERS[action.type];

  if (!runner) {
    const updated = await updateAction(id, {
      status: "failed",
      errorMessage: `No runner registered for action type: ${action.type}`,
    });
    return updated!;
  }

  try {
    const result = await runner(action, action.id);
    const updated = await updateAction(id, {
      status: "completed",
      paypalId: result.paypalId,
      paypalStatus: result.paypalStatus,
      errorMessage: null,
    });
    return updated!;
  } catch (err) {
    const safeError = extractSafeErrorMessage(err);
    const updated = await updateAction(id, {
      status: "failed",
      errorMessage: safeError,
    });
    return updated!;
  }
}

/**
 * Approves a pending action after re-verifying HARD checks against current rules.
 * If hard checks fail, sets status "blocked".
 * If hard checks pass, sets status "approved" and immediately calls executeAction.
 */
export async function approveAction(
  id: string,
  deps?: ExecutorDeps
): Promise<StoredAction> {
  const action = await getAction(id);
  if (!action) {
    throw new Error(`Action not found: ${id}`);
  }

  if (action.status !== "pending_approval") {
    // Only valid from "pending_approval"
    return action;
  }

  const rules = await getRules();
  const hardCheck = evaluateHardChecks(
    {
      type: action.type,
      amount: action.amount,
      currency: "USD",
      recipient: action.recipient,
      description: action.description,
      ...(action.reference ? { reference: action.reference } : {}),
    },
    rules
  );

  if (hardCheck) {
    const updated = await updateAction(id, {
      status: "blocked",
      decision: "blocked",
      reason: hardCheck.reason,
      ruleFired: hardCheck.ruleFired,
    });
    return updated!;
  }

  // Set status "approved"
  await updateAction(id, {
    status: "approved",
    decision: "approve",
  });

  return executeAction(id, deps);
}

/**
 * Rejects an action. Only valid from "pending_approval". Sets status to "rejected".
 */
export async function rejectAction(id: string): Promise<StoredAction> {
  const action = await getAction(id);
  if (!action) {
    throw new Error(`Action not found: ${id}`);
  }

  if (action.status !== "pending_approval") {
    return action;
  }

  const updated = await updateAction(id, {
    status: "rejected",
  });
  return updated!;
}
