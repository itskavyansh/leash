import React, { useMemo, useState, useEffect } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  ColDef,
  RowClickedEvent,
} from "ag-grid-community";
import type { StoredAction } from "@/lib/types";
import { StatusBadge } from "./statusHelper";

ModuleRegistry.registerModules([AllCommunityModule]);

// Light theme with themeQuartz.withParams
const lightTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#10231C",
  headerBackgroundColor: "#F7F9F8",
  headerTextColor: "#58675F",
  borderColor: "#E7ECE9",
  accentColor: "#0F5C45",
  chromeBackgroundColor: "#FFFFFF",
  fontSize: 13,
  rowHeight: 60,
  headerHeight: 36,
});

interface ActivityFeedProps {
  actions: StoredAction[];
  pendingActions: StoredAction[];
  onActionHandled: () => Promise<void>;
  onRefresh?: () => Promise<void> | void;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  actions,
  pendingActions,
  onActionHandled,
  onRefresh,
}) => {
  const [quickFilterText, setQuickFilterText] = useState("");
  const [selectedAction, setSelectedAction] = useState<StoredAction | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Record<string, "approve" | "reject" | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedAction(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const formatCompactTime = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    const day = d.getDate();
    const month = d.toLocaleString("en-US", { month: "short" });
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase();
    return `${day} ${month}, ${time}`;
  };

  const renderTypeCell = (type: string) => {
    if (type === "send_invoice") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink)]">
          <svg className="w-3.5 h-3.5 text-[var(--color-ink-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Invoice</span>
        </span>
      );
    }
    if (type === "issue_refund") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink)]">
          <svg className="w-3.5 h-3.5 text-[var(--color-ink-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
          <span>Refund</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink)]">
        <svg className="w-3.5 h-3.5 text-[var(--color-ink-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
        <span>Payout</span>
      </span>
    );
  };

  const columnDefs = useMemo<ColDef<StoredAction>[]>(() => {
    return [
      {
        field: "createdAt",
        headerName: "Time",
        width: 110,
        sort: "desc",
        valueFormatter: (params) => {
          if (!params.value) return "";
          return formatCompactTime(params.value);
        },
        cellClass: "tabular-nums text-[13px] text-[var(--color-ink-muted)] flex items-center",
        filter: false,
        suppressHeaderMenuButton: true,
      },
      {
        field: "type",
        headerName: "Type",
        width: 100,
        cellRenderer: (params: { value?: string }) => {
          if (!params.value) return "";
          return renderTypeCell(params.value);
        },
        cellClass: "flex items-center",
        filter: "agTextColumnFilter",
        suppressHeaderMenuButton: true,
      },
      {
        field: "recipient",
        headerName: "Request",
        flex: 1,
        minWidth: 260,
        cellRenderer: (params: { data?: StoredAction }) => {
          if (!params.data) return null;
          return (
            <div className="flex flex-col justify-center h-full py-1 overflow-hidden" title={params.data.recipient}>
              <span className="truncate text-[15px] font-medium text-[var(--color-ink)] leading-snug">
                {params.data.recipient}
              </span>
              <span className="truncate text-[13px] text-[var(--color-ink-muted)] leading-snug" title={params.data.reason}>
                {params.data.reason}
              </span>
            </div>
          );
        },
        filter: "agTextColumnFilter",
        suppressHeaderMenuButton: true,
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 120,
        cellRenderer: (params: { value?: number }) => {
          if (params.value === undefined || params.value === null) return "";
          const amt = Number(params.value);
          const formatted = amt.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return (
            <div className="flex items-center justify-end w-full h-full">
              <span className="tabular-nums font-serif text-[20px] font-medium text-[var(--color-ink)]">
                <span className="text-[var(--color-ink-muted)] font-normal text-base mr-[1px]">$</span>
                {formatted}
              </span>
            </div>
          );
        },
        headerClass: "ag-right-aligned-header",
        filter: "agNumberColumnFilter",
        suppressHeaderMenuButton: true,
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        filter: "agTextColumnFilter",
        suppressHeaderMenuButton: true,
        cellRenderer: (params: { data?: StoredAction }) => {
          if (!params.data) return null;
          return (
            <div className="flex items-center h-full">
              <StatusBadge status={params.data.status} paypalStatus={params.data.paypalStatus} />
            </div>
          );
        },
      },
    ];
  }, []);

  const onRowClicked = (event: RowClickedEvent<StoredAction>) => {
    if (event.data) {
      setSelectedAction(event.data);
    }
  };

  // Determine timeline steps for drawer
  const timelineSteps = useMemo(() => {
    if (!selectedAction) return [];

    const isBlocked = selectedAction.status === "blocked";
    const isRejected = selectedAction.status === "rejected";
    const isPendingApproval = selectedAction.status === "pending_approval";
    const isFailed = selectedAction.status === "failed";
    const hasPaypalId = Boolean(selectedAction.paypalId);
    const paypalStatus = (selectedAction.paypalStatus ?? "").toUpperCase();
    const isSettled =
      paypalStatus === "SUCCESS" ||
      paypalStatus === "PAID" ||
      paypalStatus === "COMPLETED";
    const isSettling =
      paypalStatus === "PENDING" || paypalStatus === "SENT";

    // Step 1: Requested
    const step1 = {
      label: "Requested",
      state: "done" as const,
      detail: formatCompactTime(selectedAction.createdAt),
    };

    // Step 2: Decision
    let step2State: "done" | "current" | "not_reached" | "failed" = "done";
    let step2Detail = `${selectedAction.decision} • ${selectedAction.reason}`;
    if (isPendingApproval) {
      step2State = "current";
      step2Detail = "Waiting for your approval";
    } else if (isBlocked || isRejected) {
      step2State = "failed";
      step2Detail = isBlocked ? "Blocked by policy" : "Rejected by you";
    }
    const step2 = {
      label: "Decision",
      state: step2State,
      detail: step2Detail,
    };

    // Step 3: Sent to PayPal
    let step3State: "done" | "current" | "not_reached" | "failed" = "not_reached";
    let step3Detail = selectedAction.paypalId || "Not submitted";
    if (isBlocked || isRejected) {
      step3State = "not_reached";
      step3Detail = "Skipped";
    } else if (hasPaypalId) {
      step3State = "done";
      step3Detail = `ID: ${selectedAction.paypalId}`;
    } else if (selectedAction.status === "executing") {
      step3State = "current";
      step3Detail = "In progress";
    } else if (isFailed && !hasPaypalId) {
      step3State = "failed";
      step3Detail = selectedAction.errorMessage || "Submission failed";
    }
    const step3 = {
      label: "Sent to PayPal",
      state: step3State,
      detail: step3Detail,
    };

    // Step 4: Settled
    let step4State: "done" | "current" | "not_reached" | "failed" = "not_reached";
    let step4Detail = selectedAction.paypalStatus || "Pending";
    if (isSettled) {
      step4State = "done";
      step4Detail = paypalStatus;
    } else if (isSettling) {
      step4State = "current";
      step4Detail = "In progress (settling)";
    } else if (isFailed || paypalStatus === "FAILED" || paypalStatus === "CANCELLED") {
      step4State = "failed";
      step4Detail = selectedAction.errorMessage || "Failed";
    } else if (isBlocked || isRejected) {
      step4State = "not_reached";
      step4Detail = "Skipped";
    }
    const step4 = {
      label: "Settled",
      state: step4State,
      detail: step4Detail,
    };

    return [step1, step2, step3, step4];
  }, [selectedAction]);

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5 relative flex flex-col gap-4">
      {/* Panel header: "Activity" in Newsreader 22px + subtitle + wait-tint chip when > 0 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-line-soft)]">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-[22px] font-medium text-[var(--color-ink)] leading-none">
            Activity
          </h2>
          {pendingActions.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--color-wait-tint)] text-[var(--color-wait)]">
              {pendingActions.length} needs you
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-[13px] text-[var(--color-ink-muted)]">
            Every request, decision and payment.
          </span>

          {/* Quick filter search */}
          <div className="relative w-full sm:w-56">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] pointer-events-none">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={quickFilterText}
              onChange={(e) => setQuickFilterText(e.target.value)}
              placeholder="Search ledger..."
              aria-label="Quick search ledger"
              className="w-full h-8 pl-8 pr-3 text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-[var(--color-page)] border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            />
          </div>
        </div>
      </div>

      {/* Pending band: for each pending_approval action, full-width row with row-tint & row-border */}
      {pendingActions.length > 0 ? (
        <div className="space-y-2">
          {pendingActions.map((action) => {
            const currentLoading = loadingIds[action.id];
            const errorMessage = errors[action.id];
            const dateStr = new Date(action.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <div
                key={action.id}
                className="bg-[var(--color-wait-row-tint)] border-y border-[var(--color-wait-row-border)] px-5 py-3.5 rounded-[var(--radius-control)] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: label + recipient (15px, full) + reason (13px) */}
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[var(--color-wait)]">
                    Needs you · {dateStr}
                  </div>
                  <div className="text-[15px] font-medium text-[var(--color-ink)] break-all">
                    {action.recipient}
                  </div>
                  <div className="text-[13px] text-[var(--color-ink-muted)]">
                    {action.reason}
                  </div>
                  {errorMessage && (
                    <div className="text-xs text-[var(--color-stop)] font-medium pt-1">
                      {errorMessage}
                    </div>
                  )}
                </div>

                {/* Right: amount in Newsreader 28px + Reject outline button + Approve brand button */}
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <span className="font-serif text-[28px] font-medium text-[var(--color-ink)] tabular-nums">
                    <span className="text-[var(--color-ink-muted)] text-xl font-normal mr-[1px]">$</span>
                    {action.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleReject(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="h-9 px-3 rounded-[var(--radius-control)] bg-white border border-[var(--color-line)] hover:bg-[var(--color-page)] text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-btn cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
                  >
                    {currentLoading === "reject" ? "Rejecting..." : "Reject"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApprove(action.id)}
                    disabled={Boolean(currentLoading)}
                    className="h-9 px-4 rounded-[var(--radius-control)] bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-1 inline-flex items-center justify-center min-w-[72px]"
                  >
                    {currentLoading === "approve" ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[13px] text-[var(--color-ink-muted)] py-1">
          Nothing waiting for you.
        </div>
      )}

      {/* Ledger AG Grid container (fixed-height scroll area, ~6 rows visible at 60px rowHeight + 36px header = 396px) */}
      <div className="w-full h-[396px] rounded-[var(--radius-control)] overflow-hidden border border-[var(--color-line)]">
        <AgGridReact<StoredAction>
          theme={lightTheme}
          rowData={actions}
          columnDefs={columnDefs}
          quickFilterText={quickFilterText}
          onRowClicked={onRowClicked}
          rowSelection={{
            mode: "singleRow",
            checkboxes: false,
            enableClickSelection: true,
          }}
          pagination={false}
          suppressPaginationPanel={true}
          defaultColDef={{
            sortable: true,
            resizable: true,
            suppressHeaderMenuButton: true,
          }}
        />
      </div>

      {/* Details Side Drawer */}
      {selectedAction && (
        <>
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => setSelectedAction(null)}
            aria-hidden="true"
          />

          <div
            className="fixed inset-y-0 right-0 w-full max-w-[440px] bg-[var(--color-surface)] border-l border-[var(--color-line)] shadow-[0_10px_30px_rgba(0,0,0,0.08)] z-50 flex flex-col p-6 overflow-y-auto transition-transform duration-[180ms] ease-out"
            role="dialog"
            aria-labelledby="drawer-title"
            aria-modal="true"
          >
            {/* Drawer top close */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
              <span className="text-[13px] text-[var(--color-ink-muted)] font-medium">
                Transaction details
              </span>
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="w-8 h-8 rounded-[var(--radius-control)] hover:bg-[var(--color-page)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] flex items-center justify-center transition-btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
                aria-label="Close drawer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Top overview: amount in Newsreader 32px with status chip */}
            <div className="py-4 border-b border-[var(--color-line)] space-y-2">
              <div className="flex items-center justify-between">
                <StatusBadge
                  status={selectedAction.status}
                  paypalStatus={selectedAction.paypalStatus}
                />
              </div>

              <div>
                <span className="font-serif text-[32px] font-medium text-[var(--color-ink)] tabular-nums leading-tight">
                  <span className="text-[var(--color-ink-muted)] text-2xl font-normal mr-[1px]">$</span>
                  {selectedAction.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="text-sm text-[var(--color-ink)] flex items-center gap-1.5 pt-0.5">
                <span className="font-medium">{selectedAction.type.replace("_", " ")}</span>
                <span className="text-[var(--color-ink-muted)]">to</span>
                <span className="font-medium break-all">{selectedAction.recipient}</span>
              </div>
            </div>

            {/* Settlement timeline */}
            <div className="py-4 border-b border-[var(--color-line)]">
              <h3 className="text-xs font-semibold text-[var(--color-ink)] mb-3">
                Settlement timeline
              </h3>

              <div className="relative pl-6 space-y-4">
                <div className="absolute left-2.5 top-2 bottom-2 w-[1px] bg-[var(--color-line)]" />

                {timelineSteps.map((step, idx) => {
                  let textColor = "text-[var(--color-ink)]";

                  if (step.state === "current") {
                    textColor = "text-[var(--color-live)]";
                  } else if (step.state === "failed") {
                    textColor = "text-[var(--color-stop)]";
                  } else if (step.state === "not_reached") {
                    textColor = "text-[var(--color-ink-muted)]";
                  }

                  return (
                    <div key={idx} className="relative flex items-start gap-3">
                      <span
                        className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                          step.state === "done"
                            ? "bg-[var(--color-ok-solid)] text-white"
                            : step.state === "failed"
                            ? "bg-[var(--color-stop-solid)] text-white"
                            : step.state === "current"
                            ? "bg-[var(--color-live-solid)] text-white pulse-live"
                            : "bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-muted)]"
                        }`}
                      >
                        {idx + 1}
                      </span>

                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${textColor}`}>{step.label}</span>
                          {step.state === "current" && (
                            <span className="text-[11px] text-[var(--color-live)] font-normal">
                              (In progress)
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
                          {step.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Plain definition list */}
            <div className="py-4 space-y-3 text-xs">
              <dl className="space-y-2.5">
                <div>
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">Action ID</dt>
                  <dd className="font-mono text-[11px] text-[var(--color-ink)] mt-0.5 break-all">
                    {selectedAction.id}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">Original request</dt>
                  <dd className="text-[var(--color-ink)] mt-0.5">
                    {selectedAction.requestText || "Direct API execution"}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">Policy decision</dt>
                  <dd className="text-[var(--color-ink)] mt-0.5">
                    {selectedAction.decision} • Rule {selectedAction.ruleFired}
                  </dd>
                </div>

                {selectedAction.reference && (
                  <div>
                    <dt className="text-[11px] text-[var(--color-ink-muted)]">Reference</dt>
                    <dd className="font-mono text-[11px] text-[var(--color-ink)] mt-0.5 break-all">
                      {selectedAction.reference}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">PayPal ID</dt>
                  <dd className="font-mono text-[11px] text-[var(--color-ink)] mt-0.5">
                    {selectedAction.paypalId || "—"}
                  </dd>
                </div>

                <div>
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">PayPal status</dt>
                  <dd className="font-mono text-[11px] text-[var(--color-ink)] mt-0.5">
                    {selectedAction.paypalStatus || "—"}
                  </dd>
                </div>

                {selectedAction.errorMessage && (
                  <div>
                    <dt className="text-[11px] text-[var(--color-stop)]">Error</dt>
                    <dd className="text-[var(--color-stop)] mt-0.5">
                      {selectedAction.errorMessage}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Refresh status button as a brand outline button */}
              {selectedAction.paypalId && selectedAction.status === "completed" && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={async () => {
                      setIsRefreshing(true);
                      try {
                        const res = await fetch(`/api/actions/${selectedAction.id}/refresh`, {
                          method: "POST",
                        });
                        if (res.ok) {
                          const updated = (await res.json()) as StoredAction;
                          setSelectedAction(updated);
                          if (onRefresh) {
                            await onRefresh();
                          }
                        }
                      } catch (err) {
                        console.error("Failed to refresh action status:", err);
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-[var(--radius-control)] border border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-brand-tint)] text-xs font-medium transition-btn cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] inline-flex items-center"
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh status"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
