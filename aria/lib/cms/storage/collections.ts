import { collectionToRow, mapCollectionRow } from "./db";
import type { AriaCollection } from "../schemas";
import type { CollectionKind } from "../constants";
import type { CmsStorageExecutor } from "./executor";

export async function cmsListCollections(
  executor: CmsStorageExecutor,
  options?: { kind?: CollectionKind },
): Promise<AriaCollection[]> {
  const args: unknown[] = [];
  let sql = `SELECT * FROM aria_collections`;
  if (options?.kind) {
    sql += ` WHERE kind = ?`;
    args.push(options.kind);
  }
  sql += ` ORDER BY label COLLATE NOCASE ASC`;
  const rows = await executor.queryAll(sql, args);
  return rows.map((row) => mapCollectionRow(row));
}

export async function cmsCountEntriesByCollection(
  executor: CmsStorageExecutor,
  collectionIds?: readonly string[],
): Promise<Record<string, number>> {
  const ids = collectionIds?.filter((id) => id.trim().length > 0) ?? [];
  const args: unknown[] = [];
  let sql = `SELECT collection_id, COUNT(*) AS total FROM aria_entries`;
  if (ids.length > 0) {
    sql += ` WHERE collection_id IN (${ids.map(() => "?").join(", ")})`;
    args.push(...ids);
  }
  sql += ` GROUP BY collection_id`;
  const rows = await executor.queryAll<{ collection_id: string; total: number }>(
    sql,
    args,
  );
  return Object.fromEntries(
    rows.map((row) => [String(row.collection_id), Number(row.total ?? 0)]),
  );
}

export async function cmsGetCollection(
  executor: CmsStorageExecutor,
  idOrName: string,
): Promise<AriaCollection | null> {
  const row = await executor.queryFirst(
    `SELECT * FROM aria_collections WHERE id = ? OR name = ? LIMIT 1`,
    [idOrName, idOrName],
  );
  return row ? mapCollectionRow(row) : null;
}

export async function cmsSaveCollection(
  executor: CmsStorageExecutor,
  collection: AriaCollection,
): Promise<AriaCollection> {
  const row = collectionToRow(collection);
  await executor.run(
    `INSERT INTO aria_collections (
      id, name, label, kind, schema_json, scope,
      url_pattern, template_page_id, list_page_id, supports_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      label = excluded.label,
      kind = excluded.kind,
      schema_json = excluded.schema_json,
      scope = excluded.scope,
      url_pattern = excluded.url_pattern,
      template_page_id = excluded.template_page_id,
      list_page_id = excluded.list_page_id,
      supports_json = excluded.supports_json,
      updated_at = excluded.updated_at`,
    [
      row.id, row.name, row.label, row.kind, row.schema_json, row.scope,
      row.url_pattern, row.template_page_id, row.list_page_id,
      row.supports_json, row.created_at, row.updated_at,
    ],
  );
  const saved = await cmsGetCollection(executor, collection.id);
  if (!saved) throw new Error(`Failed to persist collection: ${collection.id}`);
  return saved;
}

export async function cmsDeleteCollection(
  executor: CmsStorageExecutor,
  id: string,
): Promise<void> {
  await executor.run(`DELETE FROM aria_collections WHERE id = ?`, [id]);
}
