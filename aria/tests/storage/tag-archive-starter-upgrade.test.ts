import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  buildAriaCollection,
  buildTagArchiveTemplatePage,
  buildStarterCollectionDefinitions,
  TAGS_COLLECTION_NAME,
} from "../../lib/storage/starterContent";
import {
  buildUpgradedTagsCollectionForArchive,
  isTagArchiveStarterConfigured,
  TAG_ARCHIVE_URL_PATTERN,
} from "../../lib/storage/starterTagArchive";
import { TAG_ARCHIVE_PAGE_ID } from "../../lib/storage/starterContent";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

describe("tag archive starter upgrade", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-tag-archive-upgrade-")),
      "cms.sqlite",
    );
    client = createClient({ url: `file:${dbPath}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("persists upgraded tags collection routing through storage", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    const legacyTags = buildAriaCollection(
      {
        ...buildStarterCollectionDefinitions({ collectionIdByName: {} }).tags,
        urlPattern: null,
        templatePageId: null,
      },
      now,
    );
    const savedTags = await adapter.saveCollection(legacyTags);
    expect(isTagArchiveStarterConfigured(savedTags)).toBe(false);

    const upgraded = buildUpgradedTagsCollectionForArchive(
      savedTags,
      "2026-07-03T01:00:00.000Z",
    );
    await adapter.saveCollection(upgraded);

    const reloaded = await adapter.getCollection(legacyTags.name);
    expect(reloaded?.urlPattern).toBe(TAG_ARCHIVE_URL_PATTERN);
    expect(reloaded?.templatePageId).toBe(TAG_ARCHIVE_PAGE_ID);
  });

  it("does not repair tag routing on subsequent adapter initialization", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    await adapter.savePageDSL("tag-archive", buildTagArchiveTemplatePage());
    await adapter.savePageDSL("tag-entry", {
      id: "tag-entry",
      title: "Tag Entry",
      slug: "tag-entry",
      status: "draft",
      nodes: [],
      settings: {},
    });
    await adapter.saveCollection(
      buildAriaCollection(
        {
          ...buildStarterCollectionDefinitions({ collectionIdByName: {} }).tags,
          templatePageId: "tag-entry",
          urlPattern: "/tags/{slug}",
        },
        now,
      ),
    );

    const repairedAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: true,
      seedStarterDesign: false,
    });
    const repairedTags = await repairedAdapter.getCollection(TAGS_COLLECTION_NAME);

    expect(repairedTags?.templatePageId).toBe("tag-entry");
    expect(repairedTags?.urlPattern).toBe("/tags/{slug}");
  });

  it("keeps custom non-empty tag templates assigned", async () => {
    const now = "2026-07-03T00:00:00.000Z";
    await adapter.savePageDSL("tag-archive", buildTagArchiveTemplatePage());
    await adapter.savePageDSL("custom-tags", {
      id: "custom-tags",
      title: "Custom Tags",
      slug: "custom-tags",
      status: "draft",
      nodes: [
        {
          id: "custom-tags-heading",
          type: "heading",
          props: { text: "Custom tag" },
          styles: {},
          children: [],
        },
      ],
      settings: {},
    });
    await adapter.saveCollection(
      buildAriaCollection(
        {
          ...buildStarterCollectionDefinitions({ collectionIdByName: {} }).tags,
          templatePageId: "custom-tags",
          urlPattern: "/topics/{slug}",
        },
        now,
      ),
    );

    const repairedAdapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: true,
      seedStarterDesign: false,
    });
    const repairedTags = await repairedAdapter.getCollection(TAGS_COLLECTION_NAME);

    expect(repairedTags?.templatePageId).toBe("custom-tags");
    expect(repairedTags?.urlPattern).toBe("/topics/{slug}");
  });
});
