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
  queryEntriesFromAdapter,
  updateEntryOnAdapter,
} from "../../../lib/cms/services/entries";
import { loadDiscoverableCmsEntries } from "../../../lib/crawl/loadDiscoverableCmsEntries";
import { renderPageHtmlFromStorage } from "../../../lib/rendering/renderPageHtml";
import { resolveCollectionTemplateRoute } from "../../../lib/rendering/resolvePublicPageRoute";
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

describe("cms list archive filters", () => {
  let client: Client;
  let dbPath: string;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    dbPath = path.join(
      await fs.mkdtemp(path.join(os.tmpdir(), "aria-cms-archive-")),
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

  async function seedBlogAndTags() {
    await adapter.savePageDSL("tag-archive", {
      id: "tag-archive",
      slug: "tag-archive",
      title: "Tag Archive",
      status: "published",
      systemRole: "cms-entry",
      accessMode: "public",
      nodes: [
        {
          id: "tag-title",
          type: "heading",
          props: { text: "Tag" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "tags",
            mode: "single",
            bindings: { text: "tags.title" },
          },
        },
        {
          id: "tag-posts",
          type: "container",
          props: {},
          styles: {},
          children: [
            {
              id: "tag-post-title",
              type: "heading",
              props: { text: "Fallback post" },
              styles: {},
              children: [],
              dataSource: {
                type: "collection",
                collection: "blog",
                mode: "single",
                bindings: { text: "blog.title" },
              },
            },
          ],
          dataSource: {
            type: "collection",
            collection: "blog",
            mode: "list",
            filter: {
              relationIncludes: {
                field: "tags",
                entryId: "$entryContext.id",
              },
            },
            onError: "show-fallback",
          },
        },
        {
          id: "empty-tag-posts",
          type: "heading",
          props: { text: "No posts for this tag yet." },
          styles: {},
          children: [],
        },
      ],
    });
    await adapter.savePageDSL("blog-post", {
      id: "blog-post",
      slug: "blog-post",
      title: "Blog Post",
      nodes: [],
    });

    const tags = await createCollectionOnAdapter(adapter, {
      name: "tags",
      label: "Tags",
      kind: "tags",
      fields: [],
      urlPattern: "/tags/{slug}",
      templatePageId: "tag-archive",
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
        },
      ],
      urlPattern: "/blog/{slug}",
      templatePageId: "blog-post",
    });

    const designTag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Design",
        slug: "design",
        frontmatter: {},
      },
      testActor,
    );
    const engTag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Engineering",
        slug: "engineering",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: designTag.entry.id,
        version: designTag.entry.version,
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: engTag.entry.id,
        version: engTag.entry.version,
      },
      testActor,
    );

    const postA = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Design systems",
        slug: "design-systems",
        frontmatter: {},
      },
      testActor,
    );
    const postB = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Edge workers",
        slug: "edge-workers",
        frontmatter: {},
      },
      testActor,
    );
    const postC = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Untagged draft",
        slug: "untagged-draft",
        frontmatter: {},
      },
      testActor,
    );

    const linkedA = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: postA.entry.id,
        version: postA.entry.version,
        patch: {
          relations: [
            {
              sourceEntryId: postA.entry.id,
              fieldKey: "tags",
              targetEntryId: designTag.entry.id,
              position: 0,
            },
          ],
        },
      },
      testActor,
    );
    const linkedB = await updateEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: postB.entry.id,
        version: postB.entry.version,
        patch: {
          relations: [
            {
              sourceEntryId: postB.entry.id,
              fieldKey: "tags",
              targetEntryId: engTag.entry.id,
              position: 0,
            },
          ],
        },
      },
      testActor,
    );

    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: linkedA.entry.id,
        version: linkedA.entry.version,
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: linkedB.entry.id,
        version: linkedB.entry.version,
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: postC.entry.id,
        version: postC.entry.version,
      },
      testActor,
    );

    return { tags, blog, designTag, engTag, postA: linkedA, postB: linkedB };
  }

  it("filters list entries by relationIncludes target entry id", async () => {
    const { blog, designTag } = await seedBlogAndTags();

    const result = await adapter.listEntries({
      collectionId: blog.id,
      status: "published",
      filter: {
        relationIncludes: {
          field: "tags",
          entryId: designTag.entry.id,
        },
      },
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.locales[0]?.slug).toBe("design-systems");
  });

  it("resolves $entryContext.id tokens and returns only matching posts", async () => {
    const { blog, tags, designTag } = await seedBlogAndTags();

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        list: {
          type: "collection",
          collection: blog.name,
          mode: "list",
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: "$entryContext.id",
            },
          },
        },
      },
      entryContext: {
        collectionId: tags.id,
        entryId: designTag.entry.id,
        slug: "design",
      },
    });

    expect(resolved.list?.total).toBe(1);
    expect(resolved.list?.items[0]?.slug).toBe("design-systems");
  });

  it("resolves $entryContext.id tokens via queryEntriesFromAdapter", async () => {
    const { blog, tags, designTag } = await seedBlogAndTags();

    const result = await queryEntriesFromAdapter(adapter, {
      collectionId: blog.id,
      filter: {
        relationIncludes: {
          field: "tags",
          entryId: "$entryContext.id",
        },
      },
      entryContext: {
        collectionId: tags.id,
        entryId: designTag.entry.id,
        slug: "design",
      },
      status: "published",
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.locales[0]?.slug).toBe("design-systems");
  });

  it("filters list entries by referenceEquals current entry context", async () => {
    const authors = await createCollectionOnAdapter(adapter, {
      name: "authors",
      label: "Authors",
      kind: "data",
      fields: [],
    });
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
        },
      ],
    });
    const ada = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Ada",
        slug: "ada",
        frontmatter: {},
      },
      testActor,
    );
    const grace = await createEntryOnAdapter(
      adapter,
      {
        collectionId: authors.id,
        title: "Grace",
        slug: "grace",
        frontmatter: {},
      },
      testActor,
    );
    const adaPost = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Ada Post",
        slug: "ada-post",
        frontmatter: { author: ada.entry.id },
      },
      testActor,
    );
    const gracePost = await createEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        title: "Grace Post",
        slug: "grace-post",
        frontmatter: { author: grace.entry.id },
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: adaPost.entry.id,
        version: adaPost.entry.version,
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: blog.id,
        id: gracePost.entry.id,
        version: gracePost.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        list: {
          type: "collection",
          collection: blog.name,
          mode: "list",
          filter: {
            referenceEquals: {
              field: "author",
              entryId: "$entryContext.id",
            },
          },
        },
      },
      entryContext: {
        collectionId: authors.id,
        entryId: ada.entry.id,
        slug: "ada",
      },
    });

    expect(resolved.list?.total).toBe(1);
    expect(resolved.list?.items.map((item) => item.slug)).toEqual(["ada-post"]);
  });

  it("rejects reference archive filters when the field targets a different collection", async () => {
    const authors = await createCollectionOnAdapter(adapter, {
      name: "authors",
      label: "Authors",
      kind: "data",
      fields: [],
    });
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
          key: "author",
          label: "Author",
          type: "reference",
          targetCollection: authors.id,
        },
      ],
    });

    await expect(
      resolveDataSources(adapter, {
        preview: false,
        sources: {
          list: {
            type: "collection",
            collection: blog.name,
            mode: "list",
            filter: {
              referenceEquals: {
                field: "author",
                entryId: "$entryContext.id",
              },
            },
          },
        },
        entryContext: {
          collectionId: tags.id,
          entryId: "tag-design",
        },
      }),
    ).rejects.toThrow(/does not target the current entry context collection/i);
  });

  it("rejects archive filters when the field targets a different collection", async () => {
    const { blog } = await seedBlogAndTags();

    await expect(
      resolveDataSources(adapter, {
        preview: false,
        sources: {
          list: {
            type: "collection",
            collection: blog.name,
            mode: "list",
            filter: {
              relationIncludes: {
                field: "tags",
                entryId: "$entryContext.id",
              },
            },
          },
        },
        entryContext: {
          collectionId: "wrong-collection",
          entryId: "entry-1",
        },
      }),
    ).rejects.toThrow(/does not target the current entry context collection/i);
  });

  it("preserves archive filters across paginated list resolution", async () => {
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
        },
      ],
    });
    const tag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "News",
        slug: "news",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: tag.entry.id,
        version: tag.entry.version,
      },
      testActor,
    );

    for (let index = 0; index < 3; index += 1) {
      const draft = await createEntryOnAdapter(
        adapter,
        {
          collectionId: blog.id,
          title: `Post ${index + 1}`,
          slug: `post-${index + 1}`,
          frontmatter: {},
        },
        testActor,
      );
      const linked = await updateEntryOnAdapter(
        adapter,
        {
          collectionId: blog.id,
          id: draft.entry.id,
          version: draft.entry.version,
          patch: {
            relations: [
              {
                sourceEntryId: draft.entry.id,
                fieldKey: "tags",
                targetEntryId: tag.entry.id,
                position: 0,
              },
            ],
          },
        },
        testActor,
      );
      await publishEntryOnAdapter(
        adapter,
        {
          collectionId: blog.id,
          id: linked.entry.id,
          version: linked.entry.version,
        },
        testActor,
      );
    }

    const pageOne = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        list: {
          type: "collection",
          collection: blog.name,
          mode: "list",
          limit: 2,
          offset: 0,
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: tag.entry.id,
            },
          },
        },
      },
    });
    const pageTwo = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        list: {
          type: "collection",
          collection: blog.name,
          mode: "list",
          limit: 2,
          offset: 2,
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: tag.entry.id,
            },
          },
        },
      },
    });

    expect(pageOne.list?.total).toBe(3);
    expect(pageOne.list?.items).toHaveLength(2);
    expect(pageTwo.list?.items).toHaveLength(1);
  });

  it("returns an empty archive when a tag has no linked posts", async () => {
    const { blog, tags } = await seedBlogAndTags();
    const lonelyTag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Lonely",
        slug: "lonely",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: lonelyTag.entry.id,
        version: lonelyTag.entry.version,
      },
      testActor,
    );

    const resolved = await resolveDataSources(adapter, {
      preview: false,
      sources: {
        list: {
          type: "collection",
          collection: blog.name,
          mode: "list",
          filter: {
            relationIncludes: {
              field: "tags",
              entryId: "$entryContext.id",
            },
          },
        },
      },
      entryContext: {
        collectionId: tags.id,
        entryId: lonelyTag.entry.id,
        slug: "lonely",
      },
    });

    expect(resolved.list?.total).toBe(0);
    expect(resolved.list?.items).toEqual([]);
  });

  it("renders tag archives through storage with relation-filtered posts", async () => {
    await seedBlogAndTags();

    const design = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/tags/design",
      stage: "published",
    });

    expect(design?.html).toContain("Design");
    expect(design?.html).toContain("Design systems");
    expect(design?.html).not.toContain("Edge workers");
    expect(design?.html).not.toContain("Fallback post");
  });

  it("renders empty tag archives without leaking unrelated posts", async () => {
    const { tags } = await seedBlogAndTags();
    const lonelyTag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Lonely",
        slug: "lonely",
        frontmatter: {},
      },
      testActor,
    );
    await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: lonelyTag.entry.id,
        version: lonelyTag.entry.version,
      },
      testActor,
    );

    const lonely = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/tags/lonely",
      stage: "published",
    });

    expect(lonely?.html).toContain("Lonely");
    expect(lonely?.html).toContain("No posts for this tag yet.");
    expect(lonely?.html).not.toContain("Design systems");
    expect(lonely?.html).not.toContain("Edge workers");
  });

  it("resolves tag archive routes separately from blog entry routes", async () => {
    await seedBlogAndTags();

    const blogRoute = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/blog/design-systems",
      stage: "published",
    });
    const tagRoute = await resolveCollectionTemplateRoute(adapter, {
      pathname: "/tags/design",
      stage: "published",
    });

    expect(blogRoute?.collectionId).not.toBe(tagRoute?.collectionId);
    expect(tagRoute).toMatchObject({
      entrySlug: "design",
      templatePageId: "tag-archive",
    });
  });

  it("includes published tag URLs in discoverable CMS entries", async () => {
    const { tags } = await seedBlogAndTags();

    const entries = await loadDiscoverableCmsEntries(adapter, [
      {
        id: "tag-archive",
        slug: "tag-archive",
        status: "published",
        systemRole: "cms-entry",
        accessMode: "public",
      },
    ]);

    expect(
      entries.some(
        (entry) =>
          entry.collectionId === tags.id && entry.pathname === "/tags/design",
      ),
    ).toBe(true);
  });

  it("excludes tag URLs when the archive template is not public", async () => {
    await seedBlogAndTags();

    const entries = await loadDiscoverableCmsEntries(adapter, [
      {
        id: "tag-archive",
        slug: "tag-archive",
        status: "draft",
        systemRole: "cms-entry",
        accessMode: "public",
      },
    ]);

    expect(entries.some((entry) => entry.pathname.startsWith("/tags/"))).toBe(
      false,
    );
  });

  it("applies entry status gates to tag archive routes", async () => {
    const { tags } = await seedBlogAndTags();
    const draftTag = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Draft",
        slug: "draft",
        frontmatter: {},
      },
      testActor,
    );
    const scheduledDraft = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Scheduled",
        slug: "scheduled",
        frontmatter: {},
      },
      testActor,
    );
    const scheduledTag = await publishEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: scheduledDraft.entry.id,
        version: scheduledDraft.entry.version,
        scheduledFor: "2027-12-01T09:00:00.000Z",
      },
      testActor,
    );
    const archivedDraft = await createEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        title: "Archived",
        slug: "archived",
        frontmatter: {},
      },
      testActor,
    );
    await updateEntryOnAdapter(
      adapter,
      {
        collectionId: tags.id,
        id: archivedDraft.entry.id,
        version: archivedDraft.entry.version,
        patch: { status: "archived" },
      },
      testActor,
    );

    await expect(
      resolveCollectionTemplateRoute(adapter, {
        pathname: "/tags/draft",
        stage: "published",
      }),
    ).resolves.toBeNull();
    await expect(
      resolveCollectionTemplateRoute(adapter, {
        pathname: "/tags/scheduled",
        stage: "draft",
      }),
    ).resolves.toMatchObject({ entryId: scheduledTag.entry.id });
    await expect(
      resolveCollectionTemplateRoute(adapter, {
        pathname: "/tags/archived",
        stage: "draft",
      }),
    ).resolves.toBeNull();
    expect(draftTag.entry.status).toBe("draft");
  });
});
