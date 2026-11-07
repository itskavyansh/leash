/**
 * Date comparator for AG Grid's `agDateColumnFilter` that evaluates timestamps
 * against the user's browser local day boundary (local timezone) rather than UTC.
 *
 * Parameters passed by AG Grid:
 * @param filterLocalDateAtMidnight A Date object representing the filter date at local midnight (00:00:00.000 local time).
 * @param cellValue The cell value from the row, which is an ISO 8601 string (e.g. "2026-11-07T18:00:00.000Z").
 *
 * Return values:
 * - -1 if cellValue is before filterLocalDateAtMidnight's day
 * - 0 if cellValue is on the exact same local day as filterLocalDateAtMidnight
 * - 1 if cellValue is after filterLocalDateAtMidnight's day
 */
export function compareDatesInLocalTimezone(
  filterLocalDateAtMidnight: Date,
  cellValue: string | Date | null | undefined
): number {
  if (!cellValue) {
    return -1;
  }

  const cellDate = typeof cellValue === "string" ? new Date(cellValue) : cellValue;
  if (isNaN(cellDate.getTime())) {
    return -1;
  }

  // Extract year, month, date in local timezone for both
  const filterYear = filterLocalDateAtMidnight.getFullYear();
  const filterMonth = filterLocalDateAtMidnight.getMonth();
  const filterDay = filterLocalDateAtMidnight.getDate();

  const cellYear = cellDate.getFullYear();
  const cellMonth = cellDate.getMonth();
  const cellDay = cellDate.getDate();

  if (cellYear < filterYear) return -1;
  if (cellYear > filterYear) return 1;

  if (cellMonth < filterMonth) return -1;
  if (cellMonth > filterMonth) return 1;

  if (cellDay < filterDay) return -1;
  if (cellDay > filterDay) return 1;

  return 0;
}

