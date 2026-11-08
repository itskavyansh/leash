import React, { useState, useRef } from "react";
import type { ParseResult } from "@/lib/ai/parse";
import type { StoredAction, Decision } from "@/lib/types";
import { getDisplayStatus } from "./statusHelper";
import { SAMPLE_CLEAN_INVOICE, SAMPLE_TRICKY_INVOICE, SAMPLE_SNEAKY_INVOICE } from "@/lib/samples";
import type { DocumentResponsePayload, DocumentItemResult } from "@/app/api/request/document/route";
import { getRuleLabel } from "@/lib/ruleLabels";

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
  const [activeTab, setActiveTab] = useState<"document" | "type">("document");

  // Typed tab state
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<RequestResultPayload | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  // Document tab state
  const [docRetryable, setDocRetryable] = useState(false);
  const [docText, setDocText] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isDocLoading, setIsDocLoading] = useState(false);
  const [docRateLimitMessage, setDocRateLimitMessage] = useState<string | null>(null);
  const [docResponse, setDocResponse] = useState<DocumentResponsePayload | null>(null);
  const [docErrorMessage, setDocErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTypeSubmit = async (e?: React.FormEvent) => {
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

  const handleDocumentSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isDocLoading) {
      return;
    }

    if (!docFile && !docText.trim()) {
      return;
    }

    setIsDocLoading(true);
    setDocRateLimitMessage(null);
    setDocErrorMessage(null);
    setDocRetryable(false);
    setDocResponse(null);

    try {
      let res: Response;
      if (docFile) {
        const formData = new FormData();
        formData.append("file", docFile);
        if (docText.trim()) {
          formData.append("text", docText.trim());
        }
        res = await fetch("/api/request/document", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/request/document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: docText.trim() }),
        });
      }

      if (res.status === 429) {
        setDocRateLimitMessage(
          "Slow down! You've exceeded the rate limit. Please wait a minute before sending another document."
        );
        if (onResult) {
          onResult(null);
        }
        return;
      }

      const data: DocumentResponsePayload = await res.json();

      if (!res.ok) {
        if (res.status === 503 || (data as unknown as { retryable?: boolean }).retryable) {
          setDocRetryable(true);
        }
        setDocErrorMessage(data.error || "Failed to process document");
        if (onResult) {
          onResult(null);
        }
        return;
      }

      setDocResponse(data);

      if (data.results && data.results.length > 0) {
        const lastAction = data.results[data.results.length - 1].action;
        if (lastAction && onResult) {
          onResult({
            amount: lastAction.amount,
            status: lastAction.status,
          });
        }
      } else {
        if (onResult) {
          onResult(null);
        }
      }

      await onRequestComplete();
    } catch (err) {
      setDocErrorMessage(
        err instanceof Error ? err.message : "Network error occurred"
      );
      if (onResult) {
        onResult(null);
      }
    } finally {
      setIsDocLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocFile(file);
      setDocErrorMessage(null);
    }
  };

  const removeFile = () => {
    setDocFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const renderVerdictChip = (decision?: Decision, status?: string) => {
    if (decision === "approve" || status === "approved" || status === "completed") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-ok-tint)] text-[var(--color-ok)] border border-[var(--color-ok)]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-ok-solid)]" />
          Sends itself
        </span>
      );
    }
    if (decision === "needs_approval" || status === "pending_approval") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-wait-tint)] text-[var(--color-wait)] border border-[var(--color-wait)]/20">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-wait-solid)]" />
          Asks you
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--color-stop-tint)] text-[var(--color-stop)] border border-[var(--color-stop)]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-stop-solid)]" />
        Blocked
      </span>
    );
  };

  const renderTypeResult = () => {
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
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${display.solidDotClass}`} />
            <span className="text-[var(--color-ink)] font-normal">{summaryText}</span>
          </div>

          {action.ruleFired && (
            <span
              className="text-xs text-[var(--color-ink-muted)] bg-[var(--color-page)] border border-[var(--color-line)] px-2.5 py-0.5 rounded-full shrink-0 font-normal"
              title={action.ruleFired}
            >
              {getRuleLabel(action.ruleFired)}
            </span>
          )}
        </div>
      );
    }

    let neutralMessage = "";
    if (parse.kind === "clarify") {
      neutralMessage = parse.question;
    } else if (parse.kind === "unsupported") {
      neutralMessage = parse.message;
    } else if (parse.kind === "error") {
      if (parse.retryable) {
        return (
          <div
            role="status"
            aria-live="polite"
            className="fade-in-verdict mt-3 pt-3 border-t border-[var(--color-line-soft)] flex items-center justify-between gap-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-wait-solid)] shrink-0" />
              <span className="text-[var(--color-ink)] font-normal">The AI is busy, retrying</span>
            </div>
            <button
              type="button"
              onClick={() => handleTypeSubmit()}
              disabled={isLoading}
              className="h-7 px-2.5 rounded-[var(--radius-control)] bg-[var(--color-page)] border border-[var(--color-line)] hover:bg-white text-xs font-medium text-[var(--color-ink)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        );
      }
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

  const renderDocumentResults = () => {
    if (docRateLimitMessage) {
      return (
        <div
          role="alert"
          aria-live="polite"
          className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line-soft)] flex items-start gap-2.5 text-sm"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-wait-solid)] shrink-0 mt-1.5" />
          <div>
            <span className="font-medium text-[var(--color-ink)]">Slow down. </span>
            <span className="text-[var(--color-ink-muted)]">{docRateLimitMessage}</span>
          </div>
        </div>
      );
    }

    if (docErrorMessage) {
      if (docRetryable) {
        return (
          <div
            role="status"
            aria-live="polite"
            className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line-soft)] flex items-center justify-between gap-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--color-wait-solid)] shrink-0" />
              <span className="text-[var(--color-ink)] font-normal">The AI is busy, retrying</span>
            </div>
            <button
              type="button"
              onClick={() => handleDocumentSubmit()}
              disabled={isDocLoading}
              className="h-7 px-2.5 rounded-[var(--radius-control)] bg-[var(--color-page)] border border-[var(--color-line)] hover:bg-white text-xs font-medium text-[var(--color-ink)] transition-colors cursor-pointer disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        );
      }
      return (
        <div
          role="alert"
          aria-live="polite"
          className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line-soft)] flex items-start gap-2.5 text-sm"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-stop-solid)] shrink-0 mt-1.5" />
          <div>
            <span className="font-medium text-[var(--color-stop)]">Error: </span>
            <span className="text-[var(--color-ink-muted)]">{docErrorMessage}</span>
          </div>
        </div>
      );
    }

    if (!docResponse) {
      return null;
    }

    const { results, proposalsCount, message } = docResponse;

    if (proposalsCount === 0 || results.length === 0) {
      return (
        <div
          role="status"
          aria-live="polite"
          className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line-soft)] flex items-start gap-2.5 text-sm"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-ink-muted)] shrink-0 mt-1.5" />
          <span className="text-[var(--color-ink-muted)]">
            {message || "Leash found 0 payments in this document."}
          </span>
        </div>
      );
    }

    return (
      <div className="fade-in-verdict mt-4 pt-3 border-t border-[var(--color-line-soft)] space-y-3">
        <div className="flex items-center justify-between text-xs font-medium text-[var(--color-ink-muted)]">
          <span>
            Leash found {proposalsCount} payment{proposalsCount === 1 ? "" : "s"} in this document
          </span>
          <span className="text-[11px] font-normal">
            Evaluated by policy engine
          </span>
        </div>

        <div className="space-y-2">
          {results.map((item: DocumentItemResult, idx: number) => {
            const isBlocked =
              item.action?.decision === "blocked" || item.action?.status === "blocked";
            const isFailed = !!item.error;

            return (
              <div
                key={item.action?.id ?? idx}
                className={`p-3 rounded-[var(--radius-control)] border text-sm transition-all ${
                  isBlocked
                    ? "bg-[var(--color-stop-tint)]/40 border-[var(--color-stop)]/30"
                    : isFailed
                    ? "bg-[#FFF0F0] border-red-200"
                    : "bg-[var(--color-page)] border-[var(--color-line)]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--color-ink)]">
                      ${item.proposal.amount.toFixed(2)} USD
                    </span>
                    <span className="text-xs text-[var(--color-ink-muted)]">to</span>
                    <span className="font-mono text-xs text-[var(--color-ink)]">
                      {item.proposal.recipient}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {renderVerdictChip(item.action?.decision, item.action?.status)}
                    {item.action?.ruleFired && (
                      <span
                        className="text-[11px] text-[var(--color-ink-muted)] bg-[var(--color-surface)] border border-[var(--color-line)] px-2 py-0.5 rounded-full font-normal"
                        title={item.action.ruleFired}
                      >
                        {getRuleLabel(item.action.ruleFired)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-[var(--color-ink)] mb-1">
                  <span className="text-[var(--color-ink-muted)]">Policy: </span>
                  {item.action?.reason ?? item.error ?? "No verdict recorded"}
                </div>

                {item.sourceNote && (
                  <div className="text-xs text-[var(--color-ink-muted)] italic">
                    &ldquo;{item.sourceNote}&rdquo;
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-4">
      {/* Direction D Hairline Tabs: From a document first and default, Type a request second */}
      <div className="flex items-center gap-2 mb-3 border-b border-[var(--color-line-soft)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("document")}
          className={`px-3 py-1 text-sm font-medium rounded-full transition-btn cursor-pointer ${
            activeTab === "document"
              ? "bg-[var(--color-brand)] text-white"
              : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent"
          }`}
        >
          From a document
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("type")}
          className={`px-3 py-1 text-sm font-medium rounded-full transition-btn cursor-pointer ${
            activeTab === "type"
              ? "bg-[var(--color-brand)] text-white"
              : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent"
          }`}
        >
          Type a request
        </button>
      </div>

      {activeTab === "document" ? (
        <>
          <form onSubmit={handleDocumentSubmit} className="space-y-3">
            <div className="relative">
              <textarea
                id="document-text-input"
                value={docText}
                onChange={(e) => setDocText(e.target.value.slice(0, 20000))}
                placeholder="Paste an invoice, bill, receipt, or payment breakdown here..."
                rows={4}
                className="w-full text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] bg-transparent p-2 border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] transition-all resize-y font-mono"
                disabled={isDocLoading}
                aria-label="Document text"
              />
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--color-line-soft)]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDocLoading}
                  className="text-xs text-[var(--color-ink)] hover:bg-[var(--color-page)] border border-[var(--color-line)] rounded-[var(--radius-control)] px-3 py-1.5 transition-btn cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <svg
                    className="w-3.5 h-3.5 text-[var(--color-ink-muted)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Upload PDF or image
                </button>

                {docFile && (
                  <div className="inline-flex items-center gap-1.5 text-xs bg-[var(--color-brand-tint)] text-[var(--color-brand)] border border-[var(--color-brand)]/20 px-2.5 py-1 rounded-full">
                    <span className="max-w-[180px] truncate font-medium">
                      {docFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] font-bold ml-1 cursor-pointer"
                      title="Remove file"
                      aria-label="Remove uploaded file"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setDocText(SAMPLE_CLEAN_INVOICE);
                    removeFile();
                  }}
                  disabled={isDocLoading}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-page)] border border-[var(--color-line)] rounded-full px-3 py-1 transition-btn cursor-pointer disabled:opacity-40"
                >
                  Try: Clean invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDocText(SAMPLE_TRICKY_INVOICE);
                    removeFile();
                  }}
                  disabled={isDocLoading}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-page)] border border-[var(--color-line)] rounded-full px-3 py-1 transition-btn cursor-pointer disabled:opacity-40"
                >
                  Try: Tricky invoice
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDocText(SAMPLE_SNEAKY_INVOICE);
                    removeFile();
                  }}
                  disabled={isDocLoading}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent hover:bg-[var(--color-page)] border border-[var(--color-line)] rounded-full px-3 py-1 transition-btn cursor-pointer disabled:opacity-40"
                >
                  Try: Sneaky invoice
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] tabular-nums text-[var(--color-ink-muted)]">
                {docText.length}/20000
              </span>

              <button
                type="submit"
                disabled={isDocLoading || (!docFile && !docText.trim())}
                className="h-10 px-6 rounded-[var(--radius-control)] bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-sm font-medium transition-btn disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:ring-offset-2 inline-flex items-center justify-center min-w-[90px]"
              >
                {isDocLoading ? "Reading..." : "Read it"}
              </button>
            </div>
          </form>

          {renderDocumentResults()}
        </>
      ) : (
        <>
          <form onSubmit={handleTypeSubmit} className="space-y-3">
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

          {renderTypeResult()}
        </>
      )}
    </section>
  );
};
