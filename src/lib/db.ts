import { Pool, PoolConfig } from "pg";
import { randomUUID } from "crypto";
import { ActionStatus, ActionType, Decision, Rules, StoredAction } from "./types";

export type ActionRecord = StoredAction;
export type { StoredAction };

export interface InsertActionInput {
  id?: string;
  createdAt?: string;
  type: ActionType;
  amount: number;
  currency: string;
  recipient: string;
  description: string;
  reference?: string | null;
  status: ActionStatus;
  decision: Decision;
  reason: string;
  ruleFired: string;
  paypalId?: string | null;
  paypalStatus?: string | null;
  errorMessage?: string | null;
  requestText?: string | null;
}

export type UpdateActionPatch = Partial<
  Omit<ActionRecord, "id" | "createdAt">
>;

export interface SqlQueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlClient {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
}

interface RulesDbRow {
  id: number;
  autoApproveLimit: number;
  hardLimit: number;
  dailyCap: number;
  allowedRecipients: string;
  blockedActionTypes: string;
}

export const DEFAULT_RULES: Rules = {
  autoApproveLimit: 200,
  hardLimit: 5000,
  dailyCap: 1000,
  allowedRecipients: ["sb-sub@example.com"],
  blockedActionTypes: [],
};

declare global {
  var __leashPgPool: Pool | undefined;
}

let activeTestClient: SqlClient | null = null;
let schemaInitPromise: Promise<void> | null = null;

export function setSqlClientForTests(client: SqlClient | null): void {
  activeTestClient = client;
  schemaInitPromise = null;
}

export function getSqlClient(): SqlClient {
  if (activeTestClient) {
    return activeTestClient;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable DATABASE_URL. Please set your Postgres connection string."
    );
  }

  if (!globalThis.__leashPgPool) {
    const config: PoolConfig = {
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    };
    globalThis.__leashPgPool = new Pool(config);
  }

  const pool = globalThis.__leashPgPool;

  return {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>> {
      const res = await pool.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.rowCount ?? 0,
      };
    },
  };
}

export async function ensureSchema(): Promise<void> {
  if (schemaInitPromise) {
    return schemaInitPromise;
  }

  schemaInitPromise = (async () => {
    const client = getSqlClient();

    // 1. Create tables with double precision amounts and quoted camelCase columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS rules (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        "autoApproveLimit" DOUBLE PRECISION NOT NULL,
        "hardLimit" DOUBLE PRECISION NOT NULL,
        "dailyCap" DOUBLE PRECISION NOT NULL,
        "allowedRecipients" TEXT NOT NULL,
        "blockedActionTypes" TEXT NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        "createdAt" TEXT NOT NULL,
        type TEXT NOT NULL,
        amount DOUBLE PRECISION NOT NULL,
        currency TEXT NOT NULL,
        recipient TEXT NOT NULL,
        description TEXT NOT NULL,
        reference TEXT,
        status TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        "ruleFired" TEXT NOT NULL,
        "paypalId" TEXT,
        "paypalStatus" TEXT,
        "errorMessage" TEXT,
        "requestText" TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        "eventId" TEXT PRIMARY KEY,
        "receivedAt" TEXT NOT NULL
      );
    `);

    // 2. Enable Row Level Security (RLS) on all 3 tables
    await client.query(`ALTER TABLE rules ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE actions ENABLE ROW LEVEL SECURITY;`);
    await client.query(`ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;`);

    // 3. Seed default rules if id = 1 doesn't exist
    await client.query(
      `
      INSERT INTO rules (
        id, "autoApproveLimit", "hardLimit", "dailyCap", "allowedRecipients", "blockedActionTypes"
      ) VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO NOTHING;
    `,
      [
        DEFAULT_RULES.autoApproveLimit,
        DEFAULT_RULES.hardLimit,
        DEFAULT_RULES.dailyCap,
        JSON.stringify(DEFAULT_RULES.allowedRecipients),
        JSON.stringify(DEFAULT_RULES.blockedActionTypes),
      ]
    );
  })();

  return schemaInitPromise;
}

function parseRules(row: RulesDbRow): Rules {
  return {
    autoApproveLimit: Number(row.autoApproveLimit),
    hardLimit: Number(row.hardLimit),
    dailyCap: Number(row.dailyCap),
    allowedRecipients: JSON.parse(row.allowedRecipients) as string[],
    blockedActionTypes: JSON.parse(row.blockedActionTypes) as ActionType[],
  };
}

export async function getRules(): Promise<Rules> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query<RulesDbRow>(
    `SELECT * FROM rules WHERE id = 1 LIMIT 1`
  );
  if (res.rows.length === 0) {
    return { ...DEFAULT_RULES };
  }
  return parseRules(res.rows[0]);
}

export async function saveRules(rules: Rules): Promise<Rules> {
  await ensureSchema();
  const client = getSqlClient();
  await client.query(
    `
    INSERT INTO rules (id, "autoApproveLimit", "hardLimit", "dailyCap", "allowedRecipients", "blockedActionTypes")
    VALUES (1, $1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      "autoApproveLimit" = EXCLUDED."autoApproveLimit",
      "hardLimit" = EXCLUDED."hardLimit",
      "dailyCap" = EXCLUDED."dailyCap",
      "allowedRecipients" = EXCLUDED."allowedRecipients",
      "blockedActionTypes" = EXCLUDED."blockedActionTypes";
  `,
    [
      rules.autoApproveLimit,
      rules.hardLimit,
      rules.dailyCap,
      JSON.stringify(rules.allowedRecipients),
      JSON.stringify(rules.blockedActionTypes),
    ]
  );

  return getRules();
}

function mapActionRow(row: Record<string, unknown>): ActionRecord {
  return {
    id: String(row.id),
    createdAt: String(row.createdAt),
    type: row.type as ActionType,
    amount: Number(row.amount),
    currency: String(row.currency),
    recipient: String(row.recipient),
    description: String(row.description),
    reference: row.reference !== null && row.reference !== undefined ? String(row.reference) : null,
    status: row.status as ActionStatus,
    decision: row.decision as Decision,
    reason: String(row.reason),
    ruleFired: String(row.ruleFired),
    paypalId: row.paypalId !== null && row.paypalId !== undefined ? String(row.paypalId) : null,
    paypalStatus: row.paypalStatus !== null && row.paypalStatus !== undefined ? String(row.paypalStatus) : null,
    errorMessage: row.errorMessage !== null && row.errorMessage !== undefined ? String(row.errorMessage) : null,
    requestText: row.requestText !== null && row.requestText !== undefined ? String(row.requestText) : null,
  };
}

export async function insertAction(action: InsertActionInput): Promise<ActionRecord> {
  await ensureSchema();
  const client = getSqlClient();

  const record: ActionRecord = {
    id: action.id ?? randomUUID(),
    createdAt: action.createdAt ?? new Date().toISOString(),
    type: action.type,
    amount: action.amount,
    currency: action.currency,
    recipient: action.recipient,
    description: action.description,
    reference: action.reference ?? null,
    status: action.status,
    decision: action.decision,
    reason: action.reason,
    ruleFired: action.ruleFired,
    paypalId: action.paypalId ?? null,
    paypalStatus: action.paypalStatus ?? null,
    errorMessage: action.errorMessage ?? null,
    requestText: action.requestText ?? null,
  };

  await client.query(
    `
    INSERT INTO actions (
      id, "createdAt", type, amount, currency, recipient, description, reference,
      status, decision, reason, "ruleFired", "paypalId", "paypalStatus", "errorMessage", "requestText"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16
    )
  `,
    [
      record.id,
      record.createdAt,
      record.type,
      record.amount,
      record.currency,
      record.recipient,
      record.description,
      record.reference,
      record.status,
      record.decision,
      record.reason,
      record.ruleFired,
      record.paypalId,
      record.paypalStatus,
      record.errorMessage,
      record.requestText,
    ]
  );

  return record;
}

export async function updateAction(
  id: string,
  patch: UpdateActionPatch
): Promise<ActionRecord | null> {
  await ensureSchema();
  const client = getSqlClient();

  const existing = await getAction(id);
  if (!existing) {
    return null;
  }

  const keys = Object.keys(patch) as (keyof UpdateActionPatch)[];
  if (keys.length === 0) {
    return existing;
  }

  const setClauses: string[] = [];
  const params: unknown[] = [id];

  keys.forEach((key, index) => {
    const paramIndex = index + 2; // $1 is id
    setClauses.push(`"${String(key)}" = $${paramIndex}`);
    params.push(patch[key]);
  });

  const sql = `UPDATE actions SET ${setClauses.join(", ")} WHERE id = $1 RETURNING *`;
  const res = await client.query<Record<string, unknown>>(sql, params);

  if (res.rows.length === 0) {
    return null;
  }

  return mapActionRow(res.rows[0]);
}

export async function getAction(id: string): Promise<ActionRecord | null> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query<Record<string, unknown>>(
    `SELECT * FROM actions WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (res.rows.length === 0) {
    return null;
  }
  return mapActionRow(res.rows[0]);
}

export async function findActionByPaypalId(paypalId: string): Promise<StoredAction | undefined> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query<Record<string, unknown>>(
    `SELECT * FROM actions WHERE "paypalId" = $1 LIMIT 1`,
    [paypalId]
  );
  if (res.rows.length === 0) {
    return undefined;
  }
  return mapActionRow(res.rows[0]);
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query<{ eventId: string }>(
    `SELECT "eventId" FROM processed_events WHERE "eventId" = $1 LIMIT 1`,
    [eventId]
  );
  return res.rows.length > 0;
}

export async function recordProcessedEvent(eventId: string): Promise<void> {
  await ensureSchema();
  const client = getSqlClient();
  await client.query(
    `
    INSERT INTO processed_events ("eventId", "receivedAt")
    VALUES ($1, $2)
    ON CONFLICT ("eventId") DO NOTHING;
  `,
    [eventId, new Date().toISOString()]
  );
}

/**
 * Deletes all rows from actions and processed_events and restores default rules in a transaction.
 */
export async function resetAll(): Promise<void> {
  await ensureSchema();
  const client = getSqlClient();
  await client.query("BEGIN;");
  try {
    await client.query("DELETE FROM actions;");
    await client.query("DELETE FROM processed_events;");
    await client.query(
      `
      INSERT INTO rules (id, "autoApproveLimit", "hardLimit", "dailyCap", "allowedRecipients", "blockedActionTypes")
      VALUES (1, $1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        "autoApproveLimit" = EXCLUDED."autoApproveLimit",
        "hardLimit" = EXCLUDED."hardLimit",
        "dailyCap" = EXCLUDED."dailyCap",
        "allowedRecipients" = EXCLUDED."allowedRecipients",
        "blockedActionTypes" = EXCLUDED."blockedActionTypes";
    `,
      [
        DEFAULT_RULES.autoApproveLimit,
        DEFAULT_RULES.hardLimit,
        DEFAULT_RULES.dailyCap,
        JSON.stringify(DEFAULT_RULES.allowedRecipients),
        JSON.stringify(DEFAULT_RULES.blockedActionTypes),
      ]
    );
    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  }
}

/**
 * Atomically transitions an action from 'approved' to 'executing'.
 * Returns true if the claim was successful, false if the action was not in 'approved' status.
 */
export async function claimForExecution(id: string): Promise<boolean> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query(
    `UPDATE actions SET status = 'executing' WHERE id = $1 AND status = 'approved' RETURNING id`,
    [id]
  );
  return res.rowCount === 1;
}

export async function listActions(): Promise<ActionRecord[]> {
  await ensureSchema();
  const client = getSqlClient();
  const res = await client.query<Record<string, unknown>>(
    `SELECT * FROM actions ORDER BY "createdAt" DESC`
  );
  return res.rows.map(mapActionRow);
}

/**
 * Returns sum of amount for send_payout and issue_refund actions created today in UTC
 * whose status is approved, executing, or completed.
 */
export async function getSpentToday(): Promise<number> {
  await ensureSchema();
  const client = getSqlClient();

  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const startIso = startOfTodayUtc.toISOString();

  const res = await client.query<{ total: number | string | null }>(
    `
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM actions
    WHERE type IN ('send_payout', 'issue_refund')
      AND status IN ('approved', 'executing', 'completed')
      AND "createdAt" >= $1
  `,
    [startIso]
  );

  return res.rows.length > 0 && res.rows[0].total !== null
    ? Number(res.rows[0].total)
    : 0;
}
