import { createClient, type Client, type InValue } from "@libsql/client";
import { z } from "zod";
import { getCloudflareEnv, type RuntimeLocals } from "../cloudflare/env";
import { runPendingStorageMigrations } from "../storage/runStorageMigrations";
import { d1MigrationClient, ensureEmailSchema } from "./ensureEmailSchema";
import { SqlEmailRepository, type EmailRepository, type EmailSqlExecutor } from "./repository";

let localClient: Client | null = null;
let localRepository: EmailRepository | null = null;

function d1Executor(database: D1Database): EmailSqlExecutor {
  return {
    async run(sql, parameters = []) { const result=z.object({meta:z.object({changes:z.number().optional()})}).parse(await database.prepare(sql).bind(...parameters).run()); return { changes: result.meta.changes ?? 0 }; },
    async all(sql, parameters = []) { const result=z.object({results:z.array(z.unknown())}).parse(await database.prepare(sql).bind(...parameters).all()); return result.results; },
  };
}
function libsqlExecutor(client: Client): EmailSqlExecutor {
  const toValue = (value: unknown): InValue => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean" || value instanceof Uint8Array || value instanceof Date) return value;
    throw new TypeError("Unsupported SQL parameter type");
  };
  return {
    async run(sql, parameters = []) { const result = await client.execute({ sql, args: parameters.map(toValue) }); return { changes: result.rowsAffected }; },
    async all(sql, parameters = []) { const result = await client.execute({ sql, args: parameters.map(toValue) }); return result.rows; },
  };
}

function libsqlMigrationClient(client: Client) {
  return {
    executeMultiple: (sql: string) => client.executeMultiple(sql),
    execute: async (sql: string, args: unknown[] = []) => {
      const result = await client.execute({ sql, args: args as never[] });
      return { rows: result.rows };
    },
  };
}

async function bootstrapLocalEmailRepository(client: Client): Promise<EmailRepository> {
  const migrationClient = libsqlMigrationClient(client);
  await runPendingStorageMigrations(migrationClient);
  await ensureEmailSchema(migrationClient);
  return new SqlEmailRepository(libsqlExecutor(client));
}

export async function getEmailRepositoryAsync(locals?: RuntimeLocals): Promise<EmailRepository> {
  const env = getCloudflareEnv(locals);
  if (env.aria_db) {
    const migrationClient = d1MigrationClient(env.aria_db);
    await ensureEmailSchema(migrationClient);
    return new SqlEmailRepository(d1Executor(env.aria_db));
  }
  if (localRepository) return localRepository;
  const { resolve } = await import("node:path");
  localClient = createClient({ url: `file:${resolve(process.cwd(), "aria/storage/aria.db")}` });
  localRepository = await bootstrapLocalEmailRepository(localClient);
  return localRepository;
}

export function clearEmailRepositoryCache(): void { localClient?.close(); localClient = null; localRepository = null; }
