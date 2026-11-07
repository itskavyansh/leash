import { describe, it, expect } from "vitest";
import { compareDatesInLocalTimezone } from "./dateComparator";

describe("Date Comparator for Local Timezone (compareDatesInLocalTimezone)", () => {
  it("correctly identifies the exact same local day at local boundary times 23:30 and 00:30", () => {
    // Reference filter date: 2026-11-07 at local midnight
    const filterMidnight = new Date(2026, 10, 7, 0, 0, 0, 0); // Month is 0-indexed (10 = November)

    // Cell value at 00:30 on November 7 local time
    const cell0030 = new Date(2026, 10, 7, 0, 30, 0, 0).toISOString();
    expect(compareDatesInLocalTimezone(filterMidnight, cell0030)).toBe(0);

    // Cell value at 23:30 on November 7 local time
    const cell2330 = new Date(2026, 10, 7, 23, 30, 0, 0).toISOString();
    expect(compareDatesInLocalTimezone(filterMidnight, cell2330)).toBe(0);
  });

  it("correctly differentiates dates across midnight (23:30 previous day vs 00:30 next day)", () => {
    // Reference filter date: 2026-11-07
    const filterMidnight = new Date(2026, 10, 7, 0, 0, 0, 0);

    // 23:30 on November 6 local time (previous day)
    const cellYesterday = new Date(2026, 10, 6, 23, 30, 0, 0).toISOString();
    expect(compareDatesInLocalTimezone(filterMidnight, cellYesterday)).toBe(-1);

    // 00:30 on November 8 local time (next day)
    const cellTomorrow = new Date(2026, 10, 8, 0, 30, 0, 0).toISOString();
    expect(compareDatesInLocalTimezone(filterMidnight, cellTomorrow)).toBe(1);
  });

  it("returns -1 for null, undefined, or invalid cell values", () => {
    const filterMidnight = new Date(2026, 10, 7, 0, 0, 0, 0);
    expect(compareDatesInLocalTimezone(filterMidnight, null)).toBe(-1);
    expect(compareDatesInLocalTimezone(filterMidnight, undefined)).toBe(-1);
    expect(compareDatesInLocalTimezone(filterMidnight, "invalid-date")).toBe(-1);
  });
});

