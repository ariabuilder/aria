/**
 * Minimal SQL surface shared by CMS repositories. Storage adapters provide this interface
 * so repositories remain independent of SQLite, D1, and the narrow test.
 */

export interface CmsStorageExecutor {
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<T[]>;
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: unknown[]): Promise<void>;
  /** Execute ordered write statements atomically when the adapter supports it. */
  batch?(statements: Array<{ sql: string; args?: readonly unknown[] }>): Promise<void>;
}

export async function runCmsBatch(
  executor: CmsStorageExecutor,
  statements: Array<{ sql: string; args?: readonly unknown[] }>,
): Promise<void> {
  if (executor.batch) {
    await executor.batch(statements);
    return;
  }

  // Compatibility for narrow legacy/test executors. Production SQLite and D1
  // adapters provide `batch`, so release/comment mutations stay transactional.
  for (const statement of statements) {
    await executor.run(statement.sql, [...(statement.args ?? [])]);
  }
}
