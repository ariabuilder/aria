import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { resolveDataSources } from "../../../lib/cms/resolveDataSources";
import { createCollectionOnAdapter } from "../../../lib/cms/services/collections";
import {
  createEntryOnAdapter,
  publishEntryOnAdapter,
  updateEntryOnAdapter,
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

describe("resolveDataSources", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-cms-resolver-")),
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

  it("resolves published collection lists by default", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      fields: [],
    });
    const draft = await createEntryOnAdapter(
      adapter,
      { collectionId: collection.id, title: "Draft Post", frontmatter: {} },
      testActor,
    );
    const publishedDraft = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Published Post",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: publishedDraft.entry.id,
        version: publishedDraft.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        posts: {
          type: "collection",
          collection: "posts",
          mode: "list",
        },
      },
    });

    expect(resolved.posts?.items).toHaveLength(1);
    expect(resolved.posts?.items[0]?.title).toBe("Published Post");
    expect(resolved.posts?.items[0]?.id).not.toBe(draft.entry.id);
  });

  it("includes drafts in preview mode", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "notes",
      label: "Notes",
      kind: "content",
      fields: [],
    });
    await createEntryOnAdapter(
      adapter,
      { collectionId: collection.id, title: "Draft Note", frontmatter: {} },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: true,
      sources: {
        notes: {
          type: "cms",
          collection: collection.id,
          mode: "list",
        },
      },
    });

    expect(resolved.notes?.items).toHaveLength(1);
    expect(resolved.notes?.items[0]?.status).toBe("draft");
  });

  it("resolves collection lists with slug filters", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      fields: [],
    });
    const first = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "First Post",
        slug: "first-post",
        frontmatter: {},
      },
      testActor,
    );
    const second = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Second Post",
        slug: "second-post",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: first.entry.id,
        version: first.entry.version,
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: second.entry.id,
        version: second.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        posts: {
          type: "collection",
          collection: "posts",
          mode: "list",
          filter: { slug: "second-post" },
        },
      },
    });

    expect(resolved.posts?.items).toHaveLength(1);
    expect(resolved.posts?.items[0]?.title).toBe("Second Post");
  });

  it("uses a source locale override for list sources", async () => {
    await adapter.saveSiteSettings({
      localization: {
        content: {
          defaultLocale: "en",
          locales: [
            { code: "en", label: "English", enabled: true, fallbacks: [] },
            { code: "fr", label: "French", enabled: true, fallbacks: ["en"] },
          ],
        },
      },
    });
    const collection = await createCollectionOnAdapter(adapter, {
      name: "posts",
      label: "Posts",
      kind: "content",
      fields: [],
    });
    const entry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "English Title",
        slug: "english-title",
        frontmatter: {},
        locale: "en",
      },
      testActor,
    );
    const localized = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: entry.entry.id,
        version: entry.entry.version,
        patch: {
          locale: "fr",
          title: "Titre francais",
          slug: "titre-francais",
        },
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        id: localized.entry.id,
        version: localized.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      locale: "en",
      sources: {
        posts: {
          type: "collection",
          collection: "posts",
          mode: "list",
          locale: "fr",
        },
      },
    });

    expect(resolved.posts?.items[0]?.title).toBe("Titre francais");
    expect(resolved.posts?.items[0]?.slug).toBe("titre-francais");
  });

  it("resolves a single source from entry context", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "articles",
      label: "Articles",
      kind: "content",
      fields: [],
    });
    const entry = await createEntryOnAdapter(
      adapter,
      { collectionId: collection.id, title: "Context Entry", frontmatter: {} },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: true,
      entryContext: {
        collectionId: collection.id,
        entryId: entry.entry.id,
      },
      sources: {
        current: {
          type: "cms",
          collection: "articles",
          mode: "single",
        },
      },
    });

    expect(resolved.current?.entry?.title).toBe("Context Entry");
    expect(resolved.current?.items).toHaveLength(1);
  });

  it("rejects single sources without an entry context or id filter", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "pages",
      label: "Pages",
      kind: "content",
      fields: [],
    });

    await expect(
      resolveDataSources(adapter, {
        preview: false,
        sources: {
          current: {
            type: "cms",
            collection: collection.id,
            mode: "single",
          },
        },
      }),
    ).rejects.toThrow(
      'CMS data source "current" (collection: pages, mode: single) failed: Single data source requires entry context',
    );
  });

  it("resolves a single source from an explicit slug filter", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "announcements",
      label: "Announcements",
      kind: "content",
      fields: [],
    });
    const entry = await createEntryOnAdapter(
      adapter,
      {
        collectionId: collection.id,
        title: "Launch Window",
        slug: "launch-window",
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

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        "announcement-title": {
          type: "collection",
          collection: "announcements",
          mode: "single",
          filter: { slug: "launch-window" },
        },
      },
    });

    expect(resolved["announcement-title"]?.entry?.title).toBe("Launch Window");
  });

  it("omits unresolved single sources in preview mode", async () => {
    const collection = await createCollectionOnAdapter(adapter, {
      name: "tags",
      label: "Tags",
      kind: "tags",
      fields: [],
    });

    const resolved = await resolveDataSources(adapter, {
      preview: true,
      sources: {
        "tag-heading": {
          type: "cms",
          collection: collection.id,
          mode: "single",
        },
      },
    });

    expect(resolved).toEqual({});
  });

  it("returns an empty list in preview when entry-context filters cannot resolve", async () => {
    const tags = await createCollectionOnAdapter(adapter, {
      name: "tags",
      label: "Tags",
      kind: "tags",
      fields: [],
    });
    const blog = await createCollectionOnAdapter(adapter, {
      name: "blog",
      label: "Blog",
      kind: "content",
      fields: [
        {
          key: "tags",
          label: "Tags",
          type: "relation",
          targetCollection: tags.id,
          required: false,
        },
      ],
    });

    const resolved = await resolveDataSources(adapter, {
      preview: true,
      sources: {
        "tag-posts": {
          type: "cms",
          collection: blog.id,
          mode: "list",
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: "$entryContext.id",
            },
          },
        },
      },
    });

    expect(resolved["tag-posts"]?.items).toEqual([]);
    expect(resolved["tag-posts"]?.total).toBe(0);
  });

  it("hydrates reference fields on resolved entries", async () => {
    const authors = await createCollectionOnAdapter(adapter, {
      name: "authors",
      label: "Authors",
      kind: "data",
      fields: [{ key: "role", label: "Role", type: "string", required: true }],
    });
    const author = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Michael Chen",
        slug: "michael-chen",
        frontmatter: { role: "Senior Tech Writer" },
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        id: author.entry.id,
        version: author.entry.version,
      },
      testActor,
    );

    const blog = await createCollectionOnAdapter(adapter, {
      name: "blog",
      label: "Blog",
      kind: "content",
      fields: [
        {
          key: "author",
          label: "Author",
          type: "reference",
          targetCollection: authors.id,
          required: true,
        },
      ],
    });
    const post = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Binding Fields",
        slug: "binding-fields",
        frontmatter: { author: author.entry.id },
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: post.entry.id,
        version: post.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: true,
      entryContext: {
        collectionId: blog.id,
        entryId: post.entry.id,
        slug: "binding-fields",
      },
      sources: {
        current: {
          type: "collection",
          collection: "blog",
          mode: "single",
        },
      },
    });

    expect(resolved.current?.entry?.frontmatter.author).toMatchObject({
      id: author.entry.id,
      title: "Michael Chen",
      role: "Senior Tech Writer",
    });
  });
});
