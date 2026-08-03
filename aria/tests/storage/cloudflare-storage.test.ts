import { createClient, type Client, type InStatement } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { getSnapshotCacheKey } from "../../lib/cache/service";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import type { StylesData } from "../../lib/storage/adapter";
import {
  DEFAULT_RECENT_VERSION_LIMIT,
  VersionConflictError,
} from "../../lib/storage/versioning";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";
import {
  createStylesDataSnapshotFromUniversalDesignSystem,
  normalizeStylesDataToUniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import { MediaUsageRepository } from "../../lib/media/catalog/usage";
import {
  createCollectionOnAdapter,
  updateCollectionOnAdapter,
} from "../../lib/cms/services/collections";
import type {
  AriaCloudflareEnv,
  RuntimeLocals,
} from "../../lib/cloudflare/env";
import { createD1Mock } from "../helpers/d1Mock";
import { normalizeSurfaceForPersistence } from "../../lib/storage/internal/domains/surfaceNormalization";

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
      "0008_published_dependency_pins.sql",
      "0009_studio_presence_sessions.sql",
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
      aria_db: createD1Mock(client),
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

  it("stores canonical surface sources and source hashes for every DSL kind", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    const page = {
      ...samplePage,
      version: "client-page-version",
      updatedAt: "2020-01-01T00:00:00.000Z",
      nodes: [
        {
          id: "legacy-page-node",
          type: "Container",
          props: { borderRadius: "12px" },
          styles: {},
          children: [],
        },
      ],
    } as PageDSL;
    const layout = {
      ...sampleLayout,
      version: "client-layout-version",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const component = {
      ...sampleComponent,
      version: "client-component-version",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };

    const pageVersion = await adapter.savePageDSL(page.id, page);
    const layoutVersion = await adapter.saveLayoutDSL(layout.id, layout);
    const componentVersion = await adapter.saveComponentDSL(
      component.id,
      component,
    );
    const [pageExpected, layoutExpected, componentExpected] = await Promise.all(
      [
        normalizeSurfaceForPersistence("page", page),
        normalizeSurfaceForPersistence("layout", layout),
        normalizeSurfaceForPersistence("component", component),
      ],
    );

    for (const expected of [
      {
        table: "aria_page_versions",
        id: page.id,
        version: pageVersion,
        normalized: pageExpected,
      },
      {
        table: "aria_layout_versions",
        id: layout.id,
        version: layoutVersion,
        normalized: layoutExpected,
      },
      {
        table: "aria_component_versions",
        id: component.id,
        version: componentVersion,
        normalized: componentExpected,
      },
    ]) {
      const result = await client.execute({
        sql: `SELECT dsl_json, content_hash FROM ${expected.table} WHERE id = ? AND version = ?`,
        args: [expected.id, expected.version],
      });
      const row = result.rows[0];
      expect(row?.content_hash).toBe(expected.normalized.sourceHash);
      const stored = JSON.parse(String(row?.dsl_json)) as Record<
        string,
        unknown
      >;
      expect(stored.version).toBe(expected.version);
      expect(typeof stored.updatedAt).toBe("string");
      delete stored.version;
      delete stored.updatedAt;
      expect(stored).toEqual(expected.normalized.source);
    }
  });

  it("rejects invalid recursive page input before creating D1 rows", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    const cyclicNode: Record<string, unknown> = {
      id: "cycle",
      type: "Container",
      props: {},
      styles: {},
    };
    cyclicNode.children = [cyclicNode];

    await expect(
      adapter.savePageDSL(samplePage.id, {
        ...samplePage,
        nodes: [cyclicNode],
      } as unknown as PageDSL),
    ).rejects.toMatchObject({
      failure: {
        code: "RENDER_INPUT_INVALID",
        context: expect.objectContaining({ stage: "preflight" }),
      },
    });

    const [versions, metadata] = await Promise.all([
      client.execute({
        sql: "SELECT COUNT(*) AS count FROM aria_page_versions WHERE id = ?",
        args: [samplePage.id],
      }),
      client.execute({
        sql: "SELECT COUNT(*) AS count FROM aria_page_meta WHERE id = ?",
        args: [samplePage.id],
      }),
    ]);
    expect(Number(versions.rows[0]?.count)).toBe(0);
    expect(Number(metadata.rows[0]?.count)).toBe(0);
  });

  it("reconciles committed D1 surface retries by source hash", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    const pageV1 = await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "retry-page-v1",
    });
    const layoutV1 = await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout, {
      preserveVersion: true,
      versionHint: "retry-layout-v1",
    });
    const componentV1 = await adapter.saveComponentDSL(
      sampleComponent.id,
      sampleComponent,
      {
        preserveVersion: true,
        versionHint: "retry-component-v1",
      },
    );
    const updatedPage = { ...samplePage, title: "Committed D1 page" };
    const updatedLayout = {
      ...sampleLayout,
      description: "Committed D1 layout",
    };
    const updatedComponent = {
      ...sampleComponent,
      description: "Committed D1 component",
    };

    const pageV2 = await adapter.savePageDSL(samplePage.id, updatedPage, {
      expectedVersion: pageV1,
    });
    const layoutV2 = await adapter.saveLayoutDSL(
      sampleLayout.id,
      updatedLayout,
      { expectedVersion: layoutV1 },
    );
    const componentV2 = await adapter.saveComponentDSL(
      sampleComponent.id,
      updatedComponent,
      { expectedVersion: componentV1 },
    );

    await expect(
      adapter.savePageDSL(samplePage.id, updatedPage, {
        expectedVersion: pageV1,
      }),
    ).resolves.toBe(pageV2);
    await expect(
      adapter.saveLayoutDSL(sampleLayout.id, updatedLayout, {
        expectedVersion: layoutV1,
      }),
    ).resolves.toBe(layoutV2);
    await expect(
      adapter.saveComponentDSL(sampleComponent.id, updatedComponent, {
        expectedVersion: componentV1,
      }),
    ).resolves.toBe(componentV2);

    expect(await adapter.getPageVersions(samplePage.id)).toHaveLength(2);
    expect(await adapter.listLayoutVersions(sampleLayout.id)).toHaveLength(2);
    expect(await adapter.listComponentVersions(sampleComponent.id)).toHaveLength(
      2,
    );
  });

  it("allows exactly one concurrent guarded page save", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "cas-v1",
    });

    const results = await Promise.allSettled([
      adapter.savePageDSL(
        samplePage.id,
        { ...samplePage, title: "Left editor" },
        {
          expectedVersion: "cas-v1",
          preserveVersion: true,
          versionHint: "cas-left",
        },
      ),
      adapter.savePageDSL(
        samplePage.id,
        { ...samplePage, title: "Right editor" },
        {
          expectedVersion: "cas-v1",
          preserveVersion: true,
          versionHint: "cas-right",
        },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const versions = await adapter.getPageVersions(samplePage.id);
    const saved = await adapter.getPageDSL(samplePage.id);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      VersionConflictError,
    );
    expect(versions).toHaveLength(2);
    expect(saved?.version).toBe(
      (fulfilled[0] as PromiseFulfilledResult<string>).value,
    );
  });

  it("commits a guarded page and layout draft in one D1 batch", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout, {
      preserveVersion: true,
      versionHint: "layout-v1",
    });
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "page-v1",
    });

    const atomicPage = { ...samplePage, title: "Atomic update" };
    const atomicLayout = {
      ...sampleLayout,
      description: "Atomic layout update",
    };
    const atomicPageVersion = await adapter.savePageDSL(
      samplePage.id,
      atomicPage,
      {
        expectedVersion: "page-v1",
        linkedLayoutDraft: {
          id: sampleLayout.id,
          expectedVersion: "layout-v1",
          dsl: atomicLayout,
        },
      },
    );
    const atomicLayoutVersion = (await adapter.getLayoutDSL(sampleLayout.id))
      ?.version;

    await expect(
      adapter.savePageDSL(samplePage.id, atomicPage, {
        expectedVersion: "page-v1",
        linkedLayoutDraft: {
          id: sampleLayout.id,
          expectedVersion: "layout-v1",
          dsl: atomicLayout,
        },
      }),
    ).resolves.toBe(atomicPageVersion);
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.version).toBe(
      atomicLayoutVersion,
    );
    expect(await adapter.getPageVersions(samplePage.id)).toHaveLength(2);
    expect(await adapter.listLayoutVersions(sampleLayout.id)).toHaveLength(2);

    expect((await adapter.getPageDSL(samplePage.id))?.title).toBe(
      "Atomic update",
    );
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.description).toBe(
      "Atomic layout update",
    );

    const layoutVersion = atomicLayoutVersion;
    await expect(
      adapter.savePageDSL(
        samplePage.id,
        { ...samplePage, title: "Rejected update" },
        {
          expectedVersion: "stale-page-version",
          linkedLayoutDraft: {
            id: sampleLayout.id,
            expectedVersion: layoutVersion!,
            dsl: { ...sampleLayout, description: "Must not commit" },
          },
        },
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.description).toBe(
      "Atomic layout update",
    );
  });

  it("never lets a guarded save and publish overwrite each other's pointers", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "publish-race-v1",
    });

    const [saveResult, publishResult] = await Promise.allSettled([
      adapter.savePageDSL(
        samplePage.id,
        { ...samplePage, title: "Edited while publishing" },
        {
          expectedVersion: "publish-race-v1",
          preserveVersion: true,
          versionHint: "publish-race-v2",
        },
      ),
      adapter.publishPageDSL(samplePage.id, undefined, {
        expectedVersion: "publish-race-v1",
      }),
    ]);
    const pins = await adapter.getPageVersionPins(samplePage.id);
    const versions = await adapter.getPageVersions(samplePage.id);

    expect(
      [saveResult, publishResult].filter(
        (result) => result.status === "fulfilled",
      ),
    ).toHaveLength(1);
    expect(
      [saveResult, publishResult].filter(
        (result) => result.status === "rejected",
      ),
    ).toHaveLength(1);
    if (saveResult.status === "fulfilled") {
      expect(pins?.draftVersion).toBe("publish-race-v2");
      expect(pins?.publishedVersion).toBeNull();
      expect(versions.map((entry) => entry.version)).toContain(
        "publish-race-v2",
      );
    } else {
      expect(saveResult.reason).toBeInstanceOf(VersionConflictError);
      expect(pins?.draftVersion).toBe("publish-race-v1");
      expect(pins?.publishedVersion).toBe("publish-race-v1");
      expect(versions.map((entry) => entry.version)).toEqual([
        "publish-race-v1",
      ]);
    }
  });

  it("automatically prunes page history to the default retention limit", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
    });

    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "1000",
    });
    const firstPublishedVersion = await adapter.publishPageDSL(
      samplePage.id,
      undefined,
      {
        versionHint: "2000",
        dependencies: {
          layout: { id: "full-width", version: "layout-v1" },
          components: { header: "component-v1" },
        },
      },
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

    expect(firstPublishedVersion).toBe("1000");
    expect(draft?.title).toBe("Cloudflare Draft Update");
    expect(published?.title).toBe("Home");
    expect(published?._publicationDependencies).toEqual({
      layout: { id: "full-width", version: "layout-v1" },
      components: { header: "component-v1" },
    });
    expect(draft?._publicationDependencies).toBeUndefined();
    expect(listed[0]?.status).toBe("published");

    await adapter.unpublishPageDSL(samplePage.id);

    expect(await adapter.getPublishedPageDSL(samplePage.id)).toBeNull();
    expect(
      (await adapter.listPagesDSL({ limit: 10, offset: 0 }))[0]?.status,
    ).toBe("draft");
  });

  it("surfaces scheduled status and scheduledFor in page inventory", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });

    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "1000",
    });

    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await adapter.schedulePageDSL(samplePage.id, scheduledFor);

    const listed = await adapter.listPagesDSL({ limit: 10, offset: 0 });
    const versions = await adapter.getPageVersions(samplePage.id);
    expect(listed[0]?.status).toBe("scheduled");
    expect(listed[0]?.scheduledFor).toBe(scheduledFor);
    expect(versions.map((entry) => entry.version)).toEqual(["1000"]);
  });

  it("clears scheduling metadata when unpublishing a scheduled page", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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

  it("keeps D1 page roles synchronized with CMS assignments", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    const listPage: PageDSL = {
      ...samplePage,
      id: "page-tags",
      slug: "tags",
      title: "Tags",
    };
    const entryPage: PageDSL = {
      ...samplePage,
      id: "page-tag",
      slug: "tag",
      title: "Tag",
    };
    await adapter.savePageDSL(listPage.id, listPage);
    await adapter.savePageDSL(entryPage.id, entryPage);

    const collection = await createCollectionOnAdapter(adapter, {
      name: "tags",
      label: "Tags",
      kind: "tags",
      fields: [],
    });
    const assigned = await updateCollectionOnAdapter(adapter, {
      id: collection.id,
      expectedUpdatedAt: collection.updatedAt,
      patch: {
        listPageId: listPage.id,
        templatePageId: entryPage.id,
      },
    });

    expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
      "cms-collection",
    );
    expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
      "cms-entry",
    );

    await updateCollectionOnAdapter(adapter, {
      id: collection.id,
      expectedUpdatedAt: assigned.updatedAt,
      patch: {
        listPageId: null,
        templatePageId: null,
      },
    });

    expect((await adapter.getPagePolicy(listPage.id))?.systemRole).toBe(
      "standard",
    );
    expect((await adapter.getPagePolicy(entryPage.id))?.systemRole).toBe(
      "standard",
    );
  });

  it("invalidates draft and published page thumbnails when page revisions change", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
      aria_r2: new MemoryR2(),
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
      aria_db: createD1Mock(client),
      aria_r2: new MemoryR2(),
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
      aria_db: createD1Mock(client),
      aria_r2: new MemoryR2(),
    });

    const savedPageUrl = await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["draft-thumb"], { type: "image/webp" }),
      "draft",
    );
    expect(savedPageUrl).toBe("/uploads/thumbnails/page/page-home/draft.webp");
    await expect(
      adapter.getPageThumbnail(samplePage.id, "draft"),
    ).resolves.toBe(savedPageUrl);

    const savedComponentUrl = await adapter.saveThumbnail(
      "component",
      "hero-card",
      new Blob(["component-thumb"], { type: "image/png" }),
    );
    expect(savedComponentUrl).toBe(
      "/uploads/thumbnails/component/hero-card.png",
    );
    await expect(adapter.getThumbnail("component", "hero-card")).resolves.toBe(
      savedComponentUrl,
    );
  });

  it("lists stored page thumbnail ids across paginated R2 results", async () => {
    const r2 = new MemoryR2();
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
      aria_r2: r2,
      R2_PUBLIC_URL: "https://assets.example.com",
    });

    await r2.put("thumbnails/page/alpha/draft.webp", new ArrayBuffer(1));
    await r2.put("thumbnails/page/bravo/draft.webp", new ArrayBuffer(1));
    await r2.put("thumbnails/page/charlie/published.webp", new ArrayBuffer(1));

    expect(await adapter.listStoredPageThumbnailKeys()).toEqual(
      new Set(["alpha:draft", "bravo:draft", "charlie:published"]),
    );
  });

  it("compares legacy D1 rows by normalized semantic source hash", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    const stored = await client.execute({
      sql: "SELECT dsl_json FROM aria_page_versions WHERE id = ? AND version = ?",
      args: [samplePage.id, firstVersion],
    });
    const legacyProjection = {
      ...(JSON.parse(String(stored.rows[0]?.dsl_json)) as PageDSL),
      updatedAt: "1999-01-01T00:00:00.000Z",
      author: { id: "legacy-author" },
      isModifiedSincePublish: true,
    };
    await client.execute({
      sql: "UPDATE aria_page_versions SET dsl_json = ?, content_hash = ? WHERE id = ? AND version = ?",
      args: [
        JSON.stringify(legacyProjection),
        "legacy-non-semantic-hash",
        samplePage.id,
        firstVersion,
      ],
    });

    const resavedVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    expect(resavedVersion).toBe(firstVersion);
    expect(await adapter.getPageVersions(samplePage.id)).toHaveLength(1);
  });

  it("prunes intermediate page history while keeping latest and pinned revisions", async () => {
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
    });

    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    const publishedVersion = await adapter.publishPageDSL(samplePage.id);
    expect(publishedVersion).toBe(firstVersion);

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
    expect(result.deletedVersions).toEqual([secondVersion]);
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
      aria_db: createD1Mock(client),
    });

    await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout);
    await adapter.saveComponentDSL(sampleComponent.id, {
      ...sampleComponent,
      source: "aria",
      packId: "aria-marketing",
      packVersion: "2.4.0",
    });

    const layout = await adapter.getLayoutDSL(sampleLayout.id);
    const component = await adapter.getComponentDSL(sampleComponent.id);
    const layouts = await adapter.listLayoutsDSL();
    const components = await adapter.listComponentsDSL();

    expect(layout?.name).toBe(sampleLayout.name);
    expect(component?.name).toBe(sampleComponent.name);
    expect(component?.packVersion).toBe("2.4.0");
    expect(component?.version).not.toBe(component?.packVersion);
    expect(layouts.map((item) => item.id)).toContain(sampleLayout.id);
    expect(components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sampleComponent.id,
          packVersion: "2.4.0",
        }),
      ]),
    );
  });

  it("stores builder state in D1 and mirrors snapshots to KV cache", async () => {
    const kv = new MemoryKv();
    const adapter = new CloudflareStorageAdapter({
      aria_db: createD1Mock(client),
      aria_cache: kv,
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
      aria_db: createD1Mock(client),
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
