import React, { useState } from "react";
import type { Rules, ActionType } from "@/lib/types";

interface RulesPanelProps {
  rules: Rules | null;
  onRulesSaved: () => Promise<void>;
}

const ACTION_TYPE_OPTIONS: { type: ActionType; label: string }[] = [
  { type: "send_payout", label: "Send Payout" },
  { type: "send_invoice", label: "Send Invoice" },
  { type: "issue_refund", label: "Issue Refund" },
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
      setEmailError("Please enter a valid email address");
      return;
    }

    if (allowedRecipients.includes(trimmed)) {
      setEmailError("Email already in allowlist");
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
    <div className="bg-[#121620] border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col gap-5">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <span>Policy Engine Rules</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Control autonomous approval boundaries</p>
        </div>
        {saveSuccess && (
          <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full animate-fade-in">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Limits */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="autoApproveLimit" className="block text-xs font-medium text-zinc-400 mb-1">
              Auto-Approve Limit ($)
            </label>
            <input
              id="autoApproveLimit"
              type="number"
              min={0}
              step={1}
              value={autoApproveLimit}
              onChange={(e) => setAutoApproveLimit(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#0b0e14] border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              required
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">Under this runs automatically</span>
          </div>

          <div>
            <label htmlFor="hardLimit" className="block text-xs font-medium text-zinc-400 mb-1">
              Hard Ceiling Limit ($)
            </label>
            <input
              id="hardLimit"
              type="number"
              min={0}
              step={1}
              value={hardLimit}
              onChange={(e) => setHardLimit(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#0b0e14] border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              required
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">Strict hard cutoff</span>
          </div>

          <div>
            <label htmlFor="dailyCap" className="block text-xs font-medium text-zinc-400 mb-1">
              Daily Spending Cap ($)
            </label>
            <input
              id="dailyCap"
              type="number"
              min={1}
              step={1}
              value={dailyCap}
              onChange={(e) => setDailyCap(parseFloat(e.target.value) || 1)}
              className="w-full bg-[#0b0e14] border border-zinc-800 rounded-xl px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              required
            />
            <span className="text-[10px] text-zinc-500 mt-0.5 block">Resets at midnight</span>
          </div>
        </div>

        {/* Blocked Action Types */}
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Blocked Action Types
          </label>
          <div className="flex flex-wrap gap-2">
            {ACTION_TYPE_OPTIONS.map(({ type, label }) => {
              const isBlocked = blockedActionTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleBlockedType(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isBlocked
                      ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isBlocked ? "bg-rose-500" : "bg-zinc-600"
                    }`}
                  />
                  <span>{label}</span>
                  {isBlocked && <span className="text-[10px] font-mono text-rose-400">(Blocked)</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Allowed Recipients Allowlist */}
        <div>
          <label htmlFor="allowed-recipient-input" className="block text-xs font-medium text-zinc-400 mb-1.5">
            Allowed Recipients (Allowlist)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              id="allowed-recipient-input"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. sb-sub@example.com"
              className="flex-1 bg-[#0b0e14] border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-all cursor-pointer"
            >
              Add
            </button>
          </div>

          {emailError && (
            <p className="text-xs text-rose-400 mb-2">{emailError}</p>
          )}

          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 rounded-xl bg-[#0b0e14] border border-zinc-800/80">
            {allowedRecipients.length === 0 ? (
              <span className="text-xs text-zinc-600 italic px-2 py-1">
                No recipients allowed yet (all transfers will require approval or be blocked)
              </span>
            ) : (
              allowedRecipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300"
                >
                  <span className="truncate max-w-[200px]">{email}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
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
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs" role="alert">
            {apiError}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {isSaving ? "Saving..." : "Save Policy Rules"}
          </button>
        </div>
      </form>
    </div>
  );
};
