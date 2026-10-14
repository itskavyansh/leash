import React, { useState } from "react";
import type { ParseResult } from "@/lib/ai/parse";
import type { StoredAction } from "@/lib/types";
import { getDisplayStatus } from "./statusHelper";

interface RequestResultPayload {
  parse: ParseResult;
  action?: StoredAction;
  error?: string;
}

export interface ActionResultSummary {
  amount: number;
  status: string;
}

interface RequestBoxProps {
  onRequestComplete: () => Promise<void>;
  onResult?: (result: ActionResultSummary | null) => void;
}

const EXAMPLE_CHIPS = [
  {
    short: "Pay Sam $120",
    full: "Pay Sam (sb-sub@example.com) $120 for the illustration",
  },
  {
    short: "Pay Sam $450",
    full: "Pay Sam (sb-sub@example.com) $450 for the full brand package",
  },
  {
    short: "Invoice Acme $850",
    full: "Invoice Acme Corp (billing@acme.com) $850 for the logo design",
  },
  {
    short: "Pay hacker $50",
    full: "Pay hacker@evil.com $50",
  },
];

export const RequestBox: React.FC<RequestBoxProps> = ({
  onRequestComplete,
  onResult,
}) => {
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
        setRateLimitMessage(
          "Slow down! You've exceeded the rate limit. Please wait a minute before sending another request."
        );
        if (onResult) {
          onResult(null);
        }
        return;
      }

      const data: RequestResultPayload = await res.json();
      setLastResult(data);

      if (data.parse.kind === "action" && data.action) {
        if (onResult) {
          onResult({
            amount: data.action.amount,
            status: data.action.status,
          });
        }
      } else {
        if (onResult) {
          onResult(null);
        }
      }

      await onRequestComplete();
    } catch (err) {
      setLastResult({
        parse: {
          kind: "error",
          message: err instanceof Error ? err.message : "Network error occurred",
          retryable: true,
        },
      });
      if (onResult) {
        onResult(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderResult = () => {
    if (rateLimitMessage) {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="fade-in-verdict mt-3 pt-3 border-t border-[var(--color-line-soft)] flex items-start gap-2.5 text-sm"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-wait-solid)] shrink-0 mt-1.5" />
          <div>
            <span className="font-medium text-[var(--color-ink)]">Slow down. </span>
            <span className="text-[var(--color-ink-muted)]">{rateLimitMessage}</span>
          </div>
        </div>
      );
    }

    if (!lastResult) {
      return null;
    }

    const { parse, action } = lastResult;

    if (parse.kind === "action" && action) {
      const display = getDisplayStatus(action.status, action.paypalStatus);

      let summaryText = action.reason;
      if (action.status === "completed" || action.status === "approved") {
        summaryText = `Sent. ${action.reason}`;
      } else if (action.status === "pending_approval") {
        summaryText = `Waiting for you. ${action.reason}`;
      } else if (action.status === "blocked") {
        summaryText = `Blocked. ${action.reason}`;
      } else if (action.status === "failed") {
        summaryText = `Failed. ${action.errorMessage || action.reason}`;
      }

      return (
        <div
          role="status"
          aria-live="polite"
          className="fade-in-verdict mt-3 pt-3 border-t border-[var(--color-line-soft)] flex items-center justify-between gap-3 text-sm"
        >
          {/* State dot (solid color) + sentence in ink */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${display.solidDotClass}`} />
            <span className="text-[var(--color-ink)] font-normal">{summaryText}</span>
          </div>

          {/* Rule name as a small neutral chip at right */}
          {action.ruleFired && (
            <span className="text-xs text-[var(--color-ink-muted)] bg-[var(--color-page)] border border-[var(--color-line)] px-2.5 py-0.5 rounded-full shrink-0 font-normal">
              {action.ruleFired}
            </span>
          )}
        </div>
      );
    }

    // Clarify / unsupported / error results use a neutral dot
    let neutralMessage = "";
    if (parse.kind === "clarify") {
      neutralMessage = parse.question;
    } else if (parse.kind === "unsupported") {
      neutralMessage = parse.message;
    } else if (parse.kind === "error") {
      neutralMessage = parse.message || lastResult.error || "An unexpected error occurred.";
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className="fade-in-verdict mt-3 pt-3 border-t border-[var(--color-line-soft)] flex items-start gap-2.5 text-sm"
      >
        <span className="w-2 h-2 rounded-full bg-[var(--color-ink-muted)] shrink-0 mt-1.5" />
        <span className="text-[var(--color-ink-muted)]">{neutralMessage}</span>
      </div>
    );
  };

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Large 17px input, 48px high, no inner box border, brand Send button */}
        <div className="relative flex items-center">
          <input
            id="ai-request-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Pay Sam $120 for the illustration"
            className="w-full h-12 text-[17px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-transparent pl-1 pr-28 focus:outline-none transition-all"
            disabled={isLoading}
            aria-label="Payment instruction"
          />

          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className="absolute right-0 h-10 px-6 rounded-[var(--radius-control)] bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-sm font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2 inline-flex items-center justify-center min-w-[76px]"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>

        {/* Quiet character counter & hairline pill chips */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--color-line-soft)]">
          <div className="flex flex-wrap items-center gap-1.5">
            {EXAMPLE_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setText(chip.full)}
                disabled={isLoading}
                className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-page)] border border-[var(--color-line)] rounded-full px-3 py-1 transition-btn cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={chip.full}
              >
                {chip.short}
              </button>
            ))}
          </div>

          <span className="text-[11px] tabular-nums text-[var(--color-ink-muted)] ml-auto">
            {text.length}/500
          </span>
        </div>
      </form>

      {renderResult()}
    </section>
  );
};
