/**
 * Shared schema for both LibSQL (local) and D1 (Cloudflare) adapters.
 * Uses SQLite-compatible types that work identically in both environments.
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Users table - stores all authenticated users
 *
 * @field id - UUID primary key
 * @field username - Unique, 3-30 chars, starts with letter
 * @field email - Optional, unique, used for password reset
 * @field passwordHash - PBKDF2 hash in format "salt.hash"
 * @field role - "administrator", "manager", "content-editor", or "contributor"
 * @field totpSecret - Base32 encoded TOTP secret (null if 2FA disabled)
 * @field totpEnabled - Whether 2FA is active
 * @field backupCodes - JSON array of hashed backup codes
 * @field backupCodesUsed - JSON array of used backup code indices
 * @field lastLoginAt - ISO datetime of last successful login
 * @field createdAt - ISO datetime of account creation
 */
export const ariaUsers = sqliteTable("aria_users", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  name: text("name"),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  oauthProvider: text("oauth_provider"),
  oauthId: text("oauth_id"),
  role: text("role", {
    enum: ["administrator", "manager", "content-editor", "contributor"],
  }).notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: integer("totp_enabled", { mode: "boolean" }).default(false),
  backupCodes: text("backup_codes"),
  backupCodesUsed: text("backup_codes_used"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
  avatarUrl: text("avatar_url"),
  permissionProfile: text("permission_profile"),
  preferences: text("preferences"),
});

/**
 * Sessions table - tracks active user sessions In Cloudflare mode, KV is primary
 * for fast lookup with TTL. D1 table is secondary for audit trail.
 */
export const ariaSessions = sqliteTable(
  "aria_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => ariaUsers.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    rememberMe: integer("remember_me", { mode: "boolean" }).default(false),
    createdAt: text("created_at").notNull(),
    authMethod: text("auth_method"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [index("idx_sessions_user").on(table.userId)],
);

export const ariaPasskeyCredentials = sqliteTable(
  "aria_passkey_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => ariaUsers.id, { onDelete: "cascade" }),
    credentialId: text("credential_id").unique().notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceName: text("device_name"),
    transports: text("transports"),
    backedUp: integer("backed_up", { mode: "boolean" }).default(false),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at"),
  },
  (table) => [index("idx_passkey_user").on(table.userId)],
);

export const ariaAuthTokens = sqliteTable(
  "aria_auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => ariaUsers.id, { onDelete: "cascade" }),
    purpose: text("purpose", {
      enum: ["password_reset", "login", "invite", "email_verify"],
    }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [
    index("idx_auth_tokens_user").on(table.userId),
    index("idx_auth_tokens_hash").on(table.tokenHash),
  ],
);

export const ariaAuthEvents = sqliteTable(
  "aria_auth_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => ariaUsers.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    authMethod: text("auth_method"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    success: integer("success", { mode: "boolean" }).notNull().default(false),
    metadata: text("metadata"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_auth_events_user_created").on(
      table.userId,
      table.createdAt,
    ),
    index("idx_auth_events_created").on(table.createdAt),
  ],
);

export const ariaWebauthnChallenges = sqliteTable(
  "aria_webauthn_challenges",
  {
    id: text("id").primaryKey(),
    challenge: text("challenge").notNull(),
    purpose: text("purpose", { enum: ["register", "login"] }).notNull(),
    userId: text("user_id").references(() => ariaUsers.id, {
      onDelete: "cascade",
    }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_webauthn_challenges_expires").on(table.expiresAt)],
);

/**
 * Config table - key-value store for auth settings
 *
 * Used for CAPTCHA configuration and other auth settings.
 *
 * @field key - Config key (e.g., "captcha_config")
 * @field value - JSON-encoded config value
 * @field updatedAt - ISO datetime of last update
 */
export const ariaConfig = sqliteTable("aria_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// LOGIN ATTEMPTS TABLE (Rate Limiting)

/**
 * Login attempts table - tracks failed login attempts by IP
 *
 * Used for rate limiting: 10 attempts per 20 minutes.
 *
 * @field ip - IP address (primary key)
 * @field attempts - Number of failed attempts in current window
 * @field lastAttempt - ISO datetime of last attempt
 */
export const ariaLoginAttempts = sqliteTable("aria_login_attempts", {
  ip: text("ip").primaryKey(),
  attempts: integer("attempts").default(0),
  lastAttempt: text("last_attempt").notNull(),
});

/**
 * Password resets table - stores password reset tokens
 *
 * Tokens expire after 1 hour.
 *
 * @field id - UUID primary key
 * @field userId - FK to aria_users
 * @field tokenHash - SHA-256 hash of the reset token
 * @field expiresAt - ISO datetime when token expires (1 hour from creation)
 * @field createdAt - ISO datetime of token creation
 */
export const ariaPasswordResets = sqliteTable(
  "aria_password_resets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => ariaUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_password_resets_user").on(table.userId)],
);

/**
 * Inferred types from Drizzle schema
 */
export type AriaUser = typeof ariaUsers.$inferSelect;
export type NewAriaUser = typeof ariaUsers.$inferInsert;

export type AriaSession = typeof ariaSessions.$inferSelect;
export type NewAriaSession = typeof ariaSessions.$inferInsert;

export type AriaConfig = typeof ariaConfig.$inferSelect;
export type NewAriaConfig = typeof ariaConfig.$inferInsert;

export type AriaLoginAttempt = typeof ariaLoginAttempts.$inferSelect;
export type NewAriaLoginAttempt = typeof ariaLoginAttempts.$inferInsert;

export type AriaPasswordReset = typeof ariaPasswordResets.$inferSelect;
export type NewAriaPasswordReset = typeof ariaPasswordResets.$inferInsert;

export type AriaPasskeyCredential = typeof ariaPasskeyCredentials.$inferSelect;
export type NewAriaPasskeyCredential =
  typeof ariaPasskeyCredentials.$inferInsert;

export type AriaAuthToken = typeof ariaAuthTokens.$inferSelect;
export type NewAriaAuthToken = typeof ariaAuthTokens.$inferInsert;

export type AriaAuthEvent = typeof ariaAuthEvents.$inferSelect;
export type NewAriaAuthEvent = typeof ariaAuthEvents.$inferInsert;

export type AriaWebauthnChallenge = typeof ariaWebauthnChallenges.$inferSelect;
export type NewAriaWebauthnChallenge =
  typeof ariaWebauthnChallenges.$inferInsert;
