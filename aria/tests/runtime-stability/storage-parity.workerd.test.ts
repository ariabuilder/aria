import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { StoredStudioPresenceSessionSchema } from "../../lib/storage/adapter";
import { createPageAccessStorageDomain } from "../../lib/storage/internal/domains/pageAccess";
import { createStudioPresenceStorageDomain } from "../../lib/storage/internal/domains/studioPresence";

const PAGE_ID = "runtime-activity-page";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

function requireDatabase(): D1Database {
  const database = env.aria_db;
  if (!database) throw new Error("Runtime stability D1 binding is unavailable");
  return database;
}

function createD1QueryContext(database: D1Database) {
  return {
    async queryFirst<T extends Record<string, unknown>>(
      sql: string,
      args: readonly unknown[] = [],
    ): Promise<T | null> {
      return database.prepare(sql).bind(...args).first<T>();
    },
    async queryAll<T extends Record<string, unknown>>(
      sql: string,
      args: readonly unknown[] = [],
    ): Promise<T[]> {
      const result = await database.prepare(sql).bind(...args).all<T>();
      return result.results;
    },
    async run(sql: string, args: readonly unknown[] = []): Promise<void> {
      await database.prepare(sql).bind(...args).run();
    },
  };
}

function createD1PageActivityDomain(database: D1Database) {
  const query = createD1QueryContext(database);
  return createPageAccessStorageDomain({
    ...query,
    async resolvePageIdentity(idOrSlug: string) {
      if (idOrSlug !== PAGE_ID && idOrSlug !== "runtime-activity") return null;
      return {
        id: PAGE_ID,
        status: "draft",
        systemRole: "standard" as const,
        accessMode: "public" as const,
        draftVersion: "draft-v1",
        publishedVersion: null,
        currentVersion: "draft-v1",
      };
    },
    nowIso: () => new Date(0).toISOString(),
    getPagePolicy: async () => null,
    getPageVersions: async () => [],
  });
}

describe("Cloudflare D1 runtime stability", () => {
  beforeEach(async () => {
    const database = requireDatabase();
    const setupStatements = [
      "DROP TABLE IF EXISTS aria_page_versions",
      "DROP TABLE IF EXISTS aria_page_meta",
      "DROP TABLE IF EXISTS aria_studio_presence_sessions",
      `CREATE TABLE aria_page_meta (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        draft_version TEXT,
        published_version TEXT,
        current_version TEXT NOT NULL,
        status TEXT,
        system_role TEXT,
        access_mode TEXT
      )`,
      `CREATE TABLE aria_page_versions (
        id TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        created_by_id TEXT,
        created_by_username TEXT,
        created_by_email TEXT,
        created_by_avatar_url TEXT,
        activity_metadata TEXT,
        PRIMARY KEY (id, version)
      )`,
      `CREATE INDEX aria_page_versions_activity_idx
        ON aria_page_versions (id, version DESC)`,
      `CREATE TABLE aria_studio_presence_sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT,
        surface TEXT NOT NULL,
        resource_type TEXT,
        resource_id TEXT,
        state TEXT NOT NULL,
        dirty INTEGER NOT NULL,
        connected_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        lease_expires_at INTEGER,
        expires_at INTEGER NOT NULL
      )`,
    ] as const;
    for (const sql of setupStatements) {
      await database.prepare(sql).run();
    }
  });

  it("paginates 10,000 activity revisions inside D1", async () => {
    const database = requireDatabase();
    await database
      .prepare(
        `INSERT INTO aria_page_meta (
           id, slug, draft_version, published_version, current_version,
           status, system_role, access_mode
         ) VALUES (?, ?, ?, NULL, ?, 'draft', 'standard', 'public')`,
      )
      .bind(PAGE_ID, "runtime-activity", "draft-v1", "draft-v1")
      .run();

    const totalRows = 10_000;
    for (let start = 0; start < totalRows; start += 100) {
      const statements: D1Prepare[] = [];
      for (let index = start; index < start + 100; index += 1) {
        const isSystem = index % 10 === 0;
        const isMalformed = index % 15 === 0;
        const version = String(1_000_000 + index).padStart(16, "0");
        statements.push(
          database
            .prepare(
              `INSERT INTO aria_page_versions (
                 id, version, created_at, created_by_id,
                 created_by_username, created_by_email,
                 created_by_avatar_url, activity_metadata
               ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
            )
            .bind(
              PAGE_ID,
              version,
              new Date(index).toISOString(),
              isSystem && !isMalformed ? "system" : USER_ID,
              isSystem && !isMalformed ? "System" : "Activity User",
              "activity@example.com",
              isMalformed
                ? "{malformed"
                : JSON.stringify({
                    action: "page_updated",
                    userId: isSystem ? "system" : USER_ID,
                    userName: isSystem ? "System" : "Activity User",
                    target: "this page",
                  }),
            ),
        );
      }
      await database.batch(statements);
    }

    const activityDomain = createD1PageActivityDomain(database);
    const startedAt = performance.now();
    const page = await activityDomain.getPageActivityPage({
      pageId: PAGE_ID,
      limit: 20,
      offset: 4_000,
    });
    const durationMs = performance.now() - startedAt;

    expect(page.items).toHaveLength(20);
    expect(page.total).toBe(9_334);
    expect(page.items[0]?.version.localeCompare(page.items[19]?.version ?? ""))
      .toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(250);
  });

  it("matches strict presence replay and lease semantics in D1", async () => {
    const database = requireDatabase();
    const presenceDomain = createStudioPresenceStorageDomain(
      createD1QueryContext(database),
    );
    const session = StoredStudioPresenceSessionSchema.parse({
      sessionId: SESSION_ID,
      userId: USER_ID,
      displayName: "Runtime Tester",
      avatarUrl: null,
      surface: "composer",
      resourceType: "page",
      resourceId: PAGE_ID,
      state: "editing",
      dirty: true,
      connectedAt: 100,
      lastActivityAt: 200,
      leaseExpiresAt: 300,
      expiresAt: 400,
    });

    expect(
      await presenceDomain.upsertStudioPresenceSession(session),
    ).toMatchObject({ sessionId: SESSION_ID, state: "editing" });
    expect(
      await presenceDomain.upsertStudioPresenceSession(session),
    ).toBeNull();
    expect(
      (await presenceDomain.listStudioPresenceSessions(350))[0]?.state,
    ).toBe("viewing");
    expect(await presenceDomain.listStudioPresenceSessions(450)).toEqual([]);
  });
});
