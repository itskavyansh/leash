import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry,
  AllCommunityModule,
  themeQuartz,
  ColDef,
  RowClickedEvent,
  GridApi,
  FilterChangedEvent,
  GridReadyEvent,
} from "ag-grid-community";
import type { StoredAction } from "@/lib/types";
import { StatusBadge } from "./statusHelper";
import { FilterSpec, LedgerQueryResult } from "@/lib/ai/parseLedgerQuery";
import {
  filterSpecToAgGridModel,
  getFilterChips,
  FilterChip,
} from "@/lib/ledgerFilterMapping";

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
  spentToday?: number;
  dailyCap?: number;
}

function formatSource(source?: string | null): string {
  if (!source) return "Typed";
  const s = source.trim();
  if (s.toLowerCase() === "typed") return "Typed";
  if (s.toLowerCase() === "document") return "Document";
  if (s.toLowerCase().startsWith("agent:")) {
    const name = s.slice(6).trim();
    return name ? `Agent: ${name}` : "Agent";
  }
  return s;
}

function renderInboxSource(action: StoredAction): string {
  const s = (action.source || "typed").trim();
  if (s.toLowerCase().startsWith("agent:")) {
    const name = s.slice(6).trim();
    return `Agent "${name || "unknown"}" wants to pay`;
  }
  if (s.toLowerCase() === "document") {
    return "Document request wants to pay";
  }
  return "Typed request wants to pay";
}

function formatCompactTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString;
  }
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  actions,
  pendingActions,
  onActionHandled,
  spentToday = 0,
  dailyCap = 1000,
}) => {
  const [quickFilterText, setQuickFilterText] = useState("");
  const [selectedAction, setSelectedAction] = useState<StoredAction | null>(null);
  const [loadingIds, setLoadingIds] = useState<Record<string, "approve" | "reject" | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Ask your ledger state
  const [askInput, setAskInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [activeSpec, setActiveSpec] = useState<FilterSpec | null>(null);

  // AG Grid ref & visible filtered totals
  const gridApiRef = useRef<GridApi<StoredAction> | null>(null);
  const [filteredTotal, setFilteredTotal] = useState<number>(() =>
    actions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  );

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

  // Recalculate filtered total when filters or rows change
  const updateFilteredTotal = useCallback((api: GridApi<StoredAction>) => {
    let total = 0;
    api.forEachNodeAfterFilter((node) => {
      if (node.data && typeof node.data.amount === "number") {
        total += node.data.amount;
      }
    });
    setFilteredTotal(total);
  }, []);

  const onGridReady = (params: GridReadyEvent<StoredAction>) => {
    gridApiRef.current = params.api;
    updateFilteredTotal(params.api);
  };

  const onFilterChanged = (params: FilterChangedEvent<StoredAction>) => {
    updateFilteredTotal(params.api);
  };

  // Keep total in sync when raw actions change
  useEffect(() => {
    if (gridApiRef.current) {
      updateFilteredTotal(gridApiRef.current);
    } else {
      setFilteredTotal(
        actions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
      );
    }
  }, [actions, updateFilteredTotal]);

  // Apply or update filter spec into AG Grid
  const applySpecToGrid = useCallback((spec: FilterSpec | null) => {
    setActiveSpec(spec);
    if (!gridApiRef.current) return;

    if (!spec) {
      gridApiRef.current.setFilterModel(null);
      return;
    }

    const agModel = filterSpecToAgGridModel(spec);
    gridApiRef.current.setFilterModel(agModel);
  }, []);

  // Ask your ledger submit handler
  const handleAskSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = askInput.trim();
    if (!query) return;

    setIsAsking(true);
    setAskError(null);

    try {
      const res = await fetch("/api/ledger/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: query }),
      });

      if (!res.ok) {
        throw new Error("Could not read that, try rephrasing");
      }

      const data: LedgerQueryResult = await res.json();
      if (data.kind === "refusal") {
        setAskError(data.reason || "Could not read that, try rephrasing");
      } else if (data.kind === "error") {
        setAskError("Could not read that, try rephrasing");
      } else if (data.kind === "filter") {
        applySpecToGrid(data.spec);
        setAskInput("");
      }
    } catch {
      setAskError("Could not read that, try rephrasing");
    } finally {
      setIsAsking(false);
    }
  };

  // Clear all structured AI filters
  const handleClearFilters = () => {
    applySpecToGrid(null);
    setAskError(null);
  };

  // Remove a single active filter chip
  const handleRemoveChip = (key: keyof FilterSpec) => {
    if (!activeSpec) return;
    const nextSpec: FilterSpec = { ...activeSpec };

    if (key === "amountMin" || key === "amountMax") {
      delete nextSpec.amountMin;
      delete nextSpec.amountMax;
    } else if (key === "dateFrom" || key === "dateTo") {
      delete nextSpec.dateFrom;
      delete nextSpec.dateTo;
    } else if (key === "source" || key === "agentNameContains") {
      delete nextSpec.source;
      delete nextSpec.agentNameContains;
    } else {
      delete nextSpec[key];
    }

    const remainingKeys = Object.keys(nextSpec) as Array<keyof FilterSpec>;
    if (remainingKeys.length === 0) {
      applySpecToGrid(null);
    } else {
      applySpecToGrid(nextSpec);
    }
  };

  // Export filtered CSV using Community CsvExportModule
  const handleExportCsv = () => {
    if (!gridApiRef.current) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    gridApiRef.current.exportDataAsCsv({
      fileName: `leash-activity-${todayStr}.csv`,
      columnKeys: ["createdAt", "type", "source", "recipient", "amount", "status"],
    });
  };

  // Active filter chips
  const activeChips: FilterChip[] = useMemo(() => {
    if (!activeSpec) return [];
    return getFilterChips(activeSpec);
  }, [activeSpec]);

  const renderTypeCell = (type: string) => {
    if (type === "send_invoice") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-ink)]">
          <svg className="w-3.5 h-3.5 text-[var(--color-ink-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
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
        width: 140,
        sort: "desc",
        valueFormatter: (params) => {
          if (!params.value) return "";
          return formatCompactTime(params.value);
        },
        cellClass: "tabular-nums text-[13px] text-[var(--color-ink-muted)] flex items-center whitespace-nowrap",
        filter: "agDateColumnFilter",
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
        field: "source",
        headerName: "Source",
        width: 120,
        cellRenderer: (params: { value?: string | null }) => {
          const label = formatSource(params.value);
          return (
            <div className="flex items-center h-full">
              <span className="text-[13px] text-[var(--color-ink-muted)] truncate" title={label}>
                {label}
              </span>
            </div>
          );
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
        cellRenderer: (params: { data?: StoredAction & { isPinnedTotal?: boolean } }) => {
          if (!params.data) return null;
          if (params.data.isPinnedTotal) {
            return (
              <div className="flex items-center h-full">
                <span className="font-semibold text-xs tracking-wide uppercase text-[var(--color-ink-muted)]">
                  Totals (filtered)
                </span>
              </div>
            );
          }
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
        cellRenderer: (params: { value?: number; data?: StoredAction & { isPinnedTotal?: boolean } }) => {
          if (params.value === undefined || params.value === null) return "";
          const amt = Number(params.value);
          const formatted = amt.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const isTotal = params.data?.isPinnedTotal;
          return (
            <div className="flex items-center justify-end w-full h-full">
              <span className={`tabular-nums font-serif text-[20px] font-medium text-[var(--color-ink)] ${isTotal ? "font-semibold" : ""}`}>
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
        cellRenderer: (params: { data?: StoredAction & { isPinnedTotal?: boolean } }) => {
          if (!params.data || params.data.isPinnedTotal) return null;
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
    if (event.data && !(event.data as unknown as { isPinnedTotal?: boolean }).isPinnedTotal) {
      setSelectedAction(event.data);
    }
  };

  // Pinned bottom row for filtered total
  const pinnedBottomRowData = useMemo(() => {
    return [
      {
        isPinnedTotal: true,
        amount: filteredTotal,
        recipient: "Totals (filtered)",
        status: "" as StoredAction["status"],
        type: "send_payout" as StoredAction["type"],
        currency: "USD",
        createdAt: "",
        id: "pinned-bottom-total",
        description: "",
        reference: null,
        decision: "approve" as const,
        reason: "",
        ruleFired: "",
      },
    ];
  }, [filteredTotal]);

  // Determine timeline steps for drawer
  const timelineSteps = useMemo(() => {
    if (!selectedAction) return [];
    const isApproved = selectedAction.status === "approved";
    const isExecuting = selectedAction.status === "executing";
    const isCompleted = selectedAction.status === "completed";
    const isFailed = selectedAction.status === "failed";
    const isPending = selectedAction.status === "pending_approval";
    const isRejected = selectedAction.status === "rejected";
    const isBlocked = selectedAction.status === "blocked";

    const hasPaypalId = Boolean(selectedAction.paypalId);
    const paypalStatus = selectedAction.paypalStatus || "PENDING";
    const isSettled = isCompleted && (paypalStatus === "SUCCESS" || paypalStatus === "PAID" || paypalStatus === "COMPLETED");
    const isSettling = isCompleted && !isSettled;

    // Step 1: Requested
    const step1 = {
      label: "Requested",
      state: "done" as const,
      detail: selectedAction.createdAt ? formatCompactTime(selectedAction.createdAt) : "Received",
    };

    // Step 2: Policy decision
    let step2State: "done" | "current" | "not_reached" | "failed" = "done";
    let step2Detail = `${selectedAction.decision.toUpperCase()} (${selectedAction.ruleFired})`;
    if (isPending) {
      step2State = "current";
      step2Detail = "Waiting for human approval";
    } else if (isBlocked || isRejected) {
      step2State = "failed";
      step2Detail = isBlocked ? `Blocked (${selectedAction.ruleFired})` : "Rejected by human administrator";
    }
    const step2 = {
      label: "Policy check",
      state: step2State,
      detail: step2Detail,
    };

    // Step 3: Execution
    let step3State: "done" | "current" | "not_reached" | "failed" = "not_reached";
    let step3Detail = "Pending";
    if (isApproved) {
      step3State = "current";
      step3Detail = "Queued for execution";
    } else if (isExecuting) {
      step3State = "current";
      step3Detail = "Executing via PayPal...";
    } else if (isCompleted) {
      step3State = "done";
      step3Detail = selectedAction.paypalId ? `PayPal ID: ${selectedAction.paypalId}` : "Executed";
    } else if (isFailed && hasPaypalId) {
      step3State = "failed";
      step3Detail = selectedAction.errorMessage || `PayPal Error (${selectedAction.paypalId})`;
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

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-8 px-2.5 rounded-[var(--radius-control)] bg-[var(--color-page)] hover:bg-[var(--color-line)] text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] border border-[var(--color-line)] transition-btn cursor-pointer inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            title="Export filtered transactions to CSV"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export CSV</span>
          </button>

          {/* Quick filter search */}
          <div className="relative w-44 sm:w-48">
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
              placeholder="Search..."
              aria-label="Quick search ledger"
              className="w-full h-8 pl-8 pr-3 text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-[var(--color-page)] border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            />
          </div>

          {/* Ask your ledger form */}
          <form onSubmit={handleAskSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={askInput}
              onChange={(e) => {
                setAskInput(e.target.value);
                if (askError) setAskError(null);
              }}
              placeholder="Ask ledger e.g. blocked over $1k..."
              aria-label="Ask ledger with AI natural language query"
              maxLength={300}
              disabled={isAsking}
              className="w-48 sm:w-56 h-8 px-2.5 text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-[var(--color-page)] border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isAsking || !askInput.trim()}
              className="h-8 px-3 rounded-[var(--radius-control)] bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-medium transition-btn cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
            >
              {isAsking ? (
                <>
                  <svg className="animate-spin w-3 h-3 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  <span>Asking...</span>
                </>
              ) : (
                <span>Ask</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Ask Error Message */}
      {askError && (
        <div className="fade-in-verdict text-xs text-[var(--color-stop)] bg-[var(--color-stop-tint)] border border-[var(--color-stop)]/20 px-3 py-1.5 rounded-[var(--radius-control)] flex items-center justify-between">
          <span>{askError}</span>
          <button
            type="button"
            onClick={() => setAskError(null)}
            className="text-[var(--color-stop)] hover:underline ml-2 cursor-pointer font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Active Filters:
          </span>
          {activeChips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1.5 text-xs bg-[var(--color-page)] border border-[var(--color-line)] text-[var(--color-ink)] px-2.5 py-1 rounded-full"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={() => handleRemoveChip(chip.key)}
                className="w-3.5 h-3.5 rounded-full hover:bg-[var(--color-line-strong)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] flex items-center justify-center transition-colors cursor-pointer"
                title={`Remove ${chip.label}`}
                aria-label={`Remove filter ${chip.label}`}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] underline underline-offset-2 ml-1 cursor-pointer transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

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
                  <div className="text-[14px] text-[var(--color-ink-muted)]">
                    <span className="font-medium text-[var(--color-ink)]">{renderInboxSource(action)}</span>
                    {" "}
                    <span className="break-all font-mono text-xs">{action.recipient}</span>
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
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 self-end md:self-center">
                  <div className="flex items-center gap-3">
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

                    <div className="flex flex-col items-end gap-1">
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

                  {/* Over daily cap amber indicator if approving would push today's spend over daily cap */}
                  {action.type !== "send_invoice" && spentToday + action.amount > dailyCap && (
                    <span className="text-[11px] font-medium text-[var(--color-wait)] bg-[var(--color-wait-tint)] border border-[var(--color-wait-solid)]/30 px-2 py-0.5 rounded-full whitespace-nowrap self-end sm:self-center">
                      This puts you over your daily cap
                    </span>
                  )}
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
          pinnedBottomRowData={pinnedBottomRowData}
          onRowClicked={onRowClicked}
          onGridReady={onGridReady}
          onFilterChanged={onFilterChanged}
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
                  let circleClasses = "border-[var(--color-line)] bg-white";
                  let labelClasses = "text-[var(--color-ink-muted)]";
                  if (step.state === "done") {
                    circleClasses = "bg-[var(--color-brand)] border-[var(--color-brand)] text-white";
                    labelClasses = "text-[var(--color-ink)] font-medium";
                  } else if (step.state === "current") {
                    circleClasses = "bg-white border-2 border-[var(--color-brand)]";
                    labelClasses = "text-[var(--color-ink)] font-medium";
                  } else if (step.state === "failed") {
                    circleClasses = "bg-[var(--color-stop)] border-[var(--color-stop)] text-white";
                    labelClasses = "text-[var(--color-stop)] font-medium";
                  }

                  return (
                    <div key={idx} className="relative flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 z-10 transition-colors ${circleClasses}`}>
                        {step.state === "done" && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {step.state === "current" && (
                          <div className="w-2 h-2 rounded-full bg-[var(--color-brand)] animate-pulse" />
                        )}
                        {step.state === "failed" && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>

                      <div className="text-xs space-y-0.5">
                        <div className={labelClasses}>{step.label}</div>
                        <div className="text-[11px] text-[var(--color-ink-muted)]">{step.detail}</div>
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
                  <dt className="text-[11px] text-[var(--color-ink-muted)]">Source</dt>
                  <dd className="text-[var(--color-ink)] mt-0.5">
                    {formatSource(selectedAction.source)}
                  </dd>
                </div>

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
                    <dt className="text-[11px] text-[var(--color-stop)] font-medium">Error details</dt>
                    <dd className="text-[var(--color-stop)] mt-0.5">
                      {selectedAction.errorMessage}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
