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
        <span className="text-[13px] text-[var(--color-stop)] font-medium" role="alert">
          {resetError}
        </span>
      )}
      <button
        type="button"
        onClick={handleReset}
        disabled={isResetting}
        className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-btn underline underline-offset-4 decoration-[var(--color-line-strong)] hover:decoration-[var(--color-ink)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 rounded-[var(--radius-control)] py-1 px-1.5 min-h-[40px] inline-flex items-center"
        title="Reset all demo actions and restore default rules"
      >
        {isResetting ? "Resetting..." : "Reset demo"}
      </button>
    </div>
  );
};
