import { createClient, type Client, type InStatement } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { getSnapshotCacheKey } from "../../lib/cache/service";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import type { StylesData } from "../../lib/storage/adapter";
import { DEFAULT_RECENT_VERSION_LIMIT } from "../../lib/storage/versioning";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";
import {
  createStylesDataSnapshotFromUniversalDesignSystem,
  normalizeStylesDataToUniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import { MediaUsageRepository } from "../../lib/media/catalog/usage";
import type {
  AriaCloudflareEnv,
  RuntimeLocals,
} from "../../lib/cloudflare/env";
import { createD1Mock } from "../helpers/d1Mock";

class MemoryKv {
  private store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

class MemoryR2 {
  private store = new Map<
    string,
    { value: ArrayBuffer; httpMetadata?: { contentType?: string } }
  >();

  async get(key: string) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    return {
      async arrayBuffer() {
        return entry.value;
      },
      httpMetadata: entry.httpMetadata ?? {
        contentType: "image/webp",
      },
    };
  }

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    this.store.set(key, {
      value,
      httpMetadata: options?.httpMetadata,
    });
  }

  async delete(key: string) {
    this.store.delete(key);
  }

  async list(input?: { prefix?: string; cursor?: string }) {
    const keys = [...this.store.keys()]
      .filter((key) => !input?.prefix || key.startsWith(input.prefix))
      .sort();
    const start = input?.cursor ? Number(input.cursor) : 0;
    const page = keys.slice(start, start + 2);
    const next = start + page.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated: next < keys.length,
      cursor: next < keys.length ? String(next) : undefined,
    };
  }
}

const samplePage: PageDSL = {
  id: "page-home",
  title: "Home",
  slug: "home",
  description: "Cloudflare home page",
  layout: "full-width",
  status: "draft",
  nodes: [],
  settings: {
    cssVariables: {},
    breakpoints: [
      { name: "mobile", minWidth: "0px", label: "Mobile" },
      { name: "desktop", minWidth: "1024px", label: "Desktop" },
    ],
  },
};

const sampleLayout: LayoutDSL = {
  id: "full-width",
  name: "Full Width",
  description: "Single-column layout",
  nodes: [],
  slots: [
    { name: "header", label: "Header" },
    { name: "main", label: "Main Content", isDefault: true },
    { name: "footer", label: "Footer" },
  ],
};

const sampleComponent: ComponentDSL = {
  id: "hero-banner",
  name: "Hero Banner",
  description: "Reusable hero block",
  category: "marketing",
  nodes: [],
};

const sampleStyles: StylesData = {
  tokens: {
    colors: { primary: "#f97316", foreground: "#111827" },
    gradients: { hero: "linear-gradient(180deg, #f97316 0%, #ea580c 100%)" },
    spacing: { sm: "0.5rem", md: "1rem" },
    fonts: { body: "Instrument Sans", heading: "Fraunces" },
    fontSizes: { sm: "0.875rem", base: "1rem" },
    fontWeights: { regular: "400", medium: "500" },
    lineHeights: { normal: "1.5" },
    letterSpacing: { normal: "0" },
    borderWidths: { thin: "1px" },
    borderColors: { default: "#e5e7eb" },
    borderRadius: { md: "0.5rem" },
    boxShadows: { soft: "0 8px 30px rgba(0, 0, 0, 0.08)" },
    opacity: { muted: "0.7" },
    zIndex: { modal: 50 },
    transitions: { default: "all 150ms ease" },
    breakpoints: { md: "768px" },
  },
  globalCSS: ".hero-card{padding:1rem;}",
  globalCSSHash: "abc123",
  lastCompiled: "2026-03-16T12:00:00.000Z",
};

describe("CloudflareStorageAdapter", () => {
  let client: Client;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-cloudflare-test-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    for (const migration of [
      "0001_baseline_schema.sql",
      "0002_api_foundation.sql",
      "0003_api_idempotency_leases.sql",
      "0004_api_lifecycle_hardening.sql",
    ]) {
      await client.executeMultiple(
        await fs.readFile(
          path.resolve(process.cwd(), `aria/migrations/${migration}`),
          "utf8",
        ),
      );
    }
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("uses canonical aria_page tables for page CRUD", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    const version = await adapter.savePageDSL(samplePage.id, samplePage);
    const byId = await adapter.getPageDSL(samplePage.id);
    const bySlug = await adapter.getPageDSL(samplePage.slug);
    const versions = await adapter.getPageVersions(samplePage.id);

    expect(version).toMatch(/^\d+$/);
    expect(byId?.title).toBe(samplePage.title);
    expect(bySlug?.slug).toBe(samplePage.slug);
    expect(versions[0]?.version).toBe(version);
  });

  it("automatically prunes page history to the default retention limit", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });
    const savedVersions: string[] = [];

    for (let index = 0; index < DEFAULT_RECENT_VERSION_LIMIT + 2; index += 1) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      savedVersions.push(
        await adapter.savePageDSL(samplePage.id, {
          ...samplePage,
          title: `Home ${index}`,
        }),
      );
    }

    const versions = await adapter.getPageVersions(samplePage.id);

    expect(versions).toHaveLength(DEFAULT_RECENT_VERSION_LIMIT);
    expect(versions.map((entry) => entry.version)).toEqual(
      savedVersions.slice(-DEFAULT_RECENT_VERSION_LIMIT).reverse(),
    );
  });

  it("keeps draft and published page revisions separate", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "1000",
    });
    const firstPublishedVersion = await adapter.publishPageDSL(
      samplePage.id,
      undefined,
      { versionHint: "2000" },
    );

    await adapter.savePageDSL(
      samplePage.id,
      {
        ...samplePage,
        title: "Cloudflare Draft Update",
      },
      {
        preserveVersion: true,
        versionHint: "3000",
      },
    );

    const draft = await adapter.getPageDSL(samplePage.id);
    const published = await adapter.getPublishedPageDSL(samplePage.id);
    const listed = await adapter.listPagesDSL({ limit: 10, offset: 0 });

    expect(firstPublishedVersion).toBe("2000");
    expect(draft?.title).toBe("Cloudflare Draft Update");
    expect(published?.title).toBe("Home");
    expect(listed[0]?.status).toBe("published");

    await adapter.unpublishPageDSL(samplePage.id);

    expect(await adapter.getPublishedPageDSL(samplePage.id)).toBeNull();
    expect(
      (await adapter.listPagesDSL({ limit: 10, offset: 0 }))[0]?.status,
    ).toBe("draft");
  });

  it("surfaces scheduled status and scheduledFor in page inventory", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "1000",
    });

    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await adapter.schedulePageDSL(samplePage.id, scheduledFor);

    const listed = await adapter.listPagesDSL({ limit: 10, offset: 0 });
    expect(listed[0]?.status).toBe("scheduled");
    expect(listed[0]?.scheduledFor).toBe(scheduledFor);
  });

  it("clears scheduling metadata when unpublishing a scheduled page", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "1000",
    });

    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await adapter.schedulePageDSL(samplePage.id, scheduledFor);
    await adapter.unpublishPageDSL(samplePage.id);

    const listed = await adapter.listPagesDSL({ limit: 10, offset: 0 });
    expect(listed[0]?.status).toBe("draft");
    expect(listed[0]?.scheduledFor).toBeNull();
  });

  it("cancels a scheduled page when a newer draft is saved", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });
    await adapter.savePageDSL(samplePage.id, samplePage);
    await adapter.schedulePageDSL(
      samplePage.id,
      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    );

    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Edited after scheduling",
    });

    const row = await client.execute({
      sql: `SELECT status, scheduled_for, scheduled_version
            FROM aria_page_meta WHERE id = ?`,
      args: [samplePage.id],
    });
    expect(row.rows[0]).toMatchObject({
      status: "draft",
      scheduled_for: null,
      scheduled_version: null,
    });
  });

  it("does not treat a pre-baseline D1 schema as a supported page-save target", async () => {
    const legacyVersion = "v1";
    const legacyNow = "2026-04-28T00:00:00.000Z";

    await client.executeMultiple(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE aria_page_locale_routes;
      DROP TABLE aria_page_locale_meta;
      DROP TABLE aria_page_locale_versions;
      DROP TABLE aria_page_meta;
      DROP TABLE aria_page_versions;
      PRAGMA foreign_keys = ON;
    `);
    await client.batch([
      {
        sql: `CREATE TABLE aria_page_versions (
          id TEXT NOT NULL,
          version TEXT NOT NULL,
          slug TEXT,
          title TEXT,
          status TEXT,
          dsl_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (id, version)
        )`,
      } as InStatement,
      {
        sql: `CREATE TABLE aria_page_meta (
          id TEXT PRIMARY KEY,
          slug TEXT,
          title TEXT,
          status TEXT,
          parent TEXT,
          layout TEXT,
          draft_version TEXT,
          published_version TEXT,
          current_version TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
      } as InStatement,
      {
        sql: `INSERT INTO aria_page_versions (id, version, slug, title, status, dsl_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "legacy-page",
          legacyVersion,
          "legacy-page",
          "Legacy Page",
          "draft",
          JSON.stringify({
            ...samplePage,
            id: "legacy-page",
            slug: "legacy-page",
            title: "Legacy Page",
            visibility: "private",
          }),
          legacyNow,
        ],
      },
      {
        sql: `INSERT INTO aria_page_meta (id, slug, title, status, parent, layout, draft_version, published_version, current_version, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          "legacy-page",
          "legacy-page",
          "Legacy Page",
          "draft",
          null,
          samplePage.layout ?? null,
          legacyVersion,
          null,
          legacyVersion,
          legacyNow,
        ],
      },
    ]);

    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await expect(
      adapter.listPagesDSL({ limit: 10, offset: 0 }),
    ).rejects.toThrow(/reset\/reprovision/i);
  });

  it("rejects legacy page-role constraints instead of rebuilding D1 at runtime", async () => {
    const legacyVersion = "v1";
    const legacyNow = "2026-04-28T00:00:00.000Z";

    await client.executeMultiple(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE aria_page_locale_routes;
      DROP TABLE aria_page_locale_meta;
      DROP TABLE aria_page_locale_versions;
      DROP TABLE aria_page_meta;
      DROP TABLE aria_page_versions;
      PRAGMA foreign_keys = ON;
    `);
    await client.batch([
      {
        sql: `CREATE TABLE aria_page_versions (
          id TEXT NOT NULL,
          version TEXT NOT NULL,
          slug TEXT,
          title TEXT,
          status TEXT,
          dsl_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (id, version)
        )`,
      } as InStatement,
      {
        sql: `CREATE TABLE aria_page_meta (
          id TEXT PRIMARY KEY,
          slug TEXT,
          title TEXT,
          status TEXT,
          parent TEXT,
          layout TEXT,
          draft_version TEXT,
          published_version TEXT,
          current_version TEXT NOT NULL,
          system_role TEXT NOT NULL DEFAULT 'standard' CHECK (system_role IN ('standard', 'not-found')),
          updated_at TEXT NOT NULL
        )`,
      } as InStatement,
      {
        sql: `CREATE UNIQUE INDEX idx_aria_page_meta_system_role_unique
              ON aria_page_meta(system_role)
              WHERE system_role != 'standard'`,
      } as InStatement,
      ...["legacy-one", "legacy-two"].flatMap((id) => [
        {
          sql: `INSERT INTO aria_page_versions (id, version, slug, title, status, dsl_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            legacyVersion,
            id,
            `Legacy ${id}`,
            "draft",
            JSON.stringify({
              ...samplePage,
              id,
              slug: id,
              title: `Legacy ${id}`,
            }),
            legacyNow,
          ],
        } as InStatement,
        {
          sql: `INSERT INTO aria_page_meta (id, slug, title, status, parent, layout, draft_version, published_version, current_version, system_role, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            id,
            `Legacy ${id}`,
            "draft",
            null,
            samplePage.layout ?? null,
            legacyVersion,
            null,
            legacyVersion,
            "standard",
            legacyNow,
          ],
        } as InStatement,
      ]),
    ]);

    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });
    await expect(
      adapter.savePagePolicy({
        idOrSlug: "legacy-one",
        systemRole: "cms-entry",
        accessMode: "public",
        accessPasswordHash: null,
        accessPromptTitle: null,
        accessPromptDescription: null,
        accessRememberForDays: null,
        accessPolicyVersion: 1,
        updatedAt: "2026-04-28T12:00:00.000Z",
      }),
    ).rejects.toThrow(/reset\/reprovision/i);
  });

  it("reads and writes typed page policy and access sessions", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.savePageDSL(samplePage.id, samplePage);

    const initialPolicy = await adapter.getPagePolicy(samplePage.slug);

    expect(initialPolicy).toEqual(
      expect.objectContaining({
        id: samplePage.id,
        slug: samplePage.slug,
        systemRole: "standard",
        accessMode: "public",
        accessPasswordHash: null,
        accessPolicyVersion: 1,
        publishedVersion: null,
      }),
    );

    const savedPolicy = await adapter.savePagePolicy({
      idOrSlug: samplePage.slug,
      systemRole: "standard",
      accessMode: "password",
      accessPasswordHash: "salt.hash",
      accessPromptTitle: "Members only",
      accessPromptDescription: "Enter the password to continue.",
      accessRememberForDays: 7,
      accessPolicyVersion: 2,
      updatedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(savedPolicy).toEqual({
      id: samplePage.id,
      slug: samplePage.slug,
      systemRole: "standard",
      accessMode: "password",
      accessPasswordHash: "salt.hash",
      accessPromptTitle: "Members only",
      accessPromptDescription: "Enter the password to continue.",
      accessRememberForDays: 7,
      accessPolicyVersion: 2,
      publishedVersion: null,
      updatedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(await adapter.getPagePolicyBySystemRole("not-found")).toBeNull();

    expect(await adapter.listPagePolicySummaries()).toEqual(
      expect.arrayContaining([
        {
          id: samplePage.id,
          slug: samplePage.slug,
          systemRole: "standard",
          accessMode: "password",
          hasPassword: true,
        },
      ]),
    );

    const session = await adapter.createPageAccessSession({
      tokenHash: "token-hash",
      pageId: samplePage.id,
      policyVersion: 2,
      expiresAt: "2026-05-05T12:00:00.000Z",
      createdAt: "2026-04-28T12:00:00.000Z",
    });

    expect(session).toEqual({
      tokenHash: "token-hash",
      pageId: samplePage.id,
      policyVersion: 2,
      expiresAt: "2026-05-05T12:00:00.000Z",
      createdAt: "2026-04-28T12:00:00.000Z",
      lastUsedAt: "2026-04-28T12:00:00.000Z",
    });

    await adapter.touchPageAccessSession(
      "token-hash",
      "2026-04-29T12:00:00.000Z",
    );

    expect(
      await adapter.getPageAccessSession(samplePage.id, "token-hash"),
    ).toEqual({
      tokenHash: "token-hash",
      pageId: samplePage.id,
      policyVersion: 2,
      expiresAt: "2026-05-05T12:00:00.000Z",
      createdAt: "2026-04-28T12:00:00.000Z",
      lastUsedAt: "2026-04-29T12:00:00.000Z",
    });

    await adapter.deletePageAccessSessionsForPage(samplePage.id);

    expect(
      await adapter.getPageAccessSession(samplePage.id, "token-hash"),
    ).toBeNull();
  });

  it("invalidates draft and published page thumbnails when page revisions change", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
      aria_r2: new MemoryR2() as any,
      R2_PUBLIC_URL: "https://assets.example.com",
    });

    await adapter.savePageDSL(samplePage.id, samplePage);
    await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["draft-thumb"], { type: "image/webp" }),
      "draft",
    );

    expect(await adapter.getPageThumbnail(samplePage.id, "draft")).toContain(
      "/thumbnails/page/page-home/draft.webp",
    );

    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Changed draft",
    });

    expect(await adapter.getPageThumbnail(samplePage.id, "draft")).toBeNull();

    await adapter.publishPageDSL(samplePage.id);
    await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["published-thumb"], { type: "image/webp" }),
      "published",
    );

    expect(
      await adapter.getPageThumbnail(samplePage.id, "published"),
    ).toContain("/thumbnails/page/page-home/published.webp");

    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Republished",
    });
    await adapter.publishPageDSL(samplePage.id);

    expect(
      await adapter.getPageThumbnail(samplePage.id, "published"),
    ).toBeNull();
  });

  it("preserves page thumbnail content type metadata in R2", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
      aria_r2: new MemoryR2() as any,
      R2_PUBLIC_URL: "https://assets.example.com",
    });

    await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["png-thumb"], { type: "image/png" }),
      "draft",
    );

    const thumbnail = await adapter.readPageThumbnail(samplePage.id, "draft");

    expect(thumbnail?.contentType).toBe("image/png");
  });

  it("serves thumbnails from worker-relative URLs when R2_PUBLIC_URL is unset", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
      aria_r2: new MemoryR2() as any,
    });

    const savedPageUrl = await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["draft-thumb"], { type: "image/webp" }),
      "draft",
    );
    expect(savedPageUrl).toBe("/uploads/thumbnails/page/page-home/draft.webp");
    await expect(adapter.getPageThumbnail(samplePage.id, "draft")).resolves.toBe(
      savedPageUrl,
    );

    const savedComponentUrl = await adapter.saveThumbnail(
      "component",
      "hero-card",
      new Blob(["component-thumb"], { type: "image/png" }),
    );
    expect(savedComponentUrl).toBe(
      "/uploads/thumbnails/component/hero-card.png",
    );
    await expect(
      adapter.getThumbnail("component", "hero-card"),
    ).resolves.toBe(savedComponentUrl);
  });

  it("lists stored page thumbnail ids across paginated R2 results", async () => {
    const r2 = new MemoryR2();
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
      aria_r2: r2 as any,
      R2_PUBLIC_URL: "https://assets.example.com",
    });

    await r2.put("thumbnails/page/alpha/draft.webp", new ArrayBuffer(1));
    await r2.put("thumbnails/page/bravo/draft.webp", new ArrayBuffer(1));
    await r2.put("thumbnails/page/charlie/published.webp", new ArrayBuffer(1));

    expect(await adapter.listStoredPageThumbnailKeys()).toEqual(
      new Set(["alpha:draft", "bravo:draft", "charlie:published"]),
    );
  });

  it("prunes intermediate page history while keeping latest and pinned revisions", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    const publishedVersion = await adapter.publishPageDSL(samplePage.id);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const secondVersion = await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Second draft",
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const thirdVersion = await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Third draft",
    });

    const result = await adapter.pruneVersionHistory!({
      resourceType: "page",
      resourceId: samplePage.id,
      keepLatest: 1,
      dryRun: false,
    });
    const remainingVersions = await adapter.getPageVersions(samplePage.id);

    expect(result.keptVersions).toEqual([thirdVersion, publishedVersion]);
    expect(result.deletedVersions).toEqual([secondVersion, firstVersion]);
    expect(remainingVersions.map((entry) => entry.version)).toEqual([
      thirdVersion,
      publishedVersion,
    ]);
    expect((await adapter.getPublishedPageDSL(samplePage.id))?.title).toBe(
      "Home",
    );
  });

  it("stores layouts and components in canonical tables", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout);
    await adapter.saveComponentDSL(sampleComponent.id, sampleComponent);

    const layout = await adapter.getLayoutDSL(sampleLayout.id);
    const component = await adapter.getComponentDSL(sampleComponent.id);
    const layouts = await adapter.listLayoutsDSL();
    const components = await adapter.listComponentsDSL();

    expect(layout?.name).toBe(sampleLayout.name);
    expect(component?.name).toBe(sampleComponent.name);
    expect(layouts.map((item) => item.id)).toContain(sampleLayout.id);
    expect(components.map((item) => item.id)).toContain(sampleComponent.id);
  });

  it("stores builder state in D1 and mirrors snapshots to KV cache", async () => {
    const kv = new MemoryKv();
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
      aria_cache: kv as any,
    });

    await adapter.saveOrder("pages", ["home", "pricing"]);
    await adapter.saveSiteSettings({ siteName: "Aria Cloudflare" });
    await adapter.saveSnapshot("home", "<html>cached</html>");

    expect(await adapter.getOrder("pages")).toEqual(["home", "pricing"]);
    expect(await adapter.getSiteSettings()).toMatchObject({
      siteName: "Aria Cloudflare",
    });
    expect(await kv.get(getSnapshotCacheKey("published:home"))).toBe(
      "<html>cached</html>",
    );
    expect(await adapter.getSnapshot("home")).toBe("<html>cached</html>");
  });

  it("persists canonical design-system style artifacts as segmented aria_styles rows", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.saveDesignSystem(
      normalizeStylesDataToUniversalDesignSystem(sampleStyles),
    );

    const persistedRows = await client.execute({
      sql: `SELECT id, length(styles_json) AS styles_size
            FROM aria_styles
            ORDER BY id ASC`,
      args: [],
    });

    expect(
      createStylesDataSnapshotFromUniversalDesignSystem(
        (await adapter.getDesignSystem())!,
      ),
    ).toMatchObject({
      tokens: {
        colors: { primary: "#f97316", foreground: "#111827" },
        fonts: { body: "Instrument Sans", heading: "Fraunces" },
      },
      globalCSS: ".hero-card{padding:1rem;}",
      globalCSSHash: "abc123",
      lastCompiled: "2026-03-16T12:00:00.000Z",
    });
    expect(persistedRows.rows.length).toBeGreaterThan(1);
    expect(persistedRows.rows.map((row) => String(row.id))).not.toContain(
      "default",
    );
    expect(
      Math.max(
        ...persistedRows.rows.map((row) => Number(row.styles_size ?? 0)),
      ),
    ).toBeLessThan(50000);
  });

  it("reads only requested design-system segments", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    const source = normalizeStylesDataToUniversalDesignSystem(sampleStyles);
    source.globalStyles.variables.custom.accent = {
      label: "Accent",
      value: "#ff00aa",
      category: "color",
    };

    await adapter.saveDesignSystem(source);

    const partial = await adapter.getDesignSystemSegments([
      "global-styles",
      "tokens-colors",
    ]);

    expect(partial).not.toBeNull();
    expect(partial!.globalStyles.variables.custom.accent?.value).toBe(
      "#ff00aa",
    );
    expect(partial!.tokens.colors.palette).toEqual(
      source.tokens.colors.palette,
    );
    expect(partial!.artifacts.compiledUnoCSS).toBe("");
    expect(partial!.artifacts.globalCSS).toBe("");
  });

  it("tracks content revision state in D1", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    const first = await adapter.touchContentRevision({
      mutationKind: "save-page",
      mutationTarget: samplePage.slug,
      updatedBy: "tester",
      timestamp: "2026-03-16T12:00:00.000Z",
    });
    const second = await adapter.touchContentRevision({
      mutationKind: "save-styles",
      mutationTarget: "default",
      timestamp: "2026-03-16T12:05:00.000Z",
    });
    const current = await adapter.getContentSiteState();

    expect(first.scope).toBe("default");
    expect(first.revisionSeq).toBe(1);
    expect(first.updatedBy).toBe("tester");
    expect(second.revisionSeq).toBe(2);
    expect(second.lastMutationKind).toBe("save-styles");
    expect(current).toMatchObject({
      currentRevisionId: second.currentRevisionId,
      revisionSeq: 2,
      lastMutationKind: "save-styles",
      lastMutationTarget: "default",
    });
  });

  it("lists indexed media usage by logical path", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.getOrder("pages");

    const now = "2026-04-08T00:00:00.000Z";
    await client.execute({
      sql: `INSERT INTO aria_media_assets (
              id,
              logical_path,
              filename,
              extension,
              mime_type,
              size_bytes,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "media-logo",
        "/uploads/images/logo.svg",
        "logo.svg",
        "svg",
        "image/svg+xml",
        4,
        "active",
        now,
        now,
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_media_usage (
              id,
              media_id,
              kind,
              ref_id,
              ref_path,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        "usage-logo-page",
        "media-logo",
        "page",
        "home",
        "nodes[0].props.image.src",
        now,
      ],
    });

    await expect(
      adapter.listMediaUsageByLogicalPath("images/logo.svg"),
    ).resolves.toEqual([
      {
        kind: "page",
        refId: "home",
        refPath: "nodes[0].props.image.src",
      },
    ]);
  });

  it("syncs page media usage through MediaUsageRepository into aria_media_usage", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as unknown as AriaCloudflareEnv["aria_db"],
    });
    await adapter.getSiteSettings();

    const now = "2026-04-08T00:00:00.000Z";
    await client.execute({
      sql: `INSERT INTO aria_media_assets (
              id,
              logical_path,
              filename,
              extension,
              mime_type,
              size_bytes,
              status,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "media-hero",
        "/uploads/images/hero.jpg",
        "hero.jpg",
        "jpg",
        "image/jpeg",
        8,
        "active",
        now,
        now,
      ],
    });

    const repository = MediaUsageRepository.tryCreate({
      cfBindings: {
        aria_db: createD1Mock(
          client,
        ) as unknown as AriaCloudflareEnv["aria_db"],
      },
    } satisfies RuntimeLocals);
    expect(repository).not.toBeNull();

    await repository!.syncResourceUsage({
      kind: "page",
      refId: "home",
      resource: {
        nodes: [
          {
            props: {
              src: "/uploads/images/hero.jpg",
            },
          },
        ],
      },
      updatedAt: now,
    });

    await expect(
      adapter.listMediaUsageByLogicalPath("images/hero.jpg"),
    ).resolves.toEqual([
      {
        kind: "page",
        refId: "home",
        refPath: "nodes[0].props.src",
      },
    ]);
  });

  it("skips settings audit v2 migration when expanded schema already exists", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.getSiteSettings();

    const afterFirstInit = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'aria_settings_audit%' ORDER BY name`,
      args: [],
    });
    const firstInitTables = afterFirstInit.rows.map((row) => String(row.name));

    expect(firstInitTables).toContain("aria_settings_audit");
    expect(firstInitTables).not.toContain("aria_settings_audit_v2");

    const secondAdapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });
    await secondAdapter.getSiteSettings();

    const afterSecondInit = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'aria_settings_audit%' ORDER BY name`,
      args: [],
    });
    const secondInitTables = afterSecondInit.rows.map((row) =>
      String(row.name),
    );

    expect(secondInitTables).toEqual(firstInitTables);
    expect(secondInitTables).not.toContain("aria_settings_audit_v2");
  });

  it("does not recover interrupted settings audit migrations at request time", async () => {
    await client.execute({
      sql: `CREATE TABLE aria_settings_audit_v2 (
            id TEXT PRIMARY KEY NOT NULL,
            category TEXT NOT NULL CHECK (
              category IN ('discovery', 'redirects', 'agent', 'security')
            ),
            action TEXT NOT NULL,
            actor_id TEXT NOT NULL,
            actor_username TEXT,
            summary TEXT NOT NULL,
            payload_json TEXT,
            created_at TEXT NOT NULL
          )`,
      args: [],
    });

    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client) as any,
    });

    await adapter.getSiteSettings();

    const tables = await client.execute({
      sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'aria_settings_audit%' ORDER BY name`,
      args: [],
    });

    expect(tables.rows.map((row) => String(row.name))).toEqual([
      "aria_settings_audit",
      "aria_settings_audit_v2",
    ]);
  });
});
