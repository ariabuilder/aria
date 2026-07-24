import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client/node";
import { statSync } from "fs";
import { resolve } from "path";

import { SQLiteStorageAdapter } from "./sqlite";

export const PROTECTED_PAGE_IDS = [
  "index",
  "404",
  "contact",
  "services",
  "parent",
] as const;

export const DEFAULT_TEST_PAGE_DELETE_IDS = [
  "andy",
  "test",
  "test2-1",
  "test3",
  "testing",
  "testpage2",
  "buttons-elements-layout",
  "text-pasting",
] as const;

export const KEEP_LATEST_VERSIONS = 1;

const SYNC_CLEAR_TABLES = [
  "aria_content_sync_items",
  "aria_content_sync_jobs",
  "aria_content_site_state",
] as const;

export interface SlimLocalStorageOptions {
  apply: boolean;
  keepPageIds?: readonly string[];
  dbPath?: string;
}

export interface StorageCounts {
  pageMeta: number;
  pageVersions: number;
  layoutMeta: number;
  layoutVersions: number;
  componentMeta: number;
  componentVersions: number;
  contentSyncItems: number;
  contentSyncJobs: number;
}

export interface SlimLocalStorageReport {
  dryRun: boolean;
  dbPath: string;
  before: StorageCounts;
  after: StorageCounts;
  dbBytesBefore: number;
  dbBytesAfter: number;
  pagesDeleted: string[];
  pruneResults: Array<{
    resourceType: "page" | "layout" | "component";
    resourceId: string;
    keptVersions: string[];
    deletedVersions: string[];
  }>;
}

export function resolvePagesToDelete(options: {
  keepPageIds?: readonly string[];
} = {}): string[] {
  const keep = new Set([
    ...PROTECTED_PAGE_IDS,
    ...(options.keepPageIds ?? []).map((id) => id.trim()).filter(Boolean),
  ]);

  return DEFAULT_TEST_PAGE_DELETE_IDS.filter((pageId) => !keep.has(pageId));
}

export function parseSlimLocalStorageArgs(argv: readonly string[]): {
  apply: boolean;
  keepPageIds: string[];
} {
  const keepPageIds: string[] = [];

  for (const arg of argv) {
    if (arg === "--apply") {
      continue;
    }

    if (arg.startsWith("--keep=")) {
      const pageId = arg.slice("--keep=".length).trim();
      if (pageId) {
        keepPageIds.push(pageId);
      }
    }
  }

  return {
    apply: argv.includes("--apply"),
    keepPageIds,
  };
}

export async function collectStorageCounts(
  client: Client,
): Promise<StorageCounts> {
  async function count(table: string): Promise<number> {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    return Number(result.rows[0]?.count ?? 0);
  }

  return {
    pageMeta: await count("aria_page_meta"),
    pageVersions: await count("aria_page_versions"),
    layoutMeta: await count("aria_layout_meta"),
    layoutVersions: await count("aria_layout_versions"),
    componentMeta: await count("aria_component_meta"),
    componentVersions: await count("aria_component_versions"),
    contentSyncItems: await count("aria_content_sync_items"),
    contentSyncJobs: await count("aria_content_sync_jobs"),
  };
}

function readDbBytes(dbPath: string): number {
  try {
    return statSync(dbPath).size;
  } catch {
    return 0;
  }
}

async function clearContentSyncHistory(
  client: Client,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }

  for (const table of SYNC_CLEAR_TABLES) {
    await client.execute(`DELETE FROM ${table}`);
  }
}

async function vacuumDatabase(client: Client, dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }

  await client.execute("VACUUM");
}

export async function runSlimLocalStorage(
  options: SlimLocalStorageOptions,
): Promise<SlimLocalStorageReport> {
  const dbPath = resolve(
    options.dbPath ?? resolve(process.cwd(), "aria/storage/aria.db"),
  );
  const dryRun = !options.apply;
  const pagesToDelete = resolvePagesToDelete({
    keepPageIds: options.keepPageIds,
  });

  const client = createClient({ url: `file:${dbPath}` });
  // This is a maintenance utility for an existing database — it must never
  // seed starter content (even in dry-run mode, since simply querying the
  // adapter triggers lazy initialization/seeding on first use).
  const adapter = new SQLiteStorageAdapter(client, {
    seedStarterLayouts: false,
    seedStarterPages: false,
    seedStarterCms: false,
    seedStarterDesign: false,
    seedStarterSiteSettings: false,
  });

  const dbBytesBefore = readDbBytes(dbPath);
  const before = await collectStorageCounts(client);
  const pruneResults: SlimLocalStorageReport["pruneResults"] = [];
  const pagesDeleted: string[] = [];

  try {
    const existingPages = await adapter.listPagesDSL({ limit: 1000, offset: 0 });
    const existingPageIds = new Set(existingPages.map((page) => page.id));

    for (const pageId of pagesToDelete) {
      if (!existingPageIds.has(pageId)) {
        continue;
      }

      pagesDeleted.push(pageId);

      if (!dryRun) {
        await adapter.deletePageDSL(pageId);
      }
    }

    const pageTargets = dryRun
      ? existingPages
          .map((page) => page.id)
          .filter((pageId) => !pagesToDelete.includes(pageId))
      : (await adapter.listPagesDSL({ limit: 1000, offset: 0 })).map(
          (page) => page.id,
        );

    for (const resourceId of pageTargets) {
      const result = await adapter.pruneVersionHistory!({
        resourceType: "page",
        resourceId,
        keepLatest: KEEP_LATEST_VERSIONS,
        dryRun,
      });
      if (result.deletedVersions.length > 0 || dryRun) {
        pruneResults.push({
          resourceType: "page",
          resourceId: result.resourceId,
          keptVersions: result.keptVersions,
          deletedVersions: result.deletedVersions,
        });
      }
    }

    for (const layout of await adapter.listLayoutsDSL({ limit: 1000, offset: 0 })) {
      const result = await adapter.pruneVersionHistory!({
        resourceType: "layout",
        resourceId: layout.id,
        keepLatest: KEEP_LATEST_VERSIONS,
        dryRun,
      });
      if (result.deletedVersions.length > 0 || dryRun) {
        pruneResults.push({
          resourceType: "layout",
          resourceId: result.resourceId,
          keptVersions: result.keptVersions,
          deletedVersions: result.deletedVersions,
        });
      }
    }

    for (const component of await adapter.listComponentsDSL({
      limit: 1000,
      offset: 0,
    })) {
      const result = await adapter.pruneVersionHistory!({
        resourceType: "component",
        resourceId: component.id,
        keepLatest: KEEP_LATEST_VERSIONS,
        dryRun,
      });
      if (result.deletedVersions.length > 0 || dryRun) {
        pruneResults.push({
          resourceType: "component",
          resourceId: result.resourceId,
          keptVersions: result.keptVersions,
          deletedVersions: result.deletedVersions,
        });
      }
    }

    await clearContentSyncHistory(client, dryRun);
    await vacuumDatabase(client, dryRun);

    const after = await collectStorageCounts(client);
    const dbBytesAfter = dryRun ? dbBytesBefore : readDbBytes(dbPath);

    return {
      dryRun,
      dbPath,
      before,
      after,
      dbBytesBefore,
      dbBytesAfter,
      pagesDeleted,
      pruneResults,
    };
  } finally {
    client.close();
  }
}

export function formatStorageCounts(counts: StorageCounts): string {
  return [
    `  pages: ${counts.pageMeta} meta / ${counts.pageVersions} versions`,
    `  layouts: ${counts.layoutMeta} meta / ${counts.layoutVersions} versions`,
    `  components: ${counts.componentMeta} meta / ${counts.componentVersions} versions`,
    `  content sync: ${counts.contentSyncJobs} jobs / ${counts.contentSyncItems} items`,
  ].join("\n");
}

export function formatSlimLocalStorageReport(
  report: SlimLocalStorageReport,
): string {
  const lines = [
    report.dryRun
      ? "Dry run — no changes written."
      : "Applied slim-local-storage changes.",
    `Database: ${report.dbPath}`,
    "",
    "Before:",
    formatStorageCounts(report.before),
    "",
    "After:",
    formatStorageCounts(report.after),
    "",
    `Database size: ${report.dbBytesBefore} → ${report.dbBytesAfter} bytes`,
    "",
    `Pages ${report.dryRun ? "to delete" : "deleted"} (${report.pagesDeleted.length}): ${
      report.pagesDeleted.length > 0 ? report.pagesDeleted.join(", ") : "(none)"
    }`,
  ];

  const pruned = report.pruneResults.filter(
    (entry) => entry.deletedVersions.length > 0,
  );
  const totalDeletedVersions = pruned.reduce(
    (sum, entry) => sum + entry.deletedVersions.length,
    0,
  );

  lines.push(
    "",
    `Version rows ${report.dryRun ? "to prune" : "pruned"}: ${totalDeletedVersions} across ${pruned.length} resources`,
  );

  return lines.join("\n");
}
