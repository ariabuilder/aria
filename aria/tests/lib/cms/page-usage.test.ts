import { describe, expect, it } from "vitest";

import {
  cmsPageUsageDetailLabels,
  cmsPageUsageBadgeLabels,
  deriveCmsPageUsages,
  validateCollectionRouteUsage,
  type CmsPageReference,
  type CmsPageUsage,
} from "../../../lib/cms/pageUsage";
import {
  matchCmsUrlPattern,
  validateCmsUrlPattern,
} from "../../../lib/cms/routing";
import { AriaCollectionSchema, type AriaCollection } from "../../../lib/cms/schemas";

function collection(
  overrides: Partial<AriaCollection> & Pick<AriaCollection, "id" | "name" | "label">,
): AriaCollection {
  return AriaCollectionSchema.parse({
    kind: "content",
    schema: {
      id: overrides.id,
      label: overrides.label,
      kind: overrides.kind ?? "content",
      fields: [],
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  });
}

const pages: readonly CmsPageReference[] = [
  { id: "page-blog", slug: "blog", title: "Blog" },
  { id: "page-post", slug: "post-template", title: "Post Template" },
];

describe("CMS routing helpers", () => {
  it("validates slug-only URL patterns and rejects unsupported tokens", () => {
    expect(validateCmsUrlPattern("/posts/{slug}")).toMatchObject({
      valid: true,
    });
    expect(validateCmsUrlPattern("/posts/{id}")).toMatchObject({
      valid: false,
      message: "{id} is not supported yet. Use {slug}.",
    });
  });

  it("extracts the slug from supported collection URL patterns", () => {
    expect(matchCmsUrlPattern("/posts/{slug}", "/posts/hello-world")).toBe(
      "hello-world",
    );
    expect(matchCmsUrlPattern("/{slug}/launch-notes", "/aria/launch-notes")).toBe(
      "aria",
    );
    expect(matchCmsUrlPattern("/posts/{slug}", "/blog/hello-world")).toBeNull();
  });
});

describe("CMS page usage helpers", () => {
  it("derives template and list page usage without changing page roles", () => {
    const usages = deriveCmsPageUsages({
      pages,
      collections: [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
          templatePageId: "page-post",
          listPageId: "page-blog",
        }),
      ],
    });

    expect(usages.get("page-post")).toEqual([
      expect.objectContaining({ kind: "template", collectionName: "blog" }),
    ]);
    expect(usages.get("page-blog")).toEqual([
      expect.objectContaining({ kind: "list", collectionName: "blog" }),
    ]);
  });

  it("warns about missing template/list pages", () => {
    const warnings = validateCollectionRouteUsage({
      collection: collection({
        id: "collection-blog",
        name: "blog",
        label: "Blog",
        templatePageId: "missing-template",
        listPageId: "missing-list",
      }),
      collections: [],
      pages,
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "missing-template-page",
      "missing-list-page",
    ]);
  });

  it("warns when a static page can win before a collection pattern", () => {
    const warnings = validateCollectionRouteUsage({
      collection: collection({
        id: "collection-blog",
        name: "blog",
        label: "Blog",
        urlPattern: "/{slug}",
      }),
      collections: [],
      pages,
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "static-page-conflict",
        relatedPageId: "page-blog",
      }),
    );
  });

  it("formats static page route conflicts with normalized paths", () => {
    const warnings = validateCollectionRouteUsage({
      collection: collection({
        id: "collection-single-segment",
        name: "single-segment",
        label: "Single Segment",
        urlPattern: "/{slug}",
      }),
      collections: [],
      pages: [{ id: "page-blog", slug: "blog", title: "Blog" }],
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "static-page-conflict",
        message: "The page /blog will win before this collection route.",
      }),
    );
  });

  it("warns about overlapping collection URL patterns", () => {
    const active = collection({
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      urlPattern: "/posts/{slug}",
    });
    const other = collection({
      id: "collection-articles",
      name: "articles",
      label: "Articles",
      urlPattern: "/posts/{slug}",
    });

    const warnings = validateCollectionRouteUsage({
      collection: active,
      collections: [active, other],
      pages,
    });

    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: "overlapping-collection-pattern",
        relatedCollectionId: "collection-articles",
      }),
    );
  });
});

describe("cmsPageUsageBadgeLabels", () => {
  function usage(overrides: CmsPageUsage): CmsPageUsage {
    return overrides;
  }

  it("returns empty labels for missing or empty usages", () => {
    expect(cmsPageUsageBadgeLabels(undefined)).toEqual([]);
    expect(cmsPageUsageBadgeLabels([])).toEqual([]);
  });

  it("labels assignment usages for the pages list", () => {
    expect(
      cmsPageUsageBadgeLabels([
        usage({
          kind: "template",
          collectionId: "collection-blog",
          collectionName: "blog",
          collectionLabel: "Blog",
        }),
        usage({
          kind: "list",
          collectionId: "collection-tags",
          collectionName: "tags",
          collectionLabel: "Tags",
        }),
      ]),
    ).toEqual(["CMS: Blog Entries", "CMS: Tags"]);
  });

  it("ignores cms-bound usages in the pages list", () => {
    expect(
      cmsPageUsageBadgeLabels([
        usage({
          kind: "list",
          collectionId: "collection-blog",
          collectionName: "blog",
          collectionLabel: "Blog",
        }),
        usage({
          kind: "cms-bound",
          collectionId: "collection-main-nav",
          collectionName: "main-nav",
          collectionLabel: "Main Navigation",
          nodeId: "navigation",
        }),
        usage({
          kind: "cms-bound",
          collectionId: "collection-blog",
          collectionName: "blog",
          collectionLabel: "Blog",
          nodeId: "loop",
        }),
      ]),
    ).toEqual(["CMS: Blog"]);
  });

  it("falls back to collectionName when collectionLabel is missing", () => {
    expect(
      cmsPageUsageBadgeLabels([
        usage({
          kind: "list",
          collectionName: "blog",
        }),
      ]),
    ).toEqual(["CMS: blog"]);
  });

  it("describes assignment and block usages separately", () => {
    expect(
      cmsPageUsageDetailLabels([
        usage({
          kind: "template",
          collectionName: "tags",
          collectionLabel: "Tags",
        }),
        usage({
          kind: "cms-bound",
          collectionName: "blog",
          collectionLabel: "Blog",
          nodeId: "tag-archive-list",
          loop: true,
        }),
        usage({
          kind: "cms-bound",
          collectionName: "tags",
          collectionLabel: "Tags",
          nodeId: "tag-heading",
          loop: false,
        }),
      ]),
    ).toEqual([
      "Entry template for Tags",
      "Blog list block (tag-archive-list)",
      "Tags single binding (tag-heading)",
    ]);
  });
});
