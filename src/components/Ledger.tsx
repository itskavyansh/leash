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
import { MoneyDisplay } from "./MoneyDisplay";

// Register Community Modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Light theme with themeQuartz.withParams
const lightTheme = themeQuartz.withParams({
  backgroundColor: "#FFFFFF",
  foregroundColor: "#14171F",
  headerBackgroundColor: "#FFFFFF",
  headerTextColor: "#5B6270",
  borderColor: "#E2E5EA",
  accentColor: "#14171F",
  chromeBackgroundColor: "#FFFFFF",
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 40,
});

interface LedgerProps {
  actions: StoredAction[];
  onRefresh?: () => Promise<void> | void;
}

export const Ledger: React.FC<LedgerProps> = ({ actions, onRefresh }) => {
  const [quickFilterText, setQuickFilterText] = useState("");
  const [selectedAction, setSelectedAction] = useState<StoredAction | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedAction(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  const formatTypeName = (type: string) => {
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

  const columnDefs = useMemo<ColDef<StoredAction>[]>(() => {
    return [
      {
        field: "createdAt",
        headerName: "Time",
        width: 150,
        sort: "desc",
        valueFormatter: (params) => {
          if (!params.value) return "";
          return formatCompactTime(params.value);
        },
        cellClass: "tabular-nums text-[13px] text-[var(--color-ink-muted)]",
        filter: "agDateColumnFilter",
      },
      {
        field: "type",
        headerName: "Type",
        width: 110,
        valueFormatter: (params) => {
          if (!params.value) return "";
          return formatTypeName(params.value);
        },
        filter: "agTextColumnFilter",
      },
      {
        field: "recipient",
        headerName: "Recipient",
        flex: 1.2,
        minWidth: 160,
        filter: "agTextColumnFilter",
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
            <span className="tabular-nums font-medium text-right block w-full">
              <span className="text-[var(--color-ink-muted)] font-normal mr-[1px]">$</span>
              <span className="text-[var(--color-ink)]">{formatted}</span>
            </span>
          );
        },
        headerClass: "ag-right-aligned-header",
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        headerName: "Status",
        width: 150,
        filter: "agTextColumnFilter",
        cellRenderer: (params: { data?: StoredAction }) => {
          if (!params.data) return null;
          return <StatusBadge status={params.data.status} paypalStatus={params.data.paypalStatus} />;
        },
      },
      {
        field: "reason",
        headerName: "Decision reason",
        flex: 1.8,
        minWidth: 180,
        tooltipField: "reason",
        filter: "agTextColumnFilter",
        cellClass: "text-[var(--color-ink-muted)] truncate",
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
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Ledger</h2>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Record of all processed requests and webhooks
          </p>
        </div>

        {/* Quiet search field */}
        <div className="w-full sm:w-60">
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            placeholder="Search ledger..."
            aria-label="Quick search ledger"
            className="w-full h-8 text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[var(--radius-control)] px-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1"
          />
        </div>
      </div>

      {/* Grid container with horizontal scroll handling */}
      <div className="w-full h-[400px] rounded-[var(--radius-control)] overflow-hidden border border-[var(--color-line)]">
        <AgGridReact<StoredAction>
          theme={lightTheme}
          rowData={actions}
          columnDefs={columnDefs}
          quickFilterText={quickFilterText}
          onRowClicked={onRowClicked}
          rowSelection={{ mode: "singleRow" }}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
          defaultColDef={{
            sortable: true,
            resizable: true,
          }}
        />
      </div>

      {/* Side Drawer for Details */}
      {selectedAction && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => setSelectedAction(null)}
            aria-hidden="true"
          />

          {/* Drawer container: white, 440px max, slides in 180ms, one soft shadow */}
          <div
            className="fixed inset-y-0 right-0 w-full max-w-[440px] bg-[var(--color-surface)] border-l border-[var(--color-line)] shadow-[0_10px_30px_rgba(0,0,0,0.08)] z-50 flex flex-col p-6 overflow-y-auto transition-transform duration-[180ms] ease-out"
            role="dialog"
            aria-labelledby="drawer-title"
            aria-modal="true"
          >
            {/* Drawer top close button */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--color-line)]">
              <span className="text-[13px] text-[var(--color-ink-muted)] font-medium">
                Transaction details
              </span>
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="w-8 h-8 rounded-[var(--radius-control)] hover:bg-[var(--color-paper)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] flex items-center justify-center transition-btn cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)]"
                aria-label="Close drawer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Top overview: amount, type, recipient, status */}
            <div className="py-4 border-b border-[var(--color-line)] space-y-1">
              <div className="flex items-baseline justify-between">
                <MoneyDisplay
                  amount={selectedAction.amount}
                  className="text-2xl font-semibold"
                  valueClassName="text-2xl font-semibold"
                />
                <StatusBadge
                  status={selectedAction.status}
                  paypalStatus={selectedAction.paypalStatus}
                />
              </div>

              <div className="text-sm text-[var(--color-ink)] flex items-center gap-1.5 pt-1">
                <span className="font-medium">{formatTypeName(selectedAction.type)}</span>
                <span className="text-[var(--color-ink-muted)]">to</span>
                <span className="font-medium">{selectedAction.recipient}</span>
              </div>
            </div>

            {/* Vertical settlement timeline */}
            <div className="py-4 border-b border-[var(--color-line)]">
              <h3 className="text-xs font-semibold text-[var(--color-ink)] mb-3">
                Settlement timeline
              </h3>

              <div className="relative pl-6 space-y-4">
                {/* Vertical connecting line */}
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
                      {/* Real sequence numbered marker / state indicator */}
                      <span
                        className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                          step.state === "done"
                            ? "bg-[var(--color-ok)] text-white"
                            : step.state === "failed"
                            ? "bg-[var(--color-stop)] text-white"
                            : step.state === "current"
                            ? "bg-[var(--color-live)] text-white"
                            : "bg-[var(--color-surface)] border border-[var(--color-line-strong)] text-[var(--color-ink-muted)]"
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

            {/* Remaining detail fields as a plain definition list */}
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

              {/* Refresh status button unchanged in behavior */}
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
                    className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-btn underline underline-offset-4 decoration-[var(--color-line-strong)] hover:decoration-[var(--color-ink)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 rounded-[var(--radius-control)] py-1 min-h-[40px] inline-flex items-center"
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
