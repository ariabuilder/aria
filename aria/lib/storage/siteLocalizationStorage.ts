import {
  CacheInvalidationJobSchema,
  LayoutLocaleMetaSchema,
  LayoutLocaleRecordSchema,
  LayoutLocaleVersionSchema,
  LocalizedRouteSchema,
  PageLocaleMetaSchema,
  PageLocaleRecordSchema,
  PageLocaleVersionSchema,
  RouteLeaseSchema,
  type CacheInvalidationJob,
  type LayoutLocaleMeta,
  type LayoutLocaleRecord,
  type LayoutLocaleVersion,
  type LocalizedRoute,
  type PageLocaleMeta,
  type PageLocaleRecord,
  type PageLocaleVersion,
  type RouteLease,
} from "../localization/siteTranslationSchemas";

export type LocalizationSqlRow = Record<string, unknown>;
export type LocalizationStatement = { sql: string; args?: readonly unknown[] };

export interface LocalizationStorageExecutor {
  first<T extends LocalizationSqlRow>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T | null>;
  all<T extends LocalizationSqlRow>(
    sql: string,
    args?: readonly unknown[],
  ): Promise<T[]>;
  batch(statements: readonly LocalizationStatement[]): Promise<void>;
}

export class LocalizationStorageConflict extends Error {
  constructor(
    readonly code:
      | "VERSION_CONFLICT"
      | "ROUTE_CONFLICT"
      | "TRANSLATION_NOT_FOUND"
      | "TRANSLATION_PUBLISHED",
    message: string,
  ) {
    super(message);
  }
}

function json(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function array(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function nullable(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function actor(row: LocalizationSqlRow) {
  return {
    id: nullable(row.created_by_id),
    username: nullable(row.created_by_username),
    email: nullable(row.created_by_email),
    avatarUrl: nullable(row.created_by_avatar_url),
  };
}

function toPageVersion(row: LocalizationSqlRow): PageLocaleVersion {
  return PageLocaleVersionSchema.parse({
    pageId: row.page_id,
    locale: row.locale,
    version: row.version,
    sourceVersion: row.source_version,
    slug: nullable(row.slug),
    accessPromptTitle: nullable(row.access_prompt_title),
    accessPromptDescription: nullable(row.access_prompt_description),
    seo: json(row.seo_json),
    dsl: json(row.dsl_json),
    translatedPaths: array(row.translated_paths_json),
    sourceManifestHash: row.source_manifest_hash,
    sourceStructureHash: row.source_structure_hash,
    layoutId: nullable(row.layout_id),
    fallbackLayoutVersion: nullable(row.fallback_layout_version),
    contentHash: nullable(row.content_hash),
    createdAt: row.created_at,
    actor: actor(row),
  });
}

function toLayoutVersion(row: LocalizationSqlRow): LayoutLocaleVersion {
  return LayoutLocaleVersionSchema.parse({
    layoutId: row.layout_id,
    locale: row.locale,
    version: row.version,
    sourceVersion: row.source_version,
    dsl: json(row.dsl_json),
    translatedPaths: array(row.translated_paths_json),
    sourceManifestHash: row.source_manifest_hash,
    sourceStructureHash: row.source_structure_hash,
    contentHash: nullable(row.content_hash),
    createdAt: row.created_at,
    actor: actor(row),
  });
}

function toPageMeta(row: LocalizationSqlRow): PageLocaleMeta {
  return PageLocaleMetaSchema.parse({
    pageId: row.page_id,
    locale: row.locale,
    draftVersion: row.draft_version,
    publishedVersion: nullable(row.published_version),
    currentVersion: row.current_version,
    publishedAt: nullable(row.published_at),
    updatedAt: row.updated_at,
  });
}

function toLayoutMeta(row: LocalizationSqlRow): LayoutLocaleMeta {
  return LayoutLocaleMetaSchema.parse({
    layoutId: row.layout_id,
    locale: row.locale,
    draftVersion: row.draft_version,
    publishedVersion: nullable(row.published_version),
    currentVersion: row.current_version,
    publishedAt: nullable(row.published_at),
    updatedAt: row.updated_at,
  });
}

export async function getPageLocaleMeta(
  executor: LocalizationStorageExecutor,
  pageId: string,
  locale: string,
): Promise<PageLocaleMeta | null> {
  const row = await executor.first(
    `SELECT * FROM aria_page_locale_meta WHERE page_id = ? AND locale = ? LIMIT 1`,
    [pageId, locale],
  );
  return row ? toPageMeta(row) : null;
}

export async function getPageLocaleVersion(
  executor: LocalizationStorageExecutor,
  pageId: string,
  locale: string,
  version: string,
): Promise<PageLocaleVersion | null> {
  const row = await executor.first(
    `SELECT * FROM aria_page_locale_versions
     WHERE page_id = ? AND locale = ? AND version = ? LIMIT 1`,
    [pageId, locale, version],
  );
  return row ? toPageVersion(row) : null;
}

export async function getPageLocaleRoute(
  executor: LocalizationStorageExecutor,
  pageId: string,
  locale: string,
): Promise<LocalizedRoute | null> {
  const row = await executor.first(
    `SELECT locale, pathname_key, pathname, page_id, draft_claim, published_claim
       FROM aria_page_locale_routes
      WHERE page_id = ? AND locale = ? AND draft_claim = 1
      LIMIT 1`,
    [pageId, locale],
  );
  return row
    ? LocalizedRouteSchema.parse({
        locale: row.locale,
        pathname: row.pathname,
        pathnameKey: row.pathname_key,
        pageId: row.page_id,
        draftClaim: Number(row.draft_claim) === 1,
        publishedClaim: Number(row.published_claim) === 1,
      })
    : null;
}

function toLocalizedRoute(row: LocalizationSqlRow): LocalizedRoute {
  return LocalizedRouteSchema.parse({
    locale: row.locale,
    pathname: row.pathname,
    pathnameKey: row.pathname_key,
    pageId: row.page_id,
    draftClaim: Number(row.draft_claim) === 1,
    publishedClaim: Number(row.published_claim) === 1,
  });
}

/** Lists complete immutable page translation records in stable owner order. */
export async function listPageLocaleRecords(
  executor: LocalizationStorageExecutor,
  options?: { limit?: number; offset?: number },
): Promise<PageLocaleRecord[]> {
  const limit = options?.limit;
  const offset = options?.offset ?? 0;
  const ownerSql = `SELECT page_id, locale FROM aria_page_locale_meta
    ORDER BY page_id ASC, locale ASC${limit === undefined ? "" : " LIMIT ? OFFSET ?"}`;
  const ownerArgs = limit === undefined ? [] : [limit, offset];
  const [metaRows, versionRows, routeRows] = await Promise.all([
    executor.all(
      `WITH owners AS (${ownerSql})
       SELECT meta.* FROM aria_page_locale_meta AS meta
       INNER JOIN owners
         ON owners.page_id = meta.page_id AND owners.locale = meta.locale
       ORDER BY meta.page_id ASC, meta.locale ASC`,
      ownerArgs,
    ),
    executor.all(
      `WITH owners AS (${ownerSql})
       SELECT versions.* FROM aria_page_locale_versions AS versions
       INNER JOIN owners
         ON owners.page_id = versions.page_id AND owners.locale = versions.locale
       ORDER BY versions.page_id ASC, versions.locale ASC,
                versions.created_at ASC, versions.version ASC`,
      ownerArgs,
    ),
    executor.all(
      `WITH owners AS (${ownerSql})
       SELECT routes.locale, routes.pathname_key, routes.pathname, routes.page_id,
              routes.draft_claim, routes.published_claim
         FROM aria_page_locale_routes AS routes
         INNER JOIN owners
           ON owners.page_id = routes.page_id AND owners.locale = routes.locale
        ORDER BY routes.page_id ASC, routes.locale ASC, routes.pathname_key ASC`,
      ownerArgs,
    ),
  ]);
  const versionsByOwner = new Map<string, PageLocaleVersion[]>();
  const routesByOwner = new Map<string, LocalizedRoute[]>();
  for (const row of versionRows) {
    const version = toPageVersion(row);
    const key = `${version.pageId}\u0000${version.locale}`;
    versionsByOwner.set(key, [...(versionsByOwner.get(key) ?? []), version]);
  }
  for (const row of routeRows) {
    const route = toLocalizedRoute(row);
    const key = `${route.pageId}\u0000${route.locale}`;
    routesByOwner.set(key, [...(routesByOwner.get(key) ?? []), route]);
  }
  return metaRows.map((row) => {
    const meta = toPageMeta(row);
    const key = `${meta.pageId}\u0000${meta.locale}`;
    return PageLocaleRecordSchema.parse({
      meta,
      versions: versionsByOwner.get(key) ?? [],
      routes: routesByOwner.get(key) ?? [],
    });
  });
}

function pageLocaleVersionInsert(
  version: PageLocaleVersion,
): LocalizationStatement {
  return {
    sql: `INSERT INTO aria_page_locale_versions
      (page_id, locale, version, source_version, slug, access_prompt_title,
       access_prompt_description, seo_json, dsl_json, translated_paths_json,
       source_manifest_hash, source_structure_hash, layout_id,
       fallback_layout_version, content_hash, created_at, created_by_id,
       created_by_username, created_by_email, created_by_avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      version.pageId,
      version.locale,
      version.version,
      version.sourceVersion,
      version.slug,
      version.accessPromptTitle,
      version.accessPromptDescription,
      JSON.stringify(version.seo),
      JSON.stringify(version.dsl),
      JSON.stringify(version.translatedPaths),
      version.sourceManifestHash,
      version.sourceStructureHash,
      version.layoutId,
      version.fallbackLayoutVersion,
      version.contentHash,
      version.createdAt,
      version.actor.id,
      version.actor.username,
      version.actor.email,
      version.actor.avatarUrl,
    ],
  };
}

/**
 * Replaces a page locale as one transaction. This is deliberately
 * separate from editor saves: portability needs to retain immutable history.
 */
export async function replacePageLocaleRecord(
  executor: LocalizationStorageExecutor,
  input: PageLocaleRecord,
): Promise<void> {
  const record = PageLocaleRecordSchema.parse(input);
  const { meta } = record;
  await executor.batch([
    {
      sql: `DELETE FROM aria_page_locale_routes WHERE page_id = ? AND locale = ?`,
      args: [meta.pageId, meta.locale],
    },
    {
      sql: `DELETE FROM aria_page_locale_meta WHERE page_id = ? AND locale = ?`,
      args: [meta.pageId, meta.locale],
    },
    {
      sql: `DELETE FROM aria_page_locale_versions WHERE page_id = ? AND locale = ?`,
      args: [meta.pageId, meta.locale],
    },
    ...record.versions.map(pageLocaleVersionInsert),
    {
      sql: `INSERT INTO aria_page_locale_meta
        (page_id, locale, draft_version, published_version, current_version, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        meta.pageId,
        meta.locale,
        meta.draftVersion,
        meta.publishedVersion,
        meta.currentVersion,
        meta.publishedAt,
        meta.updatedAt,
      ],
    },
    ...record.routes.map((route) => ({
      sql: `INSERT INTO aria_page_locale_routes
        (locale, pathname_key, pathname, page_id, draft_claim, published_claim)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        route.locale,
        route.pathnameKey,
        route.pathname,
        route.pageId,
        route.draftClaim ? 1 : 0,
        route.publishedClaim ? 1 : 0,
      ],
    })),
  ]);
}

export async function savePageLocaleDraft(
  executor: LocalizationStorageExecutor,
  input: {
    version: PageLocaleVersion;
    expectedCurrentVersion?: string | null;
    updatedAt: string;
    route?: Pick<LocalizedRoute, "pathname" | "pathnameKey"> | null;
    draftRouteMoves?: ReadonlyArray<{
      pageId: string;
      route: Pick<LocalizedRoute, "pathname" | "pathnameKey">;
    }>;
  },
): Promise<PageLocaleMeta> {
  const version = PageLocaleVersionSchema.parse(input.version);
  const current = await getPageLocaleMeta(
    executor,
    version.pageId,
    version.locale,
  );
  if (
    (input.expectedCurrentVersion ?? null) !== (current?.currentVersion ?? null)
  ) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized page version changed.",
    );
  }
  const draftRouteMoves = input.draftRouteMoves ?? [];
  const targetRoutes = [
    ...(input.route ? [{ pageId: version.pageId, route: input.route }] : []),
    ...draftRouteMoves,
  ];
  const targetOwners = new Map<string, string>();
  for (const target of targetRoutes) {
    const priorOwner = targetOwners.get(target.route.pathnameKey);
    if (priorOwner && priorOwner !== target.pageId) {
      throw new LocalizationStorageConflict(
        "ROUTE_CONFLICT",
        "Localized descendant routes would collide.",
      );
    }
    targetOwners.set(target.route.pathnameKey, target.pageId);
    const owner = await executor.first<{ page_id: string }>(
      `SELECT page_id FROM aria_page_locale_routes
       WHERE locale = ? AND pathname_key = ? LIMIT 1`,
      [version.locale, target.route.pathnameKey],
    );
    if (owner && String(owner.page_id) !== target.pageId) {
      throw new LocalizationStorageConflict(
        "ROUTE_CONFLICT",
        "Localized route is already claimed.",
      );
    }
  }
  for (const move of draftRouteMoves) {
    const currentDraftRoute = await getPageLocaleRoute(
      executor,
      move.pageId,
      version.locale,
    );
    if (!currentDraftRoute) {
      throw new LocalizationStorageConflict(
        "ROUTE_CONFLICT",
        "A localized descendant is missing its draft route claim.",
      );
    }
  }
  const v = version;
  const statements: LocalizationStatement[] = [
    {
      sql: `INSERT INTO aria_page_locale_versions
        (page_id, locale, version, source_version, slug, access_prompt_title,
         access_prompt_description, seo_json, dsl_json, translated_paths_json,
         source_manifest_hash, source_structure_hash, layout_id,
         fallback_layout_version, content_hash, created_at, created_by_id,
         created_by_username, created_by_email, created_by_avatar_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        v.pageId,
        v.locale,
        v.version,
        v.sourceVersion,
        v.slug,
        v.accessPromptTitle,
        v.accessPromptDescription,
        JSON.stringify(v.seo),
        JSON.stringify(v.dsl),
        JSON.stringify(v.translatedPaths),
        v.sourceManifestHash,
        v.sourceStructureHash,
        v.layoutId,
        v.fallbackLayoutVersion,
        v.contentHash,
        v.createdAt,
        v.actor.id,
        v.actor.username,
        v.actor.email,
        v.actor.avatarUrl,
      ],
    },
    {
      sql: `INSERT INTO aria_page_locale_meta
        (page_id, locale, draft_version, published_version, current_version, published_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, NULL, ?)
        ON CONFLICT(page_id, locale) DO UPDATE SET
          draft_version = excluded.draft_version,
          current_version = excluded.current_version,
          updated_at = excluded.updated_at`,
      args: [v.pageId, v.locale, v.version, v.version, input.updatedAt],
    },
  ];
  if (input.route) {
    statements.push(
      {
        sql: `UPDATE aria_page_locale_routes SET draft_claim = 0 WHERE page_id = ? AND locale = ?`,
        args: [v.pageId, v.locale],
      },
      {
        sql: `DELETE FROM aria_page_locale_routes WHERE page_id = ? AND locale = ? AND draft_claim = 0 AND published_claim = 0`,
        args: [v.pageId, v.locale],
      },
      {
        sql: `INSERT INTO aria_page_locale_routes
          (locale, pathname_key, pathname, page_id, draft_claim, published_claim)
          VALUES (?, ?, ?, ?, 1, 0)
          ON CONFLICT(locale, pathname_key) DO UPDATE SET
            pathname = excluded.pathname, draft_claim = 1
          WHERE aria_page_locale_routes.page_id = excluded.page_id`,
        args: [
          v.locale,
          input.route.pathnameKey,
          input.route.pathname,
          v.pageId,
        ],
      },
    );
  }
  for (const move of draftRouteMoves) {
    statements.push(
      {
        sql: `UPDATE aria_page_locale_routes SET draft_claim = 0
              WHERE page_id = ? AND locale = ? AND draft_claim = 1`,
        args: [move.pageId, v.locale],
      },
      {
        sql: `DELETE FROM aria_page_locale_routes
              WHERE page_id = ? AND locale = ? AND draft_claim = 0 AND published_claim = 0`,
        args: [move.pageId, v.locale],
      },
      {
        sql: `INSERT INTO aria_page_locale_routes
          (locale, pathname_key, pathname, page_id, draft_claim, published_claim)
          VALUES (?, ?, ?, ?, 1, 0)
          ON CONFLICT(locale, pathname_key) DO UPDATE SET
            pathname = excluded.pathname, draft_claim = 1
          WHERE aria_page_locale_routes.page_id = excluded.page_id`,
        args: [
          v.locale,
          move.route.pathnameKey,
          move.route.pathname,
          move.pageId,
        ],
      },
    );
  }
  await executor.batch(statements);
  return (await getPageLocaleMeta(executor, v.pageId, v.locale))!;
}

export async function resolvePublishedPageLocale(
  executor: LocalizationStorageExecutor,
  locale: string,
  pathnameKey: string,
): Promise<{
  meta: PageLocaleMeta;
  version: PageLocaleVersion;
  route: LocalizedRoute;
} | null> {
  const routeRow = await executor.first(
    `SELECT locale, pathname_key, pathname, page_id, draft_claim, published_claim
       FROM aria_page_locale_routes
      WHERE locale = ? AND pathname_key = ? AND published_claim = 1
      LIMIT 1`,
    [locale, pathnameKey],
  );
  if (!routeRow) return null;
  const meta = await getPageLocaleMeta(
    executor,
    String(routeRow.page_id),
    String(routeRow.locale),
  );
  if (!meta?.publishedVersion) return null;
  const version = await getPageLocaleVersion(
    executor,
    meta.pageId,
    meta.locale,
    meta.publishedVersion,
  );
  if (!version) return null;
  const ancestry = await executor.all<{ id: string }>(
    `WITH RECURSIVE page_ancestry(id, parent) AS (
       SELECT id, parent FROM aria_page_meta WHERE id = ?
       UNION
       SELECT parent_page.id, parent_page.parent
         FROM aria_page_meta parent_page
         JOIN page_ancestry child
           ON parent_page.slug = child.parent OR parent_page.id = child.parent
        WHERE child.parent IS NOT NULL
     )
     SELECT id FROM page_ancestry WHERE id <> ?`,
    [meta.pageId, meta.pageId],
  );
  for (const ancestor of ancestry) {
    const [ancestorMeta, ancestorRoute] = await Promise.all([
      getPageLocaleMeta(executor, String(ancestor.id), locale),
      executor.first<{ page_id: string }>(
        `SELECT page_id FROM aria_page_locale_routes
          WHERE page_id = ? AND locale = ? AND published_claim = 1
          LIMIT 1`,
        [ancestor.id, locale],
      ),
    ]);
    if (!ancestorMeta?.publishedVersion || !ancestorRoute) return null;
  }
  return {
    meta,
    version,
    route: LocalizedRouteSchema.parse({
      locale: routeRow.locale,
      pathname: routeRow.pathname,
      pathnameKey: routeRow.pathname_key,
      pageId: routeRow.page_id,
      draftClaim: Number(routeRow.draft_claim) === 1,
      publishedClaim: Number(routeRow.published_claim) === 1,
    }),
  };
}

export async function listPublishedPageLocaleRoutes(
  executor: LocalizationStorageExecutor,
  pageId: string,
): Promise<LocalizedRoute[]> {
  const rows = await executor.all(
    `SELECT locale, pathname_key, pathname, page_id, draft_claim, published_claim
       FROM aria_page_locale_routes
      WHERE page_id = ? AND published_claim = 1
      ORDER BY locale ASC`,
    [pageId],
  );
  return rows.map((row) =>
    LocalizedRouteSchema.parse({
      locale: row.locale,
      pathname: row.pathname,
      pathnameKey: row.pathname_key,
      pageId: row.page_id,
      draftClaim: Number(row.draft_claim) === 1,
      publishedClaim: Number(row.published_claim) === 1,
    }),
  );
}

export async function publishPageLocaleDraft(
  executor: LocalizationStorageExecutor,
  input: {
    pageId: string;
    locale: string;
    expectedCurrentVersion: string;
    publishedAt: string;
    requiresRoute?: boolean;
    publishedRouteMoves?: ReadonlyArray<{
      pageId: string;
      pathnameKey: string;
    }>;
    invalidationJob?: CacheInvalidationJob;
  },
): Promise<PageLocaleMeta> {
  const meta = await getPageLocaleMeta(executor, input.pageId, input.locale);
  if (!meta) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_NOT_FOUND",
      "Localized page draft was not found.",
    );
  }
  if (meta.currentVersion !== input.expectedCurrentVersion) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized page version changed.",
    );
  }
  const draftRoute =
    input.requiresRoute === false
      ? null
      : await executor.first<{ pathname_key: string }>(
          `SELECT pathname_key FROM aria_page_locale_routes
          WHERE page_id = ? AND locale = ? AND draft_claim = 1 LIMIT 1`,
          [input.pageId, input.locale],
        );
  if (input.requiresRoute !== false && !draftRoute) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_NOT_FOUND",
      "Localized page draft has no route claim.",
    );
  }
  const pathnameKey = draftRoute ? String(draftRoute.pathname_key) : null;
  const publishedRouteMoves = input.publishedRouteMoves ?? [];
  for (const move of publishedRouteMoves) {
    const moveRoute = await executor.first<{ pathname_key: string }>(
      `SELECT pathname_key FROM aria_page_locale_routes
       WHERE page_id = ? AND locale = ? AND pathname_key = ? AND draft_claim = 1
       LIMIT 1`,
      [move.pageId, input.locale, move.pathnameKey],
    );
    if (!moveRoute) {
      throw new LocalizationStorageConflict(
        "ROUTE_CONFLICT",
        "A localized descendant draft route changed before publication.",
      );
    }
  }
  const invalidationJob = input.invalidationJob
    ? CacheInvalidationJobSchema.parse(input.invalidationJob)
    : null;
  await executor.batch([
    // A published-only predecessor must be removed before the new route can
    // claim the single published-owner index. A route carrying the draft
    // claim remains as draft-only instead.
    ...(pathnameKey
      ? [
          {
            sql: `DELETE FROM aria_page_locale_routes
             WHERE page_id = ? AND locale = ? AND published_claim = 1
               AND draft_claim = 0 AND pathname_key <> ?`,
            args: [input.pageId, input.locale, pathnameKey],
          },
          {
            sql: `UPDATE aria_page_locale_routes SET published_claim = 0
             WHERE page_id = ? AND locale = ? AND published_claim = 1
               AND draft_claim = 1 AND pathname_key <> ?`,
            args: [input.pageId, input.locale, pathnameKey],
          },
          {
            sql: `UPDATE aria_page_locale_routes SET published_claim = 1
             WHERE page_id = ? AND locale = ? AND pathname_key = ? AND draft_claim = 1`,
            args: [input.pageId, input.locale, pathnameKey],
          },
        ]
      : []),
    {
      sql: `UPDATE aria_page_locale_meta
             SET published_version = current_version, published_at = ?, updated_at = ?
             WHERE page_id = ? AND locale = ? AND current_version = ?`,
      args: [
        input.publishedAt,
        input.publishedAt,
        input.pageId,
        input.locale,
        input.expectedCurrentVersion,
      ],
    },
    ...publishedRouteMoves.flatMap((move) => [
      {
        sql: `DELETE FROM aria_page_locale_routes
             WHERE page_id = ? AND locale = ? AND published_claim = 1
               AND draft_claim = 0 AND pathname_key <> ?`,
        args: [move.pageId, input.locale, move.pathnameKey],
      },
      {
        sql: `UPDATE aria_page_locale_routes SET published_claim = 0
             WHERE page_id = ? AND locale = ? AND published_claim = 1
               AND draft_claim = 1 AND pathname_key <> ?`,
        args: [move.pageId, input.locale, move.pathnameKey],
      },
      {
        sql: `UPDATE aria_page_locale_routes SET published_claim = 1
             WHERE page_id = ? AND locale = ? AND pathname_key = ? AND draft_claim = 1`,
        args: [move.pageId, input.locale, move.pathnameKey],
      },
    ]),
    ...(invalidationJob ? [cacheInvalidationInsert(invalidationJob)] : []),
  ]);
  return (await getPageLocaleMeta(executor, input.pageId, input.locale))!;
}

export async function unpublishPageLocale(
  executor: LocalizationStorageExecutor,
  input: {
    pageId: string;
    locale: string;
    updatedAt: string;
    invalidationJob?: CacheInvalidationJob;
  },
): Promise<PageLocaleMeta | null> {
  const meta = await getPageLocaleMeta(executor, input.pageId, input.locale);
  if (!meta) return null;
  const invalidationJob = input.invalidationJob
    ? CacheInvalidationJobSchema.parse(input.invalidationJob)
    : null;
  await executor.batch([
    {
      sql: `DELETE FROM aria_page_locale_routes
             WHERE page_id = ? AND locale = ? AND published_claim = 1 AND draft_claim = 0`,
      args: [input.pageId, input.locale],
    },
    {
      sql: `UPDATE aria_page_locale_routes SET published_claim = 0
             WHERE page_id = ? AND locale = ? AND published_claim = 1 AND draft_claim = 1`,
      args: [input.pageId, input.locale],
    },
    {
      sql: `UPDATE aria_page_locale_meta
             SET published_version = NULL, published_at = NULL, updated_at = ?
             WHERE page_id = ? AND locale = ?`,
      args: [input.updatedAt, input.pageId, input.locale],
    },
    ...(invalidationJob ? [cacheInvalidationInsert(invalidationJob)] : []),
  ]);
  return getPageLocaleMeta(executor, input.pageId, input.locale);
}

/** Deletes an unpublished page locale and all of its immutable history. */
export async function deletePageLocale(
  executor: LocalizationStorageExecutor,
  input: { pageId: string; locale: string; expectedCurrentVersion: string },
): Promise<void> {
  const meta = await getPageLocaleMeta(executor, input.pageId, input.locale);
  if (!meta) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_NOT_FOUND",
      "Localized page draft was not found.",
    );
  }
  if (meta.currentVersion !== input.expectedCurrentVersion) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized page version changed.",
    );
  }
  if (meta.publishedVersion) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_PUBLISHED",
      "Unpublish this localized page before deleting it.",
    );
  }
  await executor.batch([
    {
      sql: `DELETE FROM aria_page_locale_meta WHERE page_id = ? AND locale = ?`,
      args: [input.pageId, input.locale],
    },
    {
      sql: `DELETE FROM aria_page_locale_versions WHERE page_id = ? AND locale = ?`,
      args: [input.pageId, input.locale],
    },
  ]);
}

export async function getLayoutLocaleMeta(
  executor: LocalizationStorageExecutor,
  layoutId: string,
  locale: string,
): Promise<LayoutLocaleMeta | null> {
  const row = await executor.first(
    `SELECT * FROM aria_layout_locale_meta WHERE layout_id = ? AND locale = ? LIMIT 1`,
    [layoutId, locale],
  );
  return row ? toLayoutMeta(row) : null;
}

export async function getLayoutLocaleVersion(
  executor: LocalizationStorageExecutor,
  layoutId: string,
  locale: string,
  version: string,
): Promise<LayoutLocaleVersion | null> {
  const row = await executor.first(
    `SELECT * FROM aria_layout_locale_versions
      WHERE layout_id = ? AND locale = ? AND version = ? LIMIT 1`,
    [layoutId, locale, version],
  );
  return row ? toLayoutVersion(row) : null;
}

/** Lists complete immutable layout translation records in stable owner order. */
export async function listLayoutLocaleRecords(
  executor: LocalizationStorageExecutor,
  options?: { limit?: number; offset?: number },
): Promise<LayoutLocaleRecord[]> {
  const limit = options?.limit;
  const offset = options?.offset ?? 0;
  const ownerSql = `SELECT layout_id, locale FROM aria_layout_locale_meta
    ORDER BY layout_id ASC, locale ASC${limit === undefined ? "" : " LIMIT ? OFFSET ?"}`;
  const ownerArgs = limit === undefined ? [] : [limit, offset];
  const [metaRows, versionRows] = await Promise.all([
    executor.all(
      `WITH owners AS (${ownerSql})
       SELECT meta.* FROM aria_layout_locale_meta AS meta
       INNER JOIN owners
         ON owners.layout_id = meta.layout_id AND owners.locale = meta.locale
       ORDER BY meta.layout_id ASC, meta.locale ASC`,
      ownerArgs,
    ),
    executor.all(
      `WITH owners AS (${ownerSql})
       SELECT versions.* FROM aria_layout_locale_versions AS versions
       INNER JOIN owners
         ON owners.layout_id = versions.layout_id AND owners.locale = versions.locale
       ORDER BY versions.layout_id ASC, versions.locale ASC,
                versions.created_at ASC, versions.version ASC`,
      ownerArgs,
    ),
  ]);
  const versionsByOwner = new Map<string, LayoutLocaleVersion[]>();
  for (const row of versionRows) {
    const version = toLayoutVersion(row);
    const key = `${version.layoutId}\u0000${version.locale}`;
    versionsByOwner.set(key, [...(versionsByOwner.get(key) ?? []), version]);
  }
  return metaRows.map((row) => {
    const meta = toLayoutMeta(row);
    return LayoutLocaleRecordSchema.parse({
      meta,
      versions:
        versionsByOwner.get(`${meta.layoutId}\u0000${meta.locale}`) ?? [],
    });
  });
}

function layoutLocaleVersionInsert(
  version: LayoutLocaleVersion,
): LocalizationStatement {
  return {
    sql: `INSERT INTO aria_layout_locale_versions
      (layout_id, locale, version, source_version, dsl_json, translated_paths_json,
       source_manifest_hash, source_structure_hash, content_hash, created_at,
       created_by_id, created_by_username, created_by_email, created_by_avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      version.layoutId,
      version.locale,
      version.version,
      version.sourceVersion,
      JSON.stringify(version.dsl),
      JSON.stringify(version.translatedPaths),
      version.sourceManifestHash,
      version.sourceStructureHash,
      version.contentHash,
      version.createdAt,
      version.actor.id,
      version.actor.username,
      version.actor.email,
      version.actor.avatarUrl,
    ],
  };
}

/** Replaces a layout locale atomically for export/import and content sync. */
export async function replaceLayoutLocaleRecord(
  executor: LocalizationStorageExecutor,
  input: LayoutLocaleRecord,
): Promise<void> {
  const record = LayoutLocaleRecordSchema.parse(input);
  const { meta } = record;
  await executor.batch([
    {
      sql: `DELETE FROM aria_layout_locale_meta WHERE layout_id = ? AND locale = ?`,
      args: [meta.layoutId, meta.locale],
    },
    {
      sql: `DELETE FROM aria_layout_locale_versions WHERE layout_id = ? AND locale = ?`,
      args: [meta.layoutId, meta.locale],
    },
    ...record.versions.map(layoutLocaleVersionInsert),
    {
      sql: `INSERT INTO aria_layout_locale_meta
        (layout_id, locale, draft_version, published_version, current_version, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        meta.layoutId,
        meta.locale,
        meta.draftVersion,
        meta.publishedVersion,
        meta.currentVersion,
        meta.publishedAt,
        meta.updatedAt,
      ],
    },
  ]);
}

export async function saveLayoutLocaleDraft(
  executor: LocalizationStorageExecutor,
  input: {
    version: LayoutLocaleVersion;
    expectedCurrentVersion?: string | null;
    updatedAt: string;
  },
): Promise<LayoutLocaleMeta> {
  const v = LayoutLocaleVersionSchema.parse(input.version);
  const current = await getLayoutLocaleMeta(executor, v.layoutId, v.locale);
  if (
    (input.expectedCurrentVersion ?? null) !== (current?.currentVersion ?? null)
  ) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized layout version changed.",
    );
  }
  await executor.batch([
    {
      sql: `INSERT INTO aria_layout_locale_versions
        (layout_id, locale, version, source_version, dsl_json, translated_paths_json,
         source_manifest_hash, source_structure_hash, content_hash, created_at,
         created_by_id, created_by_username, created_by_email, created_by_avatar_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        v.layoutId,
        v.locale,
        v.version,
        v.sourceVersion,
        JSON.stringify(v.dsl),
        JSON.stringify(v.translatedPaths),
        v.sourceManifestHash,
        v.sourceStructureHash,
        v.contentHash,
        v.createdAt,
        v.actor.id,
        v.actor.username,
        v.actor.email,
        v.actor.avatarUrl,
      ],
    },
    {
      sql: `INSERT INTO aria_layout_locale_meta
        (layout_id, locale, draft_version, published_version, current_version, published_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, NULL, ?)
        ON CONFLICT(layout_id, locale) DO UPDATE SET
          draft_version = excluded.draft_version,
          current_version = excluded.current_version,
          updated_at = excluded.updated_at`,
      args: [v.layoutId, v.locale, v.version, v.version, input.updatedAt],
    },
  ]);
  return (await getLayoutLocaleMeta(executor, v.layoutId, v.locale))!;
}

export async function publishLayoutLocaleDraft(
  executor: LocalizationStorageExecutor,
  input: {
    layoutId: string;
    locale: string;
    expectedCurrentVersion: string;
    publishedAt: string;
    invalidationJob?: CacheInvalidationJob;
  },
): Promise<LayoutLocaleMeta> {
  const meta = await getLayoutLocaleMeta(
    executor,
    input.layoutId,
    input.locale,
  );
  if (!meta) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_NOT_FOUND",
      "Localized layout draft was not found.",
    );
  }
  if (meta.currentVersion !== input.expectedCurrentVersion) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized layout version changed.",
    );
  }
  const invalidationJob = input.invalidationJob
    ? CacheInvalidationJobSchema.parse(input.invalidationJob)
    : null;
  await executor.batch([
    {
      sql: `UPDATE aria_layout_locale_meta
           SET published_version = current_version, published_at = ?, updated_at = ?
           WHERE layout_id = ? AND locale = ? AND current_version = ?`,
      args: [
        input.publishedAt,
        input.publishedAt,
        input.layoutId,
        input.locale,
        input.expectedCurrentVersion,
      ],
    },
    ...(invalidationJob ? [cacheInvalidationInsert(invalidationJob)] : []),
  ]);
  return (await getLayoutLocaleMeta(executor, input.layoutId, input.locale))!;
}

export async function unpublishLayoutLocale(
  executor: LocalizationStorageExecutor,
  input: {
    layoutId: string;
    locale: string;
    updatedAt: string;
    invalidationJob?: CacheInvalidationJob;
  },
): Promise<LayoutLocaleMeta | null> {
  const meta = await getLayoutLocaleMeta(
    executor,
    input.layoutId,
    input.locale,
  );
  if (!meta) return null;
  const invalidationJob = input.invalidationJob
    ? CacheInvalidationJobSchema.parse(input.invalidationJob)
    : null;
  await executor.batch([
    {
      sql: `UPDATE aria_layout_locale_meta
           SET published_version = NULL, published_at = NULL, updated_at = ?
           WHERE layout_id = ? AND locale = ?`,
      args: [input.updatedAt, input.layoutId, input.locale],
    },
    ...(invalidationJob ? [cacheInvalidationInsert(invalidationJob)] : []),
  ]);
  return getLayoutLocaleMeta(executor, input.layoutId, input.locale);
}

/** Deletes an unpublished layout locale and all of its immutable history. */
export async function deleteLayoutLocale(
  executor: LocalizationStorageExecutor,
  input: { layoutId: string; locale: string; expectedCurrentVersion: string },
): Promise<void> {
  const meta = await getLayoutLocaleMeta(
    executor,
    input.layoutId,
    input.locale,
  );
  if (!meta) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_NOT_FOUND",
      "Localized layout draft was not found.",
    );
  }
  if (meta.currentVersion !== input.expectedCurrentVersion) {
    throw new LocalizationStorageConflict(
      "VERSION_CONFLICT",
      "Localized layout version changed.",
    );
  }
  if (meta.publishedVersion) {
    throw new LocalizationStorageConflict(
      "TRANSLATION_PUBLISHED",
      "Unpublish this localized layout before deleting it.",
    );
  }
  await executor.batch([
    {
      sql: `DELETE FROM aria_layout_locale_meta WHERE layout_id = ? AND locale = ?`,
      args: [input.layoutId, input.locale],
    },
    {
      sql: `DELETE FROM aria_layout_locale_versions WHERE layout_id = ? AND locale = ?`,
      args: [input.layoutId, input.locale],
    },
  ]);
}

function toRouteLease(row: LocalizationSqlRow): RouteLease {
  return RouteLeaseSchema.parse({
    locale: row.locale,
    leaseToken: row.lease_token,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  });
}

function toCacheInvalidationJob(row: LocalizationSqlRow): CacheInvalidationJob {
  return CacheInvalidationJobSchema.parse({
    id: row.id,
    idempotencyKey: row.idempotency_key,
    scope: row.scope,
    payload: json(row.payload_json),
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    leaseToken: nullable(row.lease_token),
    leaseExpiresAt: nullable(row.lease_expires_at),
    lastError: nullable(row.last_error),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: nullable(row.completed_at),
  });
}

export function cacheInvalidationInsert(
  job: CacheInvalidationJob,
): LocalizationStatement {
  return {
    sql: `INSERT INTO aria_cache_invalidation_jobs
      (id, idempotency_key, scope, payload_json, status, attempt_count,
       next_attempt_at, lease_token, lease_expires_at, last_error,
       created_at, updated_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING`,
    args: [
      job.id,
      job.idempotencyKey,
      job.scope,
      JSON.stringify(job.payload),
      job.status,
      job.attemptCount,
      job.nextAttemptAt,
      job.leaseToken,
      job.leaseExpiresAt,
      job.lastError,
      job.createdAt,
      job.updatedAt,
      job.completedAt,
    ],
  };
}

export function cacheInvalidationInsertWhenPageState(
  job: CacheInvalidationJob,
  pageState: {
    pageId: string;
    status: "published" | "draft";
    publishedVersion: string | null;
    updatedAt: string;
  },
): LocalizationStatement {
  const insert = cacheInvalidationInsert(job);
  return {
    sql: `INSERT INTO aria_cache_invalidation_jobs
      (id, idempotency_key, scope, payload_json, status, attempt_count,
       next_attempt_at, lease_token, lease_expires_at, last_error,
       created_at, updated_at, completed_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM aria_page_meta
        WHERE id = ? AND status = ? AND published_version IS ? AND updated_at = ?
      )
      ON CONFLICT(idempotency_key) DO NOTHING`,
    args: [
      ...(insert.args ?? []),
      pageState.pageId,
      pageState.status,
      pageState.publishedVersion,
      pageState.updatedAt,
    ],
  };
}

/**
 * A lease is intentionally narrow (one locale) and short lived. The
 * caller must acquire it immediately before the route ownership check and.
 */
export async function acquireLocaleRouteLease(
  executor: LocalizationStorageExecutor,
  input: {
    locale: string;
    leaseToken: string;
    now: string;
    expiresAt: string;
    updatedAt: string;
  },
): Promise<RouteLease | null> {
  await executor.batch([
    {
      sql: `INSERT INTO aria_locale_route_leases (locale, lease_token, expires_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(locale) DO UPDATE SET
            lease_token = excluded.lease_token,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
          WHERE aria_locale_route_leases.expires_at <= ?
             OR aria_locale_route_leases.lease_token = excluded.lease_token`,
      args: [
        input.locale,
        input.leaseToken,
        input.expiresAt,
        input.updatedAt,
        input.now,
      ],
    },
  ]);
  const row = await executor.first(
    `SELECT * FROM aria_locale_route_leases WHERE locale = ? AND lease_token = ? LIMIT 1`,
    [input.locale, input.leaseToken],
  );
  return row ? toRouteLease(row) : null;
}

export async function releaseLocaleRouteLease(
  executor: LocalizationStorageExecutor,
  input: { locale: string; leaseToken: string },
): Promise<void> {
  await executor.batch([
    {
      sql: `DELETE FROM aria_locale_route_leases WHERE locale = ? AND lease_token = ?`,
      args: [input.locale, input.leaseToken],
    },
  ]);
}

export async function enqueueCacheInvalidationJob(
  executor: LocalizationStorageExecutor,
  job: CacheInvalidationJob,
): Promise<CacheInvalidationJob> {
  const parsed = CacheInvalidationJobSchema.parse(job);
  await executor.batch([cacheInvalidationInsert(parsed)]);
  const row = await executor.first(
    `SELECT * FROM aria_cache_invalidation_jobs WHERE idempotency_key = ? LIMIT 1`,
    [parsed.idempotencyKey],
  );
  if (!row) throw new Error("Cache invalidation job was not persisted.");
  return toCacheInvalidationJob(row);
}

export async function getCacheInvalidationJob(
  executor: LocalizationStorageExecutor,
  id: string,
): Promise<CacheInvalidationJob | null> {
  const row = await executor.first(
    `SELECT * FROM aria_cache_invalidation_jobs WHERE id = ? LIMIT 1`,
    [id],
  );
  return row ? toCacheInvalidationJob(row) : null;
}

export async function claimDueCacheInvalidationJobs(
  executor: LocalizationStorageExecutor,
  input: {
    now: string;
    leaseToken: string;
    leaseExpiresAt: string;
    updatedAt: string;
    limit: number;
    jobId?: string;
    force?: boolean;
  },
): Promise<CacheInvalidationJob[]> {
  const rows = await executor.all<{ id: string }>(
    `SELECT id FROM aria_cache_invalidation_jobs
      WHERE status IN ('pending', 'failed')
        ${input.force ? "" : "AND next_attempt_at <= ?"}
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        ${input.jobId ? "AND id = ?" : ""}
      ORDER BY next_attempt_at ASC, created_at ASC
      LIMIT ?`,
    [
      ...(!input.force ? [input.now] : []),
      input.now,
      ...(input.jobId ? [input.jobId] : []),
      input.limit,
    ],
  );
  const claimed: CacheInvalidationJob[] = [];
  for (const row of rows) {
    await executor.batch([
      {
        sql: `UPDATE aria_cache_invalidation_jobs
             SET status = 'processing', attempt_count = attempt_count + 1,
                 lease_token = ?, lease_expires_at = ?, updated_at = ?, last_error = NULL
             WHERE id = ? AND status IN ('pending', 'failed')
               ${input.force ? "" : "AND next_attempt_at <= ?"}
               AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
        args: [
          input.leaseToken,
          input.leaseExpiresAt,
          input.updatedAt,
          row.id,
          ...(!input.force ? [input.now] : []),
          input.now,
        ],
      },
    ]);
    const claimedRow = await executor.first(
      `SELECT * FROM aria_cache_invalidation_jobs
        WHERE id = ? AND status = 'processing' AND lease_token = ? LIMIT 1`,
      [row.id, input.leaseToken],
    );
    if (claimedRow) claimed.push(toCacheInvalidationJob(claimedRow));
  }
  return claimed;
}

export async function completeCacheInvalidationJob(
  executor: LocalizationStorageExecutor,
  input: { id: string; leaseToken: string; completedAt: string },
): Promise<void> {
  await executor.batch([
    {
      sql: `UPDATE aria_cache_invalidation_jobs
           SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL,
               updated_at = ?, completed_at = ?
           WHERE id = ? AND status = 'processing' AND lease_token = ?`,
      args: [input.completedAt, input.completedAt, input.id, input.leaseToken],
    },
  ]);
}

export async function failCacheInvalidationJob(
  executor: LocalizationStorageExecutor,
  input: {
    id: string;
    leaseToken: string;
    nextAttemptAt: string;
    updatedAt: string;
    lastError: string;
  },
): Promise<void> {
  await executor.batch([
    {
      sql: `UPDATE aria_cache_invalidation_jobs
           SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
               next_attempt_at = ?, updated_at = ?, last_error = ?
           WHERE id = ? AND status = 'processing' AND lease_token = ?`,
      args: [
        input.nextAttemptAt,
        input.updatedAt,
        input.lastError,
        input.id,
        input.leaseToken,
      ],
    },
  ]);
}
