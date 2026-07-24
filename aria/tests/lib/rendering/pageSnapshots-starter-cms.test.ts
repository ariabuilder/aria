import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { renderPageSnapshotHtml } from "../../../lib/rendering/pageSnapshots";
import { SQLiteStorageAdapter } from "../../../lib/storage/sqlite";
import {
  buildBlogEntryTemplatePage,
  buildTagArchiveTemplatePage,
} from "../../../lib/storage/starterContent";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

describe("renderPageSnapshotHtml starter CMS templates", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-page-snapshot-cms-")),
      "cms.sqlite",
    );
    client = createClient({ url: `file:${dbPath}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: true,
      seedStarterDesign: true,
      seedStarterSiteSettings: true,
    });
    await adapter.getPageDSL("tag-archive");
  });

  afterEach(async () => {
    client.close();
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("renders tag-archive and blog-post templates before any CMS entries exist", async () => {
    const tagArchiveHtml = await renderPageSnapshotHtml(
      { page: buildTagArchiveTemplatePage(), stage: "draft" },
      adapter,
    );
    const blogPostHtml = await renderPageSnapshotHtml(
      { page: buildBlogEntryTemplatePage(), stage: "draft" },
      adapter,
    );

    expect(tagArchiveHtml).toContain("aria-page-snapshot:v4");
    expect(tagArchiveHtml).toContain("Tag");
    expect(blogPostHtml).toContain("aria-page-snapshot:v4");
  });
});
