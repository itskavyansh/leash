import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
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

interface RulesRow {
  id: number;
  autoApproveLimit: number;
  hardLimit: number;
  dailyCap: number;
  allowedRecipients: string;
  blockedActionTypes: string;
}

const DEFAULT_RULES: Rules = {
  autoApproveLimit: 200,
  hardLimit: 5000,
  dailyCap: 1000,
  allowedRecipients: ["sb-sub@example.com"],
  blockedActionTypes: [],
};

let dbInstance: Database.Database | null = null;
let currentDbPath: string | null = null;

export function getDb(customPath?: string): Database.Database {
  const dbPath = customPath ?? process.env.LEASH_DB_PATH ?? path.resolve(process.cwd(), "data", "leash.db");

  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  // If switching db path, close existing
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }

  if (dbPath !== ":memory:") {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  initSchema(db);

  dbInstance = db;
  currentDbPath = dbPath;

  return db;
}

export function resetDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
    currentDbPath = null;
  }
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      autoApproveLimit REAL NOT NULL,
      hardLimit REAL NOT NULL,
      dailyCap REAL NOT NULL,
      allowedRecipients TEXT NOT NULL,
      blockedActionTypes TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      recipient TEXT NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      status TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      ruleFired TEXT NOT NULL,
      paypalId TEXT,
      paypalStatus TEXT,
      errorMessage TEXT,
      requestText TEXT
    );
  `);

  // Seed default rules if empty
  const row = db.prepare("SELECT * FROM rules WHERE id = 1").get() as RulesRow | undefined;
  if (!row) {
    db.prepare(`
      INSERT INTO rules (id, autoApproveLimit, hardLimit, dailyCap, allowedRecipients, blockedActionTypes)
      VALUES (1, @autoApproveLimit, @hardLimit, @dailyCap, @allowedRecipients, @blockedActionTypes)
    `).run({
      autoApproveLimit: DEFAULT_RULES.autoApproveLimit,
      hardLimit: DEFAULT_RULES.hardLimit,
      dailyCap: DEFAULT_RULES.dailyCap,
      allowedRecipients: JSON.stringify(DEFAULT_RULES.allowedRecipients),
      blockedActionTypes: JSON.stringify(DEFAULT_RULES.blockedActionTypes),
    });
  }
}

export function getRules(db: Database.Database = getDb()): Rules {
  const row = db.prepare("SELECT * FROM rules WHERE id = 1").get() as RulesRow | undefined;
  if (!row) {
    return { ...DEFAULT_RULES };
  }
  return {
    autoApproveLimit: row.autoApproveLimit,
    hardLimit: row.hardLimit,
    dailyCap: row.dailyCap,
    allowedRecipients: JSON.parse(row.allowedRecipients) as string[],
    blockedActionTypes: JSON.parse(row.blockedActionTypes) as ActionType[],
  };
}

export function saveRules(rules: Rules, db: Database.Database = getDb()): void {
  db.prepare(`
    INSERT INTO rules (id, autoApproveLimit, hardLimit, dailyCap, allowedRecipients, blockedActionTypes)
    VALUES (1, @autoApproveLimit, @hardLimit, @dailyCap, @allowedRecipients, @blockedActionTypes)
    ON CONFLICT(id) DO UPDATE SET
      autoApproveLimit = excluded.autoApproveLimit,
      hardLimit = excluded.hardLimit,
      dailyCap = excluded.dailyCap,
      allowedRecipients = excluded.allowedRecipients,
      blockedActionTypes = excluded.blockedActionTypes
  `).run({
    autoApproveLimit: rules.autoApproveLimit,
    hardLimit: rules.hardLimit,
    dailyCap: rules.dailyCap,
    allowedRecipients: JSON.stringify(rules.allowedRecipients),
    blockedActionTypes: JSON.stringify(rules.blockedActionTypes),
  });
}

export function insertAction(action: InsertActionInput, db: Database.Database = getDb()): ActionRecord {
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

  db.prepare(`
    INSERT INTO actions (
      id, createdAt, type, amount, currency, recipient, description, reference,
      status, decision, reason, ruleFired, paypalId, paypalStatus, errorMessage, requestText
    ) VALUES (
      @id, @createdAt, @type, @amount, @currency, @recipient, @description, @reference,
      @status, @decision, @reason, @ruleFired, @paypalId, @paypalStatus, @errorMessage, @requestText
    )
  `).run(record);

  return record;
}

export function updateAction(
  id: string,
  patch: UpdateActionPatch,
  db: Database.Database = getDb()
): ActionRecord | null {
  const existing = getAction(id, db);
  if (!existing) {
    return null;
  }

  const keys = Object.keys(patch) as (keyof UpdateActionPatch)[];
  if (keys.length === 0) {
    return existing;
  }

  const setClauses = keys.map((key) => `${String(key)} = @${String(key)}`).join(", ");
  const query = `UPDATE actions SET ${setClauses} WHERE id = @id`;

  db.prepare(query).run({
    ...patch,
    id,
  });

  return getAction(id, db);
}

export function getAction(id: string, db: Database.Database = getDb()): ActionRecord | null {
  const row = db.prepare("SELECT * FROM actions WHERE id = ?").get(id) as ActionRecord | undefined;
  return row ?? null;
}

/**
 * Atomically transitions an action from 'approved' to 'executing'.
 * Returns true if the claim was successful, false if the action was not in 'approved' status.
 */
export function claimForExecution(id: string, db: Database.Database = getDb()): boolean {
  const info = db
    .prepare("UPDATE actions SET status = 'executing' WHERE id = ? AND status = 'approved'")
    .run(id);
  return info.changes > 0;
}

export function listActions(db: Database.Database = getDb()): ActionRecord[] {
  const rows = db.prepare("SELECT * FROM actions ORDER BY createdAt DESC").all() as ActionRecord[];
  return rows;
}

/**
 * Returns sum of amount for send_payout and issue_refund actions created today in UTC
 * whose status is approved, executing, or completed.
 */
export function getSpentToday(db: Database.Database = getDb()): number {
  const startOfTodayUtc = new Date();
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const startIso = startOfTodayUtc.toISOString();

  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM actions
    WHERE type IN ('send_payout', 'issue_refund')
      AND status IN ('approved', 'executing', 'completed')
      AND createdAt >= ?
  `).get(startIso) as { total: number } | undefined;

  return row ? Number(row.total) : 0;
}
