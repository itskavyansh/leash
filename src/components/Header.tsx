import React from "react";
import { ResetButton } from "./ResetButton";
import { MoneyDisplay } from "./MoneyDisplay";

interface HeaderProps {
  spentToday: number;
  dailyCap: number;
  pendingCount: number;
  demoMode: boolean;
  onResetComplete: () => Promise<void>;
}

export const Header: React.FC<HeaderProps> = ({
  spentToday,
  dailyCap,
  demoMode,
  onResetComplete,
}) => {
  const cap = dailyCap > 0 ? dailyCap : 1000;
  const percentage = Math.min(Math.round((spentToday / cap) * 100), 100);
  const isNearCap = percentage >= 80;
  const isOverCap = spentToday >= cap;

  let barColor = "bg-[var(--color-ink)]";
  if (isOverCap) {
    barColor = "bg-[var(--color-stop)]";
  } else if (isNearCap) {
    barColor = "bg-[var(--color-wait)]";
  }

  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: wordmark + tagline */}
        <div className="flex items-baseline gap-3">
          <span className="text-xl font-semibold tracking-tight text-[var(--color-ink)]">
            Leash
          </span>
          <span className="hidden sm:inline text-sm text-[var(--color-ink-muted)]">
            Your AI agent. Your rules.
          </span>
        </div>

        {/* Right: compact meter + ResetButton */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="text-[13px] text-[var(--color-ink-muted)] flex items-baseline gap-1">
              <span>Sent today</span>
              <MoneyDisplay amount={spentToday} className="font-medium text-[var(--color-ink)]" />
              <span>of</span>
              <span className="tabular-nums font-medium text-[var(--color-ink)]">
                ${cap.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>

            {/* 4px bar */}
            <div
              className="w-16 sm:w-20 h-1 bg-[var(--color-line)] rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Daily spending limit used"
            >
              <div
                className={`h-full transition-all duration-300 ${barColor}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <ResetButton demoMode={demoMode} onResetComplete={onResetComplete} />
        </div>
      </div>
    </header>
  );
};
