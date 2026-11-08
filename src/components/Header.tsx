import React from "react";
import { ResetButton } from "./ResetButton";
import { OwnerModeButton } from "./OwnerModeButton";

interface HeaderProps {
  demoMode: boolean;
  onResetComplete: () => Promise<void>;
  // keep for backwards compatibility if passed
  spentToday?: number;
  dailyCap?: number;
  pendingCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  demoMode,
  onResetComplete,
}) => {
  return (
    <header className="w-full flex flex-wrap items-center justify-between gap-3 pb-4">
      {/* Left: 28px brand-green rounded square logo mark + "Leash" in Newsreader 26px + tagline + Sandbox Chip */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-[var(--radius-control)] bg-[var(--color-brand)] flex items-center justify-center shrink-0">
          {/* Inline SVG: looped line in white */}
          <svg
            className="w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 12c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5h-3" />
            <circle cx="9" cy="17" r="1" fill="currentColor" />
          </svg>
        </div>

        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-[26px] font-medium text-[var(--color-ink)] leading-none">
            Leash
          </span>
          <span className="hidden sm:inline text-[13px] text-[var(--color-ink-muted)]">
            Your AI agent. Your rules.
          </span>
        </div>

        {/* Small PayPal Sandbox chip */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-page)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)] shrink-0" />
          <span>PayPal Sandbox</span>
        </span>
      </div>

      {/* Right: Owner mode lock button + ResetButton */}
      <div className="flex items-center gap-3">
        <OwnerModeButton />
        <ResetButton demoMode={demoMode} onResetComplete={onResetComplete} />
      </div>
    </header>
  );
};
