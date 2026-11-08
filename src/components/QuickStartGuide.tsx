"use client";

import React, { useState } from "react";

export const QuickStartGuide: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-control)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-medium text-[var(--color-ink)] hover:bg-[var(--color-page)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--color-brand)]/15 text-[var(--color-brand)] font-semibold text-[10px]">
            ⚡
          </span>
          <span>Try it in 60 seconds</span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-[var(--color-ink-muted)] transform transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-4 pb-3.5 pt-1 border-t border-[var(--color-line-soft)] text-xs text-[var(--color-ink-muted)] space-y-2">
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              <strong className="text-[var(--color-ink)] font-medium">Send a small payout:</strong>{" "}
              Click the example chip <span className="font-mono text-[11px] bg-[var(--color-page)] px-1 py-0.5 rounded border border-[var(--color-line)]">Pay Sam $120</span> to see an action auto-approved and executed within limits.
            </li>
            <li>
              <strong className="text-[var(--color-ink)] font-medium">Read the tricky invoice:</strong>{" "}
              Switch to &quot;From a document&quot;, paste the tricky sample invoice, and watch the policy engine catch over-limit or unauthorized requests.
            </li>
            <li>
              <strong className="text-[var(--color-ink)] font-medium">Unlock owner mode and approve:</strong>{" "}
              Click &quot;Owner mode&quot; in the header to enter your passcode, then approve a pending payout from the inbox.
            </li>
            <li>
              <strong className="text-[var(--color-ink)] font-medium">Ask the ledger a question:</strong>{" "}
              Type a natural question like <span className="italic">&quot;show pending actions&quot;</span> or <span className="italic">&quot;payouts over $100&quot;</span> in the ledger search bar and click Ask.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};
