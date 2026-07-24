/**
 * Shared auth adapter bootstrap: additive columns + legacy role migration.
 */

import { applyUserRolePresetMigrationIfNeeded } from "./rolePresetMigration";

export type AuthAdapterBootstrapContext = {
  execute: (sql: string) => Promise<void>;
  executeMultiple?: (sql: string) => Promise<void>;
  getUsersTableSql: () => Promise<string | null | undefined>;
};

const USER_COLUMN_MIGRATIONS = [
  "ALTER TABLE aria_users ADD COLUMN name TEXT",
  "ALTER TABLE aria_users ADD COLUMN avatar_url TEXT",
  "ALTER TABLE aria_users ADD COLUMN permission_profile TEXT",
  "ALTER TABLE aria_users ADD COLUMN preferences TEXT",
  "ALTER TABLE aria_users ADD COLUMN oauth_provider TEXT",
  "ALTER TABLE aria_users ADD COLUMN oauth_id TEXT",
] as const;

const OAUTH_IDENTITY_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_identity
  ON aria_users(oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;
`.trim();

const SESSION_COLUMN_MIGRATIONS = [
  "ALTER TABLE aria_sessions ADD COLUMN auth_method TEXT",
  "ALTER TABLE aria_sessions ADD COLUMN ip TEXT",
  "ALTER TABLE aria_sessions ADD COLUMN user_agent TEXT",
] as const;

const MODERN_AUTH_FOUNDATION_SQL = `
CREATE TABLE IF NOT EXISTS aria_passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name TEXT,
  transports TEXT,
  backed_up INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_user
  ON aria_passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS aria_auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'login', 'invite', 'email_verify')),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user
  ON aria_auth_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash
  ON aria_auth_tokens(token_hash);

INSERT OR IGNORE INTO aria_auth_tokens (
  id,
  user_id,
  purpose,
  token_hash,
  expires_at,
  consumed_at,
  created_at
)
SELECT
  id,
  user_id,
  'password_reset',
  token_hash,
  expires_at,
  NULL,
  created_at
FROM aria_password_resets;

CREATE TABLE IF NOT EXISTS aria_auth_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  auth_method TEXT,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_created
  ON aria_auth_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_auth_events_created
  ON aria_auth_events(created_at);

CREATE TABLE IF NOT EXISTS aria_webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  user_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES aria_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires
  ON aria_webauthn_challenges(expires_at);
`;

export async function bootstrapAuthUserColumnMigrations(
  execute: (sql: string) => Promise<void>,
): Promise<void> {
  for (const statement of USER_COLUMN_MIGRATIONS) {
    try {
      await execute(statement);
    } catch {
      // Column already exists.
    }
  }

  try {
    await execute(OAUTH_IDENTITY_INDEX_SQL);
  } catch {
    // Index already exists or table is not ready yet.
  }
}

export async function bootstrapAuthUsersSchema(
  context: AuthAdapterBootstrapContext,
): Promise<void> {
  const run =
    context.executeMultiple ??
    (async (sql: string) => {
      for (const statement of sql
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        await context.execute(`${statement};`);
      }
    });

  await bootstrapAuthUserColumnMigrations(context.execute.bind(context));

  for (const statement of SESSION_COLUMN_MIGRATIONS) {
    try {
      await context.execute(statement);
    } catch {
      // Column already exists.
    }
  }

  await run(MODERN_AUTH_FOUNDATION_SQL);

  await applyUserRolePresetMigrationIfNeeded({
    getUsersTableSql: context.getUsersTableSql,
    execute: run,
  });
}
