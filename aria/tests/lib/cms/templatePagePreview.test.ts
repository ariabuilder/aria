import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { resolveTemplatePageCmsOptions } from "../../../lib/cms/templatePagePreview";
import { createCollectionOnAdapter } from "../../../lib/cms/services/collections";
import {
  createEntryOnAdapter,
  publishEntryOnAdapter,
} from "../../../lib/cms/services/entries";
import { SQLiteStorageAdapter } from "../../../lib/storage/sqlite";
import type { ActorRef } from "../../../lib/auth/types";

const testActor: ActorRef = {
  id: "author-1",
  username: "admin",
  email: "admin@example.test",
};

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
}));

describe("resolveTemplatePageCmsOptions", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-template-preview-")),
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

  it("returns preview entry context for a collection template page", async () => {
    await adapter.savePageDSL("blog-post-template", {
      id: "blog-post-template",
      slug: "blog-post-template",
      title: "Blog Post Template",
      nodes: [],
    });

    const collection = await createCollectionOnAdapter(adapter, {
      name: "blog",
      label: "Blog",
      kind: "content",
      fields: [],
      templatePageId: "blog-post-template",
    });
    const entry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Preview Post",
        slug: "preview-post",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: entry.entry.id,
        version: entry.entry.version,
      },
      testActor,
    );

    const options = await resolveTemplatePageCmsOptions(
      adapter,
      "blog-post-template",
    );

    expect(options.entryContext).toEqual({
      collectionId: collection.id,
      entryId: entry.entry.id,
      slug: "preview-post",
    });
    expect(options.preview).toBe(true);
  });

  it("preserves an existing entry context", async () => {
    const options = await resolveTemplatePageCmsOptions(adapter, "page-1", {
      preview: false,
      entryContext: {
        collectionId: "collection-1",
        entryId: "entry-1",
        slug: "existing",
      },
    });

    expect(options).toEqual({
      preview: false,
      entryContext: {
        collectionId: "collection-1",
        entryId: "entry-1",
        slug: "existing",
      },
    });
  });

  it("returns base options when the page is not a collection template", async () => {
    const options = await resolveTemplatePageCmsOptions(adapter, "regular-page", {
      preview: true,
    });

    expect(options.entryContext).toBeUndefined();
    expect(options.preview).toBe(true);
  });
});
