import type {
  AuthorshipSaveContext,
  LinkedLayoutDraftSave,
  PageInventoryItem,
  PageSaveOptions,
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
  isStorageVersionConflictError,
  VersionConflictError,
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
import type { LayoutDSL, PageDSL } from "../../../types/nodes";
import { validateLayoutDSL, validatePageDSL } from "../../../schemas/nodes";
import {
  buildCurrentCompilerMetadata,
  serializeCompilerMetadata,
} from "../../../system/metadata";
import {
  normalizeSurfaceForPersistence,
  resolveStoredSemanticSourceHash,
} from "./surfaceNormalization";
import type { SharedVersionStorageContext } from "./contextTypes";

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

type PageLifecycleStorageContext = Pick<
  SharedVersionStorageContext,
  | "resolvePageIdentity"
  | "resolveLayoutVersionState"
  | "getStoredVersionRow"
  | "resolveStoredVersionContentHash"
  | "syncPageUsage"
  | "syncMediaUsageBestEffort"
  | "normalizeVersion"
  | "pruneStoredVersionHistory"
> & {
  nowIso: () => string;
  run(sql: string, args?: readonly unknown[]): Promise<void>;
  runBatch(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<void>;
  runBatchWithChanges(
    statements: Array<{ sql: string; args?: readonly unknown[] }>,
  ): Promise<Array<{ changes: number }>>;
  runWithChanges(
    sql: string,
    args?: readonly unknown[],
  ): Promise<{ changes: number }>;
  deletePageThumbnail(
    pageId: string,
    stage?: "draft" | "published",
  ): Promise<void>;
  loadPageVersion(id: string, version: string): Promise<PageDSL | null>;
  queryAll<T extends Record<string, unknown>>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  bindArgs(args: readonly unknown[]): readonly unknown[];
};

type PreparedLinkedLayoutDraft = {
  id: string;
  dsl: LayoutDSL;
  version: string;
  expectedVersion: string;
  statements: Array<{ sql: string; args: readonly unknown[] }>;
  changed: boolean;
};

type LinkedPageSaveGuard = {
  id: string;
  expectedVersion: string;
  status: string | null;
  publishedVersion: string | null;
};

async function prepareLinkedLayoutDraft(
  context: PageLifecycleStorageContext,
  input: LinkedLayoutDraftSave,
  authorship: ReturnType<typeof parseOptionalAuthorshipSaveContext>,
  now: string,
  pageGuard: LinkedPageSaveGuard,
): Promise<PreparedLinkedLayoutDraft> {
  const normalized = await normalizeSurfaceForPersistence("layout", input.dsl);
  const normalizedDSL = normalized.source;
  const validation = validateLayoutDSL(normalizedDSL);
  if (!validation.success) {
    throw new Error(`Invalid layout DSL: ${validation.error.message}`);
  }

  const existing = await context.resolveLayoutVersionState(input.id);
  const incomingHash = normalized.sourceHash;
  const currentVersionRow = existing
    ? await context.getStoredVersionRow(
        "aria_layout_versions",
        existing.id,
        existing.currentVersion,
      )
    : null;
  const currentHash = currentVersionRow
    ? await resolveStoredSemanticSourceHash({
        kind: "layout",
        row: currentVersionRow,
        fallback: () =>
          context.resolveStoredVersionContentHash(currentVersionRow),
      })
    : null;

  const confirmLayoutVersionUnchanged = async (): Promise<string> => {
    if (!existing) {
      throw new VersionConflictError(input.expectedVersion, null);
    }
    const latest = await context.resolveLayoutVersionState(input.id);
    if (latest?.currentVersion !== existing.currentVersion) {
      throw new VersionConflictError(
        input.expectedVersion,
        latest?.currentVersion ?? null,
      );
    }
    return latest.currentVersion;
  };

  if (existing?.currentVersion !== input.expectedVersion) {
    if (existing && currentHash === incomingHash) {
      const stableVersion = await confirmLayoutVersionUnchanged();
      return {
        id: input.id,
        dsl: normalizedDSL,
        version: stableVersion,
        expectedVersion: input.expectedVersion,
        statements: [],
        changed: false,
      };
    }
    throw new VersionConflictError(
      input.expectedVersion,
      existing?.currentVersion ?? null,
    );
  }

  if (currentHash === incomingHash) {
    const stableVersion = await confirmLayoutVersionUnchanged();
    return {
      id: input.id,
      dsl: normalizedDSL,
      version: stableVersion,
      expectedVersion: input.expectedVersion,
      statements: [],
      changed: false,
    };
  }

  const version = allocateVersionId();
  const versionedDSL: LayoutDSL = {
    ...normalizedDSL,
    version,
    updatedAt: now,
  };
  const status =
    typeof (versionedDSL as { status?: unknown }).status === "string"
      ? ((versionedDSL as { status?: string }).status ?? "published")
      : "published";
  const description =
    typeof versionedDSL.description === "string"
      ? versionedDSL.description
      : null;
  const versionAuthorship = resolveVersionAuthorshipForSave(
    {},
    authorship,
    now,
  );
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
      input.id,
      version,
      versionedDSL.name ?? input.id,
      status,
      serializeDslForStorage(versionedDSL),
      now,
      incomingHash,
    ],
    buildVersionInsertAuthorshipColumns(versionAuthorship),
  );

  return {
    id: input.id,
    dsl: normalizedDSL,
    version,
    expectedVersion: input.expectedVersion,
    changed: true,
    statements: [
      {
        sql: `INSERT INTO aria_layout_versions (${versionInsert.columns.join(", ")})
              SELECT ${versionInsert.columns.map(() => "?").join(", ")}
              FROM aria_layout_meta
              WHERE id = ? AND current_version = ?
                AND EXISTS (
                  SELECT 1
                  FROM aria_page_meta
                  WHERE id = ?
                    AND COALESCE(draft_version, current_version) = ?
                    AND status IS ?
                    AND published_version IS ?
                )`,
        args: context.bindArgs([
          ...versionInsert.values,
          existing.id,
          input.expectedVersion,
          pageGuard.id,
          pageGuard.expectedVersion,
          pageGuard.status,
          pageGuard.publishedVersion,
        ]),
      },
      {
        sql: `UPDATE aria_layout_meta
              SET name = ?,
                  description = ?,
                  status = ?,
                  current_version = ?,
                  updated_at = ?
              WHERE id = ?
                AND current_version = ?
                AND EXISTS (
                  SELECT 1 FROM aria_layout_versions
                  WHERE id = ? AND version = ?
                )
                AND EXISTS (
                  SELECT 1
                  FROM aria_page_meta
                  WHERE id = ?
                    AND COALESCE(draft_version, current_version) = ?
                    AND status IS ?
                    AND published_version IS ?
                )`,
        args: context.bindArgs([
          versionedDSL.name ?? input.id,
          description,
          status,
          version,
          now,
          existing.id,
          input.expectedVersion,
          existing.id,
          version,
          pageGuard.id,
          pageGuard.expectedVersion,
          pageGuard.status,
          pageGuard.publishedVersion,
        ]),
      },
    ],
  };
}

async function settlePostCommit(
  tasks: Array<() => Promise<unknown>>,
): Promise<void> {
  await Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
}

export function createPageLifecycleStorageDomain(
  context: PageLifecycleStorageContext,
): PageLifecycleStorageDomain {
  return {
    async savePageDSL(
      id: string,
      dsl: PageDSL,
      options?: PageSaveOptions,
      authorship?: AuthorshipSaveContext,
    ): Promise<string> {
      const { linkedLayoutDraft, ...versionOptions } = options ?? {};
      const parsedOptions = VersionSaveOptionsSchema.parse(versionOptions);
      const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);
      const shouldSkipIfContentUnchanged =
        parsedOptions.skipIfContentUnchanged !== false;
      const existing = await context.resolvePageIdentity(id);
      const normalized = await normalizeSurfaceForPersistence("page", dsl);
      const normalizedDSL = normalized.source;
      const validation = validatePageDSL(normalizedDSL);
      if (!validation.success) {
        throw new Error(`Invalid page DSL: ${validation.error.message}`);
      }

      const incomingHash = normalized.sourceHash;
      const currentDraftVersion =
        existing?.draftVersion ?? existing?.currentVersion;
      const now = context.nowIso();
      const currentVersionRow =
        existing && currentDraftVersion
          ? await context.getStoredVersionRow(
              "aria_page_versions",
              existing.id,
              currentDraftVersion,
            )
          : null;
      const currentHash = currentVersionRow
        ? await resolveStoredSemanticSourceHash({
            kind: "page",
            row: currentVersionRow,
            fallback: () =>
              context.resolveStoredVersionContentHash(currentVersionRow),
          })
        : null;

      if (
        parsedOptions.expectedVersion &&
        currentDraftVersion !== parsedOptions.expectedVersion
      ) {
        if (existing && currentDraftVersion && currentHash === incomingHash) {
          const reconciledLinkedLayout = linkedLayoutDraft
            ? await prepareLinkedLayoutDraft(
                context,
                linkedLayoutDraft,
                parsedAuthorship,
                now,
                {
                  id: existing.id,
                  expectedVersion: currentDraftVersion,
                  status: existing.status,
                  publishedVersion: existing.publishedVersion,
                },
              )
            : null;

          if (!reconciledLinkedLayout?.changed) {
            await settlePostCommit([
              () => context.syncPageUsage(id, normalizedDSL),
              ...(reconciledLinkedLayout
                ? [
                    () =>
                      context.syncMediaUsageBestEffort(
                        "layout",
                        reconciledLinkedLayout.id,
                        reconciledLinkedLayout.dsl,
                      ),
                  ]
                : []),
            ]);
            return currentDraftVersion;
          }
        }
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          currentDraftVersion ?? null,
        );
      }

      if (linkedLayoutDraft && (!existing || !parsedOptions.expectedVersion)) {
        throw new Error(
          "A linked layout draft requires an existing page and expected page revision",
        );
      }

      const preparedLinkedLayout = linkedLayoutDraft
        ? await prepareLinkedLayoutDraft(
            context,
            linkedLayoutDraft,
            parsedAuthorship,
            now,
            {
              id: existing!.id,
              expectedVersion: parsedOptions.expectedVersion!,
              status: existing!.status,
              publishedVersion: existing!.publishedVersion,
            },
          )
        : null;

      if (
        shouldSkipIfContentUnchanged &&
        !preparedLinkedLayout?.changed &&
        existing &&
        currentDraftVersion
      ) {
        if (currentHash === incomingHash) {
          const latest = await context.resolvePageIdentity(existing.id);
          const latestDraftVersion =
            latest?.draftVersion ?? latest?.currentVersion;
          if (latestDraftVersion !== currentDraftVersion) {
            throw new VersionConflictError(
              parsedOptions.expectedVersion ?? currentDraftVersion,
              latestDraftVersion ?? null,
            );
          }
          await settlePostCommit([
            () => context.syncPageUsage(id, normalizedDSL),
            ...(preparedLinkedLayout
              ? [
                  () =>
                    context.syncMediaUsageBestEffort(
                      "layout",
                      preparedLinkedLayout.id,
                      preparedLinkedLayout.dsl,
                    ),
                ]
              : []),
          ]);
          return currentDraftVersion;
        }
      }

      const hintedVersion = context.normalizeVersion(parsedOptions.versionHint);
      let version =
        parsedOptions.preserveVersion && hintedVersion
          ? hintedVersion
          : allocateVersionId();
      const title = normalizedDSL.title ?? normalizedDSL.slug ?? id;
      const slug = normalizedDSL.slug ?? id;
      const status = normalizedDSL.status ?? "draft";
      const layout =
        typeof normalizedDSL.layout === "string" &&
        normalizedDSL.layout.trim().length > 0
          ? normalizedDSL.layout
          : null;
      const publishedVersion =
        existing?.publishedVersion ??
        (normalizedDSL.status === "published" ? version : null);
      const effectiveStatus = publishedVersion
        ? "published"
        : status === "published" || status === "archived"
          ? status
          : "draft";
      const initialSystemRole: StoredPageSystemRole = "standard";
      const initialAccessMode = deriveLegacyPageAccessMode(
        normalizedDSL.visibility,
      );
      const initialAccessPolicyVersion = 1;
      const metaValues: unknown[] = [
        id,
        slug,
        title,
        effectiveStatus,
        typeof normalizedDSL.parent === "string" ? normalizedDSL.parent : null,
        layout,
        version,
        publishedVersion,
        version,
        now,
        initialSystemRole,
        initialAccessMode,
        initialAccessPolicyVersion,
      ];
      const metaUpsertSql = `INSERT INTO aria_page_meta (id, slug, title, status, parent, layout, draft_version, published_version, current_version, updated_at, system_role, access_mode, access_policy_version)
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
           updated_at = excluded.updated_at`;

      let shouldInsertVersion = true;
      let existingVersionHash: string | null = null;
      const existingVersionRow = await context.getStoredVersionRow(
        "aria_page_versions",
        id,
        version,
      );
      if (existingVersionRow) {
        existingVersionHash = await resolveStoredSemanticSourceHash({
          kind: "page",
          row: existingVersionRow,
          fallback: () =>
            context.resolveStoredVersionContentHash(existingVersionRow),
        });
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
        ...normalizedDSL,
        version,
        updatedAt: now,
      };
      let committedWithGuard = false;

      if (!shouldInsertVersion && existingVersionRow) {
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
            if (existing && parsedOptions.expectedVersion) {
              const expectedVersion = parsedOptions.expectedVersion;
              metaValues[6] = version;
              metaValues[8] = version;

              const linkedLayoutStatements =
                preparedLinkedLayout?.statements ?? [];
              const linkedLayoutCommitGuard = preparedLinkedLayout?.changed
                ? `AND EXISTS (
                       SELECT 1
                       FROM aria_layout_meta
                       WHERE id = ? AND current_version = ?
                     )`
                : "";
              const linkedLayoutCommitArgs = preparedLinkedLayout?.changed
                ? [preparedLinkedLayout.id, preparedLinkedLayout.version]
                : [];
              const batchResults = await context.runBatchWithChanges([
                ...linkedLayoutStatements,
                {
                  sql: `INSERT INTO aria_page_versions (${versionInsert.columns.join(", ")})
                        SELECT ${versionInsert.columns.map(() => "?").join(", ")}
                        FROM aria_page_meta
                        WHERE id = ?
                          AND COALESCE(draft_version, current_version) = ?
                          AND status IS ?
                          AND published_version IS ?
                          ${linkedLayoutCommitGuard}`,
                  args: context.bindArgs([
                    ...versionInsert.values,
                    existing.id,
                    expectedVersion,
                    existing.status,
                    existing.publishedVersion,
                    ...linkedLayoutCommitArgs,
                  ]),
                },
                {
                  sql: `UPDATE aria_page_meta
                        SET slug = ?,
                            title = ?,
                            status = ?,
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
                        WHERE id = ?
                          AND COALESCE(draft_version, current_version) = ?
                          AND status IS ?
                          AND published_version IS ?
                          AND EXISTS (
                            SELECT 1
                            FROM aria_page_versions
                            WHERE id = ? AND version = ?
                          )
                          ${linkedLayoutCommitGuard}`,
                  args: context.bindArgs([
                    metaValues[1],
                    metaValues[2],
                    metaValues[3],
                    metaValues[4],
                    metaValues[5],
                    metaValues[6],
                    metaValues[7],
                    metaValues[8],
                    metaValues[9],
                    existing.id,
                    expectedVersion,
                    existing.status,
                    existing.publishedVersion,
                    existing.id,
                    version,
                    ...linkedLayoutCommitArgs,
                  ]),
                },
              ]);
              const pageInsertIndex = linkedLayoutStatements.length;
              const pageMetaIndex = pageInsertIndex + 1;
              const linkedLayoutCommitted = linkedLayoutStatements.every(
                (_statement, index) => batchResults[index]?.changes === 1,
              );

              if (
                !linkedLayoutCommitted ||
                batchResults[pageInsertIndex]?.changes !== 1 ||
                batchResults[pageMetaIndex]?.changes !== 1
              ) {
                if (!linkedLayoutCommitted && preparedLinkedLayout) {
                  const latestLayout = await context.resolveLayoutVersionState(
                    preparedLinkedLayout.id,
                  );
                  if (
                    latestLayout?.currentVersion !==
                    preparedLinkedLayout.expectedVersion
                  ) {
                    throw new VersionConflictError(
                      preparedLinkedLayout.expectedVersion,
                      latestLayout?.currentVersion ?? null,
                    );
                  }
                }
                const committed = await context.resolvePageIdentity(
                  existing.id,
                );
                const committedDraftVersion =
                  committed?.draftVersion ?? committed?.currentVersion ?? null;
                throw new VersionConflictError(
                  expectedVersion,
                  committedDraftVersion,
                );
              }
              committedWithGuard = true;
            } else {
              await context.run(
                `INSERT INTO aria_page_versions (${versionInsert.columns.join(", ")})
                 VALUES (${versionInsert.columns.map(() => "?").join(", ")})`,
                context.bindArgs(versionInsert.values),
              );
            }
            insertedVersionRow = true;
            break;
          } catch (error) {
            if (error instanceof VersionConflictError) {
              throw error;
            }
            if (!isStorageVersionConflictError(error) || attempt >= 4) {
              throw error;
            }
            version = allocateVersionId();
            metaValues[6] = version;
            metaValues[8] = version;
          }
        }

        if (!insertedVersionRow) {
          throw new Error(`Failed to allocate a unique page version for ${id}`);
        }
      }

      if (!committedWithGuard) {
        await context.run(metaUpsertSql, metaValues);
      }

      await settlePostCommit([
        ...(shouldInsertVersion
          ? [
              () =>
                context.deletePageThumbnail(
                  existing?.id ?? normalizedDSL.id ?? id,
                  "draft",
                ),
              () =>
                context.pruneStoredVersionHistory("page", existing?.id ?? id),
            ]
          : []),
        ...(preparedLinkedLayout?.changed
          ? [
              () =>
                context.pruneStoredVersionHistory(
                  "layout",
                  preparedLinkedLayout.id,
                ),
              () =>
                context.syncMediaUsageBestEffort(
                  "layout",
                  preparedLinkedLayout.id,
                  preparedLinkedLayout.dsl,
                ),
            ]
          : []),
        () => context.syncPageUsage(id, normalizedDSL),
      ]);
      return version;
    },

    async publishPageDSL(
      id: string,
      authorship?: AuthorshipSaveContext,
      options?: PublishPageOptions,
    ): Promise<string | null> {
      const parsedOptions = PublishPageOptionsSchema.parse(options ?? {});
      void authorship;
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return null;
      }

      const currentDraftVersion =
        resolved.draftVersion ?? resolved.currentVersion;
      if (
        parsedOptions.expectedVersion &&
        currentDraftVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          currentDraftVersion,
        );
      }

      const sourceVersion = currentDraftVersion ?? resolved.publishedVersion;
      if (!sourceVersion) {
        return null;
      }

      const now = context.nowIso();
      const scheduleLeaseToken = parsedOptions.scheduleLeaseToken;

      const publishMetaStatement = {
        sql: `UPDATE aria_page_meta
              SET status = 'published',
                  published_version = ?,
                  scheduled_for = NULL,
                  scheduled_version = NULL,
                  schedule_lease_token = NULL,
                  schedule_lease_expires_at = NULL,
                  schedule_attempt_count = 0,
                  last_schedule_error = NULL,
                  updated_at = ?
              WHERE id = ?
                AND COALESCE(draft_version, current_version) = ?
                ${
                  scheduleLeaseToken
                    ? "AND schedule_lease_token = ? AND scheduled_version = ?"
                    : ""
                }`,
        args: [
          sourceVersion,
          now,
          resolved.id,
          sourceVersion,
          ...(scheduleLeaseToken ? [scheduleLeaseToken, sourceVersion] : []),
        ],
      };
      const publishChanges = parsedOptions.dependencies
        ? await context.runBatchWithChanges([
            {
              sql: `UPDATE aria_page_versions
                    SET dependency_versions_json = ?
                    WHERE id = ? AND version = ?
                      AND EXISTS (
                        SELECT 1
                        FROM aria_page_meta
                        WHERE id = ?
                          AND COALESCE(draft_version, current_version) = ?
                          ${
                            scheduleLeaseToken
                              ? "AND schedule_lease_token = ? AND scheduled_version = ?"
                              : ""
                          }
                      )`,
              args: [
                JSON.stringify(parsedOptions.dependencies),
                resolved.id,
                sourceVersion,
                resolved.id,
                sourceVersion,
                ...(scheduleLeaseToken
                  ? [scheduleLeaseToken, sourceVersion]
                  : []),
              ],
            },
            publishMetaStatement,
          ])
        : [
            await context.runWithChanges(
              publishMetaStatement.sql,
              publishMetaStatement.args,
            ),
          ];
      const publishResult = publishChanges[publishChanges.length - 1];

      if (
        publishResult?.changes !== 1 ||
        (parsedOptions.dependencies && publishChanges[0]?.changes !== 1)
      ) {
        const committed = await context.resolvePageIdentity(resolved.id);
        throw new VersionConflictError(
          sourceVersion,
          committed?.draftVersion ?? committed?.currentVersion ?? null,
        );
      }

      await settlePostCommit([
        () => context.deletePageThumbnail(resolved.id, "published"),
      ]);

      return sourceVersion;
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
      void authorship;
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
      if (
        parsedOptions.expectedVersion &&
        sourceVersion !== parsedOptions.expectedVersion
      ) {
        throw new VersionConflictError(
          parsedOptions.expectedVersion,
          sourceVersion,
        );
      }

      const now = context.nowIso();
      const scheduleResult = await context.runWithChanges(
        `UPDATE aria_page_meta
         SET status = 'scheduled',
             scheduled_for = ?,
             scheduled_version = ?,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             schedule_attempt_count = 0,
             last_schedule_error = NULL,
             updated_at = ?
         WHERE id = ?
           AND COALESCE(draft_version, current_version, published_version) = ?
           AND status IS ?
           AND published_version IS ?`,
        [
          scheduledFor,
          sourceVersion,
          now,
          resolved.id,
          sourceVersion,
          resolved.status,
          resolved.publishedVersion,
        ],
      );
      if (scheduleResult.changes !== 1) {
        const latest = await context.resolvePageIdentity(resolved.id);
        throw new VersionConflictError(
          parsedOptions.expectedVersion ?? sourceVersion,
          latest?.draftVersion ?? latest?.currentVersion ?? null,
        );
      }

      return sourceVersion;
    },

    async unpublishPageDSL(id: string): Promise<void> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return;
      }

      const draftVersion = resolved.draftVersion ?? resolved.currentVersion;
      const unpublishResult = await context.runWithChanges(
        `UPDATE aria_page_meta
         SET status = 'draft',
             published_version = NULL,
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             schedule_attempt_count = 0,
             last_schedule_error = NULL,
             updated_at = ?
         WHERE id = ?
           AND COALESCE(draft_version, current_version) = ?
           AND status IS ?
           AND published_version IS ?`,
        [
          context.nowIso(),
          resolved.id,
          draftVersion,
          resolved.status,
          resolved.publishedVersion,
        ],
      );
      if (unpublishResult.changes !== 1) {
        const latest = await context.resolvePageIdentity(resolved.id);
        throw new VersionConflictError(
          draftVersion,
          latest?.draftVersion ?? latest?.currentVersion ?? null,
        );
      }
    },

    async archivePageDSL(id: string): Promise<void> {
      const resolved = await context.resolvePageIdentity(id);
      if (!resolved) {
        return;
      }

      const archiveResult = await context.runWithChanges(
        `UPDATE aria_page_meta
         SET status = 'archived',
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ?
           AND COALESCE(draft_version, current_version) = ?
           AND status IS ?
           AND published_version IS ?`,
        [
          context.nowIso(),
          resolved.id,
          resolved.draftVersion ?? resolved.currentVersion,
          resolved.status,
          resolved.publishedVersion,
        ],
      );
      if (archiveResult.changes !== 1) {
        const latest = await context.resolvePageIdentity(resolved.id);
        throw new VersionConflictError(
          resolved.draftVersion ?? resolved.currentVersion,
          latest?.draftVersion ?? latest?.currentVersion ?? null,
        );
      }
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

      const unarchiveResult = await context.runWithChanges(
        `UPDATE aria_page_meta
         SET status = ?,
             draft_version = ?,
             current_version = ?,
             scheduled_for = NULL,
             scheduled_version = NULL,
             schedule_lease_token = NULL,
             schedule_lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ?
           AND COALESCE(draft_version, current_version) = ?
           AND status IS ?
           AND published_version IS ?`,
        [
          hasPublishedVersion ? "published" : "draft",
          draftVersion,
          draftVersion,
          context.nowIso(),
          resolved.id,
          draftVersion,
          resolved.status,
          resolved.publishedVersion,
        ],
      );
      if (unarchiveResult.changes !== 1) {
        const latest = await context.resolvePageIdentity(resolved.id);
        throw new VersionConflictError(
          draftVersion,
          latest?.draftVersion ?? latest?.currentVersion ?? null,
        );
      }
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
