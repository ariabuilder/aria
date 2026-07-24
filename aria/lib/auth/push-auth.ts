import { createClient, type Client } from "@libsql/client";

import type { RemoteD1DatabaseLike } from "../storage/d1-database-types";
import { createRemoteD1Database } from "../storage/remote-d1";

export type AuthPushTarget = {
  local: boolean;
  d1?: RemoteD1DatabaseLike;
  sqlite?: Client;
};

type AuthUserRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  totp_secret: string | null;
  totp_enabled: number | null;
  backup_codes: string | null;
  backup_codes_used: string | null;
  last_login_at: string | null;
  created_at: string;
  avatar_url: string | null;
  permission_profile: string | null;
  preferences: string | null;
};

type AuthConfigRow = {
  key: string;
  value: string;
  updated_at: string;
};

type AuthPasskeyCredentialRow = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string | null;
  transports: string | null;
  backed_up: number | null;
  created_at: string;
  last_used_at: string | null;
};

async function readAuthUsers(client: Client): Promise<AuthUserRow[]> {
  let result;

  try {
    result = await client.execute(
      `SELECT id, username, email, password_hash, role, totp_secret, totp_enabled,
              backup_codes, backup_codes_used, last_login_at, created_at,
              avatar_url, permission_profile, preferences
       FROM aria_users`,
    );
  } catch {
    result = await client.execute(
      `SELECT id, username, email, password_hash, role, totp_secret, totp_enabled,
              backup_codes, backup_codes_used, last_login_at, created_at,
              avatar_url, permission_profile
       FROM aria_users`,
    );
  }

  return result.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    password_hash: String(row.password_hash),
    role: String(row.role),
    totp_secret: row.totp_secret == null ? null : String(row.totp_secret),
    totp_enabled:
      row.totp_enabled == null ? null : Number(row.totp_enabled),
    backup_codes: row.backup_codes == null ? null : String(row.backup_codes),
    backup_codes_used:
      row.backup_codes_used == null ? null : String(row.backup_codes_used),
    last_login_at:
      row.last_login_at == null ? null : String(row.last_login_at),
    created_at: String(row.created_at),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    permission_profile:
      row.permission_profile == null ? null : String(row.permission_profile),
    preferences: row.preferences == null ? null : String(row.preferences),
  }));
}

async function readAuthPasskeyCredentials(
  client: Client,
): Promise<AuthPasskeyCredentialRow[]> {
  const result = await client.execute(
    `SELECT id, user_id, credential_id, public_key, counter, device_name,
            transports, backed_up, created_at, last_used_at
     FROM aria_passkey_credentials`,
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    user_id: String(row.user_id),
    credential_id: String(row.credential_id),
    public_key: String(row.public_key),
    counter: Number(row.counter ?? 0),
    device_name: row.device_name == null ? null : String(row.device_name),
    transports: row.transports == null ? null : String(row.transports),
    backed_up: row.backed_up == null ? null : Number(row.backed_up),
    created_at: String(row.created_at),
    last_used_at: row.last_used_at == null ? null : String(row.last_used_at),
  }));
}

async function readAuthConfig(client: Client): Promise<AuthConfigRow[]> {
  const result = await client.execute(
    "SELECT key, value, updated_at FROM aria_config",
  );

  return result.rows.map((row) => ({
    key: String(row.key),
    value: String(row.value),
    updated_at: String(row.updated_at),
  }));
}

async function upsertPasskeyCredential(
  target: AuthPushTarget,
  credential: AuthPasskeyCredentialRow,
): Promise<void> {
  const sql = `INSERT INTO aria_passkey_credentials (
      id, user_id, credential_id, public_key, counter, device_name,
      transports, backed_up, created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      user_id = excluded.user_id,
      public_key = excluded.public_key,
      counter = MAX(aria_passkey_credentials.counter, excluded.counter),
      device_name = excluded.device_name,
      transports = excluded.transports,
      backed_up = excluded.backed_up,
      created_at = excluded.created_at,
      last_used_at = CASE
        WHEN aria_passkey_credentials.last_used_at IS NULL THEN excluded.last_used_at
        WHEN excluded.last_used_at IS NULL THEN aria_passkey_credentials.last_used_at
        WHEN excluded.last_used_at > aria_passkey_credentials.last_used_at THEN excluded.last_used_at
        ELSE aria_passkey_credentials.last_used_at
      END`;

  const args = [
    credential.id,
    credential.user_id,
    credential.credential_id,
    credential.public_key,
    credential.counter,
    credential.device_name,
    credential.transports,
    credential.backed_up,
    credential.created_at,
    credential.last_used_at,
  ];

  if (target.sqlite) {
    await target.sqlite.execute({ sql, args });
    return;
  }

  if (target.d1) {
    await target.d1.prepare(sql).bind(...args).run();
  }
}

async function upsertUser(
  target: AuthPushTarget,
  user: AuthUserRow,
  options: { includePreferences?: boolean } = {},
): Promise<void> {
  // `readAuthUsers` normalizes missing `preferences` values to `null`, so we
  // cannot rely on the field itself to decide whether to include it in the
  // upsert. The caller uses `includePreferences` (default true) to opt-out on
  // retry when the target schema does not yet have the column — without this
  // explicit flag, the fallback path below would recurse forever.
  const withPreferences =
    options.includePreferences !== false && user.preferences !== undefined;

  const sql = withPreferences
    ? `INSERT INTO aria_users (
        id, username, email, password_hash, role, totp_secret, totp_enabled,
        backup_codes, backup_codes_used, last_login_at, created_at,
        avatar_url, permission_profile, preferences
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        password_hash = excluded.password_hash,
        role = excluded.role,
        totp_secret = excluded.totp_secret,
        totp_enabled = excluded.totp_enabled,
        backup_codes = excluded.backup_codes,
        backup_codes_used = excluded.backup_codes_used,
        last_login_at = excluded.last_login_at,
        avatar_url = excluded.avatar_url,
        permission_profile = excluded.permission_profile,
        preferences = excluded.preferences`
    : `INSERT INTO aria_users (
        id, username, email, password_hash, role, totp_secret, totp_enabled,
        backup_codes, backup_codes_used, last_login_at, created_at,
        avatar_url, permission_profile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        email = excluded.email,
        password_hash = excluded.password_hash,
        role = excluded.role,
        totp_secret = excluded.totp_secret,
        totp_enabled = excluded.totp_enabled,
        backup_codes = excluded.backup_codes,
        backup_codes_used = excluded.backup_codes_used,
        last_login_at = excluded.last_login_at,
        avatar_url = excluded.avatar_url,
        permission_profile = excluded.permission_profile`;

  const args = withPreferences
    ? [
        user.id,
        user.username,
        user.email,
        user.password_hash,
        user.role,
        user.totp_secret,
        user.totp_enabled,
        user.backup_codes,
        user.backup_codes_used,
        user.last_login_at,
        user.created_at,
        user.avatar_url,
        user.permission_profile,
        user.preferences,
      ]
    : [
        user.id,
        user.username,
        user.email,
        user.password_hash,
        user.role,
        user.totp_secret,
        user.totp_enabled,
        user.backup_codes,
        user.backup_codes_used,
        user.last_login_at,
        user.created_at,
        user.avatar_url,
        user.permission_profile,
      ];

  if (target.sqlite) {
    try {
      await target.sqlite.execute({ sql, args });
    } catch (error) {
      if (!withPreferences) {
        throw error;
      }
      await upsertUser(target, user, { includePreferences: false });
    }
    return;
  }

  if (target.d1) {
    try {
      await target.d1.prepare(sql).bind(...args).run();
    } catch (error) {
      if (!withPreferences) {
        throw error;
      }
      await upsertUser(target, user, { includePreferences: false });
    }
  }
}

async function upsertConfig(
  target: AuthPushTarget,
  row: AuthConfigRow,
): Promise<void> {
  const sql = `INSERT INTO aria_config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at`;

  const args = [row.key, row.value, row.updated_at];

  if (target.sqlite) {
    await target.sqlite.execute({ sql, args });
    return;
  }

  if (target.d1) {
    await target.d1.prepare(sql).bind(...args).run();
  }
}

export async function pushAuthFromLocalDb(input: {
  sourceDbPath: string;
  target: AuthPushTarget;
}): Promise<{ users: number; passkeys: number; configKeys: number }> {
  const source = createClient({ url: `file:${input.sourceDbPath}` });

  let users: AuthUserRow[] = [];
  let passkeys: AuthPasskeyCredentialRow[] = [];
  let config: AuthConfigRow[] = [];

  try {
    users = await readAuthUsers(source);
  } catch {
    users = [];
  }

  try {
    passkeys = await readAuthPasskeyCredentials(source);
  } catch {
    passkeys = [];
  }

  try {
    config = await readAuthConfig(source);
  } catch {
    config = [];
  }

  for (const user of users) {
    await upsertUser(input.target, user);
  }

  for (const credential of passkeys) {
    await upsertPasskeyCredential(input.target, credential);
  }

  for (const row of config) {
    await upsertConfig(input.target, row);
  }

  return {
    users: users.length,
    passkeys: passkeys.length,
    configKeys: config.length,
  };
}

export async function createAuthPushTarget(input: {
  local: boolean;
  databaseBinding?: string;
}): Promise<AuthPushTarget> {
  if (input.local) {
    const { resolveLocalWranglerD1SqlitePath } = await import(
      "../storage/wrangler-config"
    );
    const sqlitePath = resolveLocalWranglerD1SqlitePath();

    if (!sqlitePath) {
      throw new Error(
        "Local wrangler D1 database was not found. Run `npm run db:migrate:local` first.",
      );
    }

    return {
      local: true,
      sqlite: createClient({ url: `file:${sqlitePath}` }),
    };
  }

  const d1 = await createRemoteD1Database(
    input.databaseBinding ?? process.env.ARIA_D1_BINDING ?? "aria_db",
    { remote: true },
  );

  return {
    local: false,
    d1,
  };
}

export function assertRemoteAuthPushAllowed(): void {
  if (process.env.I_UNDERSTAND_AUTH_PUSH === "1") {
    return;
  }

  throw new Error(
    "Refusing to push auth users to remote D1 without I_UNDERSTAND_AUTH_PUSH=1. " +
      "Create production users via /admin/setup instead, or set the env var if you intend to overwrite remote accounts.",
  );
}
