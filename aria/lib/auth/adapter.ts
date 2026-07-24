/**
 * Defines the contract for authentication storage operations. Implemented
 * by LibSQLAdapter (local) and CloudflareAdapter (D1 + KV).
 */

import type {
  User,
  UserRecord,
  Session,
  SessionUser,
  UserRole,
  UserPermissionProfile,
  AuthMethod,
  AuthEvent,
  AuthEventQuery,
  NewAuthEvent,
  NewPasskeyCredential,
  NewWebauthnChallenge,
  PasskeyCredential,
  WebauthnChallenge,
} from "./types";

/**
 * AuthAdapter - Abstract interface for auth storage operations All methods
 * are async to support both SQLite and D1/KV backends.
 */
export interface AuthAdapter {

  /**
   * Get user by ID
   * @returns User without password hash, or null if not found
   */
  getUserById(id: string): Promise<User | null>;

  /**
   * Get user by username (for login)
   * @returns Full user record including password hash, or null if not found
   */
  getUserByUsername(username: string): Promise<UserRecord | null>;

  /**
   * Get user by email (for password reset)
   * @returns User without password hash, or null if not found
   */
  getUserByEmail(email: string): Promise<User | null>;

  /**
   * Get user by identifier (email or username) for login
   * Tries to match by email first, then by username.
   * @returns Full user record including password hash, or null if not found
   */
  getUserByIdentifier(identifier: string): Promise<UserRecord | null>;

  /**
   * Create a new user
   * @returns Created user (without password hash)
   */
  createUser(data: {
    id: string;
    username: string;
    name?: string | null;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
    permissionProfile?: UserPermissionProfile;
  }): Promise<User>;

  /**
   * Atomically create the bootstrap user only when the users table is empty.
   * Returns null when another request has already created or claimed a user.
   */
  createFirstUser(data: {
    id: string;
    username: string;
    name?: string | null;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
    permissionProfile?: UserPermissionProfile;
  }): Promise<User | null>;

  /**
   * Update user fields
   * @returns Updated user (without password hash)
   */
  updateUser(
    id: string,
    data: {
      name?: string | null;
      email?: string;
      role?: UserRole;
      passwordHash?: string;
      totpSecret?: string | null;
      totpEnabled?: boolean;
      backupCodes?: string | null;
      backupCodesUsed?: string | null;
      lastLoginAt?: string;
      avatarUrl?: string | null;
      permissionProfile?: UserPermissionProfile | null;
      preferences?: string | null;
    },
  ): Promise<User>;

  /**
   * Delete user by ID
   * Also deletes all associated sessions and password reset tokens (cascade)
   */
  deleteUser(id: string): Promise<void>;

  /**
   * List all users (for admin UI)
   * @returns Array of users without password hashes
   */
  listUsers(): Promise<User[]>;

  /**
   * Count total users (for setup check)
   */
  countUsers(): Promise<number>;

  /**
   * Oldest user by account creation time (stable tie-break on id).
   * Used to resolve the bootstrap administrator when config is missing.
   */
  getOldestUserId(): Promise<string | null>;

  /**
   * Create a new session
   * @param session - Session data including expiry
   * @returns Created session
   */
  createSession(session: {
    id: string;
    userId: string;
    expiresAt: string;
    rememberMe: boolean;
    createdAt: string;
    authMethod?: AuthMethod | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<Session>;

  /**
   * Get session by ID
   * @returns Session if valid (not expired), null otherwise
   */
  getSession(id: string): Promise<Session | null>;

  /**
   * Get user for a valid session
   * Combines session lookup + user fetch for efficiency
   * @returns SessionUser if session is valid, null otherwise
   */
  getSessionUser(sessionId: string): Promise<SessionUser | null>;

  /**
   * Delete session (logout)
   */
  deleteSession(id: string): Promise<void>;

  /**
   * Delete all sessions for a user (logout everywhere)
   */
  deleteUserSessions(userId: string): Promise<void>;

  /**
   * Store a verified passkey credential.
   */
  createPasskeyCredential(
    credential: NewPasskeyCredential,
  ): Promise<PasskeyCredential>;

  /**
   * Look up a passkey by WebAuthn credential ID.
   */
  getPasskeyCredentialByCredentialId(
    credentialId: string,
  ): Promise<PasskeyCredential | null>;

  /**
   * List all passkeys registered to a user.
   */
  listPasskeyCredentials(userId: string): Promise<PasskeyCredential[]>;

  /**
   * List every passkey registered in this workspace.
   */
  listAllPasskeyCredentials(): Promise<PasskeyCredential[]>;

  /**
   * Count passkeys registered to a user.
   */
  countPasskeyCredentials(userId: string): Promise<number>;

  /**
   * Update the authenticator signature counter and last-used timestamp.
   */
  updatePasskeyCredentialUsage(
    credentialId: string,
    data: { counter: number; lastUsedAt: string },
  ): Promise<void>;

  /**
   * Rename a passkey shown in settings.
   */
  renamePasskeyCredential(
    userId: string,
    credentialId: string,
    deviceName: string | null,
  ): Promise<void>;

  /**
   * Delete a passkey credential.
   */
  deletePasskeyCredential(userId: string, credentialId: string): Promise<void>;

  /**
   * Store a short-lived WebAuthn challenge.
   */
  createWebauthnChallenge(challenge: NewWebauthnChallenge): Promise<void>;

  /**
   * Atomically consume a WebAuthn challenge by deleting it after read.
   */
  consumeWebauthnChallenge(id: string): Promise<WebauthnChallenge | null>;

  /**
   * Create an auth audit event. Must not store raw tokens, passwords, or TOTP
   * codes in metadata.
   */
  createAuthEvent(event: NewAuthEvent): Promise<void>;

  /**
   * List auth audit events for admin/session management UI.
   */
  listAuthEvents(query: AuthEventQuery): Promise<AuthEvent[]>;

  // RATE LIMITING & LOCKOUT

  /**
   * Check if IP is rate limited or locked out
   * @returns Object with isLimited boolean, remaining attempts, and lockout info
   */
  checkRateLimit(ip: string): Promise<{
    isLimited: boolean;
    isLockedOut: boolean;
    attempts: number;
    remainingAttempts: number;
    resetAt: string | null;
    lockoutUntil: string | null;
    breachCount: number;
  }>;

  /**
   * Record a failed login attempt
   */
  recordLoginAttempt(ip: string): Promise<void>;

  /**
   * Clear rate limit for IP (on successful login)
   * Does NOT clear lockout breach count - that persists
   */
  clearRateLimit(ip: string): Promise<void>;

  /**
   * Record a rate limit breach (IP hit the limit)
   * Triggers progressive lockout
   */
  recordRateLimitBreach(ip: string): Promise<{
    breachCount: number;
    lockoutUntil: string;
  }>;

  /**
   * Check if IP is currently locked out
   */
  checkLockout(ip: string): Promise<{
    isLockedOut: boolean;
    lockoutUntil: string | null;
    breachCount: number;
  }>;

  /**
   * Create password reset token
   * @returns Token ID (to be sent in email)
   */
  createPasswordReset(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void>;

  /**
   * Get password reset by token hash
   * @returns Reset record if valid (not expired), null otherwise
   */
  getPasswordResetByTokenHash(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: string } | null>;

  /**
   * Delete password reset token (after use or expiry)
   */
  deletePasswordReset(id: string): Promise<void>;

  /**
   * Delete all password reset tokens for a user
   */
  deleteUserPasswordResets(userId: string): Promise<void>;

  /**
   * Get config value by key
   * @returns Parsed config value, or null if not found
   */
  getConfig<T>(key: string): Promise<T | null>;

  /**
   * Set config value
   */
  setConfig<T>(key: string, value: T): Promise<void>;

  /**
   * Delete config value by key
   */
  deleteConfig(key: string): Promise<void>;

  /**
   * Get user's TOTP secret (for verification)
   * @returns TOTP secret if 2FA is enabled, null otherwise
   */
  getTotpSecret(userId: string): Promise<string | null>;

  /**
   * Get user's backup codes
   * @returns Object with hashed codes and used indices
   */
  getBackupCodes(
    userId: string,
  ): Promise<{ codes: string[]; usedIndices: number[] } | null>;

  /**
   * Mark backup code as used
   */
  markBackupCodeUsed(userId: string, codeIndex: number): Promise<void>;

  /**
   * Initialize adapter (create tables if needed)
   * Called once on first use
   */
  initialize(): Promise<void>;
}

/**
 * Result type for operations that might fail
 */
export type AdapterResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * KV namespace interface (for Cloudflare adapter)
 */
export interface KVNamespace {
  get(
    key: string,
    options?: { type?: "text" | "json" },
  ): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * D1 database interface (for Cloudflare adapter)
 * Minimal interface matching the D1 API methods used by the adapter.
 */
export interface D1Database {
  exec(sql: string): Promise<{
    meta: {
      duration: number;
      changes: number;
      last_row_id: number;
      served_by: string;
    };
  }>;
  prepare(sql: string): {
    run(): Promise<{
      meta: {
        duration: number;
        changes: number;
        last_row_id: number;
        served_by: string;
      };
    }>;
  };
}
