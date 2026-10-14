import { listActions, StoredAction } from "./db";
import { isTerminalStatus, reconcileAction, ReconcileFetchFn } from "./paypal/reconcile";

export interface ReconcilePendingDeps {
  fetchFn?: ReconcileFetchFn;
  now?: () => number;
}

export interface ReconcilePendingResult {
  ran: boolean;
  checkedCount: number;
  changedCount: number;
}

let lastRunTime = 0;
let isRunning = false;

const THROTTLE_MS = 10_000;
const AGE_THRESHOLD_MS = 10_000;
const MAX_BATCH_SIZE = 10;

/**
 * Resets the throttle and execution guard for unit testing purposes.
 */
export function _resetThrottleForTests(): void {
  lastRunTime = 0;
  isRunning = false;
}

/**
 * Loads pending completed actions with non-terminal PayPal status, created >10s ago,
 * and reconciles their status in parallel.
 *
 * Enforces:
 * - Module-level throttle: runs at most once every 10 seconds across calls.
 * - Concurrency guard: two runs cannot overlap.
 */
export async function reconcilePending(
  deps?: ReconcilePendingDeps
): Promise<ReconcilePendingResult> {
  const getNow = deps?.now ?? Date.now;
  const now = getNow();

  // Guard: if already running, exit immediately
  if (isRunning) {
    return { ran: false, checkedCount: 0, changedCount: 0 };
  }

  // Throttle: at most once every 10 seconds
  if (now - lastRunTime < THROTTLE_MS) {
    return { ran: false, checkedCount: 0, changedCount: 0 };
  }

  isRunning = true;
  lastRunTime = now;

  try {
    const allActions = await listActions();

    // Filter candidate actions:
    // 1. status === "completed"
    // 2. paypalId is present
    // 3. paypalStatus is non-terminal
    // 4. created more than 10 seconds ago
    const candidates = allActions
      .filter((action) => {
        if (action.status !== "completed" || !action.paypalId) {
          return false;
        }

        if (isTerminalStatus(action.type, action.paypalStatus)) {
          return false;
        }

        const createdAtMs = new Date(action.createdAt).getTime();
        if (isNaN(createdAtMs) || now - createdAtMs < AGE_THRESHOLD_MS) {
          return false;
        }

        return true;
      })
      // Oldest first
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      // Up to 10 at a time
      .slice(0, MAX_BATCH_SIZE);

    if (candidates.length === 0) {
      return { ran: true, checkedCount: 0, changedCount: 0 };
    }

    const results = await Promise.allSettled(
      candidates.map((candidate: StoredAction) =>
        reconcileAction(candidate, deps?.fetchFn)
      )
    );

    let changedCount = 0;
    for (const res of results) {
      if (res.status === "fulfilled" && res.value.changed) {
        changedCount++;
      }
    }

    return {
      ran: true,
      checkedCount: candidates.length,
      changedCount,
    };
  } finally {
    isRunning = false;
  }
}
