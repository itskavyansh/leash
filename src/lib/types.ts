export type ActionType = "send_invoice" | "send_payout" | "issue_refund";

export interface ProposedAction {
  type: ActionType;
  amount: number;
  currency: "USD";
  recipient: string; // email
  description: string;
  reference?: string; // e.g. capture id for refunds
}

export type Decision = "approve" | "needs_approval" | "blocked";

export type ActionStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "blocked"
  | "executing"
  | "completed"
  | "failed";

export interface StoredAction {
  id: string;
  createdAt: string;
  type: ActionType;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  reference: string | null;
  status: ActionStatus;
  decision: Decision;
  reason: string;
  ruleFired: string;
  paypalId: string | null;
  paypalStatus: string | null;
  errorMessage: string | null;
  requestText: string | null;
}

export interface PolicyResult {
  decision: Decision;
  reason: string;
  ruleFired: string;
}

export interface Rules {
  autoApproveLimit: number;
  hardLimit: number;
  dailyCap: number;
  allowedRecipients: string[];
  blockedActionTypes: ActionType[];
}
