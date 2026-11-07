import React, { useState } from "react";

interface ResetButtonProps {
  demoMode: boolean;
  onResetComplete: () => Promise<void>;
}

export const ResetButton: React.FC<ResetButtonProps> = ({ demoMode, onResetComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  if (!demoMode) {
    return null;
  }

  const handleConfirmReset = async () => {
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

      setIsOpen(false);
      await onResetComplete();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Error resetting demo");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {resetError && (
        <span className="text-[13px] text-[var(--color-stop)] font-medium" role="alert">
          {resetError}
        </span>
      )}

      {!isOpen ? (
        <button
          type="button"
          onClick={() => {
            setResetError(null);
            setIsOpen(true);
          }}
          disabled={isResetting}
          className="text-[13px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-btn underline underline-offset-4 decoration-[var(--color-line-strong)] hover:decoration-[var(--color-ink)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 rounded-[var(--radius-control)] py-1 px-1.5 min-h-[40px] inline-flex items-center"
          title="Reset all demo actions and restore default rules"
        >
          Reset demo
        </button>
      ) : (
        <div
          role="dialog"
          aria-label="Confirm demo reset"
          className="fade-in-verdict flex flex-wrap items-center gap-2.5 bg-[var(--color-surface)] border border-[var(--color-line)] shadow-sm px-3 py-1.5 rounded-[var(--radius-control)] text-xs text-[var(--color-ink)]"
        >
          <span className="text-[var(--color-ink-muted)]">
            This clears all activity and restores the default rules.
          </span>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setResetError(null);
              }}
              disabled={isResetting}
              className="px-2.5 py-1 text-xs font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-page)] rounded-[var(--radius-control)] transition-btn cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmReset}
              disabled={isResetting}
              className="px-3 py-1 text-xs font-medium bg-[var(--color-stop-solid)] hover:bg-[var(--color-stop)] text-white rounded-[var(--radius-control)] transition-btn cursor-pointer disabled:opacity-50"
            >
              {isResetting ? "Resetting..." : "Reset"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
