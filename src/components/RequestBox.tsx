import React, { useState } from "react";
import type { ParseResult } from "@/lib/ai/parse";
import type { StoredAction } from "@/lib/types";
import { LimitRuler } from "./LimitRuler";
import { getDisplayStatus } from "./statusHelper";

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
        setRateLimitMessage(
          "Slow down! You've exceeded the rate limit. Please wait a minute before sending another request."
        );
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

  const renderResult = () => {
    if (rateLimitMessage) {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line)] flex items-start gap-2.5 text-sm text-[var(--color-wait)]"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-wait)] shrink-0 mt-1.5" />
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

      // Sentence summary based on action status & limits
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
          className="fade-in-verdict mt-4 pt-3.5 border-t border-[var(--color-line)] flex flex-col gap-3"
        >
          {/* State dot + one plain sentence + rule name */}
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 text-sm">
            <div className="flex items-baseline gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${display.dotClass}`} />
              <span className="text-[var(--color-ink)] font-normal">{summaryText}</span>
            </div>
            {action.ruleFired && (
              <span className="text-xs text-[var(--color-ink-muted)] sm:shrink-0 font-normal">
                {action.ruleFired}
              </span>
            )}
          </div>

          {/* Action result includes LimitRuler with marker at request amount */}
          <div className="mt-1 pt-2 border-t border-[var(--color-line)]">
            <LimitRuler
              autoApproveLimit={200}
              hardLimit={5000}
              marker={action.amount}
            />
          </div>
        </div>
      );
    }

    // Clarify / unsupported / error results are neutral grey verdict rows
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
        className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line)] flex items-start gap-2.5 text-sm"
      >
        <span className="w-2 h-2 rounded-full bg-[var(--color-ink-muted)] shrink-0 mt-1.5" />
        <span className="text-[var(--color-ink-muted)]">{neutralMessage}</span>
      </div>
    );
  };

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Large, single-line-feeling composer: 16px text, 48px high, ink Send button */}
        <div className="relative flex items-center">
          <input
            id="ai-request-input"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            placeholder="Pay Sam $120 for the illustration"
            className="w-full h-12 text-base text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-transparent border border-[var(--color-line)] rounded-[var(--radius-control)] pl-3.5 pr-24 focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-2 transition-all"
            disabled={isLoading}
            aria-label="Payment instruction"
          />

          <button
            type="submit"
            disabled={isLoading || !text.trim()}
            className="absolute right-1.5 h-9 px-4 rounded-[var(--radius-control)] bg-[var(--color-ink)] hover:bg-[#222733] text-[var(--color-surface)] text-sm font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-ink)] focus:ring-offset-1 inline-flex items-center justify-center min-w-[64px]"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </div>

        {/* Example chips: quiet text-style pills with a hairline border */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {EXAMPLE_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setText(chip)}
              disabled={isLoading}
              className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-paper)] border border-[var(--color-line)] rounded-full px-2.5 py-1 transition-btn cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left max-w-full truncate"
              title={chip}
            >
              {chip}
            </button>
          ))}
        </div>
      </form>

      {renderResult()}
    </section>
  );
};
