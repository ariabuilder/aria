import type { CmsStorageExecutor } from "./executor";

const CMS_AUTHORSHIP_ALTER_STATEMENTS = [
  `ALTER TABLE aria_entries ADD COLUMN created_by_id TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN created_by_username TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN created_by_email TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN updated_by_id TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN updated_by_username TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN updated_by_email TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN published_by_id TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN published_by_username TEXT`,
  `ALTER TABLE aria_entries ADD COLUMN published_by_email TEXT`,
  `ALTER TABLE aria_entry_revisions ADD COLUMN actor_username TEXT`,
  `ALTER TABLE aria_entry_revisions ADD COLUMN actor_email TEXT`,
  `ALTER TABLE aria_entry_revisions ADD COLUMN actor_avatar_url TEXT`,
] as const;

const CMS_AUTHORSHIP_ID_BACKFILL_STATEMENTS = [
  `UPDATE aria_entries
   SET created_by_id = author_id
   WHERE created_by_id IS NULL`,
  `UPDATE aria_entries
   SET updated_by_id = author_id
   WHERE updated_by_id IS NULL`,
  `UPDATE aria_entries
   SET published_by_id = author_id
   WHERE published_by_id IS NULL AND published_at IS NOT NULL`,
] as const;

const CMS_AUTHORSHIP_USER_BACKFILL_STATEMENTS = [
  `UPDATE aria_entries
   SET
     created_by_username = (
       SELECT username FROM aria_users WHERE aria_users.id = aria_entries.created_by_id
     ),
     created_by_email = (
       SELECT email FROM aria_users WHERE aria_users.id = aria_entries.created_by_id
     )
   WHERE created_by_id IS NOT NULL AND created_by_username IS NULL`,
  `UPDATE aria_entries
   SET
     updated_by_username = (
       SELECT username FROM aria_users WHERE aria_users.id = aria_entries.updated_by_id
     ),
     updated_by_email = (
       SELECT email FROM aria_users WHERE aria_users.id = aria_entries.updated_by_id
     )
   WHERE updated_by_id IS NOT NULL AND updated_by_username IS NULL`,
  `UPDATE aria_entries
   SET
     published_by_username = (
       SELECT username FROM aria_users WHERE aria_users.id = aria_entries.published_by_id
     ),
     published_by_email = (
       SELECT email FROM aria_users WHERE aria_users.id = aria_entries.published_by_id
     )
   WHERE published_by_id IS NOT NULL AND published_by_username IS NULL`,
  `UPDATE aria_entry_revisions
   SET
     actor_username = (
       SELECT username FROM aria_users WHERE aria_users.id = aria_entry_revisions.actor_id
     ),
     actor_email = (
       SELECT email FROM aria_users WHERE aria_users.id = aria_entry_revisions.actor_id
     )
   WHERE actor_username IS NULL`,
  `UPDATE aria_entry_revisions
   SET
     actor_avatar_url = (
       SELECT avatar_url FROM aria_users WHERE aria_users.id = aria_entry_revisions.actor_id
     )
   WHERE actor_id IS NOT NULL AND actor_avatar_url IS NULL`,
] as const;

function isDuplicateColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("duplicate column");
}

export async function ensureCmsAuthorshipSchema(
  executor: CmsStorageExecutor,
): Promise<void> {
  for (const statement of CMS_AUTHORSHIP_ALTER_STATEMENTS) {
    try {
      await executor.run(statement);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }

  for (const statement of CMS_AUTHORSHIP_ID_BACKFILL_STATEMENTS) {
    await executor.run(statement);
  }

  for (const statement of CMS_AUTHORSHIP_USER_BACKFILL_STATEMENTS) {
    try {
      await executor.run(statement);
    } catch {
      // CMS can run in storage-only test databases where aria_users is absent.
    }
  }
}

export async function ensureCmsTranslationSchema(
  executor: CmsStorageExecutor,
): Promise<void> {
  try {
    await executor.queryAll(
      `SELECT translation_meta_json FROM aria_entry_locales LIMIT 0`,
    );
    return;
  } catch {
    // Upgrade old development databases before any versioned write.
  }

  try {
    await executor.run(
      `ALTER TABLE aria_entry_locales ADD COLUMN translation_meta_json TEXT`,
    );
  } catch (error) {
    if (!isDuplicateColumnError(error)) throw error;
  }
}

function parseStoredSupports(value: unknown): string[] {
  if (typeof value !== "string" || value.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function ensureCmsCoverSupportBackfill(
  executor: CmsStorageExecutor,
): Promise<void> {
  const rows = await executor.queryAll<{ id: string; supports_json: unknown }>(
    `SELECT id, supports_json FROM aria_collections WHERE kind = ?`,
    ["content"],
  );
  for (const row of rows) {
    const supports = parseStoredSupports(row.supports_json);
    if (supports.includes("cover")) continue;
    await executor.run(
      `UPDATE aria_collections SET supports_json = ? WHERE id = ?`,
      [JSON.stringify([...supports, "cover"]), row.id],
    );
  }
}
