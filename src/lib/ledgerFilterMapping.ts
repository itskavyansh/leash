import { FilterSpec } from "./ai/parseLedgerQuery";

export interface AgGridFilterModel {
  [colId: string]: unknown;
}

/**
 * Pure mapping function that converts a validated FilterSpec into
 * an AG Grid filter model compatible with setFilterModel().
 *
 * Column filters used:
 * - 'type': agTextColumnFilter (equals or multi-condition OR of equals)
 * - 'source': agTextColumnFilter (contains or startsWith)
 * - 'recipient': agTextColumnFilter (contains)
 * - 'amount': agNumberColumnFilter (inRange, greaterThanOrEqual, or lessThanOrEqual)
 * - 'status': agTextColumnFilter (equals or multi-condition OR of equals)
 * - 'createdAt': agDateColumnFilter (inRange, greaterThanOrEqual, or lessThanOrEqual)
 */
export function filterSpecToAgGridModel(spec: FilterSpec): AgGridFilterModel {
  const model: AgGridFilterModel = {};

  // 1. Status: text filter equals (or conditions if multiple)
  if (spec.status && spec.status.length > 0) {
    if (spec.status.length === 1) {
      model.status = {
        filterType: "text",
        type: "equals",
        filter: spec.status[0],
      };
    } else {
      model.status = {
        filterType: "text",
        operator: "OR",
        conditions: spec.status.map((st) => ({
          filterType: "text",
          type: "equals",
          filter: st,
        })),
      };
    }
  }

  // 2. Type: text filter equals (or conditions if multiple)
  if (spec.type && spec.type.length > 0) {
    if (spec.type.length === 1) {
      model.type = {
        filterType: "text",
        type: "equals",
        filter: spec.type[0],
      };
    } else {
      model.type = {
        filterType: "text",
        operator: "OR",
        conditions: spec.type.map((t) => ({
          filterType: "text",
          type: "equals",
          filter: t,
        })),
      };
    }
  }

  // 3. Source & Agent Name
  if (spec.source) {
    if (spec.source === "agent") {
      if (spec.agentNameContains) {
        model.source = {
          filterType: "text",
          type: "contains",
          filter: spec.agentNameContains,
        };
      } else {
        model.source = {
          filterType: "text",
          type: "contains",
          filter: "agent",
        };
      }
    } else if (spec.source === "typed") {
      model.source = {
        filterType: "text",
        type: "contains",
        filter: "typed",
      };
    } else if (spec.source === "document") {
      model.source = {
        filterType: "text",
        type: "contains",
        filter: "document",
      };
    }
  } else if (spec.agentNameContains) {
    model.source = {
      filterType: "text",
      type: "contains",
      filter: spec.agentNameContains,
    };
  }

  // 4. Recipient: text filter contains
  if (spec.recipientContains) {
    model.recipient = {
      filterType: "text",
      type: "contains",
      filter: spec.recipientContains,
    };
  }

  // 5. Amount: number filter (inRange, greaterThanOrEqual, or lessThanOrEqual)
  if (spec.amountMin !== undefined && spec.amountMax !== undefined) {
    model.amount = {
      filterType: "number",
      type: "inRange",
      filter: spec.amountMin,
      filterTo: spec.amountMax,
    };
  } else if (spec.amountMin !== undefined) {
    model.amount = {
      filterType: "number",
      type: "greaterThanOrEqual",
      filter: spec.amountMin,
    };
  } else if (spec.amountMax !== undefined) {
    model.amount = {
      filterType: "number",
      type: "lessThanOrEqual",
      filter: spec.amountMax,
    };
  }

  // 6. Dates: createdAt date filter
  if (spec.dateFrom && spec.dateTo) {
    model.createdAt = {
      filterType: "date",
      type: "inRange",
      dateFrom: spec.dateFrom.slice(0, 10),
      dateTo: spec.dateTo.slice(0, 10),
    };
  } else if (spec.dateFrom) {
    model.createdAt = {
      filterType: "date",
      type: "greaterThanOrEqual",
      dateFrom: spec.dateFrom.slice(0, 10),
    };
  } else if (spec.dateTo) {
    model.createdAt = {
      filterType: "date",
      type: "lessThanOrEqual",
      dateFrom: spec.dateTo.slice(0, 10),
    };
  }

  return model;
}

export interface FilterChip {
  id: string;
  label: string;
  key: keyof FilterSpec;
}

/**
 * Generates human-friendly active filter chip labels from a FilterSpec.
 */
export function getFilterChips(spec: FilterSpec): FilterChip[] {
  const chips: FilterChip[] = [];

  if (spec.status && spec.status.length > 0) {
    chips.push({
      id: "status",
      key: "status",
      label: `Status: ${spec.status.map((s) => s.replace("_", " ")).join(", ")}`,
    });
  }

  if (spec.type && spec.type.length > 0) {
    chips.push({
      id: "type",
      key: "type",
      label: `Type: ${spec.type.map((t) => t.replace("send_", "").replace("issue_", "")).join(", ")}`,
    });
  }

  if (spec.source) {
    const detail =
      spec.source === "agent" && spec.agentNameContains
        ? `Agent: ${spec.agentNameContains}`
        : `Source: ${spec.source}`;
    chips.push({
      id: "source",
      key: "source",
      label: detail,
    });
  } else if (spec.agentNameContains) {
    chips.push({
      id: "agentNameContains",
      key: "agentNameContains",
      label: `Agent: ${spec.agentNameContains}`,
    });
  }

  if (spec.recipientContains) {
    chips.push({
      id: "recipientContains",
      key: "recipientContains",
      label: `Recipient: "${spec.recipientContains}"`,
    });
  }

  if (spec.amountMin !== undefined && spec.amountMax !== undefined) {
    chips.push({
      id: "amount",
      key: "amountMin",
      label: `$${spec.amountMin} - $${spec.amountMax}`,
    });
  } else if (spec.amountMin !== undefined) {
    chips.push({
      id: "amountMin",
      key: "amountMin",
      label: `≥ $${spec.amountMin}`,
    });
  } else if (spec.amountMax !== undefined) {
    chips.push({
      id: "amountMax",
      key: "amountMax",
      label: `≤ $${spec.amountMax}`,
    });
  }

  if (spec.dateFrom && spec.dateTo) {
    chips.push({
      id: "dates",
      key: "dateFrom",
      label: `${spec.dateFrom.slice(0, 10)} to ${spec.dateTo.slice(0, 10)}`,
    });
  } else if (spec.dateFrom) {
    chips.push({
      id: "dateFrom",
      key: "dateFrom",
      label: `From ${spec.dateFrom.slice(0, 10)}`,
    });
  } else if (spec.dateTo) {
    chips.push({
      id: "dateTo",
      key: "dateTo",
      label: `Until ${spec.dateTo.slice(0, 10)}`,
    });
  }

  return chips;
}
