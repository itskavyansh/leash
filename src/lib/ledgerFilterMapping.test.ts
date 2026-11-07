import { describe, it, expect } from "vitest";
import {
  filterSpecToAgGridModel,
  getFilterChips,
} from "./ledgerFilterMapping";
import { FilterSpec } from "./ai/parseLedgerQuery";

describe("Ledger Filter Mapping (filterSpecToAgGridModel)", () => {
  it("maps empty spec to empty filter model", () => {
    const model = filterSpecToAgGridModel({});
    expect(model).toEqual({});
  });

  it("maps single status to equals text filter", () => {
    const spec: FilterSpec = { status: ["blocked"] };
    const model = filterSpecToAgGridModel(spec);
    expect(model.status).toEqual({
      filterType: "text",
      type: "equals",
      filter: "blocked",
    });
  });

  it("maps multiple statuses to OR condition filter", () => {
    const spec: FilterSpec = { status: ["pending_approval", "blocked"] };
    const model = filterSpecToAgGridModel(spec);
    expect(model.status).toEqual({
      filterType: "text",
      operator: "OR",
      conditions: [
        { filterType: "text", type: "equals", filter: "pending_approval" },
        { filterType: "text", type: "equals", filter: "blocked" },
      ],
    });
  });

  it("maps single and multiple types to equals and OR filters", () => {
    const singleSpec: FilterSpec = { type: ["send_payout"] };
    expect(filterSpecToAgGridModel(singleSpec).type).toEqual({
      filterType: "text",
      type: "equals",
      filter: "send_payout",
    });

    const multiSpec: FilterSpec = { type: ["send_payout", "issue_refund"] };
    expect(filterSpecToAgGridModel(multiSpec).type).toEqual({
      filterType: "text",
      operator: "OR",
      conditions: [
        { filterType: "text", type: "equals", filter: "send_payout" },
        { filterType: "text", type: "equals", filter: "issue_refund" },
      ],
    });
  });

  it("maps source and agent names properly", () => {
    expect(filterSpecToAgGridModel({ source: "document" }).source).toEqual({
      filterType: "text",
      type: "contains",
      filter: "document",
    });

    expect(
      filterSpecToAgGridModel({ source: "agent", agentNameContains: "procurement" })
        .source
    ).toEqual({
      filterType: "text",
      type: "contains",
      filter: "procurement",
    });

    expect(filterSpecToAgGridModel({ source: "agent" }).source).toEqual({
      filterType: "text",
      type: "contains",
      filter: "agent",
    });
  });

  it("maps amount ranges (min, max, both)", () => {
    expect(filterSpecToAgGridModel({ amountMin: 50 }).amount).toEqual({
      filterType: "number",
      type: "greaterThanOrEqual",
      filter: 50,
    });

    expect(filterSpecToAgGridModel({ amountMax: 500 }).amount).toEqual({
      filterType: "number",
      type: "lessThanOrEqual",
      filter: 500,
    });

    expect(
      filterSpecToAgGridModel({ amountMin: 100, amountMax: 1000 }).amount
    ).toEqual({
      filterType: "number",
      type: "inRange",
      filter: 100,
      filterTo: 1000,
    });
  });

  it("maps recipient contains", () => {
    expect(
      filterSpecToAgGridModel({ recipientContains: "kavyansh" }).recipient
    ).toEqual({
      filterType: "text",
      type: "contains",
      filter: "kavyansh",
    });
  });

  it("maps date filters (dateFrom, dateTo, inRange)", () => {
    expect(
      filterSpecToAgGridModel({ dateFrom: "2026-11-01" }).createdAt
    ).toEqual({
      filterType: "date",
      type: "greaterThanOrEqual",
      dateFrom: "2026-11-01",
    });

    expect(
      filterSpecToAgGridModel({
        dateFrom: "2026-11-01",
        dateTo: "2026-11-07",
      }).createdAt
    ).toEqual({
      filterType: "date",
      type: "inRange",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-07",
    });
  });

  describe("getFilterChips()", () => {
    it("generates readable chips for active filters", () => {
      const chips = getFilterChips({
        status: ["blocked"],
        amountMin: 100,
        amountMax: 500,
        source: "agent",
        agentNameContains: "procurement",
      });

      expect(chips.map((c) => c.label)).toEqual([
        "Status: blocked",
        "Agent: procurement",
        "$100 - $500",
      ]);
    });
  });
});

