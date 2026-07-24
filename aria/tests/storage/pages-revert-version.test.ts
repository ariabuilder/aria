import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import type { PageDSL } from "../../lib/types/nodes";

const samplePage: PageDSL = {
  id: "page-revert-test",
  title: "Original Title",
  slug: "page-revert-test",
  description: "Revert test page",
  layout: "marketing-shell",
  status: "draft",
  nodes: [
    {
      id: "page-root",
      type: "Container",
      props: {},
      styles: {},
      children: [],
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

describe("page version restore (storage)", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-page-revert-"));
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

  it("restoring an older version applies its content as a new draft version", async () => {
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updatedPage: PageDSL = {
      ...samplePage,
      title: "Updated Title",
    };
    const secondVersion = await adapter.savePageDSL(samplePage.id, updatedPage);

    const snapshot = await adapter.getPageDSL(samplePage.id, firstVersion);
    expect(snapshot?.title).toBe("Original Title");

    const revertedVersion = await adapter.savePageDSL(samplePage.id, snapshot!, {
      skipIfContentUnchanged: false,
      preserveVersion: false,
    });

    expect(revertedVersion).not.toBe(secondVersion);

    const latest = await adapter.getPageDSL(samplePage.id);
    expect(latest?.title).toBe("Original Title");

    const versions = await adapter.getPageVersions(samplePage.id);
    expect(versions.length).toBeGreaterThanOrEqual(3);
    expect(versions[0]?.version).toBe(revertedVersion);
  });
});
