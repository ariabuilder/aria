import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type {
  PageInventoryItem,
  SiteSettings,
  StorageAdapter,
} from "../../lib/storage/adapter";
import type { ComponentDSL, LayoutDSL, PageDSL } from "../../lib/types/nodes";
import type { SessionUser } from "../../lib/auth";
import type { RuntimeLocals } from "../../lib/cloudflare/env";
import type {
  AriaCollection,
  AriaEntryRecord,
  AriaEntryRevision,
} from "../../lib/cms/schemas";
import { generateSiteExportArchive } from "../../lib/export/generator";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";
import {
  buildSiteExportRecord,
  createSiteExportStore,
} from "../../lib/export/storage";
import { SiteExportRecordSchema } from "../../lib/export/schema";

const testUser: SessionUser = {
  id: "f1b18110-3ef0-4f86-9a8d-9ca4fe3064d8",
  username: "andy",
  email: "andy@example.com",
  role: "administrator",
  totpEnabled: false,
};

function createStorageAdapterMock(): StorageAdapter {
  const now = new Date("2026-03-19T16:00:00.000Z").toISOString();
  const designSystem = createDefaultUniversalDesignSystem();
  designSystem.globalStyles.defaults.body.backgroundColor = "#2db749";
  designSystem.globalStyles.variables.custom["brand-blue"] = {
    label: "Brand Blue",
    value: "#2d49b7",
    category: "color",
    description: "Brand blue used in exports",
  };
  designSystem.globalStyles.variables.aliases.surface = {
    label: "Surface",
    sourceType: "custom",
    sourceKey: "brand-blue",
    fallback: "",
  };

  designSystem.fonts.uploaded["custom-brand"] = {
    id: "custom-brand",
    name: "Brand Display",
    family: "Brand Display",
    formats: [
      {
        format: "woff2",
        url: "https://cdn.example.com/fonts/brand-display.woff2",
      },
    ],
    weight: "400",
    style: "normal",
  };

  const publishedHomePage: PageDSL = {
    id: "home",
    slug: "index",
    title: "Home",
    description: "Home page",
    layout: "default-layout",
    nodes: [
      {
        id: "node-1",
        type: "Section",
        props: {},
        styles: {},
        children: [
          {
            id: "node-1-text",
            type: "Text",
            props: {
              text: "Hello export",
            },
            styles: {},
            children: [],
          },
        ],
      },
    ],
    status: "published",
    updatedAt: now,
    settings: {
      seo: {
        title: "Home SEO",
      },
    },
  };
  const draftContactPage: PageDSL = {
    id: "contact",
    slug: "contact",
    title: "Contact",
    description: "Contact page",
    nodes: [
      {
        id: "node-2",
        type: "Section",
        props: {
          id: "contact-section",
        },
        styles: {},
        children: [
          {
            id: "node-2-text",
            type: "Text",
            props: {
              text: "Draft contact page",
            },
            styles: {},
            children: [],
          },
        ],
      },
    ],
    status: "draft",
    updatedAt: now,
    settings: {},
  };
  const layout: LayoutDSL = {
    id: "default-layout",
    name: "default-layout",
    title: "Default Layout",
    nodes: [],
    slots: [{ name: "default", isDefault: true }],
    updatedAt: now,
  };
  const component: ComponentDSL = {
    id: "cta-banner",
    name: "cta-banner",
    title: "CTA Banner",
    nodes: [],
    updatedAt: now,
  };
  const blogCollection: AriaCollection = {
    id: "collection-blog",
    name: "blog",
    label: "Blog",
    kind: "content",
    schema: {
      id: "collection-blog",
      label: "Blog",
      kind: "content",
      fields: [
        {
          key: "related",
          label: "Related",
          type: "relation",
          targetCollection: "collection-blog",
        },
      ],
      version: 1,
    },
    scope: "global",
    urlPattern: "/blog/[slug]",
    templatePageId: "home",
    listPageId: null,
    supports: ["body", "seo", "scheduling"],
    createdAt: now,
    updatedAt: now,
  };
  const blogEntry: AriaEntryRecord = {
    entry: {
      id: "entry-launch",
      collectionId: "collection-blog",
      status: "scheduled",
      version: "entry-version-1",
      authorId: testUser.id,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      scheduledFor: "2026-03-30T12:00:00.000Z",
    },
    locales: [
      {
        entryId: "entry-launch",
        collectionId: "collection-blog",
        locale: "en",
        slug: "launch-post",
        title: "Launch Post",
        frontmatter: {
          summary: "CMS export coverage",
        },
        body: [
          {
            _type: "block",
            _key: "block-1",
            style: "normal",
            markDefs: [],
            children: [
              {
                _type: "span",
                _key: "span-1",
                text: "Hello from the CMS body.",
                marks: [],
              },
            ],
          },
        ],
        isSource: true,
      },
      {
        entryId: "entry-launch",
        collectionId: "collection-blog",
        locale: "fr",
        slug: "article-lancement",
        title: "Article lancement",
        frontmatter: {},
        body: null,
        isSource: false,
      },
    ],
    relations: [
      {
        sourceEntryId: "entry-launch",
        fieldKey: "related",
        targetEntryId: "entry-related",
        position: 0,
        meta: { strength: "primary" },
      },
    ],
    authorship: {
      author: {
        id: testUser.id,
        username: testUser.username,
        email: testUser.email,
      },
      createdBy: {
        id: testUser.id,
        username: testUser.username,
        email: testUser.email,
      },
      updatedBy: {
        id: testUser.id,
        username: testUser.username,
        email: testUser.email,
      },
      publishedBy: null,
    },
  };

  return {
    getPageDSL: async (id: string) => {
      if (id === "home") {
        return publishedHomePage;
      }

      if (id === "contact") {
        return draftContactPage;
      }

      return null;
    },
    getPublishedPageDSL: async (id: string) =>
      id === "home" ? publishedHomePage : null,
    savePageDSL: async () => "",
    listPagesDSL: async (): Promise<PageInventoryItem[]> => [
      {
        id: "home",
        slug: "index",
        title: "Home",
        status: "published",
        systemRole: "standard",
        accessMode: "public",
        hasPassword: false,
        isModifiedSincePublish: false,
        updatedAt: now,
      },
      {
        id: "contact",
        slug: "contact",
        title: "Contact",
        status: "draft",
        systemRole: "standard",
        accessMode: "public",
        hasPassword: false,
        isModifiedSincePublish: false,
        updatedAt: now,
      },
    ],
    getLayoutDSL: async (id: string) =>
      id === "default-layout" ? layout : null,
    saveLayoutDSL: async () => "",
    listLayoutsDSL: async (): Promise<LayoutDSL[]> => [
      {
        id: "default-layout",
        name: "default-layout",
        title: "Default Layout",
        nodes: [],
        slots: [{ name: "default", isDefault: true }],
      },
    ],
    getComponentDSL: async (id: string) =>
      id === "cta-banner" ? component : null,
    saveComponentDSL: async () => "",
    listComponentsDSL: async (): Promise<ComponentDSL[]> => [
      {
        id: "cta-banner",
        name: "cta-banner",
        title: "CTA Banner",
        nodes: [],
      },
    ],
    listCollections: async () => [blogCollection],
    countEntriesByCollection: async () => ({
      "collection-blog": 1,
    }),
    getCollection: async (idOrName: string) =>
      idOrName === "collection-blog" || idOrName === "blog"
        ? blogCollection
        : null,
    saveCollection: async () => blogCollection,
    deleteCollection: async () => undefined,
    listEntries: async () => ({
      items: [blogEntry],
      total: 1,
      page: 1,
      limit: 200,
    }),
    getEntry: async () => blogEntry,
    saveEntry: async () => blogEntry,
    deleteEntry: async () => undefined,
    listEntryRevisions: async () => [],
    getEntryRevision: async () => null,
    saveEntryRevision: async (revision: AriaEntryRevision) => revision,
    saveOrder: async () => undefined,
    getOrder: async (kind: string) =>
      kind === "pages"
        ? ["home", "contact"]
        : kind === "layouts"
          ? ["default-layout"]
          : ["cta-banner"],
    getSnapshot: async () => null,
    saveSnapshot: async () => undefined,
    deleteSnapshot: async () => undefined,
    uploadMedia: async () => "",
    saveMedia: async () => "",
    getMedia: async (path: string) =>
      path === "logo.txt"
        ? Buffer.from("logo")
        : path === "fonts/brand-display.woff2"
          ? Buffer.from("fontbytes")
          : null,
    listMedia: async () => [
      {
        path: "logo.txt",
        url: "/uploads/logo.txt",
        size: 4,
        contentType: "text/plain",
        createdAt: now,
      },
      {
        path: "fonts/brand-display.woff2",
        url: "https://cdn.example.com/fonts/brand-display.woff2",
        size: 9,
        contentType: "font/woff2",
        createdAt: now,
      },
    ],
    deleteMedia: async () => undefined,
    getPageMetadata: async (slug: string) =>
      slug === "index"
        ? {
            seoScore: 98,
            lastReviewedBy: "content-team",
          }
        : null,
    savePageMetadata: async () => undefined,
    getDesignSystem: async () => {
      designSystem.artifacts.customFontsCSS =
        "@font-face{font-family:'Brand Display';src:url('https://cdn.example.com/fonts/brand-display.woff2') format('woff2');font-display:swap;}";
      designSystem.artifacts.globalCSS =
        ":root{--brand-blue:#2d49b7;--surface:var(--brand-blue)}body{color:black;background-color:#2db749}.hero{font-family:'Brand Display'}@font-face{font-family:'Brand Display';src:url('https://cdn.example.com/fonts/brand-display.woff2') format('woff2');font-display:swap;}";
      designSystem.artifacts.globalCSSHash = "hash-123";
      designSystem.artifacts.lastCompiled = now;

      return designSystem;
    },
    saveDesignSystem: async () => undefined,
    getSiteSettings: async (): Promise<SiteSettings> => ({
      siteName: "Aria Test",
      siteUrl: "https://example.com",
      utilityEngine: "unocss",
    }),
    saveSiteSettings: async () => undefined,
    touchResource: async () => undefined,
    getResourceTouch: async () => null,
    getContentSiteState: async () => ({
      scope: "default",
      currentRevisionId: "rev-export-1",
      revisionSeq: 7,
      updatedAt: now,
      updatedBy: testUser.id,
      lastMutationKind: "cms-entry-update",
      lastMutationTarget: "collection-blog:entry-launch",
      schemaVersion: "test-schema",
    }),
    touchContentRevision: async () => ({
      scope: "default",
      currentRevisionId: "rev-1",
      revisionSeq: 1,
      updatedAt: now,
      lastMutationKind: "save-page",
    }),
    getThumbnail: async () => null,
    saveThumbnail: async () => "",
    deleteThumbnail: async () => undefined,
    listRedirects: async (options?: { includeDisabled?: boolean }) =>
      [
        {
          id: "redirect-enabled",
          fromPath: "/old-blog",
          toPath: "/blog",
          statusCode: 301,
          enabled: true,
          note: "Legacy blog route",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "redirect-disabled",
          fromPath: "/draft-redirect",
          toPath: "/draft",
          statusCode: 302,
          enabled: false,
          createdAt: now,
          updatedAt: now,
        },
      ].filter((rule) => options?.includeDisabled || rule.enabled),
    getRedirectById: async () => null,
    createRedirect: async () => {
      throw new Error("not implemented in mock");
    },
    updateRedirect: async () => {
      throw new Error("not implemented in mock");
    },
    deleteRedirect: async () => undefined,
    listPublishedPageLocaleRoutes: async () => [],
    appendSettingsAuditEntry: async () => undefined,
  } as unknown as StorageAdapter;
}

let localExportDir: string | null = null;

afterEach(async () => {
  if (localExportDir) {
    await rm(localExportDir, { recursive: true, force: true });
    localExportDir = null;
  }

  delete process.env.ARIA_EXPORTS_LOCAL_DIR;
});

describe("site export flow", () => {
  it("builds an Astro-style site archive with current resources and settings", async () => {
    const archive = await generateSiteExportArchive({
      adapter: createStorageAdapterMock(),
    });

    expect(archive.pageCount).toBe(2);
    expect(archive.mediaCount).toBe(2);
    expect(archive.cmsCollectionCount).toBe(1);
    expect(archive.cmsEntryCount).toBe(1);
    expect(archive.redirectCount).toBe(2);
    expect(archive.filename.endsWith(".zip")).toBe(true);

    const contents = await JSZip.loadAsync(archive.bytes);

    expect(contents.file("export/pages/index.astro")).toBeDefined();
    expect(contents.file("export/pages/contact.astro")).toBeDefined();
    expect(contents.file("export/layouts/default-layout.astro")).toBeDefined();
    expect(contents.file("export/components/cta-banner.astro")).toBeDefined();
    expect(contents.file("export/site-settings.json")).toBeDefined();
    expect(contents.file("export/styles/design-system.json")).toBeDefined();
    expect(contents.file("export/content/cms.json")).toBeDefined();
    expect(
      contents.file("export/collections/blog/launch-post-2026-03-30.md"),
    ).toBeDefined();
    expect(contents.file("export/content/content-state.json")).toBeDefined();
    expect(contents.file("export/content/order.json")).toBeDefined();
    expect(contents.file("export/content/page-metadata.json")).toBeDefined();
    expect(contents.file("export/content/redirects.json")).toBeDefined();
    expect(contents.file("export/aria-export.json")).toBeDefined();
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).toContain("body{color:black;background-color:#2db749}");
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).toContain("--brand-blue:#2d49b7");
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).toContain("background-color:#2db749");
    expect(await contents.file("export/robots.txt")?.async("string")).toContain(
      "Sitemap:",
    );
    expect(await contents.file("export/llms.txt")?.async("string")).toContain(
      "Aria Test",
    );
    expect(await contents.file("export/_redirects")?.async("string")).toContain(
      "/old-blog",
    );
    expect(
      await contents.file("export/_redirects")?.async("string"),
    ).not.toContain("/draft-redirect");
    expect(
      await contents.file("export/sitemap.xml")?.async("string"),
    ).toContain("https://example.com/");
    const manifest = JSON.parse(
      (await contents.file("export/aria-export.json")?.async("string")) ?? "{}",
    );
    expect(manifest).toMatchObject({
      format: "aria-site-export",
      version: 1,
      counts: {
        pages: 2,
        layouts: 1,
        components: 1,
        media: 2,
        cmsCollections: 1,
        cmsEntries: 1,
        cmsMarkdownFiles: 1,
        redirects: 2,
        pageMetadata: 1,
      },
    });
    expect(manifest.excluded).toContain("auth users and sessions");
    const cms = JSON.parse(
      (await contents.file("export/content/cms.json")?.async("string")) ?? "{}",
    );
    expect(cms.collections).toHaveLength(1);
    expect(cms.collections[0]).toMatchObject({
      id: "collection-blog",
      name: "blog",
      label: "Blog",
      supports: ["body", "seo", "scheduling"],
    });
    expect(cms.entries).toHaveLength(1);
    expect(cms.entries[0]).toMatchObject({
      entry: {
        id: "entry-launch",
        collectionId: "collection-blog",
        status: "scheduled",
        scheduledFor: "2026-03-30T12:00:00.000Z",
      },
      locales: [
        {
          locale: "en",
          slug: "launch-post",
          title: "Launch Post",
          frontmatter: {
            summary: "CMS export coverage",
          },
          isSource: true,
        },
        {
          locale: "fr",
          slug: "article-lancement",
          title: "Article lancement",
          isSource: false,
        },
      ],
      relations: [
        {
          sourceEntryId: "entry-launch",
          fieldKey: "related",
          targetEntryId: "entry-related",
          position: 0,
          meta: { strength: "primary" },
        },
      ],
      authorship: {
        author: {
          id: testUser.id,
          username: testUser.username,
          email: testUser.email,
        },
      },
    });
    const markdownEntry = await contents
      .file("export/collections/blog/launch-post-2026-03-30.md")
      ?.async("string");
    expect(markdownEntry).toContain('title: "Launch Post"');
    expect(markdownEntry).toContain('status: "scheduled"');
    expect(markdownEntry).toContain('scheduledFor: "2026-03-30T12:00:00.000Z"');
    expect(markdownEntry).toContain(
      'frontmatter: {"summary":"CMS export coverage"}',
    );
    expect(markdownEntry).toContain("Hello from the CMS body\\.");
    expect(
      JSON.parse(
        (await contents
          .file("export/content/content-state.json")
          ?.async("string")) ?? "{}",
      ),
    ).toMatchObject({
      currentRevisionId: "rev-export-1",
      revisionSeq: 7,
      lastMutationKind: "cms-entry-update",
      lastMutationTarget: "collection-blog:entry-launch",
    });
    expect(
      JSON.parse(
        (await contents.file("export/content/order.json")?.async("string")) ??
          "{}",
      ),
    ).toEqual({
      pages: ["home", "contact"],
      layouts: ["default-layout"],
      components: ["cta-banner"],
    });
    expect(
      JSON.parse(
        (await contents
          .file("export/content/page-metadata.json")
          ?.async("string")) ?? "[]",
      ),
    ).toEqual([
      {
        id: "home",
        slug: "index",
        metadata: {
          seoScore: 98,
          lastReviewedBy: "content-team",
        },
      },
    ]);
    expect(
      JSON.parse(
        (await contents
          .file("export/content/redirects.json")
          ?.async("string")) ?? "[]",
      ).map((rule: { id: string }) => rule.id),
    ).toEqual(["redirect-disabled", "redirect-enabled"]);
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain("title: 'Home'");
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain('seo: {"title":"Home SEO"}');
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain("import Layout from '../layouts/default-layout.astro';");
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain("<Layout>");
    expect(
      await contents
        .file("export/layouts/default-layout.astro")
        ?.async("string"),
    ).toContain("<slot />");
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain('slot="default"');
    expect(
      await contents.file("export/pages/index.astro")?.async("string"),
    ).toContain("Hello export");
    expect(
      await contents.file("export/pages/contact.astro")?.async("string"),
    ).toContain("title: 'Contact'");
    expect(
      await contents.file("export/pages/contact.astro")?.async("string"),
    ).toContain("Draft contact page");
    expect(
      await contents.file("export/site-settings.json")?.async("string"),
    ).toContain("Aria Test");
    expect(
      await contents.file("export/uploads/logo.txt")?.async("string"),
    ).toBe("logo");
    expect(
      contents.file("export/uploads/fonts/brand-display.woff2"),
    ).toBeDefined();
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).toContain("/uploads/fonts/brand-display.woff2");
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).not.toContain("https://cdn.example.com/fonts/brand-display.woff2");
    expect(
      await contents.file("export/styles/design-system.json")?.async("string"),
    ).toContain('"url": "/uploads/fonts/brand-display.woff2"');
    expect(
      await contents.file("export/styles/design-system.json")?.async("string"),
    ).not.toContain("https://cdn.example.com/fonts/brand-display.woff2");
    expect(
      await contents.file("export/styles/design-system.json")?.async("string"),
    ).toContain('"backgroundColor": "#2db749"');
    expect(
      await contents.file("export/styles/design-system.json")?.async("string"),
    ).toContain('"brand-blue"');
    expect(
      await contents.file("export/styles/design-system.json")?.async("string"),
    ).toContain('"surface"');
  });

  it("exports full-width slot layouts with defaultContent and slotted page bodies", async () => {
    const adapter = createStorageAdapterMock();
    const now = new Date("2026-03-19T16:00:00.000Z").toISOString();
    const fullWidthLayout: LayoutDSL = {
      id: "full-width",
      name: "Full Width",
      nodes: [],
      slots: [
        {
          name: "header",
          defaultContent: [
            {
              id: "export-header",
              type: "Text",
              props: { text: "Export Header" },
              styles: {},
              children: [],
            },
          ],
        },
        { name: "main", isDefault: true },
        {
          name: "footer",
          defaultContent: [
            {
              id: "export-footer",
              type: "Text",
              props: { text: "Export Footer" },
              styles: {},
              children: [],
            },
          ],
        },
      ],
      updatedAt: now,
    };
    const fullWidthPage: PageDSL = {
      id: "fw-home",
      slug: "fw-home",
      title: "FW Home",
      layout: "full-width",
      nodes: [
        {
          id: "fw-main",
          type: "Text",
          props: { text: "FW main body" },
          styles: {},
          children: [],
          slot: "main",
        },
      ],
      status: "published",
      updatedAt: now,
    };

    const exportAdapter: StorageAdapter = {
      ...adapter,
      getPageDSL: async (id) => {
        if (id === "fw-home") return fullWidthPage;
        return adapter.getPageDSL(id);
      },
      getPublishedPageDSL: async (id) => {
        if (id === "fw-home") return fullWidthPage;
        return adapter.getPublishedPageDSL(id);
      },
      listPagesDSL: async (): Promise<PageInventoryItem[]> => [
        ...(await adapter.listPagesDSL()),
        {
          id: "fw-home",
          slug: "fw-home",
          title: "FW Home",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          updatedAt: now,
        },
      ],
      listLayoutsDSL: async (): Promise<LayoutDSL[]> => [
        ...(await adapter.listLayoutsDSL()),
        {
          id: "full-width",
          name: "full-width",
          title: "Full Width",
          nodes: [],
          slots: [{ name: "main", isDefault: true }],
        },
      ],
      getLayoutDSL: async (id) => {
        if (id === "full-width") return fullWidthLayout;
        return adapter.getLayoutDSL(id);
      },
    };

    const archive = await generateSiteExportArchive({ adapter: exportAdapter });
    const contents = await JSZip.loadAsync(archive.bytes);

    const layoutAstro = await contents
      .file("export/layouts/full-width.astro")
      ?.async("string");
    const pageAstro = await contents
      .file("export/pages/fw-home.astro")
      ?.async("string");

    expect(layoutAstro).toContain('<slot name="header">');
    expect(layoutAstro).toContain("Export Header");
    expect(layoutAstro).toContain('<slot name="main"');
    expect(layoutAstro).toContain("Export Footer");
    expect(layoutAstro).not.toContain("FW main body");

    expect(pageAstro).toContain(
      "import Layout from '../layouts/full-width.astro'",
    );
    expect(pageAstro).toContain("<Layout>");
    expect(pageAstro).toContain('slot="main"');
    expect(pageAstro).toContain("FW main body");
    expect(pageAstro).not.toContain("Export Header");
  });

  it("prefers an in-memory design system override when building the archive", async () => {
    const adapter = createStorageAdapterMock();
    const storedDesignSystem = (await adapter.getDesignSystem())!;
    const archive = await generateSiteExportArchive({
      adapter,
      designSystemOverride: {
        ...storedDesignSystem,
        artifacts: {
          ...storedDesignSystem.artifacts,
          globalCSS: "body{background:tomato}",
          globalCSSHash: "override-hash",
        },
      },
    });

    const contents = await JSZip.loadAsync(archive.bytes);

    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).toContain("body{background:tomato}");
    expect(
      await contents.file("export/styles/global.css")?.async("string"),
    ).not.toContain("body{color:black}");
  });

  it("parses older export metadata without CMS count fields", () => {
    const parsed = SiteExportRecordSchema.parse({
      id: "44444444-4444-4444-8444-444444444444",
      filename: "aria-site-export-old.zip",
      artifactKey: "_exports/site/old/aria-site-export-old.zip",
      metadataKey: "_exports/site/old/meta.json",
      createdAt: "2026-03-27T11:00:00.000Z",
      expiresAt: "2026-03-27T12:00:00.000Z",
      createdBy: {
        id: testUser.id,
        username: testUser.username,
      },
      pageCount: 2,
      mediaCount: 1,
      sizeBytes: 1024,
      downloadPath: "/admin/exports/44444444-4444-4444-8444-444444444444",
    });

    expect(parsed.cmsCollectionCount).toBe(0);
    expect(parsed.cmsEntryCount).toBe(0);
    expect(parsed.redirectCount).toBe(0);
  });

  it("consumes every R2 cursor page when listing exports", async () => {
    const older = buildSiteExportRecord({
      id: "55555555-5555-4555-8555-555555555555",
      filename: "aria-site-export-older.zip",
      createdAt: "2026-03-26T10:00:00.000Z",
      expiresAt: "2099-03-27T12:00:00.000Z",
      createdBy: { id: testUser.id, username: testUser.username },
      pageCount: 1,
      mediaCount: 0,
      sizeBytes: 4,
    });
    const newer = buildSiteExportRecord({
      id: "66666666-6666-4666-8666-666666666666",
      filename: "aria-site-export-newer.zip",
      createdAt: "2026-03-27T10:00:00.000Z",
      expiresAt: "2099-03-27T12:00:00.000Z",
      createdBy: { id: testUser.id, username: testUser.username },
      pageCount: 2,
      mediaCount: 1,
      sizeBytes: 8,
    });
    const records = new Map([
      [older.metadataKey, older],
      [newer.metadataKey, newer],
    ]);
    const cursors: Array<string | undefined> = [];
    const r2 = {
      async get(key: string) {
        const record = records.get(key);
        if (!record) return null;
        const raw = JSON.stringify(record);
        return {
          async text() {
            return raw;
          },
          async arrayBuffer() {
            return new TextEncoder().encode(raw).buffer;
          },
        };
      },
      async put() {},
      async delete() {},
      async list(options: { prefix?: string; cursor?: string }) {
        cursors.push(options.cursor);
        return options.cursor === undefined
          ? {
              objects: [{ key: older.metadataKey }],
              truncated: true,
              cursor: "page-2",
            }
          : {
              objects: [{ key: newer.metadataKey }],
              truncated: false,
            };
      },
    };
    const locals = {
      cfBindings: { aria_r2: r2 as unknown as R2Bucket },
    } satisfies RuntimeLocals;

    const listed = await createSiteExportStore(locals).listForUser(testUser);

    expect(cursors).toEqual([undefined, "page-2"]);
    expect(listed.map((record) => record.id)).toEqual([newer.id, older.id]);
  });

  it("stores, lists, and reads temporary exports from local storage without deleting", async () => {
    localExportDir = await mkdtemp(join(tmpdir(), "aria-site-export-"));
    process.env.ARIA_EXPORTS_LOCAL_DIR = localExportDir;

    const store = createSiteExportStore();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const record = buildSiteExportRecord({
      id: "0f69615c-6921-4301-b19e-0d425f0fe027",
      filename: "aria-site-export-test.zip",
      createdAt,
      expiresAt,
      createdBy: {
        id: testUser.id,
        username: testUser.username,
      },
      pageCount: 1,
      mediaCount: 0,
      sizeBytes: 4,
    });

    await store.save(record, new Uint8Array([1, 2, 3, 4]));

    const latest = await store.getLatestForUser(testUser);
    expect(latest?.id).toBe(record.id);

    const listed = await store.listForUser(testUser);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(record.id);

    const read = await store.readForUser(record.id, testUser);
    expect(read?.record.id).toBe(record.id);
    expect(Array.from(read?.bytes ?? [])).toEqual([1, 2, 3, 4]);

    // Export should still be visible after reading (not deleted)
    const afterRead = await store.getLatestForUser(testUser);
    expect(afterRead?.id).toBe(record.id);

    const deleted = await store.deleteForUser(record.id, testUser);
    expect(deleted).toBe(true);

    const afterDelete = await store.getLatestForUser(testUser);
    expect(afterDelete).toBeNull();
  });

  it("returns multiple non-expired exports newest first", async () => {
    localExportDir = await mkdtemp(join(tmpdir(), "aria-site-export-"));
    process.env.ARIA_EXPORTS_LOCAL_DIR = localExportDir;

    const store = createSiteExportStore();
    const older = buildSiteExportRecord({
      id: "11111111-1111-4111-8111-111111111111",
      filename: "aria-site-export-older.zip",
      createdAt: "2026-03-26T10:00:00.000Z",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdBy: {
        id: testUser.id,
        username: testUser.username,
      },
      pageCount: 1,
      mediaCount: 0,
      sizeBytes: 4,
    });
    const newer = buildSiteExportRecord({
      id: "22222222-2222-4222-8222-222222222222",
      filename: "aria-site-export-newer.zip",
      createdAt: "2026-03-27T10:00:00.000Z",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdBy: {
        id: testUser.id,
        username: testUser.username,
      },
      pageCount: 2,
      mediaCount: 1,
      sizeBytes: 8,
    });

    await store.save(older, new Uint8Array([1]));
    await store.save(newer, new Uint8Array([2]));

    const listed = await store.listForUser(testUser);
    expect(listed.map((entry) => entry.id)).toEqual([newer.id, older.id]);
    expect(await store.getLatestForUser(testUser)).toMatchObject({
      id: newer.id,
    });
  });
});
