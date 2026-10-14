import React from "react";
import { LimitRuler } from "./LimitRuler";

interface WhereItLandsPanelProps {
  autoApproveLimit: number;
  hardLimit: number;
  lastAmount?: number;
}

export const WhereItLandsPanel: React.FC<WhereItLandsPanelProps> = ({
  autoApproveLimit,
  hardLimit,
  lastAmount,
}) => {
  const hasAmount = typeof lastAmount === "number" && !isNaN(lastAmount);
  const title = hasAmount
    ? `Where $${lastAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })} lands`
    : "Where a request lands";

  return (
    <section className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-panel)] p-5 space-y-3">
      <div>
        <h2 className="font-serif text-[20px] font-medium text-[var(--color-ink)] leading-tight">
          {title}
        </h2>
      </div>

      <LimitRuler
        autoApproveLimit={autoApproveLimit}
        hardLimit={hardLimit}
        marker={lastAmount}
      />
    </section>
  );
};
