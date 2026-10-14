import React from "react";

interface SpendingGaugeProps {
  spentToday: number;
  dailyCap: number;
}

export const SpendingGauge: React.FC<SpendingGaugeProps> = ({
  spentToday,
  dailyCap,
}) => {
  const cap = dailyCap > 0 ? dailyCap : 1000;
  const percentage = Math.min(Math.round((spentToday / cap) * 100), 100);
  const isNearCap = percentage >= 80;
  const isOverCap = spentToday >= cap;

  let strokeColor = "var(--color-brand)";
  if (isOverCap) {
    strokeColor = "var(--color-stop-solid)";
  } else if (isNearCap) {
    strokeColor = "var(--color-wait-solid)";
  }

  // Semicircle arc:
  // Center: (100, 100), Radius: 85, Stroke: 11
  // Semicircle arc length = PI * 85 ~= 267.035
  const radius = 85;
  const arcLength = Math.PI * radius;
  const offset = arcLength - (arcLength * percentage) / 100;

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5">
      <div className="text-[13px] text-[var(--color-ink-muted)] font-medium mb-1">
        Sent today
      </div>

      <div
        className="flex flex-col items-center justify-center pt-2"
        role="img"
        aria-label={`Sent today $${spentToday} of $${cap} daily cap (${percentage}% used)`}
      >
        <div className="relative w-[200px] h-[105px] overflow-hidden flex justify-center">
          <svg
            viewBox="0 0 200 110"
            className="w-[200px] h-[110px]"
            fill="none"
          >
            {/* Background track arc */}
            <path
              d="M 15 100 A 85 85 0 0 1 185 100"
              stroke="var(--color-line-soft)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            {/* Value fill arc */}
            <path
              d="M 15 100 A 85 85 0 0 1 185 100"
              stroke={strokeColor}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={arcLength}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </svg>

          {/* Amount centered inside/under arc in Newsreader 38px */}
          <div className="absolute bottom-1 flex flex-col items-center">
            <span className="font-serif text-[38px] font-medium leading-none tabular-nums text-[var(--color-ink)]">
              ${spentToday.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Subtitle "of $X daily cap" */}
        <div className="text-[13px] text-[var(--color-ink-muted)] mt-1.5 flex items-baseline gap-1">
          <span>of</span>
          <span className="tabular-nums font-medium text-[var(--color-ink)]">
            ${cap.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
          <span>daily cap</span>
        </div>
      </div>
    </section>
  );
};
