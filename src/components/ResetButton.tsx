import React, { useState } from "react";

interface ResetButtonProps {
  demoMode: boolean;
  onResetComplete: () => Promise<void>;
}

export const ResetButton: React.FC<ResetButtonProps> = ({ demoMode, onResetComplete }) => {
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  if (!demoMode) {
    return null;
  }

  const handleReset = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to reset all demo data? This will clear all actions and processed events, and reset rules to defaults."
    );
    if (!confirmed) {
      return;
    }

    setIsResetting(true);
    setResetError(null);

    try {
      const res = await fetch("/api/demo/reset", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset demo data");
      }

      await onResetComplete();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Error resetting demo");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {resetError && (
        <span className="text-xs text-rose-400 font-medium" role="alert">
          {resetError}
        </span>
      )}
      <button
        type="button"
        onClick={handleReset}
        disabled={isResetting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        title="Reset all demo actions and restore default rules"
      >
        <svg
          className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        {isResetting ? "Resetting..." : "Reset Demo"}
      </button>
    </div>
  );
};
