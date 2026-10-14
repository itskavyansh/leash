import React, { useState } from "react";
import type { Rules, ActionType } from "@/lib/types";
import { LimitRuler } from "./LimitRuler";

interface RulesPanelProps {
  rules: Rules | null;
  onRulesSaved: () => Promise<void>;
}

const ACTION_TYPE_OPTIONS: { type: ActionType; label: string }[] = [
  { type: "send_invoice", label: "Send invoices" },
  { type: "send_payout", label: "Pay people" },
  { type: "issue_refund", label: "Issue refunds" },
];

export const RulesPanel: React.FC<RulesPanelProps> = ({ rules, onRulesSaved }) => {
  const [autoApproveLimit, setAutoApproveLimit] = useState<number>(rules?.autoApproveLimit ?? 200);
  const [hardLimit, setHardLimit] = useState<number>(rules?.hardLimit ?? 5000);
  const [dailyCap, setDailyCap] = useState<number>(rules?.dailyCap ?? 1000);
  const [allowedRecipients, setAllowedRecipients] = useState<string[]>(rules?.allowedRecipients ?? []);
  const [blockedActionTypes, setBlockedActionTypes] = useState<ActionType[]>(rules?.blockedActionTypes ?? []);

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleAddEmail = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    if (allowedRecipients.includes(trimmed)) {
      setEmailError("Email already in allowlist.");
      return;
    }

    setAllowedRecipients((prev) => [...prev, trimmed]);
    setNewEmail("");
    setEmailError(null);
  };

  const handleRemoveEmail = (email: string) => {
    setAllowedRecipients((prev) => prev.filter((e) => e !== email));
  };

  const toggleBlockedType = (type: ActionType) => {
    setBlockedActionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setApiError(null);

    const payload: Rules = {
      autoApproveLimit: Number(autoApproveLimit),
      hardLimit: Number(hardLimit),
      dailyCap: Number(dailyCap),
      allowedRecipients,
      blockedActionTypes,
    };

    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save rules");
      }

      setSaveSuccess(true);
      await onRulesSaved();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error saving rules");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5 space-y-5">
      {/* Title */}
      <div className="flex items-baseline justify-between pb-3 border-b border-[var(--color-line)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">Your rules</h2>
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            Define limits and autonomous policy boundaries
          </p>
        </div>
        {saveSuccess && (
          <span className="text-[13px] font-medium text-[var(--color-ok)]">
            Saved
          </span>
        )}
      </div>

      {/* Live LimitRuler preview at the top of RulesPanel */}
      <div className="pb-3 border-b border-[var(--color-line)]">
        <LimitRuler
          autoApproveLimit={autoApproveLimit}
          hardLimit={hardLimit}
        />
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Limit fields */}
        <div className="space-y-3">
          <div>
            <label htmlFor="autoApproveLimit" className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">
              Sends itself up to
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] text-sm">
                $
              </span>
              <input
                id="autoApproveLimit"
                type="number"
                min={0}
                step={1}
                value={autoApproveLimit}
                onChange={(e) => setAutoApproveLimit(parseFloat(e.target.value) || 0)}
                className="w-full h-9 pl-7 pr-3 text-sm tabular-nums text-[var(--color-ink)] bg-transparent border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1"
                required
              />
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              Actions under this amount execute without manual approval.
            </p>
          </div>

          <div>
            <label htmlFor="hardLimit" className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">
              Blocked above
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] text-sm">
                $
              </span>
              <input
                id="hardLimit"
                type="number"
                min={0}
                step={1}
                value={hardLimit}
                onChange={(e) => setHardLimit(parseFloat(e.target.value) || 0)}
                className="w-full h-9 pl-7 pr-3 text-sm tabular-nums text-[var(--color-ink)] bg-transparent border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1"
                required
              />
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              Strict ceiling. Any action above this amount is blocked.
            </p>
          </div>

          <div>
            <label htmlFor="dailyCap" className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">
              Daily spending cap
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] text-sm">
                $
              </span>
              <input
                id="dailyCap"
                type="number"
                min={1}
                step={1}
                value={dailyCap}
                onChange={(e) => setDailyCap(parseFloat(e.target.value) || 1)}
                className="w-full h-9 pl-7 pr-3 text-sm tabular-nums text-[var(--color-ink)] bg-transparent border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1"
                required
              />
            </div>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1">
              Total budget permitted per calendar day.
            </p>
          </div>
        </div>

        {/* Never allow (blocked action types) with three checkboxes */}
        <div className="pt-2 border-t border-[var(--color-line)]">
          <span className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">
            Never allow
          </span>
          <div className="space-y-2 mt-2">
            {ACTION_TYPE_OPTIONS.map(({ type, label }) => {
              const isChecked = blockedActionTypes.includes(type);
              return (
                <label
                  key={type}
                  className="flex items-center gap-2.5 text-sm text-[var(--color-ink)] cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleBlockedType(type)}
                    className="w-4 h-4 rounded border-[var(--color-line-strong)] text-[var(--color-ink)] focus:ring-[var(--color-ink)] focus:ring-offset-1"
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Allowed payout recipients */}
        <div className="pt-2 border-t border-[var(--color-line)]">
          <label htmlFor="allowed-recipient-input" className="block text-[13px] font-medium text-[var(--color-ink)] mb-1">
            Allowed payout recipients
          </label>
          <div className="flex gap-2 mb-2">
            <input
              id="allowed-recipient-input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. sb-sub@example.com"
              className="flex-1 h-9 px-3 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-transparent border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddEmail();
                }
              }}
            />
            <button
              type="button"
              onClick={() => handleAddEmail()}
              className="h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] hover:bg-[var(--color-paper)] text-xs font-medium text-[var(--color-ink)] transition-btn cursor-pointer"
            >
              Add
            </button>
          </div>

          {emailError && (
            <p className="text-xs text-[var(--color-stop)] mb-2">{emailError}</p>
          )}

          {/* Email chips with remove control */}
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
            {allowedRecipients.length === 0 ? (
              <span className="text-xs text-[var(--color-ink-muted)]">
                No recipients allowed yet. Transfers will require manual approval or be blocked.
              </span>
            ) : (
              allowedRecipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-control)] bg-[var(--color-paper)] border border-[var(--color-line)] text-xs text-[var(--color-ink)]"
                >
                  <span className="truncate max-w-[200px]">{email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="text-[var(--color-ink-muted)] hover:text-[var(--color-stop)] transition-colors cursor-pointer text-sm font-semibold leading-none"
                    aria-label={`Remove ${email}`}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {apiError && (
          <div className="p-2.5 rounded-[var(--radius-control)] border border-[var(--color-stop)] bg-[var(--color-stop-tint)] text-[var(--color-stop)] text-xs" role="alert">
            {apiError}
          </div>
        )}

        <div className="pt-3 border-t border-[var(--color-line)] flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="h-9 px-4 rounded-[var(--radius-control)] bg-[var(--color-ink)] hover:bg-[#222733] text-[var(--color-surface)] text-sm font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 min-w-[100px]"
          >
            {isSaving ? "Saving..." : "Save rules"}
          </button>
        </div>
      </form>
    </section>
  );
};
