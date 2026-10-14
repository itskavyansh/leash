import React from "react";

export function formatMoneyParts(amount: number) {
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    symbol: "$",
    value: formatted,
  };
}

export function MoneyDisplay({
  amount,
  className = "",
  valueClassName = "",
}: {
  amount: number;
  className?: string;
  valueClassName?: string;
}) {
  const { symbol, value } = formatMoneyParts(amount);
  return (
    <span className={`tabular-nums inline-flex items-baseline ${className}`}>
      <span className="text-[var(--color-ink-muted)] font-normal mr-[1px]">{symbol}</span>
      <span className={`text-[var(--color-ink)] ${valueClassName}`}>{value}</span>
    </span>
  );
}
