import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { assertPageVersionDeletable } from "../../lib/storage/pageVersionDelete";
import type { PageDSL } from "../../lib/types/nodes";

const samplePage: PageDSL = {
  id: "page-delete-version",
  title: "Delete Version Test",
  slug: "page-delete-version",
  description: "Version delete test page",
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

describe("page version delete (storage)", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-page-delete-ver-"));
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

  it("deletes a non-pinned historical version", async () => {
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);

    await new Promise((resolve) => setTimeout(resolve, 10));

    const updatedPage: PageDSL = {
      ...samplePage,
      title: "Second save",
    };
    const secondVersion = await adapter.savePageDSL(samplePage.id, updatedPage);

    await adapter.deletePageVersion(samplePage.id, firstVersion);

    const remaining = await adapter.getPageVersions(samplePage.id);
    expect(remaining.map((entry) => entry.version)).toEqual([secondVersion]);
  });

  it("rejects deleting when only one revision exists", async () => {
    const onlyVersion = await adapter.savePageDSL(samplePage.id, samplePage);

    await expect(
      adapter.deletePageVersion(samplePage.id, onlyVersion),
    ).rejects.toThrow(/only remaining revision|protected/i);

    expect(await adapter.getPageVersions(samplePage.id)).toHaveLength(1);
  });

  it("rejects deleting the current draft version", async () => {
    const firstVersion = await adapter.savePageDSL(samplePage.id, samplePage);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Newer draft",
    });

    const pins = await adapter.getPageVersionPins(samplePage.id);
    expect(pins).not.toBeNull();

    await expect(
      adapter.deletePageVersion(samplePage.id, pins!.currentVersion),
    ).rejects.toThrow(/protected/i);

    expect(
      (await adapter.getPageVersions(samplePage.id)).some(
        (entry) => entry.version === firstVersion,
      ),
    ).toBe(true);
  });

  it("rejects deleting the published version on a published page", async () => {
    await adapter.savePageDSL(samplePage.id, samplePage);
    const publishedVersion = await adapter.publishPageDSL(samplePage.id);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adapter.savePageDSL(samplePage.id, {
      ...samplePage,
      title: "Draft after publish",
    });

    await expect(
      adapter.deletePageVersion(samplePage.id, publishedVersion!),
    ).rejects.toThrow(/protected/i);
  });
});

describe("assertPageVersionDeletable", () => {
  it("normalizes version ids when checking pins", () => {
    expect(() =>
      assertPageVersionDeletable({
        version: "v123",
        pins: {
          draftVersion: "123",
          publishedVersion: null,
          currentVersion: "999",
        },
        existingVersions: ["123", "999"],
      }),
    ).toThrow(/protected/i);
  });
});
