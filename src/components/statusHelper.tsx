import React from "react";
import type { ActionStatus } from "@/lib/types";

export type DisplayTone = "ok" | "wait" | "stop" | "live" | "ink-muted";

export interface DisplayStatus {
  label: string;
  tone: DisplayTone;
  dotClass: string;
  textClass: string;
}

/**
 * Pure display status helper mapping stored status & paypalStatus
 * approved/completed + paypal SUCCESS/PAID/COMPLETED -> "Settled" (ok)
 * completed with PENDING/SENT -> "Sent, settling" (live)
 * executing -> "Sending" (live)
 * pending_approval -> "Waiting for you" (wait)
 * blocked -> "Blocked" (stop)
 * rejected -> "Rejected" (ink-muted)
 * failed -> "Failed" (stop)
 * approved (not yet executed) -> "Approved" (ok)
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
      textClass: "text-[var(--color-ok)]",
    };
  }

  if (
    normStatus === "completed" &&
    (normPaypal === "PENDING" || normPaypal === "SENT" || normPaypal === "")
  ) {
    return {
      label: "Sent, settling",
      tone: "live",
      dotClass: "bg-[var(--color-live)]",
      textClass: "text-[var(--color-live)]",
    };
  }

  if (normStatus === "executing") {
    return {
      label: "Sending",
      tone: "live",
      dotClass: "bg-[var(--color-live)]",
      textClass: "text-[var(--color-live)]",
    };
  }

  if (normStatus === "pending_approval") {
    return {
      label: "Waiting for you",
      tone: "wait",
      dotClass: "bg-[var(--color-wait)]",
      textClass: "text-[var(--color-wait)]",
    };
  }

  if (normStatus === "blocked") {
    return {
      label: "Blocked",
      tone: "stop",
      dotClass: "bg-[var(--color-stop)]",
      textClass: "text-[var(--color-stop)]",
    };
  }

  if (normStatus === "rejected") {
    return {
      label: "Rejected",
      tone: "ink-muted",
      dotClass: "bg-[var(--color-ink-muted)]",
      textClass: "text-[var(--color-ink-muted)]",
    };
  }

  if (normStatus === "failed") {
    return {
      label: "Failed",
      tone: "stop",
      dotClass: "bg-[var(--color-stop)]",
      textClass: "text-[var(--color-stop)]",
    };
  }

  if (normStatus === "approved") {
    return {
      label: "Approved",
      tone: "ok",
      dotClass: "bg-[var(--color-ok)]",
      textClass: "text-[var(--color-ok)]",
    };
  }

  return {
    label: normStatus.replace("_", " "),
    tone: "ink-muted",
    dotClass: "bg-[var(--color-ink-muted)]",
    textClass: "text-[var(--color-ink-muted)]",
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
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${display.textClass} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${display.dotClass}`} aria-hidden="true" />
      <span>{display.label}</span>
    </span>
  );
}
