"use client";

import React, { useState, useRef, useEffect } from "react";
import { useOwner } from "./OwnerAuthContext";

export const OwnerModeButton: React.FC = () => {
  const { isOwner, showDemoPasscode, demoPasscode, login, logout, isLoading } = useOwner();
  const [isOpen, setIsOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on escape or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const result = await login(passcode.trim());
    setIsSubmitting(false);

    if (result.success) {
      setPasscode("");
      setIsOpen(false);
    } else {
      setError(result.error || "Incorrect passcode");
    }
  };

  const handleLogout = async () => {
    setIsSubmitting(true);
    await logout();
    setIsSubmitting(false);
    setIsOpen(false);
  };

  if (isLoading) {
    return null;
  }

  return (
    <div className="relative inline-block text-left" ref={popoverRef}>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-medium border transition-colors cursor-pointer ${
          isOwner
            ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)] border-[var(--color-brand)]/30 hover:bg-[var(--color-brand)]/20"
            : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] border-[var(--color-line)] hover:text-[var(--color-ink)]"
        }`}
        title={isOwner ? "Owner mode unlocked. Click to manage." : "Owner mode locked. Click to enter passcode."}
      >
        {/* Lock or Unlock SVG icon */}
        {isOwner ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        )}
        <span>{isOwner ? "Owner unlocked" : "Owner mode"}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-line)] shadow-lg p-3 z-50 text-xs text-[var(--color-ink)]">
          {isOwner ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 font-medium text-[var(--color-ok)]">
                <span className="w-2 h-2 rounded-full bg-[var(--color-ok)]" />
                <span>Owner mode is active</span>
              </div>
              <p className="text-[var(--color-ink-muted)] text-[11px] leading-relaxed">
                You have permission to approve or reject actions, save policy rules, and reset demo data.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isSubmitting}
                className="w-full py-1.5 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-page)] hover:bg-white text-xs font-medium text-[var(--color-ink)] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Locking..." : "Lock owner mode"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div className="font-medium text-[var(--color-ink)]">
                Unlock owner mode
              </div>
              <p className="text-[var(--color-ink-muted)] text-[11px] leading-relaxed">
                Enter your owner passcode to approve, reject, edit rules, or reset.
              </p>

              {showDemoPasscode && demoPasscode && (
                <div className="p-2 rounded bg-[var(--color-page)] border border-[var(--color-line-soft)] text-[11px] space-y-0.5">
                  <div className="text-[var(--color-ink)] font-mono font-medium">
                    Demo passcode: <span className="underline select-all">{demoPasscode}</span>
                  </div>
                  <div className="text-[var(--color-ink-muted)] text-[10px]">
                    Note: this is a demo-only convenience.
                  </div>
                </div>
              )}

              <input
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Owner passcode..."
                aria-label="Owner passcode"
                autoFocus
                className="w-full h-8 px-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-page)] text-xs text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]"
              />

              {error && (
                <div className="text-[11px] text-[var(--color-stop)] font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !passcode.trim()}
                className="w-full h-8 rounded-[var(--radius-control)] bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Unlocking..." : "Unlock"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
