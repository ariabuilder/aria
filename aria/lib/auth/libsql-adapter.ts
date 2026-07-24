/**
 * Uses LibSQL (@libsql/client) with Drizzle ORM for
 * local development. All data stored in aria/storage/aria.
 */

import { and, asc, count, desc, eq, or, type SQL } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type { Client, InStatement } from "@libsql/client";
import type { AuthAdapter } from "./adapter";
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
import { isExpired, now } from "./session";
import { log } from "../utils/logger";
import { bootstrapAuthUsersSchema } from "./adapterBootstrap";
import { parseUserPreferences } from "../schemas/userPreferences";
import { runPendingStorageMigrations } from "../storage/runStorageMigrations";

/**
 * LibSQLAdapter - Local SQLite implementation of AuthAdapter Uses SQLite
 * for all storage (users, sessions, rate limiting, config). Sessions.
 */
export class LibSQLAdapter implements AuthAdapter {
  private db: LibSQLDatabase<typeof schema>;
  private client: Client;
  private initialized = false;

  constructor(db: LibSQLDatabase<typeof schema>, client: Client) {
    this.db = db;
    this.client = client;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Auto-create tables if they don't exist (local dev convenience)
    try {
      // Check if tables exist by attempting a simple query
      await this.db.select().from(ariaUsers).limit(1);
      console.log("[LibSQLAdapter] Auth tables found");
    } catch (error) {
      // Tables don't exist - initialize through the canonical migration runner
      // so StorageAdapter sees the same migration ledger later in this process.
      try {
        await runPendingStorageMigrations({
          executeMultiple: (sql) => this.client.executeMultiple(sql),
          execute: async (sql, args = []) => {
            const result = await this.client.execute({
              sql,
              args: args as never[],
            });
            return { rows: result.rows };
          },
        });

        console.log("[LibSQLAdapter] Canonical schema created successfully");
      } catch (initError) {
        log("error", "[LibSQLAdapter] Failed to initialize database", {
          error:
            initError instanceof Error ? initError.message : String(initError),
        });
        throw new Error("Failed to initialize auth database");
      }
    }

    // Ensure additive columns and migrate legacy admin/editor role constraints.
    await bootstrapAuthUsersSchema({
      execute: async (sql) => {
        await this.client.executeMultiple(sql);
      },
      executeMultiple: async (sql) => {
        await this.client.executeMultiple(sql);
      },
      getUsersTableSql: async () => {
        const result = await this.client.execute({
          sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'aria_users'",
        } as InStatement);
        const row = result.rows[0] as { sql?: string } | undefined;
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
      const result = await this.client.execute({
        sql: `INSERT INTO aria_users
          (id, username, email, password_hash, role, created_at, permission_profile)
          SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM aria_users LIMIT 1)
          RETURNING id`,
        args: [
          data.id,
          data.username,
          data.email,
          data.passwordHash,
          data.role,
          data.createdAt,
          data.permissionProfile
            ? JSON.stringify(data.permissionProfile)
            : null,
        ],
      });

      if (result.rows.length === 0) return null;
      return this.getUserById(data.id);
    }

    const result = await this.client.execute({
      sql: `INSERT INTO aria_users
        (id, username, name, email, password_hash, role, created_at, permission_profile)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM aria_users LIMIT 1)
        RETURNING id`,
      args: [
        data.id,
        data.username,
        data.name ?? null,
        data.email,
        data.passwordHash,
        data.role,
        data.createdAt,
        data.permissionProfile ? JSON.stringify(data.permissionProfile) : null,
      ],
    });

    if (result.rows.length === 0) return null;
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

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      rememberMe: session.rememberMe,
      createdAt: session.createdAt,
      authMethod: session.authMethod ?? null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    };
  }

  async getSession(id: string): Promise<Session | null> {
    const [session] = await this.db
      .select()
      .from(ariaSessions)
      .where(eq(ariaSessions.id, id))
      .limit(1);

    if (!session) return null;

    if (isExpired(session.expiresAt)) {
      await this.deleteSession(id);
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      expiresAt: session.expiresAt,
      rememberMe: session.rememberMe ?? false,
      createdAt: session.createdAt,
      authMethod: session.authMethod as AuthMethod | null,
      ip: session.ip,
      userAgent: session.userAgent,
    };
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
      role: this.normalizeRole(user.role),
      permissionProfile: parsePermissionProfileFromStorage(
        user.permissionProfile,
      ),
      totpEnabled: user.totpEnabled ?? false,
      avatarUrl: user.avatarUrl ?? null,
      preferences: parseUserPreferences(user.preferences),
    };
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(ariaSessions).where(eq(ariaSessions.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
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

  // RATE LIMITING & LOCKOUT

  // In-memory lockout storage for local dev (persists for process lifetime)
  private static lockoutStore: Map<
    string,
    { breachCount: number; lockoutUntil: string }
  > = new Map();

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

    const lastAttemptTime = new Date(record.lastAttempt).getTime();
    const windowExpiry = lastAttemptTime + RATE_LIMIT.WINDOW_MS;

    // Check if window has expired
    if (Date.now() > windowExpiry) {
      await this.clearRateLimit(ip);
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
    const isLimited = attempts >= RATE_LIMIT.MAX_ATTEMPTS;

    return {
      isLimited,
      isLockedOut: false,
      attempts,
      remainingAttempts: Math.max(0, RATE_LIMIT.MAX_ATTEMPTS - attempts),
      resetAt: new Date(windowExpiry).toISOString(),
      lockoutUntil: null,
      breachCount: lockout.breachCount,
    };
  }

  async recordLoginAttempt(ip: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(ariaLoginAttempts)
      .where(eq(ariaLoginAttempts.ip, ip))
      .limit(1);

    const currentTime = now();

    if (existing) {
      // Check if window expired
      const lastAttemptTime = new Date(existing.lastAttempt).getTime();
      if (Date.now() > lastAttemptTime + RATE_LIMIT.WINDOW_MS) {
        await this.db
          .update(ariaLoginAttempts)
          .set({ attempts: 1, lastAttempt: currentTime })
          .where(eq(ariaLoginAttempts.ip, ip));
      } else {
        await this.db
          .update(ariaLoginAttempts)
          .set({
            attempts: (existing.attempts ?? 0) + 1,
            lastAttempt: currentTime,
          })
          .where(eq(ariaLoginAttempts.ip, ip));
      }
    } else {
      await this.db.insert(ariaLoginAttempts).values({
        ip,
        attempts: 1,
        lastAttempt: currentTime,
      });
    }
  }

  async clearRateLimit(ip: string): Promise<void> {
    // Only clear the attempt counter, not the lockout
    await this.db.delete(ariaLoginAttempts).where(eq(ariaLoginAttempts.ip, ip));
  }

  async recordRateLimitBreach(ip: string): Promise<{
    breachCount: number;
    lockoutUntil: string;
  }> {
    const existing = LibSQLAdapter.lockoutStore.get(ip);
    const breachCount = (existing?.breachCount ?? 0) + 1;

    // Find the appropriate lockout duration based on breach count
    const threshold =
      RATE_LIMIT.LOCKOUT_THRESHOLDS.find((t) => t.breaches >= breachCount) ||
      RATE_LIMIT.LOCKOUT_THRESHOLDS[RATE_LIMIT.LOCKOUT_THRESHOLDS.length - 1];

    const lockoutUntil = new Date(
      Date.now() + threshold.duration,
    ).toISOString();

    LibSQLAdapter.lockoutStore.set(ip, { breachCount, lockoutUntil });

    return { breachCount, lockoutUntil };
  }

  async checkLockout(ip: string): Promise<{
    isLockedOut: boolean;
    lockoutUntil: string | null;
    breachCount: number;
  }> {
    const record = LibSQLAdapter.lockoutStore.get(ip);

    if (!record) {
      return { isLockedOut: false, lockoutUntil: null, breachCount: 0 };
    }

    // Check if lockout is still active
    if (new Date(record.lockoutUntil).getTime() > Date.now()) {
      return {
        isLockedOut: true,
        lockoutUntil: record.lockoutUntil,
        breachCount: record.breachCount,
      };
    }

    // Lockout expired but breach count persists
    return {
      isLockedOut: false,
      lockoutUntil: null,
      breachCount: record.breachCount,
    };
  }

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

  /**
   * Normalize legacy role values to the 4-preset system.
   * Existing databases may still have "admin" or "editor" stored.
   */
  private normalizeRole(role: string): UserRole {
    const legacyMap: Record<string, UserRole> = {
      admin: "administrator",
      editor: "content-editor",
    };
    return legacyMap[role] ?? (role as UserRole);
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

  private mapToUser(row: {
    id: string;
    username: string;
    name: string | null;
    email: string | null;
    role: string;
    totpEnabled: boolean | null;
    lastLoginAt: string | null;
    createdAt: string;
    avatarUrl: string | null;
    permissionProfile: string | null;
    preferences: string | null;
  }): User {
    const preferences = parseUserPreferences(row.preferences);
    return {
      id: row.id,
      username: row.username,
      name: row.name ?? null,
      email: row.email ?? "",
      role: this.normalizeRole(row.role),
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

  private mapToUserRecord(row: typeof ariaUsers.$inferSelect): UserRecord {
    const preferences = parseUserPreferences(row.preferences);
    return {
      id: row.id,
      username: row.username,
      name: row.name ?? null,
      email: row.email ?? "",
      role: this.normalizeRole(row.role),
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
