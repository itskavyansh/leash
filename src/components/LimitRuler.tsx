import React from "react";

export interface LimitRulerProps {
  autoApproveLimit: number;
  hardLimit: number;
  marker?: number;
}

export const LimitRuler: React.FC<LimitRulerProps> = ({
  autoApproveLimit,
  hardLimit,
  marker,
}) => {
  // Ensure non-negative numbers and valid boundaries
  const safeAuto = Math.max(0, autoApproveLimit);
  const safeHard = Math.max(safeAuto, hardLimit);

  // Position calculation for marker:
  // Segment 1: "Sends itself" (0 to safeAuto) -> 0% to 33.333%
  // Segment 2: "Asks you" (safeAuto to safeHard) -> 33.333% to 66.666%
  // Segment 3: "Blocked" (> safeHard) -> 66.666% to 100%
  let markerPercent: number | null = null;
  if (typeof marker === "number" && !isNaN(marker)) {
    if (marker <= 0) {
      markerPercent = 0;
    } else if (marker <= safeAuto) {
      const ratio = safeAuto === 0 ? 0 : marker / safeAuto;
      markerPercent = Math.min(32, ratio * 33.333);
    } else if (marker <= safeHard) {
      const range = safeHard - safeAuto;
      const ratio = range === 0 ? 0 : (marker - safeAuto) / range;
      markerPercent = 33.333 + ratio * 33.333;
    } else {
      // Exceeds hardLimit, pin inside Blocked segment (e.g. 83% or slightly beyond 66.6%)
      markerPercent = 83.333;
    }
  }

  const formatShort = (val: number) => {
    return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const srSummary = `Auto-approve limit is ${formatShort(safeAuto)}, hard limit is ${formatShort(
    safeHard
  )}${marker !== undefined ? `, current marker is at $${marker.toLocaleString("en-US")}` : ""}.`;

  return (
    <div className="w-full py-2">
      {/* Visually hidden summary for screen readers */}
      <span className="sr-only">{srSummary}</span>

      {/* Segment labels above the bar */}
      <div className="grid grid-cols-3 text-[11px] font-medium text-[var(--color-ink-muted)] mb-1.5 px-0.5">
        <span className="text-left text-[var(--color-ok)]">Sends itself</span>
        <span className="text-center text-[var(--color-wait)]">Asks you</span>
        <span className="text-right text-[var(--color-stop)]">Blocked</span>
      </div>

      {/* The 3-segment horizontal bar */}
      <div className="relative w-full h-2.5 rounded-full overflow-hidden flex bg-[var(--color-line)]">
        <div
          className="h-full bg-[var(--color-ok-tint)] border-r border-[var(--color-surface)]"
          style={{ width: "33.333%" }}
          title={`Sends itself: up to ${formatShort(safeAuto)}`}
        />
        <div
          className="h-full bg-[var(--color-wait-tint)] border-r border-[var(--color-surface)]"
          style={{ width: "33.334%" }}
          title={`Asks you: ${formatShort(safeAuto)} to ${formatShort(safeHard)}`}
        />
        <div
          className="h-full bg-[var(--color-stop-tint)]"
          style={{ width: "33.333%" }}
          title={`Blocked: above ${formatShort(safeHard)}`}
        />
      </div>

      {/* Marker needle if specified */}
      {markerPercent !== null && (
        <div className="relative w-full h-5 mt-0.5">
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-150"
            style={{ left: `${markerPercent}%` }}
          >
            {/* Ink triangle pointing up */}
            <div className="w-0 h-0 border-x-4 border-x-transparent border-b-[5px] border-b-[var(--color-ink)]" />
            <span className="text-[10px] font-medium tabular-nums text-[var(--color-ink)] mt-0.5 whitespace-nowrap bg-[var(--color-surface)] px-1 rounded border border-[var(--color-line)] shadow-xs">
              ${marker?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Boundary labels below ticks */}
      <div className="relative w-full h-4 text-[11px] tabular-nums font-medium text-[var(--color-ink-muted)] mt-1">
        <span className="absolute left-[33.333%] -translate-x-1/2">
          {formatShort(safeAuto)}
        </span>
        <span className="absolute left-[66.666%] -translate-x-1/2">
          {formatShort(safeHard)}
        </span>
      </div>
    </div>
  );
};
