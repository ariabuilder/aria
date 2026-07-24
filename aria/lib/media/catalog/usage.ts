import { z } from "astro/zod";
import { getCloudflareEnv, type RuntimeLocals } from "../../cloudflare/env";
import {
  isAriaLibraryMediaPath,
  normalizeLogicalMediaPath,
  resolveCollectedLogicalPath,
} from "../utils/path";
import { isLikelyMediaReference } from "./mediaReferenceKeys";

type D1Prepared = {
  bind: (...args: unknown[]) => D1Prepared;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
  all?: <T = unknown>() => Promise<{ results: T[] }>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Prepared;
};

const MediaUsageRowSchema = z.object({
  kind: z.enum([
    "page",
    "layout",
    "component",
    "cms-entry",
    "page-locale",
    "layout-locale",
    "site-settings",
    "design-system",
  ]),
  ref_id: z.string(),
  ref_path: z.string().nullable().optional(),
});

export type MediaUsageKind = z.infer<typeof MediaUsageRowSchema>["kind"];

export interface MediaUsageStorageExecutor {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  runBatch?(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<void>;
}

export type MediaReference = {
  logicalPath: string;
  refPath: string;
};

type MediaIdReference = {
  mediaId: string;
  refPath: string;
};

function extractMediaIdReferencesFromResource(
  resource: unknown,
): MediaIdReference[] {
  const found = new Map<string, string>();

  const visit = (value: unknown, refPath: string, parentKey: string | null) => {
    if (typeof value === "string") {
      const mediaId = value.trim();
      if (parentKey === "mediaId" && mediaId && !found.has(mediaId)) {
        found.set(mediaId, refPath || "$root");
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        visit(child, `${refPath}[${index}]`, null),
      );
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visit(child, refPath ? `${refPath}.${key}` : key, key);
      }
    }
  };

  visit(resource, "", null);
  return [...found.entries()].map(([mediaId, refPath]) => ({
    mediaId,
    refPath,
  }));
}

export function extractMediaReferencesFromResource(
  resource: unknown,
): MediaReference[] {
  const found = new Map<string, string>();

  const visit = (
    value: unknown,
    refPath: string,
    parentKey: string | null,
  ): void => {
    if (typeof value === "string") {
      if (!isLikelyMediaReference(value, parentKey)) {
        return;
      }

      try {
        const logicalPath = resolveCollectedLogicalPath(value);
        if (!isAriaLibraryMediaPath(logicalPath)) {
          return;
        }
        if (!found.has(logicalPath)) {
          found.set(logicalPath, refPath || "$root");
        }
      } catch {
        return;
      }

      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        visit(value[index], `${refPath}[${index}]`, null);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const childPath = refPath ? `${refPath}.${key}` : key;
        visit(child, childPath, key);
      }
    }
  };

  visit(resource, "", null);

  return Array.from(found.entries()).map(([logicalPath, refPath]) => ({
    logicalPath,
    refPath,
  }));
}

async function executeStatements(
  executor: MediaUsageStorageExecutor,
  statements: Array<{ sql: string; args?: readonly unknown[] }>,
): Promise<void> {
  if (executor.runBatch) {
    await executor.runBatch(statements);
    return;
  }
  for (const statement of statements) {
    await executor.run(statement.sql, statement.args);
  }
}

export async function syncMediaResourceUsage(
  executor: MediaUsageStorageExecutor,
  input: {
    kind: MediaUsageKind;
    refId: string;
    resource: unknown;
    updatedAt: string;
  },
): Promise<{ scanned: number; inserted: number; unresolved: number }> {
  const references = extractMediaReferencesFromResource(input.resource);
  const mediaIdReferences = extractMediaIdReferencesFromResource(
    input.resource,
  );
  const statements: Array<{ sql: string; args?: readonly unknown[] }> = [
    {
      sql: `DELETE FROM aria_media_usage WHERE kind = ? AND ref_id = ?`,
      args: [input.kind, input.refId],
    },
  ];
  let unresolved = 0;

  for (const reference of references) {
    const asset = await executor.queryFirst<{ id: string }>(
      `SELECT id
         FROM aria_media_assets
        WHERE logical_path = ?
          AND status = 'active'
        LIMIT 1`,
      [reference.logicalPath],
    );
    if (!asset) unresolved += 1;

    statements.push({
      sql: `INSERT INTO aria_media_usage (
              id, media_id, logical_path, kind, ref_id, ref_path, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        asset?.id ?? null,
        reference.logicalPath,
        input.kind,
        input.refId,
        reference.refPath,
        input.updatedAt,
      ],
    });
  }

  const indexedLogicalPaths = new Set(
    references.map((reference) => reference.logicalPath),
  );
  for (const reference of mediaIdReferences) {
    const asset = await executor.queryFirst<{
      id: string;
      logical_path: string;
    }>(
      `SELECT id, logical_path
         FROM aria_media_assets
        WHERE (id = ? OR logical_path = ?)
          AND status = 'active'
        LIMIT 1`,
      [reference.mediaId, reference.mediaId],
    );
    if (!asset) {
      unresolved += 1;
      continue;
    }
    if (indexedLogicalPaths.has(asset.logical_path)) {
      continue;
    }
    indexedLogicalPaths.add(asset.logical_path);
    statements.push({
      sql: `INSERT INTO aria_media_usage (
              id, media_id, logical_path, kind, ref_id, ref_path, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        asset.id,
        asset.logical_path,
        input.kind,
        input.refId,
        reference.refPath,
        input.updatedAt,
      ],
    });
  }

  await executeStatements(executor, statements);
  return {
    scanned: references.length + mediaIdReferences.length,
    inserted: statements.length - 1,
    unresolved,
  };
}

export async function listMediaUsageByLogicalPath(
  executor: MediaUsageStorageExecutor,
  logicalPath: string,
): Promise<
  Array<{ kind: MediaUsageKind; refId: string; refPath: string | null }>
> {
  const normalizedLogicalPath = normalizeLogicalMediaPath(logicalPath);
  const rows = await executor.queryAll<Record<string, unknown>>(
    `SELECT usage.kind, usage.ref_id, usage.ref_path
       FROM aria_media_usage AS usage
       LEFT JOIN aria_media_assets AS assets ON assets.id = usage.media_id
      WHERE COALESCE(usage.logical_path, assets.logical_path) = ?
      ORDER BY usage.kind ASC, usage.ref_id ASC`,
    [normalizedLogicalPath],
  );

  return rows
    .map((row) => MediaUsageRowSchema.safeParse(row))
    .filter(
      (
        row,
      ): row is z.ZodSafeParseSuccess<z.infer<typeof MediaUsageRowSchema>> =>
        row.success,
    )
    .map(({ data }) => ({
      kind: data.kind,
      refId: data.ref_id,
      refPath: data.ref_path ?? null,
    }));
}

export async function pruneOrphanedMediaUsage(
  executor: MediaUsageStorageExecutor,
): Promise<void> {
  await executeStatements(executor, [
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'page'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_page_meta WHERE aria_page_meta.id = aria_media_usage.ref_id
               )`,
    },
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'layout'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_layout_meta WHERE aria_layout_meta.id = aria_media_usage.ref_id
               )`,
    },
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'component'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_component_meta WHERE aria_component_meta.id = aria_media_usage.ref_id
               )`,
    },
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'cms-entry'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_entries WHERE aria_entries.id = aria_media_usage.ref_id
               )`,
    },
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'page-locale'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_page_locale_meta AS meta
                  WHERE meta.page_id || ':' || meta.locale = aria_media_usage.ref_id
               )`,
    },
    {
      sql: `DELETE FROM aria_media_usage
             WHERE kind = 'layout-locale'
               AND NOT EXISTS (
                 SELECT 1 FROM aria_layout_locale_meta AS meta
                  WHERE meta.layout_id || ':' || meta.locale = aria_media_usage.ref_id
               )`,
    },
  ]);
}

export class MediaUsageRepository {
  private readonly db: D1DatabaseLike;

  private constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  static tryCreate(locals?: RuntimeLocals): MediaUsageRepository | null {
    const db = getCloudflareEnv(locals).aria_db as D1DatabaseLike | undefined;
    if (!db || typeof db.prepare !== "function") {
      return null;
    }

    return new MediaUsageRepository(db);
  }

  async syncResourceUsage(input: {
    kind: MediaUsageKind;
    refId: string;
    resource: unknown;
    updatedAt: string;
  }): Promise<{ scanned: number; inserted: number; unresolved: number }> {
    return syncMediaResourceUsage(this.executor(), input);
  }

  async listUsageByLogicalPath(logicalPath: string): Promise<
    Array<{
      kind: MediaUsageKind;
      refId: string;
      refPath: string | null;
    }>
  > {
    return listMediaUsageByLogicalPath(this.executor(), logicalPath);
  }

  private executor(): MediaUsageStorageExecutor {
    return {
      queryFirst: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) =>
        this.db
          .prepare(sql)
          .bind(...args)
          .first<T>(),
      queryAll: async <T extends Record<string, unknown>>(
        sql: string,
        args: readonly unknown[] = [],
      ) => {
        const prepared = this.db.prepare(sql).bind(...args);
        if (typeof prepared.all === "function") {
          return (await prepared.all<T>()).results ?? [];
        }
        const result = (await prepared.run()) as { results?: T[] } | null;
        return result?.results ?? [];
      },
      run: async (sql: string, args: readonly unknown[] = []) => {
        await this.db
          .prepare(sql)
          .bind(...args)
          .run();
      },
    };
  }
}
