import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";

import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { LocalizationStorageConflict } from "../../lib/storage/siteLocalizationStorage";
import { createD1Mock } from "../helpers/d1Mock";

type LocalizationAdapter = Pick<
  SQLiteStorageAdapter,
  | "savePageLocaleDraft"
  | "getPageLocaleMeta"
  | "getPageLocaleRoute"
  | "getLayoutLocaleMeta"
  | "listPageLocaleRecords"
  | "replacePageLocaleRecord"
  | "listLayoutLocaleRecords"
  | "replaceLayoutLocaleRecord"
  | "publishPageLocaleDraft"
  | "unpublishPageLocale"
  | "resolvePublishedPageLocale"
  | "saveLayoutLocaleDraft"
  | "publishLayoutLocaleDraft"
  | "acquireLocaleRouteLease"
  | "releaseLocaleRouteLease"
  | "enqueueCacheInvalidationJob"
  | "claimDueCacheInvalidationJobs"
  | "completeCacheInvalidationJob"
  | "saveSiteSettingsWithInvalidationJobs"
  | "getSiteSettings"
  | "pruneVersionHistory"
  | "deletePageLocale"
  | "deleteLayoutLocale"
>;

const NOW = "2026-07-13T12:00:00.000Z";
const LATER = "2026-07-13T12:05:00.000Z";

let client: Client;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  const sql = await fs.readFile(
    path.resolve(process.cwd(), "aria/migrations/0001_baseline_schema.sql"),
    "utf8",
  );
  await client.executeMultiple(sql);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS aria_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  await client.execute({
    sql: `INSERT INTO aria_schema_migrations (id, applied_at) VALUES (?, ?)`,
    args: ["0001_baseline_schema.sql", NOW],
  });
  await seedCanonicalOwners(client);
});

afterEach(() => client.close());

async function seedCanonicalOwners(db: Client) {
  for (const id of ["about", "team"]) {
    await db.execute({
      sql: `INSERT INTO aria_page_versions (id, version, dsl_json, created_at)
            VALUES (?, 'source-v1', '{}', ?)`,
      args: [id, NOW],
    });
    await db.execute({
      sql: `INSERT INTO aria_page_meta (id, slug, title, status, current_version, updated_at)
            VALUES (?, ?, ?, 'published', 'source-v1', ?)`,
      args: [id, id, id, NOW],
    });
  }
  await db.execute({
    sql: `INSERT INTO aria_layout_versions (id, version, dsl_json, created_at)
          VALUES ('main', 'source-v1', '{}', ?)`,
    args: [NOW],
  });
  await db.execute({
    sql: `INSERT INTO aria_layout_meta (id, name, status, current_version, updated_at)
          VALUES ('main', 'Main', 'published', 'source-v1', ?)`,
    args: [NOW],
  });
}

function pageVersion(pageId: string, version: string, slug: string) {
  return {
    pageId,
    locale: "fr",
    version,
    sourceVersion: "source-v1",
    slug,
    accessPromptTitle: null,
    accessPromptDescription: null,
    seo: {
      title: null,
      description: null,
      canonicalPath: null,
      noindex: false,
      nofollow: false,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
    },
    dsl: { hero: { title: slug } },
    translatedPaths: ["hero.title"],
    sourceManifestHash: "a".repeat(16),
    sourceStructureHash: "b".repeat(16),
    layoutId: null,
    fallbackLayoutVersion: null,
    contentHash: "c".repeat(16),
    createdAt: NOW,
    actor: { id: null, username: null, email: null, avatarUrl: null },
  };
}

function layoutVersion(version: string) {
  return {
    layoutId: "main",
    locale: "fr",
    version,
    sourceVersion: "source-v1",
    dsl: { header: { label: "Bonjour" } },
    translatedPaths: ["header.label"],
    sourceManifestHash: "d".repeat(16),
    sourceStructureHash: "e".repeat(16),
    contentHash: "f".repeat(16),
    createdAt: NOW,
    actor: { id: null, username: null, email: null, avatarUrl: null },
  };
}

function adapters(): Array<{ name: string; adapter: LocalizationAdapter }> {
  return [
    {
      name: "SQLite",
      adapter: new SQLiteStorageAdapter(client, {
        seedStarterLayouts: false,
        seedStarterPages: false,
        seedStarterCms: false,
        seedStarterDesign: false,
        seedStarterSiteSettings: false,
      }),
    },
    {
      name: "D1",
      adapter: new CloudflareStorageAdapter({
        aria_db: createD1Mock(client),
      } as any),
    },
  ];
}

describe("site localization adapter parity", () => {
  it.each(["SQLite", "D1"])(
    "preserves published routes until %s promotes the renamed draft",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;

      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
        publishedAt: NOW,
      });

      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v2", "a-propos-nous"),
        expectedCurrentVersion: "fr-v1",
        updatedAt: LATER,
        route: { pathname: "/a-propos-nous", pathnameKey: "/a-propos-nous" },
      });
      expect(
        (await adapter.resolvePublishedPageLocale("fr", "/a-propos"))?.version
          .version,
      ).toBe("fr-v1");
      expect(
        await adapter.resolvePublishedPageLocale("fr", "/a-propos-nous"),
      ).toBeNull();

      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v2",
        publishedAt: LATER,
      });
      expect(
        await adapter.resolvePublishedPageLocale("fr", "/a-propos"),
      ).toBeNull();
      expect(
        (await adapter.resolvePublishedPageLocale("fr", "/a-propos-nous"))
          ?.version.version,
      ).toBe("fr-v2");
    },
  );

  it.each(["SQLite", "D1"])(
    "rejects stale drafts and locale-scoped route collisions on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await expect(
        adapter.savePageLocaleDraft({
          version: pageVersion("team", "fr-v1", "a-propos"),
          expectedCurrentVersion: null,
          updatedAt: NOW,
          route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
        }),
      ).rejects.toMatchObject({
        code: "ROUTE_CONFLICT",
      } satisfies Partial<LocalizationStorageConflict>);
      await expect(
        adapter.savePageLocaleDraft({
          version: pageVersion("about", "fr-v2", "nouveau"),
          expectedCurrentVersion: null,
          updatedAt: LATER,
          route: { pathname: "/nouveau", pathnameKey: "/nouveau" },
        }),
      ).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      } satisfies Partial<LocalizationStorageConflict>);
    },
  );

  it.each(["SQLite", "D1"])(
    "round-trips complete localized histories and independent route claims on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
        publishedAt: NOW,
      });
      await adapter.savePageLocaleDraft({
        version: { ...pageVersion("about", "fr-v2", "a-propos-nous"), createdAt: LATER },
        expectedCurrentVersion: "fr-v1",
        updatedAt: LATER,
        route: {
          pathname: "/a-propos-nous",
          pathnameKey: "/a-propos-nous",
        },
      });

      const [record] = await adapter.listPageLocaleRecords();
      expect(record).toMatchObject({
        meta: {
          pageId: "about",
          locale: "fr",
          currentVersion: "fr-v2",
          publishedVersion: "fr-v1",
        },
      });
      expect(record.versions.map((version) => version.version)).toEqual([
        "fr-v1",
        "fr-v2",
      ]);
      expect(record.routes).toHaveLength(2);

      await adapter.replacePageLocaleRecord({
        meta: { ...record.meta, pageId: "team" },
        versions: record.versions.map((version) => ({
          ...version,
          pageId: "team",
        })),
        routes: record.routes.map((route) => ({
          ...route,
          pageId: "team",
          pathname: route.pathname.replace("/a-propos", "/equipe"),
          pathnameKey: route.pathnameKey.replace("/a-propos", "/equipe"),
        })),
      });

      expect(await adapter.listPageLocaleRecords()).toHaveLength(2);
      expect(
        (await adapter.resolvePublishedPageLocale("fr", "/equipe"))?.version
          .version,
      ).toBe("fr-v1");

      await adapter.saveLayoutLocaleDraft({
        version: layoutVersion("fr-v1"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
      });
      const [layoutRecord] = await adapter.listLayoutLocaleRecords();
      await adapter.replaceLayoutLocaleRecord(layoutRecord);
      expect(await adapter.listLayoutLocaleRecords()).toEqual([layoutRecord]);
    },
  );

  it.each(["SQLite", "D1"])(
    "suppresses a published child when its localized ancestor is unpublished on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await client.execute({
        sql: `UPDATE aria_page_meta SET parent = 'team' WHERE id = 'about'`,
        args: [],
      });

      await adapter.savePageLocaleDraft({
        version: pageVersion("team", "fr-team-v1", "equipe"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/equipe", pathnameKey: "/equipe" },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "team",
        locale: "fr",
        expectedCurrentVersion: "fr-team-v1",
        publishedAt: NOW,
      });
      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-about-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: {
          pathname: "/equipe/a-propos",
          pathnameKey: "/equipe/a-propos",
        },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-about-v1",
        publishedAt: NOW,
      });

      expect(
        (await adapter.resolvePublishedPageLocale("fr", "/equipe/a-propos"))
          ?.version.version,
      ).toBe("fr-about-v1");

      await adapter.unpublishPageLocale({
        pageId: "team",
        locale: "fr",
        updatedAt: LATER,
      });
      expect(
        await adapter.resolvePublishedPageLocale("fr", "/equipe/a-propos"),
      ).toBeNull();
    },
  );

  it.each(["SQLite", "D1"])(
    "moves descendant draft claims atomically when a parent draft route changes on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await client.execute({
        sql: `UPDATE aria_page_meta SET parent = 'team' WHERE id = 'about'`,
        args: [],
      });
      await adapter.savePageLocaleDraft({
        version: pageVersion("team", "fr-team-v1", "equipe"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/equipe", pathnameKey: "/equipe" },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "team",
        locale: "fr",
        expectedCurrentVersion: "fr-team-v1",
        publishedAt: NOW,
      });
      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-about-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: {
          pathname: "/equipe/a-propos",
          pathnameKey: "/equipe/a-propos",
        },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-about-v1",
        publishedAt: NOW,
      });

      await adapter.savePageLocaleDraft({
        version: pageVersion("team", "fr-team-v2", "notre-equipe"),
        expectedCurrentVersion: "fr-team-v1",
        updatedAt: LATER,
        route: {
          pathname: "/notre-equipe",
          pathnameKey: "/notre-equipe",
        },
        draftRouteMoves: [
          {
            pageId: "about",
            route: {
              pathname: "/notre-equipe/a-propos",
              pathnameKey: "/notre-equipe/a-propos",
            },
          },
        ],
      });

      expect(await adapter.getPageLocaleRoute("about", "fr")).toMatchObject({
        pathname: "/notre-equipe/a-propos",
        draftClaim: true,
      });
      expect(
        (await adapter.resolvePublishedPageLocale("fr", "/equipe/a-propos"))
          ?.version.version,
      ).toBe("fr-about-v1");
      expect(
        await adapter.resolvePublishedPageLocale(
          "fr",
          "/notre-equipe/a-propos",
        ),
      ).toBeNull();

      await adapter.publishPageLocaleDraft({
        pageId: "team",
        locale: "fr",
        expectedCurrentVersion: "fr-team-v2",
        publishedAt: LATER,
        publishedRouteMoves: [
          { pageId: "about", pathnameKey: "/notre-equipe/a-propos" },
        ],
      });
      expect(
        await adapter.resolvePublishedPageLocale("fr", "/equipe/a-propos"),
      ).toBeNull();
      expect(
        (
          await adapter.resolvePublishedPageLocale(
            "fr",
            "/notre-equipe/a-propos",
          )
        )?.version.version,
      ).toBe("fr-about-v1");
    },
  );

  it.each(["SQLite", "D1"])(
    "keeps layout publication, leases, and durable invalidation parity on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await adapter.saveLayoutLocaleDraft({
        version: layoutVersion("fr-v1"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
      });
      await adapter.publishLayoutLocaleDraft({
        layoutId: "main",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
        publishedAt: NOW,
      });

      const firstLease = await adapter.acquireLocaleRouteLease({
        locale: "fr",
        leaseToken: "lease-one",
        now: NOW,
        expiresAt: LATER,
        updatedAt: NOW,
      });
      expect(firstLease?.leaseToken).toBe("lease-one");
      expect(
        await adapter.acquireLocaleRouteLease({
          locale: "fr",
          leaseToken: "lease-two",
          now: NOW,
          expiresAt: LATER,
          updatedAt: NOW,
        }),
      ).toBeNull();
      await adapter.releaseLocaleRouteLease({
        locale: "fr",
        leaseToken: "lease-one",
      });

      const job = {
        id: "invalidate-fr-about",
        idempotencyKey: "public-route:fr:about:fr-v1",
        scope: "public-route" as const,
        payload: { locale: "fr", pageId: "about" },
        status: "pending" as const,
        attemptCount: 0,
        nextAttemptAt: NOW,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
        completedAt: null,
      };
      expect((await adapter.enqueueCacheInvalidationJob(job)).id).toBe(job.id);
      expect(
        (await adapter.enqueueCacheInvalidationJob({ ...job, id: "ignored" }))
          .id,
      ).toBe(job.id);
      const [claimed] = await adapter.claimDueCacheInvalidationJobs({
        now: NOW,
        leaseToken: "worker-one",
        leaseExpiresAt: LATER,
        updatedAt: NOW,
        limit: 10,
      });
      expect(claimed).toMatchObject({
        id: job.id,
        status: "processing",
        attemptCount: 1,
      });
      await adapter.completeCacheInvalidationJob({
        id: job.id,
        leaseToken: "worker-one",
        completedAt: LATER,
      });
      expect(
        await adapter.claimDueCacheInvalidationJobs({
          now: LATER,
          leaseToken: "worker-two",
          leaseExpiresAt: "2026-07-13T12:10:00.000Z",
          updatedAt: LATER,
          limit: 10,
        }),
      ).toEqual([]);
    },
  );

  it.each(["SQLite", "D1"])(
    "atomically saves locale policy settings with its invalidation jobs on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      const job = {
        id: "locale-policy-fr-about",
        idempotencyKey:
          "locale-policy:transition-one:disable:fr:about:/a-propos",
        scope: "locale-policy" as const,
        payload: {
          reason: "locale-policy",
          operation: "disable",
          resourceType: "page",
          resourceId: "about",
          locale: "fr",
          pathname: "/a-propos",
        },
        status: "pending" as const,
        attemptCount: 0,
        nextAttemptAt: NOW,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        createdAt: NOW,
        updatedAt: NOW,
        completedAt: null,
      };
      await adapter.saveSiteSettingsWithInvalidationJobs(
        {
          localization: {
            content: {
              defaultLocale: "en",
              locales: [
                { code: "en", label: "English", enabled: true, fallbacks: [] },
                { code: "fr", label: "French", enabled: false, fallbacks: [] },
              ],
            },
          },
          updated_at: 0,
        },
        [job],
      );

      expect(
        (await adapter.getSiteSettings())?.localization?.content,
      ).toMatchObject({
        defaultLocale: "en",
        locales: expect.arrayContaining([
          expect.objectContaining({ code: "fr", enabled: false }),
        ]),
      });
      expect(
        await adapter.claimDueCacheInvalidationJobs({
          now: NOW,
          leaseToken: "worker-one",
          leaseExpiresAt: LATER,
          updatedAt: NOW,
          limit: 10,
        }),
      ).toEqual([
        expect.objectContaining({ id: job.id, status: "processing" }),
      ]);
    },
  );

  it.each(["SQLite", "D1"])(
    "retains canonical source history pinned by locale versions on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;

      for (const version of ["source-v2", "source-v3"]) {
        await client.execute({
          sql: `INSERT INTO aria_page_versions (id, version, dsl_json, created_at)
              VALUES ('about', ?, '{}', ?)`,
          args: [
            version,
            version === "source-v2" ? LATER : "2026-07-13T12:10:00.000Z",
          ],
        });
        await client.execute({
          sql: `INSERT INTO aria_layout_versions (id, version, dsl_json, created_at)
              VALUES ('main', ?, '{}', ?)`,
          args: [
            version,
            version === "source-v2" ? LATER : "2026-07-13T12:10:00.000Z",
          ],
        });
      }
      await client.execute(
        `UPDATE aria_page_meta SET current_version = 'source-v3' WHERE id = 'about'`,
      );
      await client.execute(
        `UPDATE aria_layout_meta SET current_version = 'source-v3' WHERE id = 'main'`,
      );

      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await adapter.saveLayoutLocaleDraft({
        version: layoutVersion("fr-v1"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
      });

      await expect(
        adapter.pruneVersionHistory!({
          resourceType: "page",
          resourceId: "about",
          keepLatest: 1,
          dryRun: false,
        }),
      ).resolves.toMatchObject({
        keptVersions: expect.arrayContaining(["source-v1", "source-v3"]),
        deletedVersions: ["source-v2"],
      });
      await expect(
        adapter.pruneVersionHistory!({
          resourceType: "layout",
          resourceId: "main",
          keepLatest: 1,
          dryRun: false,
        }),
      ).resolves.toMatchObject({
        keptVersions: expect.arrayContaining(["source-v1", "source-v3"]),
        deletedVersions: ["source-v2"],
      });
    },
  );

  it.each(["SQLite", "D1"])(
    "deletes only unpublished locale records atomically on %s",
    async (name) => {
      const { adapter } = adapters().find((entry) => entry.name === name)!;
      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v1", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await adapter.deletePageLocale({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
      });
      expect(await adapter.getPageLocaleMeta("about", "fr")).toBeNull();
      expect(
        await adapter.resolvePublishedPageLocale("fr", "/a-propos"),
      ).toBeNull();

      await adapter.saveLayoutLocaleDraft({
        version: layoutVersion("fr-v1"),
        expectedCurrentVersion: null,
        updatedAt: NOW,
      });
      await adapter.deleteLayoutLocale({
        layoutId: "main",
        locale: "fr",
        expectedCurrentVersion: "fr-v1",
      });
      expect(await adapter.getLayoutLocaleMeta("main", "fr")).toBeNull();

      await adapter.savePageLocaleDraft({
        version: pageVersion("about", "fr-v2", "a-propos"),
        expectedCurrentVersion: null,
        updatedAt: LATER,
        route: { pathname: "/a-propos", pathnameKey: "/a-propos" },
      });
      await adapter.publishPageLocaleDraft({
        pageId: "about",
        locale: "fr",
        expectedCurrentVersion: "fr-v2",
        publishedAt: LATER,
      });
      await expect(
        adapter.deletePageLocale({
          pageId: "about",
          locale: "fr",
          expectedCurrentVersion: "fr-v2",
        }),
      ).rejects.toMatchObject({ code: "TRANSLATION_PUBLISHED" });
    },
  );
});
