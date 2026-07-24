/**
 * Token DB — unified database access for MCP token storage. Resolves the correct
 * backend (D1 on Cloudflare, local SQLite otherwise) and presents a single query.
 */

import { z } from "zod";
import { getCloudflareEnv } from "../../../../../lib/cloudflare/env";
import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";

/** A row returned by any query — plain object keyed by column name. */
type SqlRow = Record<string, unknown>;

/** Unified query interface consumed by tokenStore.ts. */
export interface TokenDb {
  /** Run INSERT / UPDATE / DELETE. */
  execute(sql: string, params?: unknown[]): Promise<number>;

  /** Run SELECT returning many rows. */
  queryAll(sql: string, params?: unknown[]): Promise<SqlRow[]>;

  /** Run SELECT returning at most one row. */
  queryFirst(sql: string, params?: unknown[]): Promise<SqlRow | null>;
}

// D1 backend (Cloudflare / workerd)

// D1 prepared statement shape (subset used by token store).
type D1Statement = {
  bind(...params: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
};

class D1TokenDb implements TokenDb {
  constructor(private readonly db: { prepare(sql: string): unknown }) {}

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    let stmt = this.db.prepare(sql) as unknown as D1Statement;
    if (params.length > 0) {
      stmt = stmt.bind(...params);
    }
    const result = await stmt.run();
    const parsed = z
      .object({ meta: z.object({ changes: z.number() }).loose() })
      .loose()
      .safeParse(result);
    return parsed.success ? parsed.data.meta.changes : 0;
  }

  async queryAll(sql: string, params: unknown[] = []): Promise<SqlRow[]> {
    let stmt = this.db.prepare(sql) as unknown as D1Statement;
    if (params.length > 0) {
      stmt = stmt.bind(...params);
    }
    const result = await stmt.all<SqlRow>();
    return result.results ?? [];
  }

  async queryFirst(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlRow | null> {
    let stmt = this.db.prepare(sql) as unknown as D1Statement;
    if (params.length > 0) {
      stmt = stmt.bind(...params);
    }
    const row = await stmt.first<SqlRow>();
    return row ?? null;
  }
}

// SQLite backend (local Node.js dev)

/**
 * We dynamically import `@libsql/client/node` only in the Node path so
 * the workerd bundler never sees it.
 */
const LibSqlRowSchema = z
  .looseObject({
    id: z.unknown().optional(),
  });

class SQLiteTokenDb implements TokenDb {
  private client: unknown = null;

  private async client_(): Promise<unknown> {
    if (this.client) return this.client;

    // Dynamic import — only executed in Node, never in workerd
    const { createClient } = await import("@libsql/client/node");
    const { resolve } = await import("path");

    const dbPath = resolve(process.cwd(), "aria/storage/aria.db");
    const { mkdir } = await import("fs/promises");
    await mkdir(resolve(dbPath, ".."), { recursive: true });

    this.client = createClient({ url: `file:${dbPath}` });
    return this.client;
  }

  async execute(sql: string, params: unknown[] = []): Promise<number> {
    const client = (await this.client_()) as {
      execute: (opts: {
        sql: string;
        args: unknown[];
      }) => Promise<{ rowsAffected: number }>;
    };
    const result = await client.execute({ sql, args: params });
    return z.int().nonnegative().parse(result.rowsAffected);
  }

  async queryAll(sql: string, params: unknown[] = []): Promise<SqlRow[]> {
    const client = (await this.client_()) as {
      execute: (opts: {
        sql: string;
        args: unknown[];
      }) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const result = await client.execute({ sql, args: params });
    return z.array(LibSqlRowSchema).parse(result.rows) as unknown as SqlRow[];
  }

  async queryFirst(
    sql: string,
    params: unknown[] = [],
  ): Promise<SqlRow | null> {
    const client = (await this.client_()) as {
      execute: (opts: {
        sql: string;
        args: unknown[];
      }) => Promise<{ rows: Record<string, unknown>[] }>;
    };
    const result = await client.execute({ sql, args: params });
    const first = result.rows[0] ?? null;
    if (first === null) return null;
    return LibSqlRowSchema.parse(first) as unknown as SqlRow;
  }
}

/**
 * Returns a `TokenDb` implementation for the current runtime.
 *
 * - Cloudflare / workerd → D1-backed (`aria_db` binding)
 * - Node.js local dev     → SQLite-backed (`aria/storage/aria.db`)
 */
export async function getTokenDb(
  locals: RuntimeLocals | App.Locals,
): Promise<TokenDb> {
  const ariaDb = getCloudflareEnv(locals).aria_db as
    | { prepare(sql: string): unknown }
    | undefined;

  if (ariaDb) {
    return new D1TokenDb(ariaDb);
  }

  return new SQLiteTokenDb();
}
