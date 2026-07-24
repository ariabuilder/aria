import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { PageDSL } from "../../lib/types/nodes";

describe("savePageDSL overwriteVersionIfExists", () => {
  let tempDir: string;
  let adapter: SQLiteStorageAdapter;
  const pageId = "test-page";
  const version = "1000";

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "aria-version-overwrite-"));
    const client = createClient({ url: `file:${join(tempDir, "test.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("overwrites an existing version row when overwriteVersionIfExists is set", async () => {
    const initial: PageDSL = {
      id: pageId,
      slug: pageId,
      title: "Initial",
      nodes: [],
      version,
    };

    await adapter.savePageDSL(pageId, initial, {
      preserveVersion: true,
      versionHint: version,
      skipIfContentUnchanged: false,
    });

    const updated: PageDSL = {
      ...initial,
      title: "Updated title",
    };

    await adapter.savePageDSL(pageId, updated, {
      preserveVersion: true,
      versionHint: version,
      overwriteVersionIfExists: true,
      skipIfContentUnchanged: false,
    });

    const loaded = await adapter.getPageDSL(pageId, version);
    expect(loaded?.title).toBe("Updated title");
  });

  it("rejects a stale expectedVersion at the storage boundary", async () => {
    const initial: PageDSL = {
      id: pageId,
      slug: pageId,
      title: "Initial",
      nodes: [],
    };
    const currentVersion = await adapter.savePageDSL(pageId, initial);

    await expect(
      adapter.savePageDSL(
        pageId,
        { ...initial, title: "Stale editor overwrite" },
        { expectedVersion: "stale-version" },
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const loaded = await adapter.getPageDSL(pageId);
    expect(loaded?.version).toBe(currentVersion);
    expect(loaded?.title).toBe("Initial");
  });
});
