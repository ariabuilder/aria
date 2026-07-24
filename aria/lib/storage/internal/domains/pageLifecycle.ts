import type {
  AuthorshipSaveContext,
  PageInventoryItem,
  PublishPageOptions,
  StorageAdapter,
  StoredPageAccessMode,
  StoredPageSystemRole,
} from "../../adapter";
import {
  PublishPageOptionsSchema,
  SchedulePageOptionsSchema,
  type SchedulePageOptions,
} from "../../adapter";
import {
  allocateVersionId,
  computeVersionContentHash,
  isStorageVersionConflictError,
  VersionConflictError,
  type VersionSaveOptions,
  VersionSaveOptionsSchema,
} from "../../versioning";
import {
  appendSqlFragment,
  buildVersionInsertAuthorshipColumns,
  parseOptionalAuthorshipSaveContext,
  resolveVersionAuthorshipForSave,
} from "../../../authorship/stamping";
import { parseVersionAuthorshipRow } from "../../../authorship/reads";
import { toPageInventoryAuthorship } from "../../../authorship/schemas";
import {
  deriveLegacyPageAccessMode,
  parseFeaturedImage,
  serializeDslForStorage,
} from "../../helpers";
import type { PageDSL } from "../../../types/nodes";
import { computePageAnalytics } from "../../../blocks/nodeAnalytics";
import { migratePageDSL } from "../../../migrations/propMigrations";
import { validatePageDSL } from "../../../schemas/nodes";
import {
  buildCurrentCompilerMetadata,
  serializeCompilerMetadata,
} from "../../../system/metadata";

export type PageLifecycleStorageDomain = Pick<
  StorageAdapter,
  | "savePageDSL"
  | "publishPageDSL"
  | "schedulePageDSL"
  | "unpublishPageDSL"
  | "archivePageDSL"
  | "unarchivePageDSL"
  | "listPagesDSL"
>;

type PageLifecycleStorageContext = {
  resolvePageIdentity: any;
  getStoredVersionRow: any;
  resolveStoredVersionContentHash: any;
  syncPageUsage: any;
  normalizeVersion: any;
  nowIso: () => string;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  deletePageThumbnail: any;
  pruneStoredVersionHistory: any;
  loadPageVersion: any;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  bindArgs(args: readonly unknown[]): readonly unknown[];
};

export function createPageLifecycleStorageDomain(
  context: PageLifecycleStorageContext,
): PageLifecycleStorageDomain {
  return {
    async savePageDSL(
      id: string,
      dsl: PageDSL,
      options?: VersionSaveOptions,
      authorship?: AuthorshipSaveContext,
    ): Promise<string> {
      const parsedOptions = VersionSaveOptionsSchema.parse(options ?? {});
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const shouldSkipIfContentUnchanged =
        parsedOptions.skipIfContentUnchanged !== false;
      const existing = await context.resolvePageIdentity(id);
      const { dsl: migratedDSL } = migratePageDSL(dsl);
      // Strip derived fields that should never be persisted
      delete migratedDSL.isModifiedSincePublish;
      delete migratedDSL.systemRole;
      delete migratedDSL.accessMode;
      delete migratedDSL.hasPassword;
      const validation = validatePageDSL(migratedDSL);
      if (!validation.success) {
        throw new Error(`Invalid page DSL: ${validation.error.message}`);
      }

      const incomingHash = await computeVersionContentHash(migratedDSL);
      const currentDraftVersion =
        existing?.draftVersion ?? existing?.currentVersion;

      if (
        parsedOptions.expectedVersion &&
        currentDraftVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          currentDraftVersion ?? null,
        );
      }

      if (shouldSkipIfContentUnchanged && existing && currentDraftVersion) {
        const currentVersionRow = await context.getStoredVersionRow(
          "aria_page_versions",
          existing.id,
          currentDraftVersion,
        );

        if (currentVersionRow) {
          const currentHash =
            await context.resolveStoredVersionContentHash(currentVersionRow);
          if (currentHash === incomingHash) {
            await context.syncPageUsage(id, migratedDSL);
            return currentDraftVersion;
          }
        }
      }

      const hintedVersion = context.normalizeVersion(parsedOptions.versionHint);
      let version =
        parsedOptions.preserveVersion && hintedVersion
          ? hintedVersion
          : allocateVersionId();
      const now = context.nowIso();
      const title = migratedDSL.title ?? migratedDSL.slug ?? id;
      const slug = migratedDSL.slug ?? id;
      const status = migratedDSL.status ?? "draft";
      const layout =
        typeof migratedDSL.layout === "string" &&
        migratedDSL.layout.trim().length > 0
          ? migratedDSL.layout
          : null;
      const publishedVersion =
        existing?.publishedVersion ??
        (migratedDSL.status === "published" ? version : null);
      const effectiveStatus = publishedVersion
        ? "published"
        : status === "published" || status === "archived"
          ? status
          : "draft";
      const initialSystemRole: StoredPageSystemRole = "standard";
      const initialAccessMode = deriveLegacyPageAccessMode(
        migratedDSL.visibility,
      );
      const initialAccessPolicyVersion = 1;

      let shouldInsertVersion = true;
      const existingVersionRow = await context.getStoredVersionRow(
        "aria_page_versions",
        id,
        version,
      );
      if (existingVersionRow) {
        const existingVersionHash =
          await context.resolveStoredVersionContentHash(existingVersionRow);
        if (existingVersionHash !== incomingHash) {
          if (!parsedOptions.overwriteVersionIfExists) {
            throw new Error(
              `Page version conflict for ${id}: version ${version} already exists with different content`,
            );
          }
          shouldInsertVersion = false;
        } else {
          shouldInsertVersion = false;
        }
      }

      const versionedDSL = {
        ...migratedDSL,
        version,
        updatedAt: now,
        _computedMetrics: {
          ...computePageAnalytics(migratedDSL.nodes ?? []),
          computedAt: now,
          contentHash: incomingHash,
        },
      };

      if (!shouldInsertVersion && existingVersionRow) {
        const existingVersionHash =
          await context.resolveStoredVersionContentHash(existingVersionRow);
        if (existingVersionHash !== incomingHash) {
          await context.run(
            `UPDATE aria_page_versions
             SET slug = ?, title = ?, status = ?, dsl_json = ?, content_hash = ?, compiler_metadata_json = ?
             WHERE id = ? AND version = ?`,
            [
              slug,
              title,
              status,
              serializeDslForStorage(versionedDSL),
              incomingHash,
              serializeCompilerMetadata(buildCurrentCompilerMetadata(now)),
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
        const versionColumns = [
          "id",
          "version",
          "slug",
          "title",
          "status",
          "dsl_json",
          "created_at",
          "content_hash",
          "compiler_metadata_json",
        ];
        const versionValues: unknown[] = [
          id,
          version,
          slug,
          title,
          status,
          serializeDslForStorage(versionedDSL),
          now,
          incomingHash,
          serializeCompilerMetadata(buildCurrentCompilerMetadata(now)),
        ];
        if (parsedOptions.activityMetadata) {
          versionColumns.push("activity_metadata");
          versionValues.push(parsedOptions.activityMetadata);
        }
        const versionInsert = appendSqlFragment(
          versionColumns,
          versionValues,
          authorshipFragment,
        );

        let insertedVersionRow = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          versionedDSL.version = version;
          const versionedDslJson = serializeDslForStorage(versionedDSL);
          versionValues[1] = version;
          versionValues[5] = versionedDslJson;
          versionInsert.values[1] = version;
          versionInsert.values[5] = versionedDslJson;

          try {
            await context.run(
              `INSERT INTO aria_page_versions (${versionInsert.columns.join(", ")})
               VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
              context.bindArgs(versionInsert.values),
            );
            insertedVersionRow = true;
            break;
          } catch (error) {
            if (!isStorageVersionConflictError(error) || attempt >= 4) {
              throw error;
            }
            version = allocateVersionId();
          }
        }

        if (!insertedVersionRow) {
          throw new Error(`Failed to allocate a unique page version for ${id}`);
        }
      }

      await context.run(
        `INSERT INTO aria_page_meta (id, slug, title, status, parent, layout, draft_version, published_version, current_version, updated_at, system_role, access_mode, access_policy_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           slug = excluded.slug,
           title = excluded.title,
           status = excluded.status,
           parent = excluded.parent,
           layout = excluded.layout,
           draft_version = excluded.draft_version,
           published_version = excluded.published_version,
           current_version = excluded.current_version,
           scheduled_for = NULL,
           scheduled_version = NULL,
           schedule_lease_token = NULL,
           schedule_lease_expires_at = NULL,
           schedule_attempt_count = 0,
           last_schedule_error = NULL,
           updated_at = excluded.updated_at`,
        [
          id,
          slug,
          title,
          effectiveStatus,
          typeof migratedDSL.parent === "string" ? migratedDSL.parent : null,
          layout,
          version,
          publishedVersion,
          version,
          now,
          initialSystemRole,
          initialAccessMode,
          initialAccessPolicyVersion,
        ],
      );

      if (shouldInsertVersion) {
        await context.deletePageThumbnail(
          existing?.id ?? migratedDSL.id ?? id,
          "draft",
        );
        await context.pruneStoredVersionHistory("page", existing?.id ?? id);
      }

      await context.syncPageUsage(id, migratedDSL);
      return version;
    },

    async publishPageDSL(
      id: string,
      authorship?: AuthorshipSaveContext,
      options?: PublishPageOptions,
    ): Promise<string | null> {
      const parsedOptions = PublishPageOptionsSchema.parse(options ?? {});
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return null;
      }

      if (
        parsedOptions.expectedVersion &&
        resolved.currentVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          resolved.currentVersion,
        );
      }

      const sourceVersion =
        resolved.draftVersion ??
        resolved.currentVersion ??
        resolved.publishedVersion;
      if (!sourceVersion) {
        return null;
      }

      const sourcePage = await context.loadPageVersion(
        resolved.id,
        sourceVersion,
      );
      if (!sourcePage) {
        return null;
      }

      const hintedVersion = context.normalizeVersion(parsedOptions.versionHint);
      const version = hintedVersion ?? allocateVersionId();
      const now = context.nowIso();
      const title = sourcePage.title ?? sourcePage.slug ?? resolved.id;
      const slug = sourcePage.slug ?? resolved.slug ?? resolved.id;
      const layout =
        typeof sourcePage.layout === "string" &&
        sourcePage.layout.trim().length > 0
          ? sourcePage.layout
          : null;
      // After publishing, the draft pointer should match the published version
      // so that isModifiedSincePublish is false until the user edits again.
      const nextDraftVersion = version;
      const publishedPage: PageDSL = {
        ...sourcePage,
        status: "published",
        publishedAt: now,
        updatedAt: now,
        version,
      };
      const publishedHash = await computeVersionContentHash(publishedPage);
      const compilerMetadataJson = serializeCompilerMetadata(
        parsedOptions.compilerMetadata ?? buildCurrentCompilerMetadata(now),
      );
      const publishedPageWithMetrics: PageDSL = {
        ...publishedPage,
        _computedMetrics: {
          ...computePageAnalytics(publishedPage.nodes ?? []),
          computedAt: now,
          contentHash: publishedHash,
        },
      };
      const versionAuthorship = resolveVersionAuthorshipForSave(
        undefined,
        parsedAuthorship,
        now,
      );
      const authorshipFragment =
        buildVersionInsertAuthorshipColumns(versionAuthorship);
      const versionColumns = [
        "id",
        "version",
        "slug",
        "title",
        "status",
        "dsl_json",
        "created_at",
        "content_hash",
        "compiler_metadata_json",
      ];
      const versionValues: unknown[] = [
        resolved.id,
        version,
        slug,
        title,
        "published",
        serializeDslForStorage(publishedPageWithMetrics),
        now,
        publishedHash,
        compilerMetadataJson,
      ];
      if (parsedOptions.activityMetadata) {
        versionColumns.push("activity_metadata");
        versionValues.push(parsedOptions.activityMetadata);
      }
      const versionInsert = appendSqlFragment(
        versionColumns,
        versionValues,
        authorshipFragment,
      );

      await context.run(
        `INSERT INTO aria_page_versions (${versionInsert.columns.join(", ")})
         VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
        context.bindArgs(versionInsert.values),
      );

      await context.run(
        `UPDATE aria_page_meta
         SET slug = ?,
             title = ?,
             status = 'published',
             parent = ?,
             layout = ?,
             draft_version = ?,
             published_version = ?,
             current_version = ?,
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             schedule_attempt_count = 0,
             last_schedule_error = NULL,
             updated_at = ?
         WHERE id = ?`,
        [
          slug,
          title,
          typeof sourcePage.parent === "string" ? sourcePage.parent : null,
          layout,
          nextDraftVersion,
          version,
          nextDraftVersion,
          now,
          resolved.id,
        ],
      );

      await context.deletePageThumbnail(resolved.id, "published");
      await context.pruneStoredVersionHistory("page", resolved.id);

      return version;
    },

    async schedulePageDSL(
      id: string,
      scheduledFor: string,
      authorship?: AuthorshipSaveContext,
      options?: SchedulePageOptions,
    ): Promise<string | null> {
      if (Date.parse(scheduledFor) <= Date.now()) {
        throw new Error("scheduledFor must be in the future");
      }

      const parsedOptions = SchedulePageOptionsSchema.parse(options ?? {});
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return null;
      }

      const sourceVersion =
        resolved.draftVersion ??
        resolved.currentVersion ??
        resolved.publishedVersion;
      if (!sourceVersion) {
        return null;
      }

      const sourcePage = await context.loadPageVersion(
        resolved.id,
        sourceVersion,
      );
      if (!sourcePage) {
        return null;
      }

      const version = allocateVersionId();
      const now = context.nowIso();
      const title = sourcePage.title ?? sourcePage.slug ?? resolved.id;
      const slug = sourcePage.slug ?? resolved.slug ?? resolved.id;
      const layout =
        typeof sourcePage.layout === "string" &&
        sourcePage.layout.trim().length > 0
          ? sourcePage.layout
          : null;
      const scheduledPage: PageDSL = {
        ...sourcePage,
        status: "scheduled",
        updatedAt: now,
        version,
      };
      const scheduledHash = await computeVersionContentHash(scheduledPage);
      const compilerMetadataJson = serializeCompilerMetadata(
        parsedOptions.compilerMetadata ?? buildCurrentCompilerMetadata(now),
      );
      const scheduledPageWithMetrics: PageDSL = {
        ...scheduledPage,
        _computedMetrics: {
          ...computePageAnalytics(scheduledPage.nodes ?? []),
          computedAt: now,
          contentHash: scheduledHash,
        },
      };
      const versionAuthorship = resolveVersionAuthorshipForSave(
        undefined,
        parsedAuthorship,
        now,
      );
      const authorshipFragment =
        buildVersionInsertAuthorshipColumns(versionAuthorship);
      const versionColumns = [
        "id",
        "version",
        "slug",
        "title",
        "status",
        "dsl_json",
        "created_at",
        "content_hash",
        "compiler_metadata_json",
      ];
      const versionValues: unknown[] = [
        resolved.id,
        version,
        slug,
        title,
        "scheduled",
        serializeDslForStorage(scheduledPageWithMetrics),
        now,
        scheduledHash,
        compilerMetadataJson,
      ];
      if (parsedOptions.activityMetadata) {
        versionColumns.push("activity_metadata");
        versionValues.push(parsedOptions.activityMetadata);
      }
      const versionInsert = appendSqlFragment(
        versionColumns,
        versionValues,
        authorshipFragment,
      );

      await context.run(
        `INSERT INTO aria_page_versions (${versionInsert.columns.join(", ")})
         VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
        context.bindArgs(versionInsert.values),
      );

      await context.run(
        `UPDATE aria_page_meta
         SET slug = ?,
             title = ?,
             status = 'scheduled',
             parent = ?,
             layout = ?,
             draft_version = ?,
             current_version = ?,
             scheduled_for = ?,
             scheduled_version = ?,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             schedule_attempt_count = 0,
             last_schedule_error = NULL,
             updated_at = ?
         WHERE id = ?`,
        [
          slug,
          title,
          typeof sourcePage.parent === "string" ? sourcePage.parent : null,
          layout,
          version,
          version,
          scheduledFor,
          version,
          now,
          resolved.id,
        ],
      );

      await context.deletePageThumbnail(resolved.id, "draft");
      await context.pruneStoredVersionHistory("page", resolved.id);

      return version;
    },

    async unpublishPageDSL(id: string): Promise<void> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return;
      }

      const draftVersion = resolved.draftVersion ?? resolved.currentVersion;
      await context.run(
        `UPDATE aria_page_meta
         SET status = 'draft',
             draft_version = ?,
             published_version = NULL,
             current_version = ?,
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             schedule_attempt_count = 0,
             last_schedule_error = NULL,
             updated_at = ?
         WHERE id = ?`,
        [draftVersion, draftVersion, context.nowIso(), resolved.id],
      );
    },

    async archivePageDSL(id: string): Promise<void> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return;
      }

      await context.run(
        `UPDATE aria_page_meta
         SET status = 'archived',
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ?`,
        [context.nowIso(), resolved.id],
      );
    },

    async unarchivePageDSL(id: string): Promise<void> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return;
      }

      const draftVersion = resolved.draftVersion ?? resolved.currentVersion;
      const hasPublishedVersion =
        typeof resolved.publishedVersion === "string" &&
        resolved.publishedVersion.trim().length > 0;

      await context.run(
        `UPDATE aria_page_meta
         SET status = ?,
             draft_version = ?,
             current_version = ?,
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ?`,
        [
          hasPublishedVersion ? "published" : "draft",
          draftVersion,
          draftVersion,
          context.nowIso(),
          resolved.id,
        ],
      );
    },

    async listPagesDSL(opts?: {
      limit?: number;
      offset?: number;
      status?: "draft" | "published" | "scheduled" | "archived";
    }): Promise<PageInventoryItem[]> {
      const limit = opts?.limit ?? 100;
      const offset = opts?.offset ?? 0;
      const args: unknown[] = [];

      let sql = `
        SELECT m.id,
               m.slug,
               m.title,
               m.status,
               m.draft_version,
               m.published_version,
               m.parent,
               m.layout,
               m.updated_at,
               m.scheduled_for,
               m.system_role,
               m.access_mode,
               m.access_password_hash,
               cv.created_at AS editor_created_at,
               cv.created_by_id AS editor_created_by_id,
               cv.created_by_username AS editor_created_by_username,
               cv.created_by_email AS editor_created_by_email,
               cv.created_by_avatar_url AS editor_created_by_avatar_url,
               (SELECT json_extract(dsl_json, '$.featuredImage')
                FROM aria_page_versions
                WHERE id = m.id
                  AND version = COALESCE(m.draft_version, m.current_version)
                LIMIT 1) as featured_image,
               (SELECT json_extract(dsl_json, '$.description')
                FROM aria_page_versions
                WHERE id = m.id
                  AND version = COALESCE(m.draft_version, m.current_version)
                LIMIT 1) as description
        FROM aria_page_meta m
        LEFT JOIN aria_page_versions cv
          ON cv.id = m.id AND cv.version = m.current_version
      `;

      if (opts?.status) {
        sql += ` WHERE m.status = ?`;
        args.push(opts.status);
      }

      sql += ` ORDER BY COALESCE(cv.created_at, m.updated_at) DESC LIMIT ? OFFSET ?`;
      args.push(limit, offset);

      const rows = await context.queryAll<{
        id: string;
        slug: string | null;
        title: string | null;
        status: string | null;
        draft_version: string | null;
        published_version: string | null;
        parent: string | null;
        layout: string | null;
        updated_at: string | null;
        scheduled_for: string | null;
        system_role: StoredPageSystemRole | null;
        access_mode: StoredPageAccessMode | null;
        access_password_hash: string | null;
        editor_created_at: string | null;
        editor_created_by_id: string | null;
        editor_created_by_username: string | null;
        editor_created_by_email: string | null;
        editor_created_by_avatar_url: string | null;
        featured_image: string | null;
        description: string | null;
      }>(sql, args);

      return rows.map((row) => {
        const editorSlice = parseVersionAuthorshipRow({
          version: "current",
          created_at:
            typeof row.editor_created_at === "string"
              ? row.editor_created_at
              : typeof row.updated_at === "string"
                ? row.updated_at
                : new Date(0).toISOString(),
          created_by_id: row.editor_created_by_id,
          created_by_username: row.editor_created_by_username,
          created_by_email: row.editor_created_by_email,
          created_by_avatar_url: row.editor_created_by_avatar_url,
        });

        const authorship =
          editorSlice.createdBy || editorSlice.createdAt
            ? toPageInventoryAuthorship({
                updatedBy: editorSlice.createdBy,
                updatedAt: editorSlice.createdAt,
              })
            : undefined;

        const canonicalUpdatedAt = authorship?.updatedAt ?? undefined;

        return {
          id: String(row.id),
          slug: typeof row.slug === "string" ? row.slug : String(row.id),
          title: typeof row.title === "string" ? row.title : String(row.id),
          status:
            row.status === "published" ||
            row.status === "draft" ||
            row.status === "scheduled" ||
            row.status === "archived"
              ? row.status
              : "draft",
          isModifiedSincePublish:
            typeof row.draft_version === "string" &&
            typeof row.published_version === "string" &&
            row.draft_version !== row.published_version,
          parent: typeof row.parent === "string" ? row.parent : undefined,
          layout: typeof row.layout === "string" ? row.layout : undefined,
          systemRole: row.system_role ?? "standard",
          accessMode: row.access_mode ?? "public",
          hasPassword:
            typeof row.access_password_hash === "string" &&
            row.access_password_hash.length > 0,
          featuredImage: parseFeaturedImage(row.featured_image),
          description:
            typeof row.description === "string" ? row.description : undefined,
          updatedAt:
            canonicalUpdatedAt ??
            (typeof row.updated_at === "string" ? row.updated_at : undefined),
          scheduledFor:
            typeof row.scheduled_for === "string" ? row.scheduled_for : null,
          authorship,
        } satisfies PageInventoryItem;
      });
    },
  };
}
