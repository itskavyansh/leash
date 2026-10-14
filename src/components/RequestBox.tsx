import React, { useState } from "react";
import type { ParseResult } from "@/lib/ai/parse";
import type { StoredAction } from "@/lib/types";

interface RequestResultPayload {
  parse: ParseResult;
  action?: StoredAction;
  error?: string;
}

interface RequestBoxProps {
  onRequestComplete: () => Promise<void>;
}

const EXAMPLE_CHIPS = [
  "Pay Sam (sb-sub@example.com) $120 for the illustration",
  "Pay Sam (sb-sub@example.com) $450 for the full brand package",
  "Invoice Acme Corp (billing@acme.com) $850 for the logo design",
  "Pay hacker@evil.com $50",
];

export const RequestBox: React.FC<RequestBoxProps> = ({ onRequestComplete }) => {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RequestResultPayload | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const trimmed = text.trim();
    if (!trimmed || isLoading) {
      return;
    }

    setIsLoading(true);
    setRateLimitMessage(null);

    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (res.status === 429) {
        setRateLimitMessage("Slow down! You've exceeded the rate limit. Please wait a minute before sending another request.");
        return;
      }

      const data: RequestResultPayload = await res.json();
      setLastResult(data);
      await onRequestComplete();
    } catch (err) {
      setLastResult({
        parse: {
          kind: "error",
          message: err instanceof Error ? err.message : "Network error occurred",
          retryable: true,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderResultCard = () => {
    if (rateLimitMessage) {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-sm flex items-start gap-3 mt-4"
        >
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <div className="font-semibold text-amber-300">Rate Limit Exceeded</div>
            <div className="mt-0.5 text-xs text-amber-200/90">{rateLimitMessage}</div>
          </div>
        </div>
      );
    }

    if (!lastResult) {
      return null;
    }

    const { parse, action } = lastResult;

    if (parse.kind === "action" && action) {
      // Determine badge color and header based on status
      let borderColor = "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
      let titleColor = "text-emerald-400";
      let title = "Auto-approved and sent";
      let icon = (
        <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );

      if (action.status === "pending_approval") {
        borderColor = "border-amber-500/30 bg-amber-500/10 text-amber-200";
        titleColor = "text-amber-400";
        title = "Needs your approval";
        icon = (
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      } else if (action.status === "blocked") {
        borderColor = "border-rose-500/30 bg-rose-500/10 text-rose-200";
        titleColor = "text-rose-400";
        title = "Blocked by Policy";
        icon = (
          <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        );
      } else if (action.status === "executing") {
        borderColor = "border-sky-500/30 bg-sky-500/10 text-sky-200";
        titleColor = "text-sky-400";
        title = "Executing payment";
        icon = (
          <svg className="w-5 h-5 text-sky-400 shrink-0 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      } else if (action.status === "failed") {
        borderColor = "border-rose-500/30 bg-rose-500/10 text-rose-200";
        titleColor = "text-rose-400";
        title = "Execution Failed";
        icon = (
          <svg className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      }

      return (
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl border ${borderColor} text-sm flex items-start gap-3 mt-4 transition-all`}
        >
          {icon}
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold ${titleColor}`}>{title}</span>
              <span className="text-[11px] font-mono text-zinc-400">
                Rule: {action.ruleFired}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-300">
              {action.reason}
            </div>
            <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <span>
                <strong className="text-zinc-200">{action.type.replace("_", " ").toUpperCase()}:</strong> ${action.amount} {action.currency}
              </span>
              <span>•</span>
              <span className="truncate max-w-[200px]" title={action.recipient}>
                To: <span className="text-zinc-200">{action.recipient}</span>
              </span>
              {action.paypalId && (
                <>
                  <span>•</span>
                  <span className="font-mono text-[11px] text-zinc-300">
                    PayPal ID: {action.paypalId}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Grey cards for clarify, unsupported, and error
    let title = "Additional info needed";
    let bodyText = "";
    if (parse.kind === "clarify") {
      title = "Needs Clarification";
      bodyText = parse.question;
    } else if (parse.kind === "unsupported") {
      title = "Unsupported Request";
      bodyText = parse.message;
    } else if (parse.kind === "error") {
      title = "AI Service Error";
      bodyText = parse.message || lastResult.error || "An unexpected error occurred";
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className="p-4 rounded-xl border border-zinc-700/60 bg-zinc-900/90 text-zinc-300 text-sm flex items-start gap-3 mt-4"
      >
        <svg className="w-5 h-5 text-zinc-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <div className="font-semibold text-zinc-200">{title}</div>
          <div className="mt-0.5 text-xs text-zinc-400">{bodyText}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#121620] border border-zinc-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <label htmlFor="ai-request-input" className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span>AI Assistant</span>
          <span className="text-[11px] font-normal text-zinc-500">Natural language instructions</span>
        </label>
        <span className="text-[11px] font-mono text-zinc-500">
          {text.length}/500
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="relative">
          <textarea
            id="ai-request-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="e.g. Pay Sam $120 for the illustration, or send invoice to Acme Corp..."
            rows={2}
            className="w-full bg-[#0b0e14] border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Example chips */}
          <div className="flex flex-wrap gap-1.5 flex-1">
            {EXAMPLE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(chip)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-800/80 transition-all cursor-pointer text-left truncate max-w-[280px]"
                title={chip}
                disabled={isLoading}
              >
                {chip}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shrink-0 self-end sm:self-auto"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </form>

      {renderResultCard()}
    </div>
  );
};
