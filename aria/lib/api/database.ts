import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import type { Client, InValue } from "@libsql/client";

export type ApiSqlRow = Record<string, unknown>;

export type ApiSqlStatement = Readonly<{
  sql: string;
  params?: readonly unknown[];
}>;

export interface ApiSqlDatabase {
  execute(sql: string, params?: readonly unknown[]): Promise<number>;
  queryAll<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  queryFirst<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | null>;
  executeBatch(statements: readonly ApiSqlStatement[]): Promise<number[]>;
}

type D1Statement = {
  bind(...params: unknown[]): D1Statement;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T extends ApiSqlRow>(): Promise<{ results?: T[] }>;
  first<T extends ApiSqlRow>(): Promise<T | null>;
};

export class D1ApiSqlDatabase implements ApiSqlDatabase {
  constructor(
    private readonly db: {
      prepare(sql: string): unknown;
      batch(
        statements: unknown[],
      ): Promise<Array<{ meta?: { changes?: number } }>>;
    },
  ) {}

  private statement(sql: string, params: readonly unknown[]): D1Statement {
    const statement = this.db.prepare(sql) as D1Statement;
    return params.length ? statement.bind(...params) : statement;
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    const result = await this.statement(sql, params).run();
    return result.meta?.changes ?? 0;
  }

  async queryAll<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return (await this.statement(sql, params).all<T>()).results ?? [];
  }

  queryFirst<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    return this.statement(sql, params).first<T>();
  }

  async executeBatch(
    statements: readonly ApiSqlStatement[],
  ): Promise<number[]> {
    if (statements.length === 0) return [];
    const results = await this.db.batch(
      statements.map((statement) =>
        this.statement(statement.sql, statement.params ?? []),
      ),
    );
    return results.map((result) => result.meta?.changes ?? 0);
  }
}

export class LibSqlApiSqlDatabase implements ApiSqlDatabase {
  constructor(private readonly client: Client) {}

  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    return (await this.client.execute({ sql, args: [...params] as InValue[] }))
      .rowsAffected;
  }

  async queryAll<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T[]> {
    return (await this.client.execute({ sql, args: [...params] as InValue[] }))
      .rows as unknown as T[];
  }

  async queryFirst<T extends ApiSqlRow = ApiSqlRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<T | null> {
    return (await this.queryAll<T>(sql, params))[0] ?? null;
  }

  async executeBatch(
    statements: readonly ApiSqlStatement[],
  ): Promise<number[]> {
    if (statements.length === 0) return [];
    const results = await this.client.batch(
      statements.map((statement) => ({
        sql: statement.sql,
        args: [...(statement.params ?? [])] as InValue[],
      })),
      "write",
    );
    return results.map((result) => result.rowsAffected);
  }
}

let localDatabase: ApiSqlDatabase | null = null;

export async function getApiSqlDatabase(
  locals?: RuntimeLocals,
): Promise<ApiSqlDatabase> {
  const d1 = getCloudflareEnv(locals).aria_db as
    | {
        prepare(sql: string): unknown;
        batch(
          statements: unknown[],
        ): Promise<Array<{ meta?: { changes?: number } }>>;
      }
    | undefined;
  if (d1) return new D1ApiSqlDatabase(d1);
  if (localDatabase) return localDatabase;

  const [{ createClient }, { resolve }, { mkdir }] = await Promise.all([
    import("@libsql/client/node"),
    import("node:path"),
    import("node:fs/promises"),
  ]);
  const path = resolve(process.cwd(), "aria/storage/aria.db");
  await mkdir(resolve(path, ".."), { recursive: true });
  localDatabase = new LibSqlApiSqlDatabase(
    createClient({ url: `file:${path}` }),
  );
  return localDatabase;
}
