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
  // Guard degenerate values
  const safeAuto = Math.max(0, autoApproveLimit);
  const safeHard = Math.max(safeAuto + 1, hardLimit);

  // Piecewise scale:
  // 0..autoApproveLimit maps to 0-22%
  // autoApproveLimit..hardLimit maps to 22-70%
  // above hardLimit maps linearly to 70-97% up to 2x hardLimit and pins at 97% beyond
  let markerPercent: number | null = null;
  let zoneName = "In the 'sends itself' zone";
  let zoneColor = "text-[var(--color-ok)]";

  if (typeof marker === "number" && !isNaN(marker)) {
    if (marker <= safeAuto) {
      const ratio = safeAuto === 0 ? 0 : Math.max(0, marker) / safeAuto;
      markerPercent = ratio * 22;
      zoneName = "In the 'sends itself' zone";
      zoneColor = "text-[var(--color-ok)]";
    } else if (marker <= safeHard) {
      const range = safeHard - safeAuto;
      const ratio = range === 0 ? 0 : (marker - safeAuto) / range;
      markerPercent = 22 + ratio * 48; // 22% to 70%
      zoneName = "In the 'asks you' zone";
      zoneColor = "text-[var(--color-wait)]";
    } else {
      const excess = marker - safeHard;
      const range = safeHard; // from hardLimit to 2x hardLimit
      const ratio = Math.min(1, excess / range);
      markerPercent = 70 + ratio * 27; // 70% to 97%
      zoneName = "In the 'blocked' zone";
      zoneColor = "text-[var(--color-stop)]";
    }
  }

  const formatShort = (val: number) => {
    return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  };

  const srSummary = `Auto-approve limit is ${formatShort(safeAuto)}, hard limit is ${formatShort(
    safeHard
  )}${marker !== undefined ? `, current marker is at $${marker.toLocaleString("en-US")} (${zoneName})` : ""}.`;

  return (
    <div className="w-full py-2">
      {/* Visually hidden summary for screen readers */}
      <span className="sr-only">{srSummary}</span>

      {/* Segment labels above the bar */}
      <div className="flex justify-between text-[11px] font-medium mb-1.5 px-0.5">
        <span className="text-left text-[var(--color-ok)]" style={{ width: "22%" }}>Sends itself</span>
        <span className="text-center text-[var(--color-wait)]" style={{ width: "48%" }}>Asks you</span>
        <span className="text-right text-[var(--color-stop)]" style={{ width: "30%" }}>Blocked</span>
      </div>

      {/* 8px bar with 2px gaps and rounded ends, solid colors ok/wait/stop */}
      <div className="relative w-full h-2 flex gap-[2px]">
        <div
          className="h-full rounded-l-full bg-[var(--color-ok-solid)]"
          style={{ width: "22%" }}
          title={`Sends itself: up to ${formatShort(safeAuto)}`}
        />
        <div
          className="h-full bg-[var(--color-wait-solid)]"
          style={{ width: "48%" }}
          title={`Asks you: ${formatShort(safeAuto)} to ${formatShort(safeHard)}`}
        />
        <div
          className="h-full rounded-r-full bg-[var(--color-stop-solid)]"
          style={{ width: "30%" }}
          title={`Blocked: above ${formatShort(safeHard)}`}
        />
      </div>

      {/* Marker needle/line with 450ms slide animation */}
      {markerPercent !== null && (
        <div className="relative w-full h-6 mt-1 overflow-visible">
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-[left] duration-[450ms] ease-out"
            style={{ left: `${markerPercent}%` }}
          >
            {/* 2px ink line with amount label */}
            <div className="w-[2px] h-2 bg-[var(--color-ink)]" />
            <span className="text-[10px] font-medium tabular-nums text-[var(--color-ink)] whitespace-nowrap px-1 rounded bg-[var(--color-surface)] border border-[var(--color-line)] shadow-xs">
              ${marker?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* Boundary labels below ticks at 22% and 70% */}
      <div className="relative w-full h-4 text-xs tabular-nums text-[var(--color-ink-muted)] mt-1">
        <span className="absolute left-[22%] -translate-x-1/2">
          {formatShort(safeAuto)}
        </span>
        <span className="absolute left-[70%] -translate-x-1/2">
          {formatShort(safeHard)}
        </span>
      </div>

      {/* One line naming the zone in that zone's text color */}
      {marker !== undefined && (
        <div className={`text-xs font-medium mt-1.5 ${zoneColor}`}>
          {zoneName}
        </div>
      )}
    </div>
  );
};
