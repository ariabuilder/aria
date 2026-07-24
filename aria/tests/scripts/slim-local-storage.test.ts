import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import {
  DEFAULT_TEST_PAGE_DELETE_IDS,
  PROTECTED_PAGE_IDS,
  collectStorageCounts,
  parseSlimLocalStorageArgs,
  resolvePagesToDelete,
  runSlimLocalStorage,
} from "../../lib/storage/slimLocalStorage";

describe("slimLocalStorage allowlists", () => {
  it("never includes protected pages in the default delete set", () => {
    for (const pageId of PROTECTED_PAGE_IDS) {
      expect(DEFAULT_TEST_PAGE_DELETE_IDS).not.toContain(pageId);
      expect(resolvePagesToDelete()).not.toContain(pageId);
    }
  });

  it("respects --keep overrides", () => {
    expect(resolvePagesToDelete({ keepPageIds: ["testing"] })).not.toContain(
      "testing",
    );
    expect(resolvePagesToDelete({ keepPageIds: ["testing"] })).toContain(
      "test",
    );
  });

  it("parses apply and keep flags", () => {
    expect(parseSlimLocalStorageArgs([])).toEqual({
      apply: false,
      keepPageIds: [],
    });
    expect(
      parseSlimLocalStorageArgs(["--apply", "--keep=testing", "--keep=test"]),
    ).toEqual({
      apply: true,
      keepPageIds: ["testing", "test"],
    });
  });
});

describe("runSlimLocalStorage", () => {
  let tempDir: string;
  let dbPath: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  const samplePage = {
    id: "index",
    title: "Home",
    slug: "index",
    layout: "",
    status: "published" as const,
    nodes: [],
  };

  const testingPage = {
    id: "testing",
    title: "Testing",
    slug: "testing",
    layout: "",
    status: "draft" as const,
    nodes: [],
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-slim-local-test-"));
    dbPath = path.join(tempDir, "aria.db");
    client = createClient({ url: `file:${dbPath}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
      uploadDir: path.join(tempDir, "uploads"),
      snapshotDir: path.join(tempDir, "snapshots"),
      thumbnailsDir: path.join(tempDir, "thumbnails"),
    });

    await adapter.savePageDSL(samplePage.id, samplePage);
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Home v2",
    });
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Home v3",
    });
    await adapter.publishPageDSL(samplePage.id);
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Home draft",
    });
    await adapter.savePageDSL(testingPage.id, testingPage);

    const now = "2026-05-27T00:00:00.000Z";
    await client.execute({
      sql: `INSERT INTO aria_content_sync_jobs
            (id, mode, direction, status, source_endpoint_id, target_endpoint_id, conflict_policy, created_at, idempotency_key)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "job-1",
        "apply",
        "push",
        "completed",
        "local",
        "remote",
        "manual",
        now,
        "job-1",
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_content_sync_items
            (id, job_id, resource_type, resource_id, action, result_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        "item-1",
        "job-1",
        "page",
        "index",
        "update",
        "applied",
        now,
      ],
    });
    await client.execute({
      sql: `INSERT INTO aria_content_site_state
            (scope, current_revision_id, revision_seq, updated_at, last_mutation_kind)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["default", "rev-1", 1, now, "seed"],
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("dry-run leaves the database unchanged", async () => {
    const before = await collectStorageCounts(client);

    const report = await runSlimLocalStorage({
      apply: false,
      keepPageIds: [],
      dbPath,
    });

    const after = await collectStorageCounts(client);

    expect(report.dryRun).toBe(true);
    expect(report.pagesDeleted).toContain("testing");
    expect(before).toEqual(after);
    expect(report.before).toEqual(report.after);
  });

  it("apply deletes test pages, prunes history, and clears sync tables", async () => {
    const report = await runSlimLocalStorage({
      apply: true,
      keepPageIds: [],
      dbPath,
    });

    const after = await collectStorageCounts(client);
    const indexVersions = await adapter.getPageVersions("index");

    expect(report.pagesDeleted).toContain("testing");
    expect(after.pageMeta).toBe(1);
    expect(after.contentSyncItems).toBe(0);
    expect(after.contentSyncJobs).toBe(0);
    expect(indexVersions.length).toBeLessThanOrEqual(2);
    expect(indexVersions.length).toBeGreaterThan(0);
  });
});
