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

// Register Community Modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Dark theme customized with Leash palette
const darkTheme = themeQuartz.withParams({
  backgroundColor: "#121620",
  foregroundColor: "#e4e4e7",
  headerBackgroundColor: "#0d1017",
  headerTextColor: "#a1a1aa",
  borderColor: "#27272a",
  accentColor: "#6366f1",
  chromeBackgroundColor: "#121620",
  fontSize: 13,
  rowHeight: 44,
  headerHeight: 40,
});

interface LedgerProps {
  actions: StoredAction[];
}

export const Ledger: React.FC<LedgerProps> = ({ actions }) => {
  const [quickFilterText, setQuickFilterText] = useState("");
  const [selectedAction, setSelectedAction] = useState<StoredAction | null>(null);

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

  const columnDefs = useMemo<ColDef<StoredAction>[]>(() => {
    return [
      {
        field: "createdAt",
        headerName: "Time",
        width: 130,
        sort: "desc",
        valueFormatter: (params) => {
          if (!params.value) return "";
          const d = new Date(params.value);
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        },
        filter: "agDateColumnFilter",
      },
      {
        field: "type",
        headerName: "Type",
        width: 120,
        valueFormatter: (params) => {
          if (!params.value) return "";
          return params.value.replace("_", " ").toUpperCase();
        },
        filter: "agTextColumnFilter",
      },
      {
        field: "recipient",
        headerName: "Recipient",
        flex: 1,
        minWidth: 160,
        filter: "agTextColumnFilter",
      },
      {
        field: "amount",
        headerName: "Amount",
        width: 110,
        valueFormatter: (params) => {
          if (params.value === undefined || params.value === null) return "";
          return `$${Number(params.value).toFixed(2)}`;
        },
        filter: "agNumberColumnFilter",
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        filter: "agTextColumnFilter",
        cellRenderer: (params: { value?: string }) => {
          const status = params.value ?? "unknown";
          let badgeClass = "bg-zinc-800 text-zinc-300 border-zinc-700";

          if (status === "approved" || status === "completed") {
            badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
          } else if (status === "pending_approval") {
            badgeClass = "bg-amber-500/15 text-amber-400 border-amber-500/30";
          } else if (status === "blocked" || status === "failed" || status === "rejected") {
            badgeClass = "bg-rose-500/15 text-rose-400 border-rose-500/30";
          } else if (status === "executing") {
            badgeClass = "bg-sky-500/15 text-sky-400 border-sky-500/30";
          }

          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeClass}`}
            >
              {status.replace("_", " ")}
            </span>
          );
        },
      },
      {
        field: "reason",
        headerName: "Decision Reason",
        flex: 1.5,
        minWidth: 180,
        tooltipField: "reason",
        filter: "agTextColumnFilter",
      },
      {
        field: "paypalStatus",
        headerName: "PayPal Status",
        width: 130,
        cellRenderer: (params: { value?: string }) => {
          const status = params.value;
          if (!status) {
            return <span className="text-zinc-600 text-xs">—</span>;
          }

          let color = "text-zinc-300";
          if (status === "PAID" || status === "SUCCESS" || status === "COMPLETED") {
            color = "text-emerald-400 font-semibold";
          } else if (status === "FAILED" || status === "CANCELLED") {
            color = "text-rose-400 font-semibold";
          } else if (status === "PENDING" || status === "SENT") {
            color = "text-amber-400";
          }

          return <span className={`text-xs font-mono ${color}`}>{status}</span>;
        },
        filter: "agTextColumnFilter",
      },
    ];
  }, []);

  const onRowClicked = (event: RowClickedEvent<StoredAction>) => {
    if (event.data) {
      setSelectedAction(event.data);
    }
  };

  return (
    <div className="bg-[#121620] border border-zinc-800 rounded-2xl p-5 shadow-xl relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Audit Ledger</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Immutable record of all processed requests and webhooks</p>
        </div>

        {/* Quick filter search box */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            value={quickFilterText}
            onChange={(e) => setQuickFilterText(e.target.value)}
            placeholder="Quick search..."
            aria-label="Quick search ledger"
            className="w-full bg-[#0b0e14] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
      </div>

      {/* Grid container */}
      <div className="w-full h-[400px] rounded-xl overflow-hidden border border-zinc-800/80">
        <AgGridReact<StoredAction>
          theme={darkTheme}
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
        <div
          className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-[#0f131d] border-l border-zinc-800 shadow-2xl z-50 flex flex-col p-6 overflow-y-auto animate-in slide-in-from-right duration-200"
          role="dialog"
          aria-labelledby="drawer-title"
          aria-modal="true"
        >
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div>
              <h3 id="drawer-title" className="text-sm font-bold text-white">
                Action Details
              </h3>
              <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                {selectedAction.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedAction(null)}
              className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>

          <div className="py-4 space-y-4 text-xs">
            {/* Request Text */}
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Original Request Text
              </span>
              <p className="mt-1 p-2.5 rounded-lg bg-[#0b0e14] border border-zinc-800 text-zinc-300 italic">
                &ldquo;{selectedAction.requestText || "Direct API execution"}&rdquo;
              </p>
            </div>

            {/* Financial Overview */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
              <div>
                <span className="text-zinc-500 text-[10px] uppercase">Type</span>
                <p className="font-semibold text-zinc-200 mt-0.5 uppercase">
                  {selectedAction.type.replace("_", " ")}
                </p>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] uppercase">Amount</span>
                <p className="font-semibold text-white mt-0.5">
                  ${selectedAction.amount.toFixed(2)} {selectedAction.currency}
                </p>
              </div>
              <div className="col-span-2 pt-2 border-t border-zinc-800">
                <span className="text-zinc-500 text-[10px] uppercase">Recipient</span>
                <p className="font-mono text-zinc-300 mt-0.5 break-all">
                  {selectedAction.recipient}
                </p>
              </div>
              {selectedAction.reference && (
                <div className="col-span-2 pt-2 border-t border-zinc-800">
                  <span className="text-zinc-500 text-[10px] uppercase">Reference</span>
                  <p className="font-mono text-zinc-300 mt-0.5 break-all">
                    {selectedAction.reference}
                  </p>
                </div>
              )}
            </div>

            {/* Decision & Policy Engine */}
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Policy Engine Decision
              </span>
              <div className="mt-1 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Decision:</span>
                  <span className="font-semibold text-zinc-200 uppercase">
                    {selectedAction.decision}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Rule Triggered:</span>
                  <span className="font-mono text-indigo-400">
                    {selectedAction.ruleFired}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-800 text-zinc-300">
                  <span className="text-zinc-400">Reason:</span> {selectedAction.reason}
                </div>
              </div>
            </div>

            {/* PayPal Gateway Data */}
            <div>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                PayPal Gateway
              </span>
              <div className="mt-1 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">PayPal ID:</span>
                  <span className="text-zinc-200">
                    {selectedAction.paypalId || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">PayPal Status:</span>
                  <span className="text-zinc-200">
                    {selectedAction.paypalStatus || "—"}
                  </span>
                </div>
                {selectedAction.errorMessage && (
                  <div className="pt-2 border-t border-zinc-800 text-rose-400 font-sans">
                    Error: {selectedAction.errorMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="text-[11px] text-zinc-500 flex flex-col gap-1 pt-2 border-t border-zinc-800">
              <div>Created: {new Date(selectedAction.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
