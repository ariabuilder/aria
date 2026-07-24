import {
  entryLocaleToRow,
  entryRelationToRow,
  entryToRow,
  mapEntryAuthorshipFromRow,
  mapEntryLocaleRow,
  mapEntryRelationRow,
  mapEntryRevisionRow,
  mapEntryRow,
} from "./db";
import type {
  AriaEntryAuthorDisplay,
  AriaEntryRecord,
  AriaEntryRevision,
} from "../schemas";
import type {
  EntryListParams,
  EntryListResult,
  EntryStatus,
} from "../constants";
import { buildCmsListFilterSql, CmsListFilterSchema } from "../listFilters";
import type { CmsStorageExecutor } from "./executor";
import { ensureCmsTranslationSchema } from "./schema";

const DEFAULT_LOCALE = "en";

function resolveLocale(requested?: string): string {
  return requested?.trim() || DEFAULT_LOCALE;
}
function statusFilterClause(status: EntryStatus | EntryStatus[] | undefined): {
  sql: string;
  args: unknown[];
} {
  if (!status) return { sql: "", args: [] };
  const values = Array.isArray(status) ? status : [status];
  return {
    sql: ` AND e.status IN (${values.map(() => "?").join(", ")})`,
    args: values,
  };
}
type LocaleProjectionSql = {
  joins: string;
  args: string[];
  title: string;
  slug: string;
};
function buildLocaleProjection(
  requestedLocale: string,
  fallbackLocales: readonly string[] | undefined,
): LocaleProjectionSql {
  const candidates = Array.from(
    new Set(
      [requestedLocale, ...(fallbackLocales ?? [])].filter(
        (locale) => locale.trim().length > 0,
      ),
    ),
  );
  const aliases = candidates.map((_, index) =>
    index === 0 ? "l_requested" : `l_fallback_${index}`,
  );
  const joins = aliases
    .map(
      (alias) =>
        `LEFT JOIN aria_entry_locales ${alias}\n       ON ${alias}.entry_id = e.id AND ${alias}.locale = ?`,
    )
    .join("\n     ");
  const coalesce = (column: "title" | "slug") =>
    `COALESCE(${[...aliases.map((alias) => `${alias}.${column}`), `l_source.${column}`, `l_any.${column}`].join(", ")})`;
  return {
    joins,
    args: candidates,
    title: coalesce("title"),
    slug: coalesce("slug"),
  };
}
function queryFilterClause(
  query: string | undefined,
  projection: LocaleProjectionSql,
): { sql: string; args: unknown[] } {
  const trimmed = query?.trim();
  if (!trimmed) return { sql: "", args: [] };
  const pattern = `%${trimmed}%`;
  return {
    sql: ` AND (\n      ${projection.title} LIKE ?\n      OR ${projection.slug} LIKE ?\n    )`,
    args: [pattern, pattern],
  };
}
function entrySortClause(
  sort: EntryListParams["sort"],
  projection: LocaleProjectionSql,
): string {
  const sortItems =
    sort && sort.length > 0
      ? sort
      : [{ field: "updatedAt" as const, direction: "desc" as const }];
  const columns = sortItems.map((item) => {
    const direction = item.direction === "asc" ? "ASC" : "DESC";
    switch (item.field) {
      case "title":
        return `${projection.title} COLLATE NOCASE ${direction}`;
      case "slug":
        return `${projection.slug} COLLATE NOCASE ${direction}`;
      case "publishedAt":
        return `e.published_at ${direction}`;
      case "createdAt":
        return `e.created_at ${direction}`;
      case "updatedAt":
      default:
        return `e.updated_at ${direction}`;
    }
  });
  return ` ORDER BY ${columns.join(", ")}, e.id ASC`;
}
function resolveRequestedLocale(
  locales: AriaEntryRecord["locales"],
  requested?: string,
  fallbackLocales?: readonly string[],
): AriaEntryRecord["locales"][number] | null {
  const requestedLocale = resolveLocale(requested);
  const matched = [requestedLocale, ...(fallbackLocales ?? [])]
    .map((code) => locales.find((locale) => locale.locale === code))
    .find((locale): locale is AriaEntryRecord["locales"][number] =>
      Boolean(locale),
    );
  return (
    matched ?? locales.find((locale) => locale.isSource) ?? locales[0] ?? null
  );
}
function actorSnapshotColumns(
  actor: AriaEntryAuthorDisplay | null | undefined,
): {
  id: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
} {
  return {
    id: actor?.id ?? null,
    username: actor?.username ?? null,
    email: actor?.email ?? null,
    avatarUrl: actor?.avatarUrl?.trim() || null,
  };
}
async function loadEntryLocales(
  executor: CmsStorageExecutor,
  entryId: string,
): Promise<AriaEntryRecord["locales"]> {
  const rows = await executor.queryAll(
    `SELECT * FROM aria_entry_locales WHERE entry_id = ? ORDER BY is_source DESC, locale ASC`,
    [entryId],
  );
  return rows.map((row) => mapEntryLocaleRow(row));
}
async function loadEntryLocalesForEntries(
  executor: CmsStorageExecutor,
  entryIds: readonly string[],
): Promise<Map<string, AriaEntryRecord["locales"]>> {
  if (entryIds.length === 0) return new Map();
  const rows = await executor.queryAll(
    `SELECT * FROM aria_entry_locales WHERE entry_id IN (${entryIds.map(() => "?").join(", ")}) ORDER BY entry_id ASC, is_source DESC, locale ASC`,
    [...entryIds],
  );
  const localesByEntry = new Map<string, AriaEntryRecord["locales"]>();
  for (const row of rows) {
    const locale = mapEntryLocaleRow(row);
    const current = localesByEntry.get(locale.entryId) ?? [];
    current.push(locale);
    localesByEntry.set(locale.entryId, current);
  }
  return localesByEntry;
}
async function loadEntryRelations(
  executor: CmsStorageExecutor,
  entryId: string,
): Promise<NonNullable<AriaEntryRecord["relations"]>> {
  const rows = await executor.queryAll(
    `SELECT * FROM aria_entry_relations WHERE source_entry_id = ? ORDER BY field_key ASC, position ASC`,
    [entryId],
  );
  return rows.map((row) => mapEntryRelationRow(row));
}

export async function cmsGetEntry(
  executor: CmsStorageExecutor,
  options: {
    collectionId: string;
    idOrSlug: string;
    locale?: string;
    localeFallbacks?: string[];
    includeAllLocales?: boolean;
    includeRelations?: boolean;
  },
): Promise<AriaEntryRecord | null> {
  const locale = options.locale?.trim() || null;
  const entryRow = await executor.queryFirst(
    `SELECT e.* FROM aria_entries e WHERE e.collection_id = ? AND (e.id = ? OR EXISTS (SELECT 1 FROM aria_entry_locales lookup WHERE lookup.entry_id = e.id AND lookup.slug = ? AND (? IS NULL OR lookup.locale = ?))) LIMIT 1`,
    [options.collectionId, options.idOrSlug, options.idOrSlug, locale, locale],
  );
  if (!entryRow) return null;
  const entry = mapEntryRow(entryRow);
  const locales = await loadEntryLocales(executor, entry.id);
  if (locales.length === 0) return null;
  const recordLocales =
    locale && !options.includeAllLocales
      ? [
          resolveRequestedLocale(locales, locale, options.localeFallbacks),
        ].filter((item): item is AriaEntryRecord["locales"][number] =>
          Boolean(item),
        )
      : locales;
  if (recordLocales.length === 0) return null;
  const authorship = mapEntryAuthorshipFromRow(entryRow);
  const record: AriaEntryRecord = { entry, locales: recordLocales };
  if (authorship) record.authorship = authorship;
  if (options.includeRelations)
    record.relations = await loadEntryRelations(executor, entry.id);
  return record;
}

export async function cmsListEntries(
  executor: CmsStorageExecutor,
  params: EntryListParams,
): Promise<EntryListResult> {
  const locale = resolveLocale(params.locale);
  const limit = params.limit ?? 50;
  const page = params.page ?? 1;
  const offset = (page - 1) * limit;
  const statusClause = statusFilterClause(params.status);
  const projection = buildLocaleProjection(locale, params.localeFallbacks);
  const queryClause = queryFilterClause(params.query, projection);
  const sortClause = entrySortClause(params.sort, projection);
  const listFilter = params.filter
    ? CmsListFilterSchema.parse(params.filter)
    : undefined;
  const filterClause =
    listFilter && (listFilter.relationIncludes || listFilter.referenceEquals)
      ? buildCmsListFilterSql(listFilter)
      : { joins: "", sql: "", args: [] as unknown[] };
  const common = `FROM aria_entries e ${projection.joins} LEFT JOIN aria_entry_locales l_source ON l_source.entry_id = e.id AND l_source.is_source = 1 LEFT JOIN aria_entry_locales l_any ON l_any.entry_id = e.id AND l_any.locale = (SELECT locale FROM aria_entry_locales WHERE entry_id = e.id ORDER BY is_source DESC, locale ASC LIMIT 1) ${filterClause.joins} WHERE e.collection_id = ?${statusClause.sql}${queryClause.sql}${filterClause.sql}`;
  const args = [
    ...projection.args,
    params.collectionId,
    ...statusClause.args,
    ...queryClause.args,
    ...filterClause.args,
  ];
  const countRow = await executor.queryFirst<{ total: number }>(
    `SELECT COUNT(DISTINCT e.id) AS total ${common}`,
    args,
  );
  const entryRows = await executor.queryAll(
    `SELECT DISTINCT e.* ${common} ${sortClause} LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  const localesByEntry = await loadEntryLocalesForEntries(
    executor,
    entryRows.map((row) => String(row.id)),
  );
  const items: AriaEntryRecord[] = [];
  for (const entryRow of entryRows) {
    const entry = mapEntryRow(entryRow);
    const resolved = resolveRequestedLocale(
      localesByEntry.get(entry.id) ?? [],
      locale,
      params.localeFallbacks,
    );
    if (resolved) {
      const authorship = mapEntryAuthorshipFromRow(entryRow);
      items.push(
        authorship
          ? { entry, locales: [resolved], authorship }
          : { entry, locales: [resolved] },
      );
    }
  }
  return { items, total: Number(countRow?.total ?? 0), page, limit };
}

export async function cmsSaveEntry(
  executor: CmsStorageExecutor,
  record: AriaEntryRecord,
  options?: {
    expectedVersion?: string;
    relations?: AriaEntryRecord["relations"];
    replaceLocales?: boolean;
  },
): Promise<AriaEntryRecord> {
  await ensureCmsTranslationSchema(executor);
  const existing = await executor.queryFirst<{ version: string }>(
    `SELECT version FROM aria_entries WHERE id = ? LIMIT 1`,
    [record.entry.id],
  );
  if (
    existing &&
    options?.expectedVersion &&
    String(existing.version) !== options.expectedVersion
  )
    throw new Error(
      `Entry version conflict: expected ${options.expectedVersion}, found ${String(existing.version)}`,
    );
  const entryRow = entryToRow(record.entry);
  const createdBy = actorSnapshotColumns(
    record.authorship?.createdBy ?? record.authorship?.author,
  );
  const updatedBy = actorSnapshotColumns(
    record.authorship?.updatedBy ?? record.authorship?.author,
  );
  const publishedBy = actorSnapshotColumns(record.authorship?.publishedBy);
  await executor.run(
    `INSERT INTO aria_entries (id, collection_id, status, version, author_id, created_at, updated_at, published_at, scheduled_for, scheduled_version, created_by_id, created_by_username, created_by_email, updated_by_id, updated_by_username, updated_by_email, published_by_id, published_by_username, published_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, version = excluded.version, author_id = excluded.author_id, updated_at = excluded.updated_at, published_at = excluded.published_at, scheduled_for = excluded.scheduled_for, scheduled_version = excluded.scheduled_version, created_by_id = COALESCE(excluded.created_by_id, created_by_id), created_by_username = COALESCE(excluded.created_by_username, created_by_username), created_by_email = COALESCE(excluded.created_by_email, created_by_email), updated_by_id = excluded.updated_by_id, updated_by_username = excluded.updated_by_username, updated_by_email = excluded.updated_by_email, published_by_id = excluded.published_by_id, published_by_username = excluded.published_by_username, published_by_email = excluded.published_by_email`,
    [
      entryRow.id,
      entryRow.collection_id,
      entryRow.status,
      entryRow.version,
      entryRow.author_id,
      entryRow.created_at,
      entryRow.updated_at,
      entryRow.published_at,
      entryRow.scheduled_for,
      entryRow.scheduled_version,
      createdBy.id,
      createdBy.username,
      createdBy.email,
      updatedBy.id,
      updatedBy.username,
      updatedBy.email,
      publishedBy.id,
      publishedBy.username,
      publishedBy.email,
    ],
  );
  if (options?.replaceLocales) {
    const locales = record.locales.map((locale) => locale.locale);
    if (locales.length > 0)
      await executor.run(
        `DELETE FROM aria_entry_locales WHERE entry_id = ? AND locale NOT IN (${locales.map(() => "?").join(", ")})`,
        [record.entry.id, ...locales],
      );
  }
  for (const locale of record.locales) {
    const localeRow = entryLocaleToRow({
      ...locale,
      entryId: record.entry.id,
      collectionId: record.entry.collectionId,
    });
    await executor.run(
      `INSERT INTO aria_entry_locales (entry_id, collection_id, locale, slug, title, frontmatter_json, body, is_source, translation_meta_json, comments_closed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entry_id, locale) DO UPDATE SET collection_id = excluded.collection_id, slug = excluded.slug, title = excluded.title, frontmatter_json = excluded.frontmatter_json, body = excluded.body, is_source = excluded.is_source, translation_meta_json = excluded.translation_meta_json, comments_closed = excluded.comments_closed`,
      [
        localeRow.entry_id,
        localeRow.collection_id,
        localeRow.locale,
        localeRow.slug,
        localeRow.title,
        localeRow.frontmatter_json,
        localeRow.body,
        localeRow.is_source,
        localeRow.translation_meta_json,
        localeRow.comments_closed,
      ],
    );
  }
  await executor.run(
    `UPDATE aria_cms_entry_workflow SET state = 'none', reviewed_version = NULL, updated_by_id = ?, updated_at = ? WHERE entry_id = ? AND state = 'approved' AND reviewed_version <> ?`,
    [
      record.entry.authorId,
      record.entry.updatedAt,
      record.entry.id,
      record.entry.version,
    ],
  );
  const relations = options?.relations ?? record.relations;
  if (relations) {
    await executor.run(
      `DELETE FROM aria_entry_relations WHERE source_entry_id = ?`,
      [record.entry.id],
    );
    for (const relation of relations) {
      const relationRow = entryRelationToRow({
        ...relation,
        sourceEntryId: record.entry.id,
      });
      await executor.run(
        `INSERT INTO aria_entry_relations (source_entry_id, field_key, target_entry_id, position, meta_json) VALUES (?, ?, ?, ?, ?)`,
        [
          relationRow.source_entry_id,
          relationRow.field_key,
          relationRow.target_entry_id,
          relationRow.position,
          relationRow.meta_json,
        ],
      );
    }
  }
  const saved = await cmsGetEntry(executor, {
    collectionId: record.entry.collectionId,
    idOrSlug: record.entry.id,
    includeRelations: Boolean(relations),
  });
  if (!saved) throw new Error(`Failed to persist entry: ${record.entry.id}`);
  return saved;
}

export async function cmsDeleteEntry(
  executor: CmsStorageExecutor,
  collectionId: string,
  entryId: string,
): Promise<void> {
  await executor.run(
    `DELETE FROM aria_entries WHERE id = ? AND collection_id = ?`,
    [entryId, collectionId],
  );
}
export async function cmsGetEntryRevision(
  executor: CmsStorageExecutor,
  revisionId: string,
): Promise<AriaEntryRevision | null> {
  const row = await executor.queryFirst(
    `SELECT revisions.* FROM aria_entry_revisions revisions WHERE revisions.id = ? LIMIT 1`,
    [revisionId],
  );
  return row ? mapEntryRevisionRow(row) : null;
}
export async function cmsListEntryRevisions(
  executor: CmsStorageExecutor,
  entryId: string,
  options?: { limit?: number; offset?: number },
): Promise<AriaEntryRevision[]> {
  const rows = await executor.queryAll(
    `SELECT revisions.* FROM aria_entry_revisions revisions WHERE revisions.entry_id = ? ORDER BY revisions.created_at DESC LIMIT ? OFFSET ?`,
    [entryId, options?.limit ?? 50, options?.offset ?? 0],
  );
  return rows.map((row) => mapEntryRevisionRow(row));
}
export async function cmsSaveEntryRevision(
  executor: CmsStorageExecutor,
  revision: AriaEntryRevision,
): Promise<AriaEntryRevision> {
  const actor = actorSnapshotColumns(revision.authorship?.actor);
  await executor.run(
    `INSERT INTO aria_entry_revisions (id, entry_id, locale, version, snapshot_json, actor_id, actor_username, actor_email, actor_avatar_url, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      revision.id,
      revision.entryId,
      revision.locale,
      revision.version,
      JSON.stringify(revision.snapshot),
      revision.actorId,
      actor.username,
      actor.email,
      actor.avatarUrl,
      revision.message ?? null,
      revision.createdAt,
    ],
  );
  const row = await executor.queryFirst(
    `SELECT * FROM aria_entry_revisions WHERE id = ? LIMIT 1`,
    [revision.id],
  );
  if (!row) throw new Error(`Failed to persist revision: ${revision.id}`);
  return mapEntryRevisionRow(row);
}
