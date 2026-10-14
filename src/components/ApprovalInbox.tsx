import React, { useState } from "react";
import type { StoredAction } from "@/lib/types";

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

  const formatActionType = (type: string) => {
    switch (type) {
      case "send_payout":
        return { label: "Payout", icon: "💸" };
      case "send_invoice":
        return { label: "Invoice", icon: "📄" };
      case "issue_refund":
        return { label: "Refund", icon: "↩️" };
      default:
        return { label: type, icon: "💳" };
    }
  };

  return (
    <div className="bg-[#121620] border border-zinc-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Approval Inbox</h2>
          {pendingActions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {pendingActions.length}
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500">Requires manual authorization</span>
      </div>

      {pendingActions.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/30">
          <div className="w-10 h-10 mx-auto rounded-full bg-zinc-800/60 flex items-center justify-center text-zinc-400 mb-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-300">Nothing waiting for you.</p>
          <p className="text-xs text-zinc-500 mt-0.5">All actions have been reviewed or auto-handled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingActions.map((action) => {
            const { label, icon } = formatActionType(action.type);
            const currentLoading = loadingIds[action.id];
            const errorMessage = errors[action.id];

            return (
              <div
                key={action.id}
                className="p-4 rounded-xl border border-amber-500/25 bg-[#161a26] hover:border-amber-500/40 transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg" aria-hidden="true">{icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                          {label}
                        </span>
                        <span className="text-sm font-bold text-white">
                          ${action.amount.toFixed(2)} {action.currency}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate max-w-[260px] sm:max-w-md">
                        To: <span className="text-zinc-200">{action.recipient}</span>
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                    {new Date(action.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="bg-[#0f131c] rounded-lg p-2.5 text-xs text-zinc-300 border border-zinc-800/60">
                  <div className="text-zinc-400 font-medium">{action.description}</div>
                  <div className="mt-1 text-amber-300/90 text-[11px] flex items-center gap-1.5">
                    <span>Reason:</span>
                    <span className="text-zinc-300">{action.reason}</span>
                  </div>
                </div>

                {errorMessage && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-lg">
                    {errorMessage}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/50">
                  <button
                    type="button"
                    onClick={() => handleReject(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  >
                    {currentLoading === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all shadow-sm shadow-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    {currentLoading === "approve" ? "Approving..." : "Approve & Execute"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
