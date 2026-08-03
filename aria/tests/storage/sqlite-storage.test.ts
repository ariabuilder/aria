import { createClient, type Client, type InValue } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { z } from "zod";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { BLOG_ENTRY_TEMPLATE_PAGE_ID } from "../../lib/storage/starterContent";
import { STARTER_BLOG_PAGES_COMPOSER_SLUG } from "../../lib/storage/starterCmsEntries";
import type { StylesData } from "../../lib/storage/adapter";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
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
import type {
  AriaCloudflareEnv,
  RuntimeLocals,
} from "../../lib/cloudflare/env";
import { createD1Mock } from "../helpers/d1Mock";
import { normalizeSurfaceForPersistence } from "../../lib/storage/internal/domains/surfaceNormalization";

const samplePage: PageDSL = {
  id: "page-home",
  title: "Home",
  slug: "home",
  description: "Home page",
  layout: "marketing-shell",
  status: "draft",
  nodes: [
    {
      id: "page-root",
      type: "Container",
      props: {},
      styles: {},
      children: [
        {
          id: "page-heading",
          type: "Text",
          props: { content: "Hello from SQLite" },
          styles: {},
          children: [],
        },
      ],
    },
  ],
  settings: {
    cssVariables: {},
    breakpoints: [
      { name: "mobile", minWidth: "0px", label: "Mobile" },
      { name: "desktop", minWidth: "1024px", label: "Desktop" },
    ],
  },
};

const sampleLayout: LayoutDSL = {
  id: "marketing-shell",
  name: "Marketing Shell",
  description: "Layout for marketing pages",
  nodes: [
    {
      id: "layout-root",
      type: "Container",
      props: {},
      styles: {},
      children: [],
    },
  ],
  slots: [
    { name: "header", label: "Header", required: false },
    { name: "default", label: "Default", required: true, isDefault: true },
    { name: "footer", label: "Footer", required: false },
  ],
};

const sampleComponent: ComponentDSL = {
  id: "hero-banner",
  name: "Hero Banner",
  description: "Reusable hero block",
  category: "marketing",
  nodes: [
    {
      id: "component-root",
      type: "Container",
      props: {},
      styles: {},
      children: [],
    },
  ],
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

const PagePolicyRowSchema = z
  .object({
    system_role: z.string(),
    access_mode: z.string(),
    access_password_hash: z.string().nullable(),
    access_policy_version: z.coerce.number(),
  })
  .strict();

describe("SQLiteStorageAdapter", () => {
  let client: Client;
  let adapter: SQLiteStorageAdapter;
  let tempDir: string;
  let uploadDir: string;
  let snapshotDir: string;
  let thumbnailsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-sqlite-test-"));
    uploadDir = path.join(tempDir, "uploads");
    snapshotDir = path.join(tempDir, "snapshots");
    thumbnailsDir = path.join(tempDir, "thumbnails");
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("saves and retrieves a page by id and slug", async () => {
    const version = await adapter.savePageDSL(samplePage.id, samplePage);

    expect(version).toMatch(/^\d+$/);

    const byId = await adapter.getPageDSL(samplePage.id);
    const bySlug = await adapter.getPageDSL(samplePage.slug);

    expect(byId?.title).toBe(samplePage.title);
    expect(bySlug?.slug).toBe(samplePage.slug);
    expect(bySlug?.layout).toBe(samplePage.layout);
  });

  it("stores canonical surface sources and source hashes for every DSL kind", async () => {
    const page = {
      ...samplePage,
      version: "client-page-version",
      updatedAt: "2020-01-01T00:00:00.000Z",
      nodes: [
        {
          ...samplePage.nodes[0],
          props: { borderRadius: "12px" },
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

    const [pageVersion, layoutVersion, componentVersion] = await Promise.all([
      adapter.savePageDSL(page.id, page),
      adapter.saveLayoutDSL(layout.id, layout),
      adapter.saveComponentDSL(component.id, component),
    ]);
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

  it("rejects invalid recursive page input before creating storage rows", async () => {
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

  it("persists lease-bounded Studio presence and rejects stale heartbeats", async () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const current = await adapter.upsertStudioPresenceSession({
      sessionId,
      userId,
      displayName: "Editor",
      avatarUrl: null,
      surface: "composer",
      resourceType: "page",
      resourceId: samplePage.id,
      state: "editing",
      dirty: true,
      connectedAt: 100,
      lastActivityAt: 200,
      leaseExpiresAt: 300,
      expiresAt: 400,
    });
    expect(current?.state).toBe("editing");
    expect(await adapter.listStudioPresenceSessions(250)).toHaveLength(1);

    const stale = await adapter.upsertStudioPresenceSession({
      sessionId,
      userId,
      displayName: "Editor",
      avatarUrl: null,
      surface: "composer",
      resourceType: "page",
      resourceId: samplePage.id,
      state: "away",
      dirty: false,
      connectedAt: 100,
      lastActivityAt: 150,
      leaseExpiresAt: null,
      expiresAt: 500,
    });
    expect(stale).toBeNull();
    expect((await adapter.listStudioPresenceSessions(350))[0]?.state).toBe(
      "viewing",
    );

    const replayed = await adapter.upsertStudioPresenceSession({
      sessionId,
      userId,
      displayName: "Editor",
      avatarUrl: null,
      surface: "composer",
      resourceType: "page",
      resourceId: samplePage.id,
      state: "editing",
      dirty: true,
      connectedAt: 100,
      lastActivityAt: 200,
      leaseExpiresAt: 450,
      expiresAt: 500,
    });
    expect(replayed).toBeNull();
    expect(await adapter.listStudioPresenceSessions(450)).toEqual([]);
  });

  it("paginates 10,000 page activity rows in storage", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage);
    const totalRows = 10_000;
    const statements = Array.from({ length: totalRows }, (_, index) => {
      const isSystem = index % 10 === 0;
      const isMalformed = index % 15 === 0;
      const version = String(1_000_000 + index).padStart(16, "0");
      return {
        sql: `INSERT INTO aria_page_versions (
                id, version, slug, title, status, dsl_json, created_at,
                created_by_id, created_by_username, created_by_email,
                activity_metadata
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          samplePage.id,
          version,
          samplePage.slug,
          samplePage.title,
          "draft",
          JSON.stringify(samplePage),
          new Date(index).toISOString(),
          isSystem && !isMalformed ? "system" : "activity-user",
          isSystem && !isMalformed ? "System" : "Activity User",
          "activity@example.com",
          isMalformed
            ? "{malformed"
            : JSON.stringify({
                action: "page_updated",
                userId: isSystem ? "system" : "activity-user",
                userName: isSystem ? "System" : "Activity User",
                target: "this page",
              }),
        ],
      } satisfies { sql: string; args: InValue[] };
    });
    for (let index = 0; index < statements.length; index += 500) {
      await client.batch(statements.slice(index, index + 500), "write");
    }

    const startedAt = performance.now();
    const page = await adapter.getPageActivityPage({
      pageId: samplePage.id,
      limit: 20,
      offset: 4_000,
    });
    const durationMs = performance.now() - startedAt;

    expect(page.items).toHaveLength(20);
    expect(page.total).toBe(9_334);
    expect(
      (page.items[0]?.version ?? "").localeCompare(
        page.items[19]?.version ?? "",
      ),
    ).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(1_000);
  });

  it("hydrates page DSL policy fields from metadata instead of stale DSL", async () => {
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      systemRole: "cms-entry",
      accessMode: "private",
    });

    await adapter.savePagePolicy({
      idOrSlug: samplePage.id,
      systemRole: "standard",
      accessMode: "public",
      accessPasswordHash: null,
      accessPromptTitle: null,
      accessPromptDescription: null,
      accessRememberForDays: null,
      accessPolicyVersion: 2,
    });

    const reloaded = await adapter.getPageDSL(samplePage.id);

    expect(reloaded?.systemRole).toBe("standard");
    expect(reloaded?.accessMode).toBe("public");
  });

  it("stamps version authorship columns when authorship context is provided", async () => {
    const actor = {
      id: "11111111-1111-4111-8111-111111111111",
      username: "editor",
      email: "editor@example.com",
    };

    await adapter.savePageDSL(
      samplePage.id,
      samplePage,
      { preserveVersion: true, versionHint: "auth-v1" },
      buildAuthorshipSaveContext(
        {
          id: actor.id,
          username: actor.username,
          email: actor.email,
          role: "content-editor",
          totpEnabled: false,
        },
        "save-page",
      ),
    );

    const row = await client.execute({
      sql: `SELECT created_by_id, created_by_username, created_by_email
            FROM aria_page_versions
            WHERE id = ? AND version = ?`,
      args: [samplePage.id, "auth-v1"],
    });

    expect(String(row.rows[0]?.created_by_id)).toBe(actor.id);
    expect(String(row.rows[0]?.created_by_username)).toBe(actor.username);
    expect(String(row.rows[0]?.created_by_email)).toBe(actor.email);

    const authorship = await adapter.getPageAuthorship(samplePage.id);
    expect(authorship?.updatedBy?.id).toBe(actor.id);
    expect(authorship?.updatedBy?.username).toBe(actor.username);

    const inventory = await adapter.listPagesDSL();
    const listed = inventory.find((entry) => entry.id === samplePage.id);
    expect(listed?.authorship?.lastEditorName).toBe(actor.username);

    const hydrated = await adapter.getPageDSL(samplePage.id, "auth-v1");
    expect(hydrated?.author?.id).toBe(actor.id);
    expect(hydrated?.author?.name).toBe(actor.username);

    const versions = await adapter.getPageVersions(samplePage.id);
    const versionEntry = versions.find((entry) => entry.version === "auth-v1");
    expect(versionEntry?.createdBy?.id).toBe(actor.id);
  });

  it("tracks page versions and returns the latest version by default", async () => {
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updatedPage: PageDSL = {
      ...samplePage,
      title: "Home Updated",
      description: "Updated description",
    };
    const secondVersion = await adapter.savePageDSL(samplePage.id, updatedPage);

    const latest = await adapter.getPageDSL(samplePage.id);
    const original = await adapter.getPageDSL(samplePage.id, firstVersion);
    const versions = await adapter.getPageVersions(samplePage.id);

    expect(secondVersion).not.toBe(firstVersion);
    expect(latest?.title).toBe("Home Updated");
    expect(original?.title).toBe("Home");
    expect(versions[0]?.version).toBe(secondVersion);
    expect(versions[1]?.version).toBe(firstVersion);
  });

  it("includes page description in listPagesDSL inventory", async () => {
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      description: "Editor summary",
    });

    const inventory = await adapter.listPagesDSL();
    const listed = inventory.find((entry) => entry.id === samplePage.id);

    expect(listed?.description).toBe("Editor summary");
  });

  it("skips unchanged page saves by default", async () => {
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    const versions = await adapter.getPageVersions(samplePage.id);

    expect(secondVersion).toBe(firstVersion);
    expect(versions.map((entry) => entry.version)).toEqual([firstVersion]);
  });

  it("compares legacy stored rows by normalized semantic source hash", async () => {
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

  it("allows exactly one concurrent guarded page save", async () => {
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

  it("commits a guarded page and layout draft in one storage batch", async () => {
    await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout, {
      preserveVersion: true,
      versionHint: "layout-v1",
    });
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "page-v1",
    });

    await adapter.savePageDSL(
      samplePage.id,
      { ...samplePage, title: "Atomic update" },
      {
        expectedVersion: "page-v1",
        linkedLayoutDraft: {
          id: sampleLayout.id,
          expectedVersion: "layout-v1",
          dsl: { ...sampleLayout, description: "Atomic layout update" },
        },
      },
    );

    expect((await adapter.getPageDSL(samplePage.id))?.title).toBe(
      "Atomic update",
    );
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.description).toBe(
      "Atomic layout update",
    );

    const layoutVersion = (await adapter.getLayoutDSL(sampleLayout.id))
      ?.version;
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

  it("does not commit a linked layout when the page changes after preflight", async () => {
    await adapter.saveLayoutDSL(sampleLayout.id, sampleLayout, {
      preserveVersion: true,
      versionHint: "layout-race-v1",
    });
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "page-race-v1",
    });
    await client.execute(`
      INSERT INTO aria_page_versions (
        id, version, slug, title, status, dsl_json, created_at, content_hash
      )
      SELECT
        id, 'page-race-v2', slug, title, status, dsl_json, created_at, content_hash
      FROM aria_page_versions
      WHERE id = 'page-home' AND version = 'page-race-v1'
    `);

    const originalBatch = client.batch.bind(client);
    let injectedCompetingSave = false;
    (client as unknown as { batch: typeof client.batch }).batch = async (
      ...args
    ) => {
      if (!injectedCompetingSave) {
        injectedCompetingSave = true;
        await client.execute({
          sql: `UPDATE aria_page_meta
                SET draft_version = ?, current_version = ?
                WHERE id = ?`,
          args: ["page-race-v2", "page-race-v2", samplePage.id],
        });
      }
      return originalBatch(...args);
    };

    await expect(
      adapter.savePageDSL(
        samplePage.id,
        { ...samplePage, title: "Must not commit" },
        {
          expectedVersion: "page-race-v1",
          linkedLayoutDraft: {
            id: sampleLayout.id,
            expectedVersion: "layout-race-v1",
            dsl: { ...sampleLayout, description: "Must not commit" },
          },
        },
      ),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(
      (await adapter.getPageVersionPins(samplePage.id))?.draftVersion,
    ).toBe("page-race-v2");
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.version).toBe(
      "layout-race-v1",
    );
    expect((await adapter.getLayoutDSL(sampleLayout.id))?.description).toBe(
      sampleLayout.description,
    );
  });

  it("never lets a guarded save and publish overwrite each other's pointers", async () => {
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

  it("does not attach dependency pins when publish loses its revision fence", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage, {
      preserveVersion: true,
      versionHint: "publish-pin-race-v1",
    });
    await client.execute(`
      INSERT INTO aria_page_versions (
        id, version, slug, title, status, dsl_json, created_at, content_hash
      )
      SELECT
        id, 'publish-pin-race-v2', slug, title, status, dsl_json, created_at, content_hash
      FROM aria_page_versions
      WHERE id = 'page-home' AND version = 'publish-pin-race-v1'
    `);

    const originalBatch = client.batch.bind(client);
    let injectedCompetingSave = false;
    (client as unknown as { batch: typeof client.batch }).batch = async (
      ...args
    ) => {
      if (!injectedCompetingSave) {
        injectedCompetingSave = true;
        await client.execute({
          sql: `UPDATE aria_page_meta
                SET draft_version = ?, current_version = ?
                WHERE id = ?`,
          args: ["publish-pin-race-v2", "publish-pin-race-v2", samplePage.id],
        });
      }
      return originalBatch(...args);
    };

    await expect(
      adapter.publishPageDSL(samplePage.id, undefined, {
        expectedVersion: "publish-pin-race-v1",
        dependencies: { components: { "hero-banner": "component-v1" } },
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const dependencyRow = await client.execute({
      sql: `SELECT dependency_versions_json
            FROM aria_page_versions
            WHERE id = ? AND version = ?`,
      args: [samplePage.id, "publish-pin-race-v1"],
    });
    expect(dependencyRow.rows[0]?.dependency_versions_json).toBeNull();
  });

  it("does not create a draft revision when resaving an enriched published page", async () => {
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      status: "published",
    });
    const publishedVersion = await adapter.publishPageDSL(samplePage.id);
    expect(publishedVersion).toBeTruthy();

    const enrichedPage = await adapter.getPageDSL(samplePage.id);
    expect(enrichedPage?.isModifiedSincePublish).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const resavedVersion = await adapter.savePageDSL(
      samplePage.id,
      enrichedPage!,
    );
    const pins = await adapter.getPageVersionPins(samplePage.id);
    const listed = await adapter.listPagesDSL({ limit: 10, offset: 0 });

    expect(resavedVersion).toBe(publishedVersion);
    expect(pins?.draftVersion).toBe(publishedVersion);
    expect(pins?.publishedVersion).toBe(publishedVersion);
    expect(
      listed.find((entry) => entry.id === samplePage.id)
        ?.isModifiedSincePublish,
    ).toBe(false);
  });

  it("automatically prunes page history to the default retention limit", async () => {
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
        title: "Home Draft Update",
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
    expect(draft?.title).toBe("Home Draft Update");
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

  it("derives access_mode from legacy DSL visibility when creating a new page", async () => {
    await adapter.savePageDSL("page-unlisted", {
      ...samplePage,
      id: "page-unlisted",
      slug: "page-unlisted",
      title: "Unlisted Page",
      visibility: "unlisted",
    });

    const insertedRow = PagePolicyRowSchema.parse(
      (
        await client.execute({
          sql: `SELECT system_role, access_mode, access_password_hash, access_policy_version
                FROM aria_page_meta
                WHERE id = ?`,
          args: ["page-unlisted"],
        })
      ).rows[0],
    );

    expect(insertedRow).toEqual({
      system_role: "standard",
      access_mode: "unlisted",
      access_password_hash: null,
      access_policy_version: 1,
    });
  });

  it("reads and writes typed page policy and access sessions", async () => {
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

  it("rejects legacy system_role schemas instead of repairing them at runtime", async () => {
    await client.executeMultiple(`
      CREATE TABLE aria_page_meta (
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
        access_mode TEXT NOT NULL DEFAULT 'public' CHECK (access_mode IN ('public', 'password', 'private', 'unlisted')),
        access_password_hash TEXT,
        access_prompt_title TEXT,
        access_prompt_description TEXT,
        access_remember_for_days INTEGER CHECK (access_remember_for_days IS NULL OR access_remember_for_days BETWEEN 1 AND 30),
        access_policy_version INTEGER NOT NULL DEFAULT 1,
        scheduled_for TEXT,
        schedule_lease_token TEXT,
        schedule_lease_expires_at TEXT,
        schedule_attempt_count INTEGER NOT NULL DEFAULT 0,
        last_schedule_error TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE aria_collections (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('content', 'data', 'config', 'tags')),
        schema_json TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'collection')),
        url_pattern TEXT,
        template_page_id TEXT,
        list_page_id TEXT,
        supports_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO aria_page_meta (
        id,
        slug,
        title,
        status,
        parent,
        layout,
        draft_version,
        published_version,
        current_version,
        system_role,
        access_mode,
        access_policy_version,
        updated_at
      )
      VALUES (
        'legacy-template',
        'legacy-template',
        'Legacy Template',
        'draft',
        NULL,
        NULL,
        'v1',
        NULL,
        'v1',
        'standard',
        'public',
        1,
        '2026-07-05T00:00:00.000Z'
      );
    `);

    await expect(
      adapter.savePagePolicy({
        idOrSlug: "legacy-template",
        systemRole: "cms-entry",
        accessMode: "public",
        accessPasswordHash: null,
        accessPromptTitle: null,
        accessPromptDescription: null,
        accessRememberForDays: null,
        accessPolicyVersion: 1,
        updatedAt: "2026-07-05T00:05:00.000Z",
      }),
    ).rejects.toThrow(/reset\/reprovision/i);
  });

  it("invalidates draft thumbnails when a page draft is saved again", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage);
    await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["draft-thumbnail"], { type: "image/webp" }),
      "draft",
    );

    expect(
      await adapter.readPageThumbnail(samplePage.id, "draft"),
    ).not.toBeNull();

    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Draft changed",
    });

    expect(await adapter.readPageThumbnail(samplePage.id, "draft")).toBeNull();
  });

  it("invalidates published thumbnails when a page is republished", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage);
    await adapter.publishPageDSL(samplePage.id);
    await adapter.savePageThumbnail(
      samplePage.id,
      new Blob(["published-thumbnail"], { type: "image/webp" }),
      "published",
    );

    expect(
      await adapter.readPageThumbnail(samplePage.id, "published"),
    ).not.toBeNull();

    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Published changed",
    });
    await adapter.publishPageDSL(samplePage.id);

    expect(
      await adapter.readPageThumbnail(samplePage.id, "published"),
    ).toBeNull();
  });

  it("prunes intermediate page history while keeping latest and pinned revisions", async () => {
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

  it("saves, lists, and deletes layouts and components", async () => {
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

    await adapter.deleteLayoutDSL(sampleLayout.id);
    await adapter.deleteComponentDSL(sampleComponent.id);

    expect(await adapter.getLayoutDSL(sampleLayout.id)).toBeNull();
    expect(await adapter.getComponentDSL(sampleComponent.id)).toBeNull();
  });

  it("stores builder state records used outside raw DSL", async () => {
    await adapter.saveOrder("pages", ["home", "pricing", "contact"]);
    await adapter.saveSnapshot("home", "<html><body>snapshot</body></html>");
    await adapter.saveSiteSettings({
      siteName: "Aria Test",
      siteDescription: "SQLite-backed settings",
      siteUrl: "https://example.com",
    });

    expect(await adapter.getOrder("pages")).toEqual([
      "home",
      "pricing",
      "contact",
    ]);
    expect(await adapter.getSnapshot("home")).toContain("snapshot");
    expect(await adapter.getSiteSettings()).toMatchObject({
      siteName: "Aria Test",
      siteDescription: "SQLite-backed settings",
      siteUrl: "https://example.com",
    });
  });

  it("normalizes legacy framework settings into utilityEngine and persists only the canonical field", async () => {
    await adapter.saveSiteSettings({ siteName: "Bootstrap" });

    await client.execute({
      sql: `INSERT INTO aria_site_settings (id, settings_json, updated_at)
            VALUES ('default', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              settings_json = excluded.settings_json,
              updated_at = excluded.updated_at`,
      args: [
        JSON.stringify({
          siteName: "Legacy Settings",
          framework: "custom",
        }),
        "2026-03-20T12:00:00.000Z",
      ],
    });

    expect(await adapter.getSiteSettings()).toMatchObject({
      siteName: "Legacy Settings",
      utilityEngine: "custom",
    });
    expect(
      "framework" in
        ((await adapter.getSiteSettings()) as Record<string, unknown>),
    ).toBe(false);

    await adapter.saveSiteSettings({
      siteName: "Canonical Settings",
      utilityEngine: "unocss",
    });

    const persisted = await client.execute({
      sql: `SELECT settings_json FROM aria_site_settings WHERE id = 'default'`,
      args: [],
    });
    const stored = JSON.parse(
      String(persisted.rows[0]?.settings_json ?? "{}"),
    ) as Record<string, unknown>;

    expect(stored.utilityEngine).toBe("unocss");
    expect(stored.framework).toBeUndefined();
  });

  it("persists canonical design-system style artifacts through the SQLite adapter", async () => {
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

  it("lists nested media files such as uploaded fonts", async () => {
    await adapter.saveMedia("fonts/brand-display.woff2", Buffer.from("font"), {
      contentType: "font/woff2",
    });
    await adapter.saveMedia("images/logo.svg", Buffer.from("logo"), {
      contentType: "image/svg+xml",
    });

    const media = await adapter.listMedia();

    expect(media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "fonts/brand-display.woff2",
          url: "/uploads/fonts/brand-display.woff2",
          contentType: "font/woff2",
        }),
        expect.objectContaining({
          path: "images/logo.svg",
          url: "/uploads/images/logo.svg",
          contentType: "image/svg+xml",
        }),
      ]),
    );
  });

  it("ignores hidden files when listing media", async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, ".DS_Store"), "finder");
    await fs.mkdir(path.join(uploadDir, "images"), { recursive: true });
    await fs.writeFile(path.join(uploadDir, "images", ".DS_Store"), "finder");
    await adapter.saveMedia("images/hero.png", Buffer.from("hero"), {
      contentType: "image/png",
    });

    const media = await adapter.listMedia();
    const listedPaths = media.map((item) => item.path);

    expect(listedPaths).toContain("images/hero.png");
    expect(listedPaths).not.toContain(".DS_Store");
    expect(listedPaths).not.toContain("images/.DS_Store");
  });

  it("lists indexed media usage by logical path", async () => {
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

  it("stores page thumbnails as SQLite blobs and preserves the uploaded content type", async () => {
    const source = Buffer.from("page-thumbnail-png");

    const thumbnailUrl = await adapter.savePageThumbnail(
      samplePage.id,
      new Blob([source], { type: "image/png" }),
      "draft",
    );
    const stored = await adapter.readPageThumbnail(samplePage.id, "draft");
    const lookupUrl = await adapter.getPageThumbnail(samplePage.id, "draft");
    const rows = await client.execute({
      sql: `SELECT kind, ref_id, stage, content_type, size_bytes
            FROM aria_thumbnails
            WHERE kind = 'page' AND ref_id = ? AND stage = 'draft'`,
      args: [samplePage.id],
    });

    expect(thumbnailUrl).toContain(
      `/admin/api/page-thumbnails/${samplePage.id}`,
    );
    expect(thumbnailUrl).toContain("stage=draft");
    expect(lookupUrl).toBe(thumbnailUrl);
    expect(stored?.buffer.equals(source)).toBe(true);
    expect(stored?.contentType).toBe("image/png");
    expect(rows.rows[0]).toMatchObject({
      kind: "page",
      ref_id: samplePage.id,
      stage: "draft",
      content_type: "image/png",
      size_bytes: source.byteLength,
    });

    await adapter.deletePageThumbnail(samplePage.id, "draft");

    expect(await adapter.readPageThumbnail(samplePage.id, "draft")).toBeNull();
  });

  it("stores component thumbnails in aria_thumbnails and returns data URLs locally", async () => {
    const source = Buffer.from("component-thumbnail");

    const savedUrl = await adapter.saveThumbnail(
      "component",
      sampleComponent.id,
      new Blob([source], { type: "image/webp" }),
    );
    const lookupUrl = await adapter.getThumbnail(
      "component",
      sampleComponent.id,
    );
    const rows = await client.execute({
      sql: `SELECT kind, ref_id, stage, content_type, size_bytes
            FROM aria_thumbnails
            WHERE kind = 'component' AND ref_id = ? AND stage = 'default'`,
      args: [sampleComponent.id],
    });

    expect(savedUrl).toMatch(/^data:image\/webp;base64,/);
    expect(lookupUrl).toBe(savedUrl);
    expect(rows.rows[0]).toMatchObject({
      kind: "component",
      ref_id: sampleComponent.id,
      stage: "default",
      content_type: "image/webp",
      size_bytes: source.byteLength,
    });

    await adapter.deleteThumbnail("component", sampleComponent.id);

    expect(
      await adapter.getThumbnail("component", sampleComponent.id),
    ).toBeNull();
  });

  it("removes page records from both meta and versions tables", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage);

    expect(await adapter.getPageDSL(samplePage.id)).not.toBeNull();

    await adapter.deletePageDSL(samplePage.slug);

    expect(await adapter.getPageDSL(samplePage.id)).toBeNull();
    expect(await adapter.listPagesDSL({ limit: 10, offset: 0 })).toEqual([]);
  });

  it("seeds the four starter layouts when enabled", async () => {
    const seededAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: true,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });

    const layouts = await seededAdapter.listLayoutsDSL();

    expect(layouts.map((layout) => layout.id).sort()).toEqual([
      "full-width",
      "left-sidebar",
      "right-sidebar",
      "two-sidebar",
    ]);
  });

  it("seeds the starter home page when enabled", async () => {
    const seededAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: true,
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });

    const homePage = await seededAdapter.getPageDSL("index");

    expect(homePage?.id).toBe("index");
    expect(homePage?.slug).toBe("index");
    expect(homePage?.title).toBe("Home");
    expect(homePage?.status).toBe("published");
  });

  it("refuses to delete the reserved home page", async () => {
    const seededAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: true,
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });

    await expect(seededAdapter.deletePageDSL("index")).rejects.toThrow(
      "Cannot delete reserved home page: index",
    );

    expect(await seededAdapter.getPageDSL("index")).not.toBeNull();
  });
});

describe("first-install starter seeding", () => {
  let client: Client;
  let tempDir: string;
  let uploadDir: string;
  let snapshotDir: string;
  let thumbnailsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-first-install-"));
    uploadDir = path.join(tempDir, "uploads");
    snapshotDir = path.join(tempDir, "snapshots");
    thumbnailsDir = path.join(tempDir, "thumbnails");
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function createSeededAdapter(): SQLiteStorageAdapter {
    return new SQLiteStorageAdapter(client, {
      seedStarterLayouts: true,
      seedStarterPages: true,
      seedStarterCms: true,
      seedStarterDesign: true,
      seedStarterSiteSettings: true,
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });
  }

  async function rebootAdapter(): Promise<SQLiteStorageAdapter> {
    return createSeededAdapter();
  }

  it("does not seed starter content by default", async () => {
    const adapter = new SQLiteStorageAdapter(client, {
      uploadDir,
      snapshotDir,
      thumbnailsDir,
    });

    expect(await adapter.getPageDSL("index")).toBeNull();
    expect(await adapter.listLayoutsDSL()).toEqual([]);
    expect(await adapter.getCollection("blog")).toBeNull();
  });

  it("seeds starter content once on a fresh database", async () => {
    const adapter = createSeededAdapter();

    expect(await adapter.getPageDSL("index")).not.toBeNull();
    expect(
      await adapter.getPageDSL(BLOG_ENTRY_TEMPLATE_PAGE_ID),
    ).not.toBeNull();
    expect(await adapter.getCollection("blog")).not.toBeNull();
    expect(await adapter.getCollection("main-nav")).not.toBeNull();

    const mainNavEntries = await adapter.listEntries({
      collectionId: "main-nav",
    });
    expect(mainNavEntries.items).toHaveLength(1);
    await expect(
      adapter.getEntry({ collectionId: "main-nav", idOrSlug: "main-nav" }),
    ).resolves.toMatchObject({
      locales: [
        {
          slug: "main-nav",
          frontmatter: {
            location: "header",
          },
        },
      ],
    });

    expect((await adapter.getSiteSettings())?.localization?.content).toEqual({
      defaultLocale: "en",
      locales: [{ code: "en", label: "English", enabled: true, fallbacks: [] }],
    });
    expect((await adapter.getSiteSettings())?.utilityEngine).toBe("custom");

    const blogEntries = await adapter.listEntries({ collectionId: "blog" });
    expect(blogEntries.items.length).toBeGreaterThan(0);
  });

  it("does not re-insert deleted starter pages after reboot", async () => {
    const adapter = createSeededAdapter();
    expect(
      await adapter.getPageDSL(BLOG_ENTRY_TEMPLATE_PAGE_ID),
    ).not.toBeNull();

    await adapter.deletePageDSL(BLOG_ENTRY_TEMPLATE_PAGE_ID);

    const rebooted = await rebootAdapter();
    expect(await rebooted.getPageDSL(BLOG_ENTRY_TEMPLATE_PAGE_ID)).toBeNull();
  });

  it("does not re-insert deleted starter CMS entries after reboot", async () => {
    const adapter = createSeededAdapter();
    const blogCollection = await adapter.getCollection("blog");
    expect(blogCollection).not.toBeNull();

    const entries = await adapter.listEntries({
      collectionId: blogCollection!.id,
    });
    const target = entries.items.find(
      (item) => item.locales[0]?.slug === STARTER_BLOG_PAGES_COMPOSER_SLUG,
    );
    expect(target).toBeDefined();
    await adapter.deleteEntry(blogCollection!.id, target!.entry.id);

    const rebooted = await rebootAdapter();
    const afterEntries = await rebooted.listEntries({
      collectionId: blogCollection!.id,
    });
    expect(
      afterEntries.items.some(
        (item) => item.locales[0]?.slug === STARTER_BLOG_PAGES_COMPOSER_SLUG,
      ),
    ).toBe(false);
  });

  it("does not re-insert deleted starter collections after reboot", async () => {
    const adapter = createSeededAdapter();
    const tags = await adapter.getCollection("tags");
    expect(tags).not.toBeNull();

    await adapter.deleteCollection(tags!.id);

    const rebooted = await rebootAdapter();
    expect(await rebooted.getCollection("tags")).toBeNull();
  });

  it("does not mutate the home page DSL after reboot", async () => {
    const adapter = createSeededAdapter();
    const homeBefore = await adapter.getPageDSL("index");
    expect(homeBefore).not.toBeNull();

    const rebooted = await rebootAdapter();
    const homeAfter = await rebooted.getPageDSL("index");

    expect(JSON.stringify(homeAfter)).toBe(JSON.stringify(homeBefore));
  });

  it("does not repair page system roles after reboot", async () => {
    const adapter = createSeededAdapter();
    const blogPage = await adapter.getPageDSL("blog");
    expect(blogPage?.systemRole).toBe("cms-collection");

    await client.execute({
      sql: `UPDATE aria_page_meta SET system_role = ? WHERE id = ?`,
      args: ["standard", "blog"],
    });

    const rebooted = await rebootAdapter();
    const blogAfter = await rebooted.getPageDSL("blog");
    expect(blogAfter?.systemRole).toBe("standard");
  });
});
