import React from "react";
import { ResetButton } from "./ResetButton";

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
  pendingCount,
  demoMode,
  onResetComplete,
}) => {
  const cap = dailyCap > 0 ? dailyCap : 1000;
  const percentage = Math.min(Math.round((spentToday / cap) * 100), 100);
  const isNearCap = percentage >= 80;
  const isOverCap = spentToday >= cap;

  return (
    <header className="border-b border-zinc-800/80 bg-[#0d1017]/70 backdrop-blur-md sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20">
              <div className="w-full h-full bg-[#0b0d11] rounded-[11px] flex items-center justify-center">
                <span className="text-indigo-400 font-bold text-lg tracking-wider">L</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">Leash</h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                  Autonomous Ops
                </span>
              </div>
              <p className="text-xs text-zinc-400">Your AI agent. Your rules.</p>
            </div>
          </div>

          <div className="md:hidden">
            <ResetButton demoMode={demoMode} onResetComplete={onResetComplete} />
          </div>
        </div>

        {/* Stats Strip */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
          {/* Spent Today & Cap */}
          <div className="bg-zinc-900/80 border border-zinc-800 px-3.5 py-2 rounded-xl flex items-center gap-3.5 shadow-sm">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
                Spent Today
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-semibold text-white">
                  ${spentToday.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-zinc-500">
                  / ${cap.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-20 sm:w-24 flex flex-col gap-1">
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverCap
                      ? "bg-rose-500"
                      : isNearCap
                      ? "bg-amber-400"
                      : "bg-indigo-500"
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400 text-right font-mono">
                {percentage}%
              </span>
            </div>
          </div>

          {/* Pending Approval Badge */}
          <div className="bg-zinc-900/80 border border-zinc-800 px-3.5 py-2 rounded-xl flex items-center gap-2.5 shadow-sm">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                pendingCount > 0 ? "bg-amber-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-medium">
                Pending Actions
              </span>
              <span className="text-sm font-semibold text-white">
                {pendingCount} {pendingCount === 1 ? "action" : "actions"}
              </span>
            </div>
          </div>

          <div className="hidden md:block">
            <ResetButton demoMode={demoMode} onResetComplete={onResetComplete} />
          </div>
        </div>
      </div>
    </header>
  );
};
