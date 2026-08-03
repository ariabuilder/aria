import type { AuthorshipSaveContext, StorageAdapter } from "../../adapter";
import {
  allocateVersionId,
  VersionConflictError,
  selectRetainedVersions,
  VersionHistoryPruneRequestSchema,
  VersionHistoryPruneResultSchema,
  type VersionSaveOptions,
  VersionSaveOptionsSchema,
} from "../../versioning";
import {
  appendSqlFragment,
  buildVersionInsertAuthorshipColumns,
  parseOptionalAuthorshipSaveContext,
  resolveVersionAuthorshipForSave,
} from "../../../authorship/stamping";
import { parseActorFromSqlColumns } from "../../../authorship/reads";
import type { ActorRef } from "../../../auth/types";
import { serializeDslForStorage } from "../../helpers";
import type { ComponentDSL, LayoutDSL } from "../../../types/nodes";
import {
  validateComponentDSL,
  validateLayoutDSL,
} from "../../../schemas/nodes";
import { stripLegacyClassFields } from "../../../migrations/propMigrations";
import { log } from "../../../utils/logger";
import {
  normalizeSurfaceForPersistence,
  resolveStoredSemanticSourceHash,
} from "./surfaceNormalization";
import type { SharedVersionStorageContext } from "./contextTypes";

export type DslAssetStorageDomain = Pick<
  StorageAdapter,
  | "getLayoutDSL"
  | "saveLayoutDSL"
  | "listLayoutsDSL"
  | "listLayoutVersions"
  | "getLayoutVersionPins"
  | "getComponentDSL"
  | "saveComponentDSL"
  | "listComponentsDSL"
  | "listComponentVersions"
  | "pruneVersionHistory"
>;

type DslAssetStorageContext = Pick<
  SharedVersionStorageContext,
  | "normalizeVersion"
  | "resolveLayoutVersionState"
  | "getStoredVersionRow"
  | "resolveStoredVersionContentHash"
  | "syncMediaUsageBestEffort"
  | "pruneStoredVersionHistory"
  | "resolveComponentVersionState"
  | "resolvePageIdentity"
> & {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  nowIso: () => string;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  bindArgs(args: readonly unknown[]): readonly unknown[];
};

export function createDslAssetStorageDomain(
  context: DslAssetStorageContext,
): DslAssetStorageDomain {
  return {
    async getLayoutDSL(
      id: string,
      version?: string,
    ): Promise<LayoutDSL | null> {
      const normalizedVersion = context.normalizeVersion(version);
      const row = normalizedVersion
        ? await context.queryFirst<{ dsl_json: string }>(
            `SELECT dsl_json
             FROM aria_layout_versions
             WHERE id = ? AND version = ?
             LIMIT 1`,
            [id, normalizedVersion],
          )
        : await context.queryFirst<{ dsl_json: string }>(
            `SELECT v.dsl_json
             FROM aria_layout_meta m
             JOIN aria_layout_versions v
               ON m.id = v.id AND m.current_version = v.version
             WHERE m.id = ?
             LIMIT 1`,
            [id],
          );

      if (!row) {
        return null;
      }

      try {
        const parsed = JSON.parse(String(row.dsl_json));
        const stripped = stripLegacyClassFields(parsed);
        const validation = validateLayoutDSL(stripped);
        if (!validation.success) {
          log("error", "Invalid layout DSL in SQLite storage", {
            error: validation.error.message,
            id,
          });
          return null;
        }

        return stripped as LayoutDSL;
      } catch {
        return null;
      }
    },

    async saveLayoutDSL(
      id: string,
      dsl: LayoutDSL,
      options?: VersionSaveOptions,
      authorship?: AuthorshipSaveContext,
    ): Promise<string> {
      const parsedOptions = VersionSaveOptionsSchema.parse(options ?? {});
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const shouldSkipIfContentUnchanged =
        parsedOptions.skipIfContentUnchanged !== false;
      const normalized = await normalizeSurfaceForPersistence("layout", dsl);
      const normalizedDSL = normalized.source;
      const validation = validateLayoutDSL(normalizedDSL);
      if (!validation.success) {
        throw new Error(`Invalid layout DSL: ${validation.error.message}`);
      }

      const existing = await context.resolveLayoutVersionState(id);
      if (
        parsedOptions.expectedVersion &&
        existing?.currentVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          existing?.currentVersion ?? null,
        );
      }
      const incomingHash = normalized.sourceHash;
      if (shouldSkipIfContentUnchanged && existing) {
        const currentVersionRow = await context.getStoredVersionRow(
          "aria_layout_versions",
          existing.id,
          existing.currentVersion,
        );
        if (currentVersionRow) {
          const currentHash = await resolveStoredSemanticSourceHash({
            kind: "layout",
            row: currentVersionRow,
            fallback: () =>
              context.resolveStoredVersionContentHash(currentVersionRow),
          });
          if (currentHash === incomingHash) {
            await context.syncMediaUsageBestEffort("layout", id, normalizedDSL);
            return existing.currentVersion;
          }
        }
      }

      const hintedVersion = context.normalizeVersion(parsedOptions.versionHint);
      const version =
        parsedOptions.preserveVersion && hintedVersion
          ? hintedVersion
          : allocateVersionId();
      const now = context.nowIso();
      const versionedDSL = {
        ...normalizedDSL,
        version,
        updatedAt: now,
      };
      const versionedLayoutStatus: string =
        typeof (versionedDSL as { status?: unknown }).status === "string"
          ? ((versionedDSL as { status?: string }).status ?? "published")
          : "published";
      const versionedLayoutDescription: string | null =
        typeof (versionedDSL as { description?: unknown }).description ===
        "string"
          ? ((versionedDSL as { description?: string }).description ?? null)
          : null;

      let shouldInsertVersion = true;
      let existingVersionHash: string | null = null;
      const existingVersionRow = await context.getStoredVersionRow(
        "aria_layout_versions",
        id,
        version,
      );
      if (existingVersionRow) {
        existingVersionHash = await resolveStoredSemanticSourceHash({
          kind: "layout",
          row: existingVersionRow,
          fallback: () =>
            context.resolveStoredVersionContentHash(existingVersionRow),
        });
        if (existingVersionHash !== incomingHash) {
          if (!parsedOptions.overwriteVersionIfExists) {
            throw new Error(
              `Layout version conflict for ${id}: version ${version} already exists with different content`,
            );
          }
          shouldInsertVersion = false;
        } else {
          shouldInsertVersion = false;
        }
      }

      if (!shouldInsertVersion && existingVersionRow) {
        if (existingVersionHash !== incomingHash) {
          await context.run(
            `UPDATE aria_layout_versions
             SET name = ?, status = ?, dsl_json = ?, content_hash = ?
             WHERE id = ? AND version = ?`,
            [
              versionedDSL.name ?? id,
              versionedLayoutStatus,
              serializeDslForStorage(versionedDSL),
              incomingHash,
              id,
              version,
            ],
          );
        }
      } else if (shouldInsertVersion) {
        const versionAuthorship = resolveVersionAuthorshipForSave(
          parsedOptions,
          parsedAuthorship,
          now,
        );
        const authorshipFragment =
          buildVersionInsertAuthorshipColumns(versionAuthorship);
        const versionInsert = appendSqlFragment(
          [
            "id",
            "version",
            "name",
            "status",
            "dsl_json",
            "created_at",
            "content_hash",
          ],
          [
            id,
            version,
            versionedDSL.name ?? id,
            versionedLayoutStatus,
            serializeDslForStorage(versionedDSL),
            now,
            incomingHash,
          ],
          authorshipFragment,
        );

        await context.run(
          `INSERT INTO aria_layout_versions (${versionInsert.columns.join(", ")})
           VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
          context.bindArgs(versionInsert.values),
        );
      }

      await context.run(
        `INSERT INTO aria_layout_meta (id, name, description, status, current_version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           status = excluded.status,
           current_version = excluded.current_version,
           updated_at = excluded.updated_at`,
        [
          id,
          versionedDSL.name ?? id,
          versionedLayoutDescription,
          versionedLayoutStatus,
          version,
          now,
        ],
      );

      if (shouldInsertVersion) {
        await context.pruneStoredVersionHistory("layout", id);
      }

      await context.syncMediaUsageBestEffort("layout", id, normalizedDSL);
      return version;
    },

    async listLayoutsDSL(opts?: {
      limit?: number;
      offset?: number;
    }): Promise<LayoutDSL[]> {
      const limit = opts?.limit ?? 100;
      const offset = opts?.offset ?? 0;
      const rows = await context.queryAll<{
        id: string;
        name: string | null;
        description: string | null;
        updated_at: string | null;
        current_version: string;
      }>(
        `SELECT id, name, description, updated_at, current_version
         FROM aria_layout_meta
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );

      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            name: typeof row.name === "string" ? row.name : String(row.id),
            description:
              typeof row.description === "string" ? row.description : undefined,
            updatedAt:
              typeof row.updated_at === "string" ? row.updated_at : undefined,
            version: String(row.current_version),
          }) as LayoutDSL,
      );
    },

    async listLayoutVersions(
      id: string,
    ): Promise<Array<{ version: string; createdAt: string }>> {
      const rows = await context.queryAll<{
        version: string;
        created_at: string;
      }>(
        `SELECT version, created_at
         FROM aria_layout_versions
         WHERE id = ?
         ORDER BY version DESC`,
        [id],
      );

      return rows.map((row) => ({
        version: String(row.version),
        createdAt: String(row.created_at),
      }));
    },

    async getLayoutVersionPins(
      id: string,
    ): Promise<{ currentVersion: string } | null> {
      const row = await context.queryFirst<{ current_version: string }>(
        `SELECT current_version FROM aria_layout_meta WHERE id = ? LIMIT 1`,
        [id],
      );
      return row ? { currentVersion: String(row.current_version) } : null;
    },

    async getComponentDSL(
      id: string,
      version?: string,
    ): Promise<ComponentDSL | null> {
      const normalizedVersion = context.normalizeVersion(version);
      const row = normalizedVersion
        ? await context.queryFirst<{ dsl_json: string }>(
            `SELECT dsl_json
             FROM aria_component_versions
             WHERE id = ? AND version = ?
             LIMIT 1`,
            [id, normalizedVersion],
          )
        : await context.queryFirst<{ dsl_json: string }>(
            `SELECT v.dsl_json
             FROM aria_component_meta m
             JOIN aria_component_versions v
               ON m.id = v.id AND m.current_version = v.version
             WHERE m.id = ?
             LIMIT 1`,
            [id],
          );

      if (!row) {
        return null;
      }

      try {
        const parsed = JSON.parse(String(row.dsl_json));
        const stripped = stripLegacyClassFields(parsed);
        const validation = validateComponentDSL(stripped);
        if (!validation.success) {
          log("error", "Invalid component DSL in SQLite storage", {
            error: validation.error.message,
            id,
          });
          return null;
        }

        return stripped as ComponentDSL;
      } catch {
        return null;
      }
    },

    async saveComponentDSL(
      id: string,
      dsl: ComponentDSL,
      options?: VersionSaveOptions,
      authorship?: AuthorshipSaveContext,
    ): Promise<string> {
      const parsedOptions = VersionSaveOptionsSchema.parse(options ?? {});
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const shouldSkipIfContentUnchanged =
        parsedOptions.skipIfContentUnchanged !== false;
      const normalized = await normalizeSurfaceForPersistence("component", dsl);
      const normalizedDSL = normalized.source;
      const validation = validateComponentDSL(normalizedDSL);
      if (!validation.success) {
        throw new Error(`Invalid component DSL: ${validation.error.message}`);
      }

      const existing = await context.resolveComponentVersionState(id);
      if (
        parsedOptions.expectedVersion &&
        existing?.currentVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          existing?.currentVersion ?? null,
        );
      }
      const incomingHash = normalized.sourceHash;
      if (shouldSkipIfContentUnchanged && existing) {
        const currentVersionRow = await context.getStoredVersionRow(
          "aria_component_versions",
          existing.id,
          existing.currentVersion,
        );
        if (currentVersionRow) {
          const currentHash = await resolveStoredSemanticSourceHash({
            kind: "component",
            row: currentVersionRow,
            fallback: () =>
              context.resolveStoredVersionContentHash(currentVersionRow),
          });
          if (currentHash === incomingHash) {
            await context.syncMediaUsageBestEffort(
              "component",
              id,
              normalizedDSL,
            );
            return existing.currentVersion;
          }
        }
      }

      const hintedVersion = context.normalizeVersion(parsedOptions.versionHint);
      const version =
        parsedOptions.preserveVersion && hintedVersion
          ? hintedVersion
          : allocateVersionId();
      const now = context.nowIso();
      const versionedDSL = {
        ...normalizedDSL,
        version,
        updatedAt: now,
      };

      let shouldInsertVersion = true;
      let existingVersionHash: string | null = null;
      const existingVersionRow = await context.getStoredVersionRow(
        "aria_component_versions",
        id,
        version,
      );
      if (existingVersionRow) {
        existingVersionHash = await resolveStoredSemanticSourceHash({
          kind: "component",
          row: existingVersionRow,
          fallback: () =>
            context.resolveStoredVersionContentHash(existingVersionRow),
        });
        if (existingVersionHash !== incomingHash) {
          if (!parsedOptions.overwriteVersionIfExists) {
            throw new Error(
              `Component version conflict for ${id}: version ${version} already exists with different content`,
            );
          }
          shouldInsertVersion = false;
        } else {
          shouldInsertVersion = false;
        }
      }

      if (!shouldInsertVersion && existingVersionRow) {
        if (existingVersionHash !== incomingHash) {
          await context.run(
            `UPDATE aria_component_versions
             SET name = ?, category = ?, dsl_json = ?, content_hash = ?
             WHERE id = ? AND version = ?`,
            [
              versionedDSL.name ?? id,
              versionedDSL.category ?? null,
              serializeDslForStorage(versionedDSL),
              incomingHash,
              id,
              version,
            ],
          );
        }
      } else if (shouldInsertVersion) {
        const versionAuthorship = resolveVersionAuthorshipForSave(
          parsedOptions,
          parsedAuthorship,
          now,
        );
        const authorshipFragment =
          buildVersionInsertAuthorshipColumns(versionAuthorship);
        const versionInsert = appendSqlFragment(
          [
            "id",
            "version",
            "name",
            "category",
            "dsl_json",
            "created_at",
            "content_hash",
          ],
          [
            id,
            version,
            versionedDSL.name ?? id,
            versionedDSL.category ?? null,
            serializeDslForStorage(versionedDSL),
            now,
            incomingHash,
          ],
          authorshipFragment,
        );

        await context.run(
          `INSERT INTO aria_component_versions (${versionInsert.columns.join(", ")})
           VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
          context.bindArgs(versionInsert.values),
        );
      }

      await context.run(
        `INSERT INTO aria_component_meta (id, name, description, category, source, tier, is_locked, pack_id, current_version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           category = excluded.category,
           source = excluded.source,
           tier = excluded.tier,
           is_locked = excluded.is_locked,
           pack_id = excluded.pack_id,
           current_version = excluded.current_version,
           updated_at = excluded.updated_at`,
        [
          id,
          versionedDSL.name ?? id,
          versionedDSL.description ?? null,
          versionedDSL.category ?? null,
          versionedDSL.source ?? null,
          versionedDSL.tier ?? null,
          versionedDSL.isLocked ? 1 : 0,
          versionedDSL.packId ?? null,
          version,
          now,
        ],
      );

      if (shouldInsertVersion) {
        await context.pruneStoredVersionHistory("component", id);
      }

      await context.syncMediaUsageBestEffort("component", id, normalizedDSL);
      return version;
    },

    async listComponentsDSL(opts?: {
      limit?: number;
      offset?: number;
      category?: string;
    }): Promise<ComponentDSL[]> {
      const limit = opts?.limit ?? 100;
      const offset = opts?.offset ?? 0;
      const args: unknown[] = [];

      let sql = `
        SELECT m.id, m.name, m.description, m.category, m.source, m.tier,
               m.is_locked, m.pack_id, m.updated_at, m.current_version,
               json_extract(v.dsl_json, '$.packVersion') AS pack_version
        FROM aria_component_meta m
        LEFT JOIN aria_component_versions v
          ON v.id = m.id AND v.version = m.current_version
      `;

      if (opts?.category) {
        sql += ` WHERE m.category = ?`;
        args.push(opts.category);
      }

      sql += ` ORDER BY m.name ASC LIMIT ? OFFSET ?`;
      args.push(limit, offset);

      const rows = await context.queryAll<{
        id: string;
        name: string | null;
        description: string | null;
        category: string | null;
        source: string | null;
        tier: string | null;
        is_locked: number | null;
        pack_id: string | null;
        pack_version: string | null;
        updated_at: string | null;
        current_version: string;
      }>(sql, args);

      return rows.map(
        (row) =>
          ({
            id: String(row.id),
            name: typeof row.name === "string" ? row.name : String(row.id),
            description:
              typeof row.description === "string" ? row.description : undefined,
            category:
              typeof row.category === "string" ? row.category : undefined,
            source:
              row.source === "aria" || row.source === "custom"
                ? row.source
                : undefined,
            tier:
              row.tier === "free" || row.tier === "pro" ? row.tier : undefined,
            isLocked: Boolean(row.is_locked),
            packId: typeof row.pack_id === "string" ? row.pack_id : undefined,
            packVersion:
              typeof row.pack_version === "string"
                ? row.pack_version
                : undefined,
            updatedAt:
              typeof row.updated_at === "string" ? row.updated_at : undefined,
            version: String(row.current_version),
          }) as ComponentDSL,
      );
    },

    async listComponentVersions(
      id: string,
    ): Promise<
      Array<{ version: string; createdAt: string; createdBy?: ActorRef }>
    > {
      const rows = await context.queryAll<{
        version: string;
        created_at: string;
        created_by_id: string | null;
        created_by_username: string | null;
        created_by_email: string | null;
        created_by_avatar_url: string | null;
      }>(
        `SELECT version,
                created_at,
                created_by_id,
                created_by_username,
                created_by_email,
                created_by_avatar_url
         FROM aria_component_versions
         WHERE id = ?
         ORDER BY created_at DESC`,
        [id],
      );

      return rows.map((row) => {
        const createdBy = parseActorFromSqlColumns({
          id: row.created_by_id,
          username: row.created_by_username,
          email: row.created_by_email,
          avatarUrl: row.created_by_avatar_url,
        });
        return {
          version: String(row.version),
          createdAt: String(row.created_at),
          ...(createdBy ? { createdBy } : {}),
        };
      });
    },

    async pruneVersionHistory(input: {
      resourceType: "page" | "layout" | "component";
      resourceId: string;
      keepLatest: number;
      dryRun?: boolean;
    }) {
      const parsedInput = VersionHistoryPruneRequestSchema.parse(input);

      if (parsedInput.resourceType === "page") {
        const resolved = await context.resolvePageIdentity(
          parsedInput.resourceId,
        );
        if (!resolved) {
          throw new Error(`Page not found: ${parsedInput.resourceId}`);
        }

        const rows = await context.queryAll<{
          version: string;
          created_at: string;
        }>(
          `SELECT version, created_at
           FROM aria_page_versions
           WHERE id = ?
           ORDER BY version DESC`,
          [resolved.id],
        );
        const selection = selectRetainedVersions({
          versions: rows.map((row) => ({
            version: String(row.version),
            createdAt: String(row.created_at),
          })),
          policy: {
            keepLatest: parsedInput.keepLatest,
            pinnedVersions: [
              resolved.draftVersion,
              resolved.publishedVersion,
              resolved.currentVersion,
              ...(
                await context.queryAll<{ source_version: string }>(
                  `SELECT DISTINCT source_version
                   FROM aria_page_locale_versions
                   WHERE page_id = ?`,
                  [resolved.id],
                )
              ).map((row) => String(row.source_version)),
            ].filter((value): value is string => Boolean(value)),
          },
        });

        if (!parsedInput.dryRun && selection.deleteVersions.length > 0) {
          const placeholders = selection.deleteVersions
            .map(() => "?")
            .join(", ");
          await context.run(
            `DELETE FROM aria_page_versions
             WHERE id = ? AND version IN (${placeholders})`,
            [resolved.id, ...selection.deleteVersions],
          );
        }

        return VersionHistoryPruneResultSchema.parse({
          resourceType: parsedInput.resourceType,
          resourceId: resolved.id,
          keepLatest: parsedInput.keepLatest,
          dryRun: parsedInput.dryRun,
          keptVersions: selection.keepVersions,
          deletedVersions: selection.deleteVersions,
        });
      }

      if (parsedInput.resourceType === "layout") {
        const resolved = await context.resolveLayoutVersionState(
          parsedInput.resourceId,
        );
        if (!resolved) {
          throw new Error(`Layout not found: ${parsedInput.resourceId}`);
        }

        const rows = await context.queryAll<{
          version: string;
          created_at: string;
        }>(
          `SELECT version, created_at
           FROM aria_layout_versions
           WHERE id = ?
           ORDER BY version DESC`,
          [resolved.id],
        );
        const selection = selectRetainedVersions({
          versions: rows.map((row) => ({
            version: String(row.version),
            createdAt: String(row.created_at),
          })),
          policy: {
            keepLatest: parsedInput.keepLatest,
            pinnedVersions: [
              resolved.currentVersion,
              ...(
                await context.queryAll<{ source_version: string }>(
                  `SELECT DISTINCT source_version
                   FROM aria_layout_locale_versions
                   WHERE layout_id = ?`,
                  [resolved.id],
                )
              ).map((row) => String(row.source_version)),
            ],
          },
        });

        if (!parsedInput.dryRun && selection.deleteVersions.length > 0) {
          const placeholders = selection.deleteVersions
            .map(() => "?")
            .join(", ");
          await context.run(
            `DELETE FROM aria_layout_versions
             WHERE id = ? AND version IN (${placeholders})`,
            [resolved.id, ...selection.deleteVersions],
          );
        }

        return VersionHistoryPruneResultSchema.parse({
          resourceType: parsedInput.resourceType,
          resourceId: resolved.id,
          keepLatest: parsedInput.keepLatest,
          dryRun: parsedInput.dryRun,
          keptVersions: selection.keepVersions,
          deletedVersions: selection.deleteVersions,
        });
      }

      const resolved = await context.resolveComponentVersionState(
        parsedInput.resourceId,
      );
      if (!resolved) {
        throw new Error(`Component not found: ${parsedInput.resourceId}`);
      }

      const rows = await context.queryAll<{
        version: string;
        created_at: string;
      }>(
        `SELECT version, created_at
         FROM aria_component_versions
         WHERE id = ?
         ORDER BY version DESC`,
        [resolved.id],
      );
      const selection = selectRetainedVersions({
        versions: rows.map((row) => ({
          version: String(row.version),
          createdAt: String(row.created_at),
        })),
        policy: {
          keepLatest: parsedInput.keepLatest,
          pinnedVersions: [resolved.currentVersion],
        },
      });

      if (!parsedInput.dryRun && selection.deleteVersions.length > 0) {
        const placeholders = selection.deleteVersions.map(() => "?").join(", ");
        await context.run(
          `DELETE FROM aria_component_versions
           WHERE id = ? AND version IN (${placeholders})`,
          [resolved.id, ...selection.deleteVersions],
        );
      }

      return VersionHistoryPruneResultSchema.parse({
        resourceType: parsedInput.resourceType,
        resourceId: resolved.id,
        keepLatest: parsedInput.keepLatest,
        dryRun: parsedInput.dryRun,
        keptVersions: selection.keepVersions,
        deletedVersions: selection.deleteVersions,
      });
    },
  };
}
