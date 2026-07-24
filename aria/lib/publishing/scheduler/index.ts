import { createClient, type Client, type InValue } from "@libsql/client";
import { z } from "zod";
import {
  getCloudflareEnv,
  type RuntimeLocals,
} from "../../cloudflare/env";
import { resolve } from "node:path";

export {
  BATCH_LIMIT,
  LEASE_MS,
  MAX_SCHEDULE_ATTEMPTS,
  SYSTEM_SCHEDULE_ACTOR,
} from "./constants";
export {
  claimDueCmsEntry,
  clearCmsScheduleFailure,
  findDueCmsEntries,
  recoverExpiredCmsScheduleLeases,
  recordCmsScheduleFailure,
  releaseCmsScheduleLease,
} from "./cms";
export { executeCmsEntryPublication, executePagePublication } from "./execute";
export {
  claimDuePage,
  clearPageScheduleFailure,
  findDuePages,
  recoverExpiredPageScheduleLeases,
  recordPageScheduleFailure,
  releasePageScheduleLease,
} from "./pages";
export { reconcileScheduledPublications } from "./reconcile";
export {
  ClaimedCmsEntrySchema,
  ClaimedPageSchema,
  DueCmsEntrySchema,
  DuePageSchema,
  ReconcileOptionsSchema,
  ReconcileResultSchema,
  type ClaimedCmsEntry,
  type ClaimedPage,
  type DueCmsEntry,
  type DuePage,
  type ReconcileOptions,
  type ReconcileResult,
  type ScheduleSqlExecutor,
  type ScheduleSqlRunResult,
} from "./schemas";

function d1Executor(database: D1Database) {
  return {
    async run(sql: string, parameters: readonly unknown[] = []) {
      const result = z
        .object({ meta: z.object({ changes: z.number().optional() }) })
        .parse(await database.prepare(sql).bind(...parameters).run());
      return { changes: result.meta.changes ?? 0 };
    },
    async all(sql: string, parameters: readonly unknown[] = []) {
      const result = z
        .object({ results: z.array(z.unknown()) })
        .parse(await database.prepare(sql).bind(...parameters).all());
      return result.results;
    },
  };
}

function libsqlExecutor(client: Client) {
  const toValue = (value: unknown): InValue => {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      typeof value === "boolean" ||
      value instanceof Uint8Array ||
      value instanceof Date
    ) {
      return value;
    }
    throw new TypeError("Unsupported SQL parameter type");
  };

  return {
    async run(sql: string, parameters: readonly unknown[] = []) {
      const result = await client.execute({
        sql,
        args: parameters.map(toValue),
      });
      return { changes: result.rowsAffected };
    },
    async all(sql: string, parameters: readonly unknown[] = []) {
      const result = await client.execute({
        sql,
        args: parameters.map(toValue),
      });
      return result.rows;
    },
  };
}

let localClient: Client | null = null;
let localExecutor: ReturnType<typeof libsqlExecutor> | null = null;

export async function getScheduleSqlExecutor(
  locals?: RuntimeLocals,
): Promise<import("./schemas").ScheduleSqlExecutor> {
  const env = getCloudflareEnv(locals);
  if (env.aria_db) {
    return d1Executor(env.aria_db);
  }
  if (localExecutor) {
    return localExecutor;
  }
  localClient = createClient({
    url: `file:${resolve(process.cwd(), "aria/storage/aria.db")}`,
  });
  localExecutor = libsqlExecutor(localClient);
  return localExecutor;
}

export function clearScheduleSqlExecutorCache(): void {
  localClient?.close();
  localClient = null;
  localExecutor = null;
}
