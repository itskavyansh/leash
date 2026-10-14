import { PGlite } from "@electric-sql/pglite";
import { setSqlClientForTests, SqlClient, SqlQueryResult } from "./db";

let testPglite: PGlite | null = null;

export async function setupTestDb(): Promise<SqlClient> {
  if (testPglite) {
    try {
      await testPglite.close();
    } catch {
      // ignore
    }
  }

  testPglite = new PGlite();

  const client: SqlClient = {
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>> {
      if (!testPglite) {
        throw new Error("Test PGlite instance is not initialized");
      }
      const res = await testPglite.query(sql, params);
      return {
        rows: res.rows as T[],
        rowCount: res.affectedRows ?? res.rows.length,
      };
    },
  };

  setSqlClientForTests(client);
  return client;
}

export async function teardownTestDb(): Promise<void> {
  setSqlClientForTests(null);
  if (testPglite) {
    try {
      await testPglite.close();
    } catch {
      // ignore
    }
    testPglite = null;
  }
}
