import { describe, expect, it } from "vitest";
import {
  ExportedEntrySchema,
  SeedManifestSchema,
  SiteExportSelectionSchema,
} from "../../lib/export/cmsTypes";
import {
  projectCollectionManifest,
  projectEntryRecord,
  shouldIncludeEntryStatus,
} from "../../lib/cms/entryProjection";
import type { AriaCollection, AriaEntryRecord } from "../../lib/cms/schemas";

const now = "2026-01-01T00:00:00.000Z";

const collection = {
  id: "collection-blog",
  name: "blog",
  label: "Blog",
  kind: "content",
  schema: {
    id: "collection-blog",
    label: "Blog",
    kind: "content",
    fields: [],
    version: 1,
  },
  scope: "global",
  urlPattern: "/blog/{slug}",
  templatePageId: "page-template",
  listPageId: "page-list",
  supports: ["body", "seo"],
  createdAt: now,
  updatedAt: now,
} as AriaCollection;

const publishedEntry: AriaEntryRecord = {
  entry: {
    id: "entry-published",
    collectionId: collection.id,
    authorId: "author-1",
    status: "published",
    version: "v1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    publishedAt: "2026-01-02T00:00:00.000Z",
    scheduledFor: null,
  },
  locales: [
    {
      entryId: "entry-published",
      collectionId: collection.id,
      locale: "en",
      slug: "hello-world",
      title: "Hello World",
      frontmatter: { excerpt: "Intro" },
      body: [],
      isSource: true,
    },
  ],
  relations: [],
};

describe("CMS export contract types", () => {
  it("parses site export selection with cms options", () => {
    const parsed = SiteExportSelectionSchema.parse({
      preset: "dataOnly",
      mediaMode: "omit",
      cms: {
        includeDrafts: false,
        includeCanonicalJson: true,
      },
    });

    expect(parsed.preset).toBe("dataOnly");
    expect(parsed.cms?.includeCanonicalJson).toBe(true);
  });

  it("projects published entries into exported entry JSON", () => {
    const collections = new Map([[collection.id, collection]]);
    const slugIndex = new Map<`${string}:${string}`, string>([
      ["blog:entry-published", "hello-world"],
    ]);
    const locale = publishedEntry.locales[0]!;

    const exported = projectEntryRecord({
      record: publishedEntry,
      collection,
      locale,
      collections,
      slugIndex,
    });

    expect(ExportedEntrySchema.parse(exported)).toMatchObject({
      id: "entry-published",
      slug: "hello-world",
      locale: "en",
      status: "published",
    });
  });

  it("excludes non-published entries from canonical export by default", () => {
    expect(shouldIncludeEntryStatus("scheduled", false)).toBe(false);
    expect(shouldIncludeEntryStatus("published", false)).toBe(true);
    expect(shouldIncludeEntryStatus("draft", true)).toBe(true);
  });

  it("builds collection manifest and seed manifest contracts", () => {
    const pages = new Map([
      ["page-template", "post-template"],
      ["page-list", "blog"],
    ]);

    const manifest = projectCollectionManifest({
      collection,
      entryCount: 1,
      exportedAt: "2026-07-08T00:00:00.000Z",
      pages,
    });

    expect(manifest).toMatchObject({
      name: "blog",
      entryCount: 1,
      templatePageSlug: "post-template",
      listPageSlug: "blog",
    });

    const seed = SeedManifestSchema.parse({
      version: 1,
      collections: ["blog"],
      applyOrder: ["blog"],
    });
    expect(seed.collections).toEqual(["blog"]);
  });
});
