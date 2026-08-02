import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import type { SessionUser } from "../../lib/auth/types";
import {
  buildAuthorshipSaveContext,
  buildSystemAuthorshipSaveContext,
} from "../../lib/authorship/stamping";
import { CloudflareStorageAdapter } from "../../lib/storage/cloudflare";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";
import { createD1Mock } from "../helpers/d1Mock";

type StorageAdapterUnderTest = SQLiteStorageAdapter | CloudflareStorageAdapter;

const editorA: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "editor-a",
  email: "editor-a@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const publisherB: SessionUser = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "publisher-b",
  email: "publisher-b@example.com",
  role: "manager",
  totpEnabled: false,
};

const samplePage: PageDSL = {
  id: "auth-page",
  title: "Auth Page",
  slug: "auth-page",
  status: "draft",
  nodes: [],
};

const sampleLayout: LayoutDSL = {
  id: "auth-layout",
  name: "Auth Layout",
  description: "Layout for authorship tests",
  nodes: [],
  slots: [{ name: "main", label: "Main", isDefault: true }],
};

const sampleComponent: ComponentDSL = {
  id: "auth-component",
  name: "Auth Component",
  description: "Component for authorship tests",
  category: "marketing",
  nodes: [],
};

async function queryVersionAuthorship(
  client: Client,
  table:
    | "aria_page_versions"
    | "aria_layout_versions"
    | "aria_component_versions",
  id: string,
  version: string,
) {
  const row = await client.execute({
    sql: `SELECT created_by_id, created_by_username, created_by_email
          FROM ${table}
          WHERE id = ? AND version = ?`,
    args: [id, version],
  });

  return row.rows[0] as unknown as
    | {
        created_by_id: string | null;
        created_by_username: string | null;
        created_by_email: string | null;
      }
    | undefined;
}

function runAdapterParityTests(
  label: string,
  createFixture: () => Promise<{
    client: Client;
    adapter: StorageAdapterUnderTest;
    cleanup: () => Promise<void>;
  }>,
) {
  describe(`${label} authorship persistence`, () => {
    let client: Client;
    let adapter: StorageAdapterUnderTest;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const fixture = await createFixture();
      client = fixture.client;
      adapter = fixture.adapter;
      cleanup = fixture.cleanup;
      await adapter.listPagesDSL();
    });

    afterEach(async () => {
      await cleanup();
    });

    it("stamps page version authorship and exposes it on reads", async () => {
      const authorship = buildAuthorshipSaveContext(editorA, "save-page");

      await adapter.savePageDSL(
        samplePage.id,
        samplePage,
        { preserveVersion: true, versionHint: "page-v1" },
        authorship,
      );

      const row = await queryVersionAuthorship(
        client,
        "aria_page_versions",
        samplePage.id,
        "page-v1",
      );

      expect(String(row?.created_by_id)).toBe(editorA.id);
      expect(String(row?.created_by_username)).toBe(editorA.username);
      expect(String(row?.created_by_email)).toBe(editorA.email);

      const authorshipRead = await adapter.getPageAuthorship(samplePage.id);
      expect(authorshipRead?.updatedBy?.id).toBe(editorA.id);

      const versions = await adapter.getPageVersions(samplePage.id);
      const entry = versions.find((v) => v.version === "page-v1");
      expect(entry?.createdBy?.id).toBe(editorA.id);

      const inventory = await adapter.listPagesDSL();
      const listed = inventory.find((entry) => entry.id === samplePage.id);
      expect(listed?.authorship?.lastEditorName).toBe(editorA.username);

      const hydrated = await adapter.getPageDSL(samplePage.id, "page-v1");
      expect(hydrated?.author?.id).toBe(editorA.id);
      expect(hydrated?.author?.name).toBe(editorA.username);
    });

    it("stamps layout version authorship on save", async () => {
      const authorship = buildAuthorshipSaveContext(editorA, "save-layout");

      await adapter.saveLayoutDSL(
        sampleLayout.id,
        sampleLayout,
        { preserveVersion: true, versionHint: "layout-v1" },
        authorship,
      );

      const row = await queryVersionAuthorship(
        client,
        "aria_layout_versions",
        sampleLayout.id,
        "layout-v1",
      );

      expect(String(row?.created_by_id)).toBe(editorA.id);
      expect(String(row?.created_by_username)).toBe(editorA.username);
    });

    it("stamps component version authorship on save", async () => {
      const authorship = buildAuthorshipSaveContext(editorA, "save-component");

      await adapter.saveComponentDSL(
        sampleComponent.id,
        sampleComponent,
        { preserveVersion: true, versionHint: "component-v1" },
        authorship,
      );

      const row = await queryVersionAuthorship(
        client,
        "aria_component_versions",
        sampleComponent.id,
        "component-v1",
      );

      expect(String(row?.created_by_id)).toBe(editorA.id);
      expect(String(row?.created_by_username)).toBe(editorA.username);

      const versions = await adapter.listComponentVersions(sampleComponent.id);
      const entry = versions.find((v) => v.version === "component-v1");
      expect(entry?.createdBy?.id).toBe(editorA.id);
      expect(entry?.createdBy?.username).toBe(editorA.username);
      expect(entry?.createdBy?.email).toBe(editorA.email);
    });

    it("publishes the exact authored draft without creating another version row", async () => {
      const draftAuthorship = buildAuthorshipSaveContext(editorA, "save-page");
      const publishAuthorship = buildAuthorshipSaveContext(
        publisherB,
        "save-page",
      );

      await adapter.savePageDSL(
        samplePage.id,
        samplePage,
        { preserveVersion: true, versionHint: "draft-v1" },
        draftAuthorship,
      );

      const publishedVersion = await adapter.publishPageDSL(
        samplePage.id,
        publishAuthorship,
        { versionHint: "pub-v1" },
      );

      expect(publishedVersion).toBe("draft-v1");

      const draftRow = await queryVersionAuthorship(
        client,
        "aria_page_versions",
        samplePage.id,
        "draft-v1",
      );
      const versions = await adapter.getPageVersions(samplePage.id);

      expect(String(draftRow?.created_by_id)).toBe(editorA.id);
      expect(versions.map((entry) => entry.version)).toEqual(["draft-v1"]);

      const authorshipRead = await adapter.getPageAuthorship(samplePage.id);
      expect(authorshipRead?.publishedBy?.id).toBe(editorA.id);
      expect(authorshipRead?.updatedBy?.id).toBe(editorA.id);
    });

    it("persists system actor on singleton site settings writes", async () => {
      const authorship = buildSystemAuthorshipSaveContext("save-site-settings");

      await adapter.saveSiteSettings({ siteName: "System Site" }, authorship);

      const row = await client.execute(
        `SELECT created_by_id, updated_by_id FROM aria_site_settings WHERE id = 'default'`,
      );

      expect(String(row.rows[0]?.created_by_id)).toBe("system");
      expect(String(row.rows[0]?.updated_by_id)).toBe("system");
    });
  });
}

runAdapterParityTests("SQLite", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aria-authorship-persist-"),
  );
  const client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
  const adapter = new SQLiteStorageAdapter(client, {
    seedStarterLayouts: false,
    seedStarterPages: false,
    seedStarterCms: false,
    seedStarterDesign: false,
    seedStarterSiteSettings: false,
  });

  return {
    client,
    adapter,
    cleanup: async () => {
      client.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
});

runAdapterParityTests("Cloudflare", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "aria-authorship-cf-"),
  );
  const client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
  for (const migration of [
    "0001_baseline_schema.sql",
    "0002_api_foundation.sql",
    "0003_api_idempotency_leases.sql",
    "0004_api_lifecycle_hardening.sql",
    "0008_published_dependency_pins.sql",
  ]) {
    await client.executeMultiple(
      await fs.readFile(
        path.resolve(process.cwd(), `aria/migrations/${migration}`),
        "utf8",
      ),
    );
  }
  const adapter = new CloudflareStorageAdapter({
    aria_db: createD1Mock(client) as any,
  });

  return {
    client,
    adapter,
    cleanup: async () => {
      client.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
});

describe("SQLite legacy authorship reads", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "aria-authorship-legacy-"),
    );
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.listPagesDSL();
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("hydrates authorship from legacy DSL author before column backfill", async () => {
    const now = "2026-05-26T00:00:00.000Z";
    const dsl = JSON.stringify({
      id: "legacy-read-page",
      title: "Legacy Read",
      slug: "legacy-read",
      author: {
        id: "user-legacy-read",
        name: "Legacy Reader",
        email: "legacy-read@example.com",
      },
      nodes: [],
    });

    await client.execute({
      sql: `INSERT INTO aria_page_versions (
              id, version, slug, title, status, dsl_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "legacy-read-page",
        "legacy-v1",
        "legacy-read",
        "Legacy Read",
        "draft",
        dsl,
        now,
      ],
    });

    await client.execute({
      sql: `INSERT INTO aria_page_meta (
              id, slug, title, status, layout, draft_version, published_version, current_version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "legacy-read-page",
        "legacy-read",
        "Legacy Read",
        "draft",
        null,
        "legacy-v1",
        null,
        "legacy-v1",
        now,
      ],
    });

    const authorship = await adapter.getPageAuthorship("legacy-read-page");
    expect(authorship?.createdBy?.id).toBe("user-legacy-read");
    expect(authorship?.updatedBy?.id).toBeUndefined();

    const page = await adapter.getPageDSL("legacy-read-page");
    expect(page?.author?.id).toBe("user-legacy-read");
    expect(page?.author?.name).toBe("Legacy Reader");
  });

  it("backfills created_by columns when a new adapter initializes the database", async () => {
    const now = "2026-05-26T12:00:00.000Z";
    const dsl = JSON.stringify({
      id: "legacy-backfill-page",
      title: "Legacy Backfill",
      slug: "legacy-backfill",
      author: {
        id: "user-legacy-backfill",
        name: "Legacy Backfill Author",
        email: "backfill@example.com",
      },
      nodes: [],
    });

    await client.execute({
      sql: `INSERT INTO aria_page_versions (
              id, version, slug, title, status, dsl_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "legacy-backfill-page",
        "bf-v1",
        "legacy-backfill",
        "Legacy Backfill",
        "draft",
        dsl,
        now,
      ],
    });

    const secondAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await secondAdapter.listPagesDSL();

    const row = await queryVersionAuthorship(
      client,
      "aria_page_versions",
      "legacy-backfill-page",
      "bf-v1",
    );

    expect(String(row?.created_by_id)).toBe("user-legacy-backfill");
    expect(String(row?.created_by_username)).toBe("Legacy Backfill Author");
    expect(String(row?.created_by_email)).toBe("backfill@example.com");
  });
});

describe("SQLite global content revision vs asset authorship", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "aria-authorship-revision-"),
    );
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.listPagesDSL();
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("tracks revision updated_by separately from version created_by snapshots", async () => {
    const revisionUserId = "revision-user-99";
    const pageAuthorship = buildAuthorshipSaveContext(editorA, "save-page");

    await adapter.savePageDSL(
      samplePage.id,
      samplePage,
      { preserveVersion: true, versionHint: "rev-page-v1" },
      pageAuthorship,
    );

    const first = await adapter.touchContentRevision({
      mutationKind: "save-page",
      mutationTarget: samplePage.slug,
      updatedBy: revisionUserId,
      timestamp: "2026-05-26T10:00:00.000Z",
    });

    const state = await adapter.getContentSiteState();

    expect(first.updatedBy).toBe(revisionUserId);
    expect(state?.updatedBy).toBe(revisionUserId);
    expect(state?.lastMutationKind).toBe("save-page");

    const versionRow = await queryVersionAuthorship(
      client,
      "aria_page_versions",
      samplePage.id,
      "rev-page-v1",
    );

    expect(String(versionRow?.created_by_id)).toBe(editorA.id);
    expect(state?.updatedBy).not.toBe(editorA.id);
  });
});
