import React from "react";
import type { ActionStatus } from "@/lib/types";

export type DisplayTone = "ok" | "wait" | "stop" | "live" | "ink-muted";

export interface DisplayStatus {
  label: string;
  tone: DisplayTone;
  dotClass: string;
  solidDotClass: string;
  textClass: string;
  tintBgClass: string;
}

/**
 * Pure display status helper mapping stored status & paypalStatus (Direction D):
 * - completed with paypal SUCCESS/PAID/COMPLETED -> "Settled" (ok)
 * - completed with PENDING/SENT/other non-terminal -> "Settling" (live)
 * - executing -> "Sending" (live)
 * - pending_approval -> "Waiting" (wait)
 * - blocked -> "Blocked" (stop)
 * - rejected -> "Rejected" (neutral grey tint #EEF1EF / ink-muted)
 * - failed -> "Failed" (stop)
 * - approved not yet executed -> "Approved" (ok)
 */
export function getDisplayStatus(
  status: ActionStatus | string,
  paypalStatus?: string | null
): DisplayStatus {
  const normStatus = status;
  const normPaypal = (paypalStatus ?? "").toUpperCase();

  if (
    (normStatus === "completed" || normStatus === "approved") &&
    (normPaypal === "SUCCESS" || normPaypal === "PAID" || normPaypal === "COMPLETED")
  ) {
    return {
      label: "Settled",
      tone: "ok",
      dotClass: "bg-[var(--color-ok)]",
      solidDotClass: "bg-[var(--color-ok-solid)]",
      textClass: "text-[var(--color-ok)]",
      tintBgClass: "bg-[var(--color-ok-tint)]",
    };
  }

  if (
    normStatus === "completed" &&
    (normPaypal === "PENDING" || normPaypal === "SENT" || normPaypal === "" || normPaypal !== "FAILED")
  ) {
    return {
      label: "Settling",
      tone: "live",
      dotClass: "bg-[var(--color-live)]",
      solidDotClass: "bg-[var(--color-live-solid)]",
      textClass: "text-[var(--color-live)]",
      tintBgClass: "bg-[var(--color-live-tint)]",
    };
  }

  if (normStatus === "executing") {
    return {
      label: "Sending",
      tone: "live",
      dotClass: "bg-[var(--color-live)]",
      solidDotClass: "bg-[var(--color-live-solid)]",
      textClass: "text-[var(--color-live)]",
      tintBgClass: "bg-[var(--color-live-tint)]",
    };
  }

  if (normStatus === "pending_approval") {
    return {
      label: "Waiting",
      tone: "wait",
      dotClass: "bg-[var(--color-wait)]",
      solidDotClass: "bg-[var(--color-wait-solid)]",
      textClass: "text-[var(--color-wait)]",
      tintBgClass: "bg-[var(--color-wait-tint)]",
    };
  }

  if (normStatus === "blocked") {
    return {
      label: "Blocked",
      tone: "stop",
      dotClass: "bg-[var(--color-stop)]",
      solidDotClass: "bg-[var(--color-stop-solid)]",
      textClass: "text-[var(--color-stop)]",
      tintBgClass: "bg-[var(--color-stop-tint)]",
    };
  }

  if (normStatus === "rejected") {
    return {
      label: "Rejected",
      tone: "ink-muted",
      dotClass: "bg-[var(--color-ink-muted)]",
      solidDotClass: "bg-[var(--color-ink-muted)]",
      textClass: "text-[var(--color-ink-muted)]",
      tintBgClass: "bg-[#EEF1EF]",
    };
  }

  if (normStatus === "failed") {
    return {
      label: "Failed",
      tone: "stop",
      dotClass: "bg-[var(--color-stop)]",
      solidDotClass: "bg-[var(--color-stop-solid)]",
      textClass: "text-[var(--color-stop)]",
      tintBgClass: "bg-[var(--color-stop-tint)]",
    };
  }

  if (normStatus === "approved") {
    return {
      label: "Approved",
      tone: "ok",
      dotClass: "bg-[var(--color-ok)]",
      solidDotClass: "bg-[var(--color-ok-solid)]",
      textClass: "text-[var(--color-ok)]",
      tintBgClass: "bg-[var(--color-ok-tint)]",
    };
  }

  return {
    label: normStatus.replace("_", " "),
    tone: "ink-muted",
    dotClass: "bg-[var(--color-ink-muted)]",
    solidDotClass: "bg-[var(--color-ink-muted)]",
    textClass: "text-[var(--color-ink-muted)]",
    tintBgClass: "bg-[#EEF1EF]",
  };
}

export function StatusBadge({
  status,
  paypalStatus,
  className = "",
}: {
  status: ActionStatus | string;
  paypalStatus?: string | null;
  className?: string;
}) {
  const display = getDisplayStatus(status, paypalStatus);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${display.tintBgClass} ${display.textClass} ${className}`}
    >
      <span>{display.label}</span>
    </span>
  );
}
