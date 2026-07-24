export interface PageMetaSystemRoleMigrationExecutor {
  queryFirst<T extends Record<string, unknown>>(
    sql: string,
    args?: unknown[],
  ): Promise<T | null>;
  run(sql: string, args?: unknown[]): Promise<void>;
}

export const PAGE_META_SYSTEM_ROLE_REBUILD_STATEMENTS = [
  `DROP INDEX IF EXISTS idx_aria_page_meta_system_role_unique`,
  `DROP INDEX IF EXISTS idx_aria_page_meta_access_mode`,
  `DROP INDEX IF EXISTS idx_aria_page_meta_scheduled_for`,
  `DROP INDEX IF EXISTS idx_aria_page_meta_slug`,
  `DROP TABLE IF EXISTS aria_page_meta_v2`,
  `CREATE TABLE aria_page_meta_v2 (
     id TEXT PRIMARY KEY,
     slug TEXT,
     title TEXT,
     status TEXT,
     parent TEXT,
     layout TEXT,
     draft_version TEXT,
     published_version TEXT,
     current_version TEXT NOT NULL,
     system_role TEXT NOT NULL DEFAULT 'standard' CHECK (system_role IN ('standard', 'not-found', 'cms-collection', 'cms-entry')),
     access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'password', 'private', 'unlisted')),
     access_password_hash TEXT,
     access_prompt_title TEXT,
     access_prompt_description TEXT,
     access_remember_for_days INTEGER CHECK (access_remember_for_days IS NULL OR access_remember_for_days BETWEEN 1 AND 30),
     access_policy_version INTEGER NOT NULL DEFAULT 1,
     scheduled_for TEXT,
     schedule_lease_token TEXT,
     schedule_lease_expires_at TEXT,
     schedule_attempt_count INTEGER NOT NULL DEFAULT 0,
     last_schedule_error TEXT,
     updated_at TEXT NOT NULL
   )`,
  `INSERT INTO aria_page_meta_v2 (
     id,
     slug,
     title,
     status,
     parent,
     layout,
     draft_version,
     published_version,
     current_version,
     system_role,
     access_mode,
     access_password_hash,
     access_prompt_title,
     access_prompt_description,
     access_remember_for_days,
     access_policy_version,
     scheduled_for,
     schedule_lease_token,
     schedule_lease_expires_at,
     schedule_attempt_count,
     last_schedule_error,
     updated_at
   )
   SELECT
     id,
     slug,
     title,
     status,
     parent,
     layout,
     draft_version,
     published_version,
     current_version,
     CASE
       WHEN COALESCE(NULLIF(TRIM(system_role), ''), 'standard') = 'cms-template' THEN 'cms-entry'
       ELSE COALESCE(NULLIF(TRIM(system_role), ''), 'standard')
     END,
     COALESCE(NULLIF(TRIM(access_mode), ''), 'public'),
     access_password_hash,
     access_prompt_title,
     access_prompt_description,
     access_remember_for_days,
     COALESCE(access_policy_version, 1),
     scheduled_for,
     schedule_lease_token,
     schedule_lease_expires_at,
     COALESCE(schedule_attempt_count, 0),
     last_schedule_error,
     updated_at
   FROM aria_page_meta`,
  `DROP TABLE aria_page_meta`,
  `ALTER TABLE aria_page_meta_v2 RENAME TO aria_page_meta`,
  `CREATE INDEX IF NOT EXISTS idx_aria_page_meta_slug
     ON aria_page_meta (slug)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_page_meta_access_mode
     ON aria_page_meta(access_mode)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_page_meta_scheduled_for
     ON aria_page_meta (scheduled_for)
     WHERE status = 'scheduled'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_page_meta_system_role_unique
     ON aria_page_meta(system_role)
     WHERE system_role = 'not-found'`,
] as const;

export function needsPageMetaSystemRoleConstraintMigration(
  ddl: string,
): boolean {
  const normalized = ddl.toLowerCase();

  return (
    normalized.includes("system_role") &&
    !(
      normalized.includes("cms-collection") &&
      normalized.includes("cms-entry")
    )
  );
}

export async function ensurePageMetaSystemRoleConstraint(
  executor: PageMetaSystemRoleMigrationExecutor,
): Promise<void> {
  const row = await executor.queryFirst<{ sql: string | null }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_page_meta' LIMIT 1`,
  );
  const ddl = String(row?.sql ?? "");

  if (!needsPageMetaSystemRoleConstraintMigration(ddl)) {
    return;
  }

  for (const statement of PAGE_META_SYSTEM_ROLE_REBUILD_STATEMENTS) {
    await executor.run(statement);
  }
}
