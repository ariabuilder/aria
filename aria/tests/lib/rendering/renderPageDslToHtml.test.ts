import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../../lib/storage/adapter";
import type { LayoutDSL, PageDSL } from "../../../lib/types/nodes";
import { renderPageDslToHtml } from "../../../lib/rendering/renderPageDslToHtml";
import { renderPageHtmlFromStorage } from "../../../lib/rendering/renderPageHtml";
import { createDefaultUniversalDesignSystem } from "../../../lib/styles/universalDesignSystem";
import type { AriaCollection, AriaEntryRecord } from "../../../lib/cms/schemas";

const fullWidthLayout: LayoutDSL = {
  id: "full-width",
  name: "Full Width",
  nodes: [],
  slots: [
    {
      name: "header",
      defaultContent: [
        {
          id: "header-text",
          type: "Text",
          props: { text: "Site Header" },
          styles: {},
          children: [],
          slot: "header",
        },
      ],
    },
    { name: "main", isDefault: true },
    {
      name: "footer",
      defaultContent: [
        {
          id: "footer-text",
          type: "Text",
          props: { text: "Site Footer" },
          styles: {},
          children: [],
          slot: "footer",
        },
      ],
    },
  ],
};

function createAdapter(
  layout: LayoutDSL | null,
  globalCSS: string = "",
): StorageAdapter {
  const designSystem = createDefaultUniversalDesignSystem();
  if (globalCSS) {
    designSystem.artifacts.globalCSS = globalCSS;
    designSystem.artifacts.globalCSSHash = "compiled-motion-css";
  }

  return {
    getLayoutDSL: async (id: string) => (id === "full-width" ? layout : null),
    getSiteSettings: async () => ({}),
    getDesignSystem: async () => designSystem,
    getComponentDSL: async () => null,
    listPagesDSL: async () => [],
    listCollections: async () => [],
    listEntries: async () => ({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
  } as unknown as StorageAdapter;
}

function createCmsRenderAdapter(input: {
  collection: AriaCollection;
  entries: AriaEntryRecord[];
}): StorageAdapter {
  return {
    ...createAdapter(null),
    getCollection: async (id: string) =>
      id === input.collection.id || id === input.collection.name
        ? input.collection
        : null,
    listCollections: async () => [input.collection],
    listEntries: async () => ({
      items: input.entries.filter(
        (entry) => entry.entry.status === "published",
      ),
      total: input.entries.filter((entry) => entry.entry.status === "published")
        .length,
      page: 1,
      limit: 50,
    }),
  } as unknown as StorageAdapter;
}

describe("renderPageDslToHtml", () => {
  it("renders published component and layout dependency pins", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      layout: "full-width",
      status: "published",
      version: "page-v1",
      _publicationDependencies: {
        layout: { id: "full-width", version: "layout-v1" },
        components: { header: "component-v1" },
      },
      nodes: [
        {
          id: "header-instance",
          type: "Component",
          props: {},
          styles: {},
          children: [],
          reference: {
            id: "header",
            masterId: "header",
            type: "instance",
          },
        },
      ],
    };
    const adapter = createAdapter(fullWidthLayout);
    adapter.getLayoutDSL = async (_id, version) => {
      expect(version).toBe("layout-v1");
      return { ...fullWidthLayout, version: "layout-v1" };
    };
    adapter.getComponentDSL = async (_id, version) => ({
      id: "header",
      name: "Header",
      category: "custom",
      version: version ?? "component-v2",
      nodes: [
        {
          id: "header-text",
          type: "Text",
          props: {
            text: version === "component-v1" ? "Published header" : "Draft header",
          },
          styles: {},
          children: [],
        },
      ],
    });

    const { html } = await renderPageDslToHtml({ page, adapter });

    expect(html).toContain("Published header");
    expect(html).not.toContain("Draft header");
  });

  it("sets the document language from the resolved CMS locale", async () => {
    const page: PageDSL = {
      id: "post-template",
      slug: "post-template",
      title: "Article",
      nodes: [],
      status: "published",
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createAdapter(null),
      cms: { preview: false, locale: "fr" },
    });

    expect(html).toContain('<html lang="fr"');
  });

  it("serializes document spacing through the fallback Global Styles path", async () => {
    const designSystem = createDefaultUniversalDesignSystem();
    designSystem.globalStyles.defaults.root.margin = "2px";
    designSystem.globalStyles.defaults.root.padding = "var(--root-space)";
    designSystem.globalStyles.defaults.body.margin = "1rem auto";
    designSystem.globalStyles.defaults.body.padding = "24px";
    const adapter = {
      ...createAdapter(null),
      getDesignSystem: async () => designSystem,
    } as StorageAdapter;
    const page: PageDSL = {
      id: "spacing",
      slug: "spacing",
      title: "Spacing",
      nodes: [],
    };

    const { html } = await renderPageDslToHtml({ page, adapter });

    expect(html).toContain("html {\n  margin: 2px;");
    expect(html).toContain("padding: var(--root-space);");
    expect(html).toContain(
      "body {\n  margin: 1rem auto;\n  padding: 24px;",
    );
    expect(html).not.toContain("html, body {");
  });

  it("suppresses canonicals for localized error documents", async () => {
    const page: PageDSL = {
      id: "not-found",
      slug: "not-found",
      title: "Not found",
      nodes: [],
      status: "published",
      settings: {
        seo: { canonical: "https://example.com/not-found" },
      },
    };
    const adapter = {
      ...createAdapter(null),
      getSiteSettings: async () => ({ siteUrl: "https://example.com" }),
    } as StorageAdapter;

    const { html } = await renderPageDslToHtml({
      page,
      adapter,
      pathOrSlug: "/fr/missing",
      locale: "fr",
      suppressCanonical: true,
      seoOverride: { noindex: true },
    });

    expect(html).toContain('<html lang="fr"');
    expect(html).toContain('name="robots" content="noindex');
    expect(html).not.toContain('rel="canonical"');
  });

  it("merges slot-only layout defaultContent into the document body", async () => {
    const page: PageDSL = {
      id: "home",
      slug: "",
      title: "Home",
      layout: "full-width",
      nodes: [
        {
          id: "main-section",
          type: "Text",
          props: { text: "Main copy" },
          styles: {},
          children: [],
          slot: "main",
        },
      ],
      status: "published",
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createAdapter(fullWidthLayout),
      pathOrSlug: "/",
    });

    const headerIndex = html.indexOf("Site Header");
    const mainIndex = html.indexOf("Main copy");
    const footerIndex = html.indexOf("Site Footer");

    expect(headerIndex).toBeGreaterThan(-1);
    expect(mainIndex).toBeGreaterThan(-1);
    expect(footerIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeLessThan(mainIndex);
    expect(mainIndex).toBeLessThan(footerIndex);
  });

  it("renders no shared chrome when a page has no layout", async () => {
    const layout: LayoutDSL = {
      id: "full-width",
      name: "Full Width",
      nodes: [],
      slots: [],
      regions: {
        headerComponent: "shared-header",
        footerComponent: "shared-footer",
      },
    };
    const adapter = {
      ...createAdapter(layout),
      getComponentDSL: async (id: string) => ({
        id,
        name: id,
        nodes: [
          {
            id: `${id}-text`,
            type: "Text",
            props: { text: id },
            styles: {},
            children: [],
          },
        ],
      }),
    } as unknown as StorageAdapter;
    const page: PageDSL = {
      id: "landing",
      slug: "landing",
      title: "Landing",
      nodes: [
        {
          id: "landing-copy",
          type: "Text",
          props: { text: "Landing copy" },
          styles: {},
          children: [],
        },
      ],
    };

    const rendered = await renderPageDslToHtml({ page, adapter });
    expect(rendered.html).toContain("Landing copy");
    expect(rendered.html).not.toContain("shared-header");
    expect(rendered.html).not.toContain("shared-footer");
  });

  it("keeps published HTML free of motion styles for hover-only motion", async () => {
    const page: PageDSL = {
      id: "motion-hover",
      slug: "motion-hover",
      title: "Motion Hover",
      nodes: [
        {
          id: "hover-card",
          type: "Container",
          props: {},
          styles: {},
          classNames: { base: ["rounded-lg"] },
          motion: {
            enabled: true,
            effects: ["fade"],
            trigger: "hover",
          },
          children: [],
        },
      ],
      status: "published",
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createAdapter(null, ".aria-motion {}"),
      pathOrSlug: "/motion-hover",
    });

    expect(html).not.toContain('style data-aria-motion="true"');
    expect(html).toContain(
      '<link rel="stylesheet" href="/styles/global.css?v=compiled-motion-css">',
    );
    expect(html).toContain("aria-motion aria-motion-fade aria-motion-hover");
    expect(html).not.toContain("/vendor/aria-motion/aria-motion.js");
  });

  it("renders CMS data source bindings into node props", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-launch",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-launch",
          collectionId: "collection-posts",
          locale: "en",
          slug: "launch-notes",
          title: "Launch Notes",
          frontmatter: { excerpt: "CMS excerpt" },
          body: null,
          isSource: true,
        },
      ],
    };
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "cms-heading",
          type: "heading",
          props: { text: "Fallback title" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "list",
            bindings: { text: "posts.title" },
          },
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({ collection, entries: [entry] }),
    });

    expect(html).toContain("Launch Notes");
    expect(html).not.toContain("Fallback title");
  });

  it("reports page and node context for invalid CMS single bindings", async () => {
    const collection: AriaCollection = {
      id: "collection-announcements",
      name: "announcements",
      label: "Announcements",
      kind: "content",
      schema: {
        id: "collection-announcements",
        label: "Announcements",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/announcements/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const page: PageDSL = {
      id: "standard-page",
      slug: "standard-page",
      title: "Standard Page",
      nodes: [
        {
          id: "announcement-title",
          type: "heading",
          props: { text: "Fallback announcement" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "announcements",
            mode: "single",
            bindings: { text: "announcements.title" },
          },
        },
      ],
    };

    await expect(
      renderPageDslToHtml({
        page,
        adapter: createCmsRenderAdapter({ collection, entries: [] }),
      }),
    ).rejects.toThrow(
      'CMS data source failed in page "standard-page" nodes: CMS data source "announcement-title" (collection: announcements, mode: single) failed',
    );
  });

  it("renders JSON-safe CMS binding values into node props", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-launch",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-launch",
          collectionId: "collection-posts",
          locale: "en",
          slug: "launch-notes",
          title: "Launch Notes",
          frontmatter: {
            cover: {
              mediaId: "media-1",
              alt: "Launch image",
            },
          },
          body: null,
          isSource: true,
        },
      ],
    };
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "cms-image",
          type: "img",
          props: { alt: "Fallback image" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "list",
            bindings: { "data-media": "posts.cover" },
          },
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({ collection, entries: [entry] }),
    });

    expect(html).toContain(
      "data-media='{&quot;mediaId&quot;:&quot;media-1&quot;",
    );
    expect(html).toContain("&quot;alt&quot;:&quot;Launch image&quot;}'");
  });

  it("repeats CMS list child templates for each resolved entry", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const firstEntry: AriaEntryRecord = {
      entry: {
        id: "entry-alpha",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-alpha",
          collectionId: "collection-posts",
          locale: "en",
          slug: "alpha",
          title: "Alpha Post",
          frontmatter: { excerpt: "Alpha excerpt" },
          body: null,
          isSource: true,
        },
      ],
    };
    const secondEntry: AriaEntryRecord = {
      entry: {
        id: "entry-beta",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-03T00:00:00.000Z",
        publishedAt: "2026-06-03T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-beta",
          collectionId: "collection-posts",
          locale: "en",
          slug: "beta",
          title: "Beta Post",
          frontmatter: { excerpt: "Beta excerpt" },
          body: null,
          isSource: true,
        },
      ],
    };
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "post-list",
          type: "Container",
          props: {},
          styles: {},
          children: [
            {
              id: "post-title",
              type: "heading",
              props: { text: "Fallback title" },
              styles: {},
              children: [],
              dataSource: {
                type: "collection",
                collection: "posts",
                mode: "single",
                bindings: { text: "posts.title" },
              },
            },
          ],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "list",
            limit: 2,
          },
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({
        collection,
        entries: [firstEntry, secondEntry],
      }),
    });

    expect(html).toContain("Alpha Post");
    expect(html).toContain("Beta Post");
    expect(html).not.toContain("Fallback title");
  });

  it("repeats one-level field loops from the current CMS entry", async () => {
    const collection: AriaCollection = {
      id: "collection-faqs",
      name: "faqs",
      label: "FAQs",
      kind: "content",
      schema: {
        id: "collection-faqs",
        label: "FAQs",
        kind: "content",
        fields: [
          {
            key: "faq_items",
            label: "FAQ items",
            type: "repeater",
            required: false,
            fields: [
              {
                key: "question",
                label: "Question",
                type: "string",
                required: true,
              },
              {
                key: "answer",
                label: "Answer",
                type: "text",
                required: true,
              },
            ],
          },
        ],
        version: 1,
      },
      scope: "global",
      urlPattern: "/faqs/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-faqs",
        collectionId: "collection-faqs",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-faqs",
          collectionId: "collection-faqs",
          locale: "en",
          slug: "billing",
          title: "Billing FAQs",
          frontmatter: {
            faq_items: [
              { question: "Can I upgrade?", answer: "Yes, any time." },
              { question: "Can I cancel?", answer: "Also yes." },
            ],
          },
          body: null,
          isSource: true,
        },
      ],
    };
    const page: PageDSL = {
      id: "faq-page",
      slug: "faq-page",
      title: "FAQ Page",
      nodes: [
        {
          id: "entry-loop",
          type: "Container",
          props: {},
          styles: {},
          dataSource: {
            type: "collection",
            collection: "faqs",
            mode: "list",
          },
          children: [
            {
              id: "faq-loop",
              type: "Container",
              props: {},
              styles: {},
              dataSource: {
                type: "static",
                source: "field",
                mode: "list",
                field: "faqs.faq_items",
              },
              children: [
                {
                  id: "question",
                  type: "heading",
                  props: { text: "Fallback question" },
                  styles: {},
                  children: [],
                  dataSource: {
                    type: "static",
                    bindings: { text: "question" },
                  },
                },
                {
                  id: "answer",
                  type: "Text",
                  props: { text: "Fallback answer" },
                  styles: {},
                  children: [],
                  dataSource: {
                    type: "static",
                    bindings: { text: "answer" },
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({ collection, entries: [entry] }),
    });

    expect(html).toContain("Can I upgrade?");
    expect(html).toContain("Yes, any time.");
    expect(html).toContain("Can I cancel?");
    expect(html).toContain("Also yes.");
    expect(html).not.toContain("Fallback question");
    expect(html).not.toContain("Fallback answer");
  });

  it("hides empty CMS list containers by default", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "post-list",
          type: "Container",
          props: {},
          styles: {},
          children: [
            {
              id: "post-empty-title",
              type: "heading",
              props: { text: "No posts yet" },
              styles: {},
              children: [],
            },
          ],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "list",
          },
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({ collection, entries: [] }),
    });

    expect(html).not.toContain("No posts yet");
  });

  it("keeps explicit fallback content for empty CMS list containers", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const page: PageDSL = {
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [
        {
          id: "post-list",
          type: "Container",
          props: {},
          styles: {},
          children: [
            {
              id: "post-empty-title",
              type: "heading",
              props: { text: "No posts yet" },
              styles: {},
              children: [],
            },
          ],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "list",
            onError: "show-fallback",
          },
        },
      ],
    };

    const { html } = await renderPageDslToHtml({
      page,
      adapter: createCmsRenderAdapter({ collection, entries: [] }),
    });

    expect(html).toContain("No posts yet");
  });

  it("renders collection template URLs with entry context", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: "post-template",
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-launch",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-launch",
          collectionId: "collection-posts",
          locale: "en",
          slug: "launch-notes",
          title: "Launch Notes",
          frontmatter: {},
          body: null,
          isSource: true,
        },
      ],
    };
    const templatePage: PageDSL = {
      id: "post-template",
      slug: "post-template",
      title: "Post Template",
      nodes: [
        {
          id: "post-title",
          type: "heading",
          props: { text: "Fallback title" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "single",
            bindings: { text: "posts.title" },
          },
        },
      ],
    };
    const baseAdapter = createAdapter(null);
    const adapter = {
      ...baseAdapter,
      getPageDSL: async (id: string) =>
        id === "post-template" ? templatePage : null,
      getPublishedPageDSL: async (id: string) =>
        id === "post-template" ? templatePage : null,
      listCollections: async () => [collection],
      getCollection: async (id: string) =>
        id === collection.id || id === collection.name ? collection : null,
      getEntry: async (options: { collectionId: string; idOrSlug: string }) =>
        options.collectionId === collection.id &&
        (options.idOrSlug === "launch-notes" ||
          options.idOrSlug === "entry-launch")
          ? entry
          : null,
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/posts/launch-notes",
      stage: "published",
    });

    expect(result?.html).toContain("Launch Notes");
    expect(result?.html).not.toContain("Fallback title");
  });

  it("renders collection template pages using auto preview entry context", async () => {
    const collection: AriaCollection = {
      id: "collection-posts",
      name: "posts",
      label: "Posts",
      kind: "content",
      schema: {
        id: "collection-posts",
        label: "Posts",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/posts/{slug}",
      templatePageId: "post-template",
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-launch",
        collectionId: "collection-posts",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-launch",
          collectionId: "collection-posts",
          locale: "en",
          slug: "launch-notes",
          title: "Launch Notes",
          frontmatter: {},
          body: null,
          isSource: true,
        },
      ],
    };
    const templatePage: PageDSL = {
      id: "post-template",
      slug: "post-template",
      title: "Post Template",
      nodes: [
        {
          id: "post-title",
          type: "heading",
          props: { text: "Fallback title" },
          styles: {},
          children: [],
          dataSource: {
            type: "collection",
            collection: "posts",
            mode: "single",
            bindings: { text: "posts.title" },
          },
        },
      ],
    };
    const adapter = {
      ...createAdapter(null),
      listCollections: async () => [collection],
      getCollection: async (id: string) =>
        id === collection.id || id === collection.name ? collection : null,
      getEntry: async (options: { collectionId: string; idOrSlug: string }) =>
        options.collectionId === collection.id &&
        (options.idOrSlug === "launch-notes" ||
          options.idOrSlug === "entry-launch")
          ? entry
          : null,
      listEntries: async () => ({
        items: [entry],
        total: 1,
        page: 1,
        limit: 50,
      }),
    } as unknown as StorageAdapter;

    const { html } = await renderPageDslToHtml({
      page: templatePage,
      adapter,
    });

    expect(html).toContain("Launch Notes");
    expect(html).not.toContain("Fallback title");
  });

  it("keeps exact static page routes ahead of collection templates", async () => {
    const staticPage: PageDSL = {
      id: "static-article",
      slug: "articles/launch-notes",
      title: "Static Article",
      nodes: [
        {
          id: "static-title",
          type: "heading",
          props: { text: "Static page wins" },
          styles: {},
          children: [],
        },
      ],
    };
    const adapter = {
      ...createAdapter(null),
      getPageDSL: async (id: string) =>
        id === "articles/launch-notes" ? staticPage : null,
      getPublishedPageDSL: async (id: string) =>
        id === "articles/launch-notes" ? staticPage : null,
      listCollections: async () => [],
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/articles/launch-notes",
      stage: "published",
    });

    expect(result?.html).toContain("Static page wins");
  });

  it("uses the most specific matching collection template route", async () => {
    const broadCollection: AriaCollection = {
      id: "collection-broad",
      name: "broad",
      label: "Broad",
      kind: "content",
      schema: {
        id: "collection-broad",
        label: "Broad",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/{slug}/launch-notes",
      templatePageId: "broad-template",
      listPageId: null,
      supports: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    };
    const articleCollection: AriaCollection = {
      ...broadCollection,
      id: "collection-articles",
      name: "articles",
      label: "Articles",
      schema: {
        id: "collection-articles",
        label: "Articles",
        kind: "content",
        fields: [],
        version: 1,
      },
      urlPattern: "/articles/{slug}",
      templatePageId: "article-template",
    };
    const broadEntry: AriaEntryRecord = {
      entry: {
        id: "entry-broad",
        collectionId: "collection-broad",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-broad",
          collectionId: "collection-broad",
          locale: "en",
          slug: "articles",
          title: "Broad Template Entry",
          frontmatter: {},
          body: null,
          isSource: true,
        },
      ],
    };
    const articleEntry: AriaEntryRecord = {
      entry: {
        id: "entry-article",
        collectionId: "collection-articles",
        status: "published",
        version: "v1",
        authorId: "author-1",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
        publishedAt: "2026-06-02T00:00:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-article",
          collectionId: "collection-articles",
          locale: "en",
          slug: "launch-notes",
          title: "Specific Article Entry",
          frontmatter: {},
          body: null,
          isSource: true,
        },
      ],
    };
    const broadTemplate: PageDSL = {
      id: "broad-template",
      slug: "broad-template",
      title: "Broad Template",
      nodes: [
        {
          id: "broad-title",
          type: "heading",
          props: { text: "Broad template" },
          styles: {},
          children: [],
        },
      ],
    };
    const articleTemplate: PageDSL = {
      id: "article-template",
      slug: "article-template",
      title: "Article Template",
      nodes: [
        {
          id: "article-title",
          type: "heading",
          props: { text: "Article template" },
          styles: {},
          children: [],
        },
      ],
    };
    const adapter = {
      ...createAdapter(null),
      getPageDSL: async (id: string) =>
        id === "broad-template"
          ? broadTemplate
          : id === "article-template"
            ? articleTemplate
            : null,
      getPublishedPageDSL: async (id: string) =>
        id === "broad-template"
          ? broadTemplate
          : id === "article-template"
            ? articleTemplate
            : null,
      listCollections: async () => [broadCollection, articleCollection],
      getEntry: async (options: { collectionId: string; idOrSlug: string }) => {
        if (
          options.collectionId === broadCollection.id &&
          options.idOrSlug === "articles"
        ) {
          return broadEntry;
        }
        if (
          options.collectionId === articleCollection.id &&
          options.idOrSlug === "launch-notes"
        ) {
          return articleEntry;
        }
        return null;
      },
    } as unknown as StorageAdapter;

    const result = await renderPageHtmlFromStorage({
      adapter,
      pathname: "/articles/launch-notes",
      stage: "published",
    });

    expect(result?.html).toContain("Article template");
    expect(result?.html).not.toContain("Broad template");
  });
});
