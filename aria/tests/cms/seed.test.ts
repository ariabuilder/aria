import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { applyStarterDemoContentStep } from "../../lib/storage/starterDemoContent";

const actor = {
  id: "seed-test",
  username: "seed-test",
  email: "seed-test@example.com",
};

describe("official starter content", () => {
  let client: Client;
  let tempDir: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-starter-content-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
    await adapter.getPageDSL("index");
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("applies the canonical full starter dataset through onboarding steps", async () => {
    await applyStarterDemoContentStep(adapter, "site-shell", actor);
    expect((await adapter.listLayoutsDSL({ limit: 20 })).map((layout) => layout.id)).toEqual(
      expect.arrayContaining(["full-width", "left-sidebar", "right-sidebar", "two-sidebar"]),
    );
    expect(await adapter.getPageDSL("index")).not.toBeNull();
    expect(await adapter.getPublishedPageDSL("index")).not.toBeNull();
    const home = await adapter.getPageDSL("index");
    expect(home?.version).toBeTruthy();
    expect(home?.status).toBe("published");
    const homePins = await adapter.getPageVersionPins("index");
    expect(homePins?.draftVersion).toBe(home?.version);
    expect(homePins?.publishedVersion).toBe(home?.version);
    expect((await adapter.getPagePolicy("not-found"))?.systemRole).toBe("not-found");
    expect(await adapter.getPublishedPageDSL("not-found")).not.toBeNull();
    expect(await adapter.listCollections()).toHaveLength(0);

    await applyStarterDemoContentStep(adapter, "collections", actor);
    await applyStarterDemoContentStep(adapter, "pages", actor);
    await applyStarterDemoContentStep(adapter, "catalog", actor);

    expect(await adapter.getDesignSystem()).not.toBeNull();
    expect((await adapter.listCollections()).map((collection) => collection.name)).toEqual(
      expect.arrayContaining(["main-nav", "tags", "authors", "blog"]),
    );
    expect((await adapter.listPagesDSL({ limit: 20 })).map((page) => page.id)).toEqual(
      expect.arrayContaining(["index", "not-found", "blog", "blog-post", "tag-archive"]),
    );
    expect((await adapter.getPagePolicy("blog"))?.systemRole).toBe("cms-collection");
    expect((await adapter.getPagePolicy("blog-post"))?.systemRole).toBe("cms-entry");

    const expectedEntryCounts: Record<string, number> = {
      "main-nav": 1,
      tags: 4,
      authors: 1,
      blog: 3,
    };
    for (const [name, expected] of Object.entries(expectedEntryCounts)) {
      const collection = await adapter.getCollection(name);
      expect(collection).not.toBeNull();
      expect(
        (await adapter.listEntries({ collectionId: collection!.id, page: 1, limit: 20 })).total,
      ).toBe(expected);
    }

    await applyStarterDemoContentStep(adapter, "catalog", actor);
    const blog = await adapter.getCollection("blog");
    expect(
      (await adapter.listEntries({ collectionId: blog!.id, page: 1, limit: 20 })).total,
    ).toBe(3);
  });
});
