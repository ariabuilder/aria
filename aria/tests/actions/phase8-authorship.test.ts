import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { ContentSyncExecutor } from "../../lib/content-sync/service/executor";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { SessionUser } from "../../lib/auth/types";
import type {
  ContentSyncHistoryItem,
  ContentSyncJob,
} from "../../lib/content-sync/schema";

const syncActor: SessionUser = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  username: "sync-admin",
  email: "sync@example.com",
  role: "administrator",
  totpEnabled: false,
};

function createDryRunJob(): ContentSyncJob {
  return {
    id: "job-1",
    mode: "dry-run",
    status: "completed",
    direction: "push",
    sourceEndpointId: "local-sqlite",
    targetEndpointId: "local-sqlite",
    conflictPolicy: "manual",
    createdAt: "2026-05-26T00:00:00.000Z",
    startedAt: "2026-05-26T00:00:00.000Z",
    finishedAt: "2026-05-26T00:00:00.000Z",
  };
}

function createPageItem(
  overrides: Partial<ContentSyncHistoryItem> = {},
): ContentSyncHistoryItem {
  return {
    id: "item-1",
    jobId: "job-1",
    resourceType: "page",
    resourceId: "home",
    resourceLabel: "Home",
    action: "create",
    resultStatus: "planned",
    createdAt: "2026-05-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("Phase 8 content sync authorship", () => {
  let tempDir: string;
  let sourceClient: Client;
  let targetClient: Client;
  let source: SQLiteStorageAdapter;
  let target: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-phase8-sync-"));
    sourceClient = createClient({
      url: `file:${path.join(tempDir, "source.db")}`,
    });
    targetClient = createClient({
      url: `file:${path.join(tempDir, "target.db")}`,
    });
    source = new SQLiteStorageAdapter(sourceClient, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    target = new SQLiteStorageAdapter(targetClient, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
  });

  afterEach(async () => {
    sourceClient.close();
    targetClient.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stamps created_by on page version row when content sync apply saves a page", async () => {
    const page = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      status: "draft" as const,
      version: "sync-v1",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    await source.savePageDSL("home", page, {
      preserveVersion: true,
      versionHint: "sync-v1",
    });

    const authorship = buildAuthorshipSaveContext(syncActor, "save-page");
    const executor = new ContentSyncExecutor();
    const result = await executor.apply({
      dryRunJob: createDryRunJob(),
      dryRunItems: [createPageItem({ localVersion: "sync-v1" })],
      localAdapter: source,
      remoteAdapter: target,
      actorId: syncActor.id,
      authorship,
    });

    expect(result.summary.created).toBe(1);

    const row = await targetClient.execute({
      sql: `SELECT created_by_id, created_by_username, created_by_email
            FROM aria_page_versions WHERE id = ? AND version = ?`,
      args: ["home", "sync-v1"],
    });

    expect(String(row.rows[0]?.created_by_id)).toBe(syncActor.id);
    expect(String(row.rows[0]?.created_by_username)).toBe(syncActor.username);
    expect(String(row.rows[0]?.created_by_email)).toBe(syncActor.email);
  });

  it("skips version authorship stamp when synced page content is unchanged", async () => {
    const page = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      status: "draft" as const,
      version: "sync-v2",
      updatedAt: "2026-05-26T00:00:00.000Z",
    };
    await source.savePageDSL("home", page, {
      preserveVersion: true,
      versionHint: "sync-v2",
    });
    await target.savePageDSL("home", page, {
      preserveVersion: true,
      versionHint: "sync-v2",
    });

    const authorship = buildAuthorshipSaveContext(syncActor, "save-page");
    const executor = new ContentSyncExecutor();
    await executor.apply({
      dryRunJob: createDryRunJob(),
      dryRunItems: [
        createPageItem({
          action: "update",
          localVersion: "sync-v2",
          remoteVersion: "sync-v2",
        }),
      ],
      localAdapter: source,
      remoteAdapter: target,
      actorId: syncActor.id,
      authorship,
    });

    const rows = await targetClient.execute({
      sql: "SELECT created_by_id FROM aria_page_versions WHERE id = ?",
      args: ["home"],
    });

    expect(rows.rows.every((row) => row.created_by_id == null)).toBe(true);
  });
});
