/**
 * Migrates legacy aria_users. Role CHECK constraints (admin/editor)
 * to the four-preset role system (administrator/manager/content-editor/contributor).
 */

export const USER_ROLE_PRESET_CHECK =
  "role IN ('administrator', 'manager', 'content-editor', 'contributor')";

export function needsUserRolePresetMigration(
  createTableSql: string | null | undefined,
): boolean {
  if (!createTableSql) {
    return false;
  }

  return (
    createTableSql.includes("'administrator'") === false ||
    createTableSql.includes("'manager'") === false
  );
}

export function getUserRolePresetMigrationSql(): string {
  return `PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE aria_users__role_preset_migration (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (${USER_ROLE_PRESET_CHECK}),
  totp_secret TEXT,
  totp_enabled INTEGER DEFAULT 0,
  backup_codes TEXT,
  backup_codes_used TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  avatar_url TEXT,
  permission_profile TEXT
);

INSERT INTO aria_users__role_preset_migration (
  id,
  username,
  name,
  email,
  password_hash,
  role,
  totp_secret,
  totp_enabled,
  backup_codes,
  backup_codes_used,
  last_login_at,
  created_at,
  avatar_url,
  permission_profile
)
SELECT
  id,
  username,
  name,
  email,
  password_hash,
  CASE role
    WHEN 'admin' THEN 'administrator'
    WHEN 'editor' THEN 'content-editor'
    ELSE role
  END,
  totp_secret,
  totp_enabled,
  backup_codes,
  backup_codes_used,
  last_login_at,
  created_at,
  avatar_url,
  permission_profile
FROM aria_users;

DROP TABLE aria_users;

ALTER TABLE aria_users__role_preset_migration RENAME TO aria_users;

CREATE INDEX IF NOT EXISTS idx_users_email ON aria_users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON aria_users(username);

COMMIT;

PRAGMA foreign_keys=ON;`;
}

export type RolePresetMigrationContext = {
  getUsersTableSql: () => Promise<string | null | undefined>;
  execute: (sql: string) => Promise<void>;
};

export async function applyUserRolePresetMigrationIfNeeded(
  context: RolePresetMigrationContext,
): Promise<boolean> {
  const createTableSql = await context.getUsersTableSql();
  if (!needsUserRolePresetMigration(createTableSql)) {
    return false;
  }

  for (const statement of [
    "ALTER TABLE aria_users ADD COLUMN name TEXT",
    "ALTER TABLE aria_users ADD COLUMN avatar_url TEXT",
    "ALTER TABLE aria_users ADD COLUMN permission_profile TEXT",
  ]) {
    try {
      await context.execute(statement);
    } catch {
      // Column already exists.
    }
  }

  await context.execute(getUserRolePresetMigrationSql());
  return true;
}
