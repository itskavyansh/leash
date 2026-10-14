import React, { useState } from "react";
import type { StoredAction } from "@/lib/types";
import { MoneyDisplay } from "./MoneyDisplay";

interface ApprovalInboxProps {
  pendingActions: StoredAction[];
  onActionHandled: () => Promise<void>;
}

export const ApprovalInbox: React.FC<ApprovalInboxProps> = ({
  pendingActions,
  onActionHandled,
}) => {
  const [loadingIds, setLoadingIds] = useState<Record<string, "approve" | "reject" | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleApprove = async (id: string) => {
    setLoadingIds((prev) => ({ ...prev, [id]: "approve" }));
    setErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const res = await fetch(`/api/actions/${id}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to approve (status ${res.status})`);
      }

      await onActionHandled();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Error approving action",
      }));
    } finally {
      setLoadingIds((prev) => ({ ...prev, [id]: null }));
    }
  };

  const handleReject = async (id: string) => {
    setLoadingIds((prev) => ({ ...prev, [id]: "reject" }));
    setErrors((prev) => ({ ...prev, [id]: "" }));

    try {
      const res = await fetch(`/api/actions/${id}/reject`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to reject (status ${res.status})`);
      }

      await onActionHandled();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Error rejecting action",
      }));
    } finally {
      setLoadingIds((prev) => ({ ...prev, [id]: null }));
    }
  };

  const formatType = (type: string) => {
    switch (type) {
      case "send_payout":
        return "Payout";
      case "send_invoice":
        return "Invoice";
      case "issue_refund":
        return "Refund";
      default:
        return type.replace("_", " ");
    }
  };

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5">
      {/* Header: "Needs you" + pending count only when > 0 */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Needs you</h2>
          {pendingActions.length > 0 && (
            <span className="text-[13px] tabular-nums font-medium text-[var(--color-wait)]">
              {pendingActions.length}
            </span>
          )}
        </div>
      </div>

      {/* Empty state: single quiet line */}
      {pendingActions.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-muted)] py-2">Nothing waiting for you.</p>
      ) : (
        <div className="divide-y divide-[var(--color-line)]">
          {pendingActions.map((action) => {
            const currentLoading = loadingIds[action.id];
            const errorMessage = errors[action.id];
            const dateStr = new Date(action.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <div key={action.id} className="py-4 first:pt-1 last:pb-1 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    {/* Amount large: 16px/600, tabular */}
                    <MoneyDisplay
                      amount={action.amount}
                      className="text-base font-semibold"
                      valueClassName="text-base font-semibold"
                    />

                    {/* Type + recipient on line below */}
                    <div className="text-sm text-[var(--color-ink)] flex items-center gap-1.5 flex-wrap">
                      <span>{formatType(action.type)}</span>
                      <span className="text-[var(--color-ink-muted)]">to</span>
                      <span className="font-medium">{action.recipient}</span>
                    </div>

                    {/* Plain-English reason in ink-muted */}
                    <p className="text-[13px] text-[var(--color-ink-muted)] mt-1">
                      {action.reason}
                    </p>
                  </div>

                  {/* Time at right */}
                  <span className="text-[13px] tabular-nums text-[var(--color-ink-muted)] shrink-0">
                    {dateStr}
                  </span>
                </div>

                {errorMessage && (
                  <p className="text-[13px] text-[var(--color-stop)]" role="alert">
                    {errorMessage}
                  </p>
                )}

                {/* Actions: Approve (ink button) and Reject (quiet text button) */}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleReject(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-btn underline underline-offset-4 decoration-[var(--color-line-strong)] hover:decoration-[var(--color-ink)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 rounded-[var(--radius-control)] py-1 px-2 min-h-[40px] inline-flex items-center"
                  >
                    {currentLoading === "reject" ? "Rejecting..." : "Reject"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApprove(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="h-9 px-4 rounded-[var(--radius-control)] bg-[var(--color-ink)] hover:bg-[#222733] text-[var(--color-surface)] text-sm font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 inline-flex items-center justify-center min-w-[72px]"
                  >
                    {currentLoading === "approve" ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
