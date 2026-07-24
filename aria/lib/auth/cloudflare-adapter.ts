/**
 * Counters; KV is reserved for TTL-backed session lookups.
 */

import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { AuthAdapter, D1Database, KVNamespace } from "./adapter";
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
import {
  AuthEventSchema,
  PasskeyCredentialSchema,
  RATE_LIMIT,
  WebauthnChallengeSchema,
} from "./types";
import { parsePermissionProfileFromStorage } from "../authorship/stamping";
import {
  ariaUsers,
  ariaSessions,
  ariaConfig,
  ariaLoginAttempts,
  ariaPasswordResets,
  ariaAuthEvents,
  ariaPasskeyCredentials,
  ariaWebauthnChallenges,
} from "./schema";
import type * as schema from "./schema";
import { sessionKey, isExpired, now, getSessionTtlSeconds } from "./session";
import { bootstrapAuthUsersSchema } from "./adapterBootstrap";
import { parseUserPreferences } from "../schemas/userPreferences";

/**
 * CloudflareAdapter - D1 + KV implementation of AuthAdapter
 *
 * Uses KV for sessions (with TTL) and D1 for users, security counters,
 * config, and password resets.
 */
function normalizeRole(role: string): UserRole {
  const legacyMap: Record<string, UserRole> = {
    admin: "administrator",
    editor: "content-editor",
  };
  return legacyMap[role] ?? (role as UserRole);
}

async function hashRateLimitSubject(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(subject),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export class CloudflareAdapter implements AuthAdapter {
  private db: DrizzleD1Database<typeof schema>;
  private d1: D1Database;
  private kv: KVNamespace;
  private initialized = false;

  constructor(
    db: DrizzleD1Database<typeof schema>,
    d1: D1Database,
    kv: KVNamespace,
  ) {
    this.db = db;
    this.d1 = d1;
    this.kv = kv;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await bootstrapAuthUsersSchema({
      execute: async (sql) => {
        await this.d1.prepare(sql).run();
      },
      getUsersTableSql: async () => {
        const [row] = await this.db.all<{ sql: string | null }>(
          sql`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'`,
        );
        return row?.sql ?? null;
      },
    });

    this.initialized = true;
  }

  async getUserById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select({
        id: ariaUsers.id,
        username: ariaUsers.username,
        name: ariaUsers.name,
        email: ariaUsers.email,
        role: ariaUsers.role,
        totpEnabled: ariaUsers.totpEnabled,
        lastLoginAt: ariaUsers.lastLoginAt,
        createdAt: ariaUsers.createdAt,
        avatarUrl: ariaUsers.avatarUrl,
        permissionProfile: ariaUsers.permissionProfile,
        preferences: ariaUsers.preferences,
      })
      .from(ariaUsers)
      .where(eq(ariaUsers.id, id))
      .limit(1);

    return user ? this.mapToUser(user) : null;
  }

  async getUserByUsername(username: string): Promise<UserRecord | null> {
    const [user] = await this.db
      .select()
      .from(ariaUsers)
      .where(eq(ariaUsers.username, username))
      .limit(1);

    return user ? this.mapToUserRecord(user) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select({
        id: ariaUsers.id,
        username: ariaUsers.username,
        name: ariaUsers.name,
        email: ariaUsers.email,
        role: ariaUsers.role,
        totpEnabled: ariaUsers.totpEnabled,
        lastLoginAt: ariaUsers.lastLoginAt,
        createdAt: ariaUsers.createdAt,
        avatarUrl: ariaUsers.avatarUrl,
        permissionProfile: ariaUsers.permissionProfile,
        preferences: ariaUsers.preferences,
      })
      .from(ariaUsers)
      .where(eq(ariaUsers.email, email))
      .limit(1);

    return user ? this.mapToUser(user) : null;
  }

  async getUserByIdentifier(identifier: string): Promise<UserRecord | null> {
    // Try to find user by email or username
    const [user] = await this.db
      .select()
      .from(ariaUsers)
      .where(
        or(eq(ariaUsers.email, identifier), eq(ariaUsers.username, identifier)),
      )
      .limit(1);

    return user ? this.mapToUserRecord(user) : null;
  }

  async createUser(data: {
    id: string;
    username: string;
    name?: string | null;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
    permissionProfile?: UserPermissionProfile;
  }): Promise<User> {
    await this.db.insert(ariaUsers).values({
      id: data.id,
      username: data.username,
      name: data.name ?? undefined,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
      createdAt: data.createdAt,
      permissionProfile: data.permissionProfile
        ? JSON.stringify(data.permissionProfile)
        : null,
    });

    const user = await this.getUserById(data.id);
    if (!user) throw new Error("Failed to create user");
    return user;
  }

  async createFirstUser(data: {
    id: string;
    username: string;
    name?: string | null;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: string;
    permissionProfile?: UserPermissionProfile;
  }): Promise<User | null> {
    if (data.name == null) {
      const rows = await this.db.all<{ id: string }>(sql`
        INSERT INTO aria_users
          (id, username, email, password_hash, role, created_at, permission_profile)
        SELECT
          ${data.id},
          ${data.username},
          ${data.email},
          ${data.passwordHash},
          ${data.role},
          ${data.createdAt},
          ${data.permissionProfile ? JSON.stringify(data.permissionProfile) : null}
        WHERE NOT EXISTS (SELECT 1 FROM aria_users LIMIT 1)
        RETURNING id
      `);

      if (rows.length === 0) return null;
      return this.getUserById(data.id);
    }

    const rows = await this.db.all<{ id: string }>(sql`
      INSERT INTO aria_users
        (id, username, name, email, password_hash, role, created_at, permission_profile)
      SELECT
        ${data.id},
        ${data.username},
        ${data.name ?? null},
        ${data.email},
        ${data.passwordHash},
        ${data.role},
        ${data.createdAt},
        ${data.permissionProfile ? JSON.stringify(data.permissionProfile) : null}
      WHERE NOT EXISTS (SELECT 1 FROM aria_users LIMIT 1)
      RETURNING id
    `);

    if (rows.length === 0) return null;
    return this.getUserById(data.id);
  }

  async updateUser(
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
  ): Promise<User> {
    const updates: Record<string, string | boolean | null> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.email !== undefined) updates.email = data.email;
    if (data.role !== undefined) updates.role = data.role;
    if (data.passwordHash !== undefined)
      updates.passwordHash = data.passwordHash;
    if (data.totpSecret !== undefined) updates.totpSecret = data.totpSecret;
    if (data.totpEnabled !== undefined) updates.totpEnabled = data.totpEnabled;
    if (data.backupCodes !== undefined) updates.backupCodes = data.backupCodes;
    if (data.backupCodesUsed !== undefined)
      updates.backupCodesUsed = data.backupCodesUsed;
    if (data.lastLoginAt !== undefined) updates.lastLoginAt = data.lastLoginAt;
    if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl;
    if (data.permissionProfile !== undefined) {
      updates.permissionProfile = data.permissionProfile
        ? JSON.stringify(data.permissionProfile)
        : null;
    }
    if (data.preferences !== undefined) {
      updates.preferences = data.preferences;
    }

    if (Object.keys(updates).length > 0) {
      await this.db.update(ariaUsers).set(updates).where(eq(ariaUsers.id, id));
    }

    const user = await this.getUserById(id);
    if (!user) throw new Error("User not found");
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Delete user sessions from KV
    await this.deleteUserSessions(id);
    // Delete from D1 (cascades to sessions table, password resets)
    await this.db.delete(ariaUsers).where(eq(ariaUsers.id, id));
  }

  async listUsers(): Promise<User[]> {
    const users = await this.db
      .select({
        id: ariaUsers.id,
        username: ariaUsers.username,
        name: ariaUsers.name,
        email: ariaUsers.email,
        role: ariaUsers.role,
        totpEnabled: ariaUsers.totpEnabled,
        lastLoginAt: ariaUsers.lastLoginAt,
        createdAt: ariaUsers.createdAt,
        avatarUrl: ariaUsers.avatarUrl,
        permissionProfile: ariaUsers.permissionProfile,
        preferences: ariaUsers.preferences,
      })
      .from(ariaUsers)
      .orderBy(ariaUsers.createdAt);

    return users.map((u) => this.mapToUser(u));
  }

  async countUsers(): Promise<number> {
    // SELECT COUNT(*) is dramatically cheaper than streaming every user row
    // back from D1 (this runs in middleware on every admin request).
    const [row] = await this.db.select({ value: count() }).from(ariaUsers);
    return row?.value ?? 0;
  }

  async getOldestUserId(): Promise<string | null> {
    const [row] = await this.db
      .select({ id: ariaUsers.id })
      .from(ariaUsers)
      .orderBy(asc(ariaUsers.createdAt), asc(ariaUsers.id))
      .limit(1);

    return row?.id ?? null;
  }

  // SESSION OPERATIONS (KV-based with D1 audit)

  async createSession(session: {
    id: string;
    userId: string;
    expiresAt: string;
    rememberMe: boolean;
    createdAt: string;
    authMethod?: AuthMethod | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<Session> {
    const sessionData: Session = {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      rememberMe: session.rememberMe,
      createdAt: session.createdAt,
      authMethod: session.authMethod ?? null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    };

    // Store in KV with TTL
    const ttl = getSessionTtlSeconds(session.rememberMe);
    await this.kv.put(sessionKey(session.id), JSON.stringify(sessionData), {
      expirationTtl: ttl,
    });

    // Also store in D1 for audit trail
    await this.db.insert(ariaSessions).values({
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      rememberMe: session.rememberMe,
      createdAt: session.createdAt,
      authMethod: session.authMethod ?? null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    });

    return sessionData;
  }

  async getSession(id: string): Promise<Session | null> {
    // KV is primary (fast, handles TTL)
    const data = await this.kv.get(sessionKey(id));
    if (!data) return null;

    try {
      const session = JSON.parse(data) as Session;
      // Double-check expiry (shouldn't be needed with TTL, but safe)
      if (isExpired(session.expiresAt)) {
        await this.deleteSession(id);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  async getSessionUser(sessionId: string): Promise<SessionUser | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const [user] = await this.db
      .select({
        id: ariaUsers.id,
        username: ariaUsers.username,
        name: ariaUsers.name,
        email: ariaUsers.email,
        role: ariaUsers.role,
        totpEnabled: ariaUsers.totpEnabled,
        avatarUrl: ariaUsers.avatarUrl,
        permissionProfile: ariaUsers.permissionProfile,
        preferences: ariaUsers.preferences,
      })
      .from(ariaUsers)
      .where(eq(ariaUsers.id, session.userId))
      .limit(1);

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      name: user.name ?? null,
      email: user.email,
      role: normalizeRole(user.role),
      permissionProfile: parsePermissionProfileFromStorage(
        user.permissionProfile,
      ),
      totpEnabled: user.totpEnabled ?? false,
      avatarUrl: user.avatarUrl ?? null,
      preferences: parseUserPreferences(user.preferences),
    };
  }

  async deleteSession(id: string): Promise<void> {
    // Delete from KV
    await this.kv.delete(sessionKey(id));
    // Delete from D1
    await this.db.delete(ariaSessions).where(eq(ariaSessions.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    // Get all sessions for user from D1
    const sessions = await this.db
      .select({ id: ariaSessions.id })
      .from(ariaSessions)
      .where(eq(ariaSessions.userId, userId));

    // Delete each from KV
    for (const session of sessions) {
      await this.kv.delete(sessionKey(session.id));
    }

    // Delete from D1
    await this.db.delete(ariaSessions).where(eq(ariaSessions.userId, userId));
  }

  async createPasskeyCredential(
    credential: NewPasskeyCredential,
  ): Promise<PasskeyCredential> {
    await this.db.insert(ariaPasskeyCredentials).values({
      id: credential.id,
      userId: credential.userId,
      credentialId: credential.credentialId,
      publicKey: credential.publicKey,
      counter: credential.counter,
      deviceName: credential.deviceName ?? null,
      transports: JSON.stringify(credential.transports),
      backedUp: credential.backedUp,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt ?? null,
    });

    return credential;
  }

  async getPasskeyCredentialByCredentialId(
    credentialId: string,
  ): Promise<PasskeyCredential | null> {
    const [credential] = await this.db
      .select()
      .from(ariaPasskeyCredentials)
      .where(eq(ariaPasskeyCredentials.credentialId, credentialId))
      .limit(1);

    return credential ? this.mapToPasskeyCredential(credential) : null;
  }

  async listPasskeyCredentials(userId: string): Promise<PasskeyCredential[]> {
    const credentials = await this.db
      .select()
      .from(ariaPasskeyCredentials)
      .where(eq(ariaPasskeyCredentials.userId, userId))
      .orderBy(desc(ariaPasskeyCredentials.createdAt));

    return credentials.map((credential) =>
      this.mapToPasskeyCredential(credential),
    );
  }

  async listAllPasskeyCredentials(): Promise<PasskeyCredential[]> {
    const credentials = await this.db
      .select()
      .from(ariaPasskeyCredentials)
      .orderBy(desc(ariaPasskeyCredentials.createdAt));

    return credentials.map((credential) =>
      this.mapToPasskeyCredential(credential),
    );
  }

  async countPasskeyCredentials(userId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(ariaPasskeyCredentials)
      .where(eq(ariaPasskeyCredentials.userId, userId));

    return result?.count ?? 0;
  }

  async updatePasskeyCredentialUsage(
    credentialId: string,
    data: { counter: number; lastUsedAt: string },
  ): Promise<void> {
    await this.db
      .update(ariaPasskeyCredentials)
      .set({ counter: data.counter, lastUsedAt: data.lastUsedAt })
      .where(eq(ariaPasskeyCredentials.credentialId, credentialId));
  }

  async renamePasskeyCredential(
    userId: string,
    credentialId: string,
    deviceName: string | null,
  ): Promise<void> {
    await this.db
      .update(ariaPasskeyCredentials)
      .set({ deviceName })
      .where(
        and(
          eq(ariaPasskeyCredentials.userId, userId),
          eq(ariaPasskeyCredentials.credentialId, credentialId),
        ),
      );
  }

  async deletePasskeyCredential(
    userId: string,
    credentialId: string,
  ): Promise<void> {
    await this.db
      .delete(ariaPasskeyCredentials)
      .where(
        and(
          eq(ariaPasskeyCredentials.userId, userId),
          eq(ariaPasskeyCredentials.credentialId, credentialId),
        ),
      );
  }

  async createWebauthnChallenge(
    challenge: NewWebauthnChallenge,
  ): Promise<void> {
    await this.db.insert(ariaWebauthnChallenges).values({
      id: challenge.id,
      challenge: challenge.challenge,
      purpose: challenge.purpose,
      userId: challenge.userId ?? null,
      expiresAt: challenge.expiresAt,
      createdAt: challenge.createdAt,
    });
  }

  async consumeWebauthnChallenge(
    id: string,
  ): Promise<WebauthnChallenge | null> {
    const [challenge] = await this.db
      .select()
      .from(ariaWebauthnChallenges)
      .where(eq(ariaWebauthnChallenges.id, id))
      .limit(1);

    if (!challenge) return null;

    await this.db
      .delete(ariaWebauthnChallenges)
      .where(eq(ariaWebauthnChallenges.id, id));

    if (isExpired(challenge.expiresAt)) return null;

    return this.mapToWebauthnChallenge(challenge);
  }

  async createAuthEvent(event: NewAuthEvent): Promise<void> {
    await this.db.insert(ariaAuthEvents).values({
      id: crypto.randomUUID(),
      userId: event.userId,
      eventType: event.eventType,
      authMethod: event.authMethod,
      ip: event.ip,
      userAgent: event.userAgent,
      success: event.success,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      createdAt: now(),
    });
  }

  async listAuthEvents(query: AuthEventQuery): Promise<AuthEvent[]> {
    const conditions: SQL[] = [];
    if (query.userId) conditions.push(eq(ariaAuthEvents.userId, query.userId));
    if (query.eventType) {
      conditions.push(eq(ariaAuthEvents.eventType, query.eventType));
    }
    if (query.authMethod) {
      conditions.push(eq(ariaAuthEvents.authMethod, query.authMethod));
    }
    if (query.success !== undefined) {
      conditions.push(eq(ariaAuthEvents.success, query.success));
    }

    const rows = await this.db
      .select()
      .from(ariaAuthEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ariaAuthEvents.createdAt))
      .limit(query.limit);

    return rows.map((row) => this.mapToAuthEvent(row));
  }

  // RATE LIMITING & LOCKOUT (D1-backed)

  async checkRateLimit(ip: string): Promise<{
    isLimited: boolean;
    isLockedOut: boolean;
    attempts: number;
    remainingAttempts: number;
    resetAt: string | null;
    lockoutUntil: string | null;
    breachCount: number;
  }> {
    const lockout = await this.checkLockout(ip);
    if (lockout.isLockedOut) {
      return {
        isLimited: true,
        isLockedOut: true,
        attempts: RATE_LIMIT.MAX_ATTEMPTS,
        remainingAttempts: 0,
        resetAt: lockout.lockoutUntil,
        lockoutUntil: lockout.lockoutUntil,
        breachCount: lockout.breachCount,
      };
    }

    const [record] = await this.db
      .select()
      .from(ariaLoginAttempts)
      .where(eq(ariaLoginAttempts.ip, ip))
      .limit(1);

    if (!record) {
      return {
        isLimited: false,
        isLockedOut: false,
        attempts: 0,
        remainingAttempts: RATE_LIMIT.MAX_ATTEMPTS,
        resetAt: null,
        lockoutUntil: null,
        breachCount: lockout.breachCount,
      };
    }

    const lastAttemptAt = new Date(record.lastAttempt).getTime();
    const resetAt = lastAttemptAt + RATE_LIMIT.WINDOW_MS;
    if (resetAt <= Date.now()) {
      return {
        isLimited: false,
        isLockedOut: false,
        attempts: 0,
        remainingAttempts: RATE_LIMIT.MAX_ATTEMPTS,
        resetAt: null,
        lockoutUntil: null,
        breachCount: lockout.breachCount,
      };
    }

    const attempts = record.attempts ?? 0;
    return {
      isLimited: attempts >= RATE_LIMIT.MAX_ATTEMPTS,
      isLockedOut: false,
      attempts,
      remainingAttempts: Math.max(0, RATE_LIMIT.MAX_ATTEMPTS - attempts),
      resetAt: new Date(resetAt).toISOString(),
      lockoutUntil: null,
      breachCount: lockout.breachCount,
    };
  }

  async recordLoginAttempt(ip: string): Promise<void> {
    const currentTime = now();
    const windowStart = new Date(
      Date.now() - RATE_LIMIT.WINDOW_MS,
    ).toISOString();
    await this.db.all(sql`
      INSERT INTO aria_login_attempts (ip, attempts, last_attempt)
      VALUES (${ip}, 1, ${currentTime})
      ON CONFLICT(ip) DO UPDATE SET
        attempts = CASE
          WHEN aria_login_attempts.last_attempt <= ${windowStart} THEN 1
          ELSE aria_login_attempts.attempts + 1
        END,
        last_attempt = ${currentTime}
    `);
  }

  async clearRateLimit(ip: string): Promise<void> {
    // Only clear the attempt counter, not the lockout
    await this.db.delete(ariaLoginAttempts).where(eq(ariaLoginAttempts.ip, ip));
  }

  async recordRateLimitBreach(ip: string): Promise<{
    breachCount: number;
    lockoutUntil: string;
  }> {
    const subjectHash = await hashRateLimitSubject(ip);
    const nowMs = Date.now();
    const maxLockoutDuration =
      RATE_LIMIT.LOCKOUT_THRESHOLDS[RATE_LIMIT.LOCKOUT_THRESHOLDS.length - 1]
        .duration;
    const resetWindowStart = nowMs - maxLockoutDuration;
    const [record] = await this.db.all<{ count: number }>(sql`
      INSERT INTO aria_rate_limits (scope, subject_hash, count, reset_at)
      VALUES ('auth-lockout', ${subjectHash}, 1, ${nowMs})
      ON CONFLICT(scope, subject_hash) DO UPDATE SET
        count = CASE
          WHEN aria_rate_limits.reset_at <= ${resetWindowStart} THEN 1
          ELSE aria_rate_limits.count + 1
        END,
        reset_at = ${nowMs}
      RETURNING count
    `);
    const breachCount = Number(record?.count ?? 1);

    // Find the appropriate lockout duration based on breach count
    const threshold =
      RATE_LIMIT.LOCKOUT_THRESHOLDS.find((t) => t.breaches >= breachCount) ||
      RATE_LIMIT.LOCKOUT_THRESHOLDS[RATE_LIMIT.LOCKOUT_THRESHOLDS.length - 1];

    const lockoutUntilMs = nowMs + threshold.duration;
    await this.db.all(sql`
      UPDATE aria_rate_limits
      SET reset_at = MAX(reset_at, ${lockoutUntilMs})
      WHERE scope = 'auth-lockout' AND subject_hash = ${subjectHash}
    `);
    const lockoutUntil = new Date(lockoutUntilMs).toISOString();

    return { breachCount, lockoutUntil };
  }

  async checkLockout(ip: string): Promise<{
    isLockedOut: boolean;
    lockoutUntil: string | null;
    breachCount: number;
  }> {
    const subjectHash = await hashRateLimitSubject(ip);
    const [record] = await this.db.all<{
      count: number;
      reset_at: number;
    }>(sql`
      SELECT count, reset_at
      FROM aria_rate_limits
      WHERE scope = 'auth-lockout' AND subject_hash = ${subjectHash}
      LIMIT 1
    `);

    if (!record) {
      return { isLockedOut: false, lockoutUntil: null, breachCount: 0 };
    }

    const lockoutUntilMs = Number(record.reset_at);
    if (lockoutUntilMs > Date.now()) {
      return {
        isLockedOut: true,
        lockoutUntil: new Date(lockoutUntilMs).toISOString(),
        breachCount: Number(record.count),
      };
    }

    return {
      isLockedOut: false,
      lockoutUntil: null,
      breachCount: Number(record.count),
    };
  }

  // PASSWORD RESET (D1-based)

  async createPasswordReset(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
  }): Promise<void> {
    await this.db.insert(ariaPasswordResets).values({
      id: data.id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
    });
  }

  async getPasswordResetByTokenHash(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: string } | null> {
    const [reset] = await this.db
      .select({
        id: ariaPasswordResets.id,
        userId: ariaPasswordResets.userId,
        expiresAt: ariaPasswordResets.expiresAt,
      })
      .from(ariaPasswordResets)
      .where(eq(ariaPasswordResets.tokenHash, tokenHash))
      .limit(1);

    if (!reset) return null;

    if (isExpired(reset.expiresAt)) {
      await this.deletePasswordReset(reset.id);
      return null;
    }

    return reset;
  }

  async deletePasswordReset(id: string): Promise<void> {
    await this.db
      .delete(ariaPasswordResets)
      .where(eq(ariaPasswordResets.id, id));
  }

  async deleteUserPasswordResets(userId: string): Promise<void> {
    await this.db
      .delete(ariaPasswordResets)
      .where(eq(ariaPasswordResets.userId, userId));
  }

  // CONFIG OPERATIONS (D1-based)

  async getConfig<T>(key: string): Promise<T | null> {
    const [config] = await this.db
      .select()
      .from(ariaConfig)
      .where(eq(ariaConfig.key, key))
      .limit(1);

    if (!config) return null;

    try {
      return JSON.parse(config.value) as T;
    } catch {
      return null;
    }
  }

  async setConfig<T>(key: string, value: T): Promise<void> {
    const jsonValue = JSON.stringify(value);
    const currentTime = now();

    const [existing] = await this.db
      .select()
      .from(ariaConfig)
      .where(eq(ariaConfig.key, key))
      .limit(1);

    if (existing) {
      await this.db
        .update(ariaConfig)
        .set({ value: jsonValue, updatedAt: currentTime })
        .where(eq(ariaConfig.key, key));
    } else {
      await this.db.insert(ariaConfig).values({
        key,
        value: jsonValue,
        updatedAt: currentTime,
      });
    }
  }

  async deleteConfig(key: string): Promise<void> {
    await this.db.delete(ariaConfig).where(eq(ariaConfig.key, key));
  }

  async getTotpSecret(userId: string): Promise<string | null> {
    const [user] = await this.db
      .select({
        totpSecret: ariaUsers.totpSecret,
        totpEnabled: ariaUsers.totpEnabled,
      })
      .from(ariaUsers)
      .where(eq(ariaUsers.id, userId))
      .limit(1);

    if (!user || !user.totpEnabled) return null;
    return user.totpSecret;
  }

  async getBackupCodes(
    userId: string,
  ): Promise<{ codes: string[]; usedIndices: number[] } | null> {
    const [user] = await this.db
      .select({
        backupCodes: ariaUsers.backupCodes,
        backupCodesUsed: ariaUsers.backupCodesUsed,
      })
      .from(ariaUsers)
      .where(eq(ariaUsers.id, userId))
      .limit(1);

    if (!user || !user.backupCodes) return null;

    try {
      const codes = JSON.parse(user.backupCodes) as string[];
      const usedIndices = user.backupCodesUsed
        ? (JSON.parse(user.backupCodesUsed) as number[])
        : [];
      return { codes, usedIndices };
    } catch {
      return null;
    }
  }

  async markBackupCodeUsed(userId: string, codeIndex: number): Promise<void> {
    const backup = await this.getBackupCodes(userId);
    if (!backup) return;

    const usedIndices = [...backup.usedIndices, codeIndex];
    await this.db
      .update(ariaUsers)
      .set({ backupCodesUsed: JSON.stringify(usedIndices) })
      .where(eq(ariaUsers.id, userId));
  }

  private mapToUser(row: {
    id: string;
    username: string;
    name?: string | null;
    email: string | null;
    role: string;
    totpEnabled: boolean | null;
    lastLoginAt: string | null;
    createdAt: string;
    avatarUrl?: string | null;
    permissionProfile: string | null;
    preferences: string | null;
  }): User {
    const preferences = parseUserPreferences(row.preferences);
    return {
      id: row.id,
      username: row.username,
      name: row.name ?? null,
      email: row.email ?? "",
      role: normalizeRole(row.role),
      totpEnabled: row.totpEnabled ?? false,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      avatarUrl: row.avatarUrl ?? null,
      permissionProfile: row.permissionProfile
        ? JSON.parse(row.permissionProfile as string)
        : undefined,
      ...(Object.keys(preferences).length > 0 ? { preferences } : {}),
    };
  }

  private mapToAuthEvent(row: typeof ariaAuthEvents.$inferSelect): AuthEvent {
    const metadata = row.metadata
      ? (JSON.parse(row.metadata) as Record<string, unknown>)
      : null;

    return AuthEventSchema.parse({
      id: row.id,
      userId: row.userId,
      eventType: row.eventType,
      authMethod: row.authMethod,
      ip: row.ip,
      userAgent: row.userAgent,
      success: row.success,
      metadata,
      createdAt: row.createdAt,
    });
  }

  private mapToPasskeyCredential(
    row: typeof ariaPasskeyCredentials.$inferSelect,
  ): PasskeyCredential {
    return PasskeyCredentialSchema.parse({
      id: row.id,
      userId: row.userId,
      credentialId: row.credentialId,
      publicKey: row.publicKey,
      counter: row.counter,
      deviceName: row.deviceName,
      transports: row.transports,
      backedUp: row.backedUp ?? false,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    });
  }

  private mapToWebauthnChallenge(
    row: typeof ariaWebauthnChallenges.$inferSelect,
  ): WebauthnChallenge {
    return WebauthnChallengeSchema.parse({
      id: row.id,
      challenge: row.challenge,
      purpose: row.purpose,
      userId: row.userId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  }

  private mapToUserRecord(row: typeof ariaUsers.$inferSelect): UserRecord {
    const preferences = parseUserPreferences(row.preferences);
    return {
      id: row.id,
      username: row.username,
      name: row.name ?? null,
      email: row.email ?? "",
      role: normalizeRole(row.role),
      totpEnabled: row.totpEnabled ?? false,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      avatarUrl: row.avatarUrl ?? null,
      permissionProfile: row.permissionProfile
        ? JSON.parse(row.permissionProfile as string)
        : undefined,
      ...(Object.keys(preferences).length > 0 ? { preferences } : {}),
      passwordHash: row.passwordHash,
      totpSecret: row.totpSecret,
      backupCodes: row.backupCodes,
      backupCodesUsed: row.backupCodesUsed,
    };
  }
}
