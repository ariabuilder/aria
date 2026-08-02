import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../lib/storage/adapter";
import { DefaultContentSyncPlanner } from "../../lib/content-sync/service/default-planner";
import type {
  AriaCollection,
  AriaEntryRecord,
  AriaEntryRevision,
} from "../../lib/cms/types";
import type {
  LayoutLocaleRecord,
  PageLocaleRecord,
} from "../../lib/localization/siteTranslationSchemas";
import { createDefaultUniversalDesignSystem } from "../../lib/styles/universalDesignSystem";

function createStorageAdapterMock(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter {
  return {
    getPageDSL: async () => null,
    getPublishedPageDSL: async () => null,
    savePageDSL: async () => "",
    publishPageDSL: async () => null,
    unpublishPageDSL: async () => undefined,
    listPagesDSL: async () => [],
    getPageVersions: async () => [],
    listPageLocaleRecords: async () => [],
    listLayoutLocaleRecords: async () => [],
    getLayoutDSL: async () => null,
    saveLayoutDSL: async () => "",
    listLayoutsDSL: async () => [],
    listLayoutVersions: async () => [],
    getComponentDSL: async () => null,
    saveComponentDSL: async () => "",
    listComponentsDSL: async () => [],
    listComponentVersions: async () => [],
    deletePageDSL: async () => undefined,
    deleteLayoutDSL: async () => undefined,
    deleteComponentDSL: async () => undefined,
    getOrder: async () => [],
    saveOrder: async () => undefined,
    getSnapshot: async () => null,
    saveSnapshot: async () => undefined,
    deleteSnapshot: async () => undefined,
    uploadMedia: async () => "",
    saveMedia: async () => "",
    getMedia: async () => null,
    listMedia: async () => [],
    deleteMedia: async () => undefined,
    getPageMetadata: async () => null,
    savePageMetadata: async () => undefined,
    getDesignSystem: async () => null,
    saveDesignSystem: async () => undefined,
    getSiteSettings: async () => null,
    saveSiteSettings: async () => undefined,
    touchResource: async () => undefined,
    getResourceTouch: async () => null,
    getContentSiteState: async () => null,
    touchContentRevision: async () => ({
      scope: "default",
      currentRevisionId: "rev",
      revisionSeq: 1,
      updatedAt: new Date().toISOString(),
      lastMutationKind: "save-page",
    }),
    getThumbnail: async () => null,
    saveThumbnail: async () => "",
    deleteThumbnail: async () => undefined,
    listCollections: async () => [],
    getCollection: async () => null,
    saveCollection: async (collection: AriaCollection) => collection,
    deleteCollection: async () => undefined,
    listEntries: async () => ({ items: [], total: 0, page: 1, limit: 50 }),
    getEntry: async () => null,
    saveEntry: async (record: AriaEntryRecord) => record,
    deleteEntry: async () => undefined,
    listEntryRevisions: async () => [],
    getEntryRevision: async () => null,
    saveEntryRevision: async (revision: AriaEntryRevision) => revision,
    ...overrides,
  } as unknown as StorageAdapter;
}

describe("DefaultContentSyncPlanner", () => {
  it("plans localized page and layout records independently of canonical resources", async () => {
    const planner = new DefaultContentSyncPlanner();
    const pageLocale: PageLocaleRecord = {
      meta: {
        pageId: "about",
        locale: "fr",
        draftVersion: "fr-v1",
        publishedVersion: "fr-v1",
        currentVersion: "fr-v1",
        publishedAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:00:00.000Z",
      },
      versions: [],
      routes: [],
    };
    const layoutLocale: LayoutLocaleRecord = {
      meta: {
        layoutId: "main",
        locale: "fr",
        draftVersion: "fr-v1",
        publishedVersion: null,
        currentVersion: "fr-v1",
        publishedAt: null,
        updatedAt: "2026-03-16T12:01:00.000Z",
      },
      versions: [],
    };

    const result = await planner.plan({
      request: {
        direction: "push",
        conflictPolicy: "local-wins",
        resourceTypes: ["page-locale", "layout-locale"],
      },
      localAdapter: createStorageAdapterMock({
        listPageLocaleRecords: async () => [pageLocale],
        listLayoutLocaleRecords: async () => [layoutLocale],
      }),
      remoteAdapter: createStorageAdapterMock(),
      createdAt: "2026-03-16T12:10:00.000Z",
    });

    expect(
      result.plan.items.map((item) => [item.resourceType, item.resourceId, item.action]),
    ).toEqual([
      ["layout-locale", "main|fr", "create"],
      ["page-locale", "about|fr", "create"],
    ]);
  });

  it("builds create, update, and delete page plan items for push", async () => {
    const planner = new DefaultContentSyncPlanner();

    const localAdapter = createStorageAdapterMock({
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "local-rev",
        revisionSeq: 2,
        updatedAt: "2026-03-16T12:00:00.000Z",
        lastMutationKind: "save-page",
      }),
      listPagesDSL: async () => [
        {
          id: "home",
          slug: "home",
          title: "Home",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          version: "v2",
          updatedAt: "2026-03-16T12:00:00.000Z",
        },
        {
          id: "contact",
          slug: "contact",
          title: "Contact",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          version: "v1",
          updatedAt: "2026-03-16T12:05:00.000Z",
        },
      ],
      getPageDSL: async (id) =>
        id === "home"
          ? {
              id: "home",
              slug: "home",
              title: "Home",
              nodes: [],
              version: "v2",
              updatedAt: "2026-03-16T12:00:00.000Z",
            }
          : id === "contact"
            ? {
                id: "contact",
                slug: "contact",
                title: "Contact",
                nodes: [],
                version: "v1",
                updatedAt: "2026-03-16T12:05:00.000Z",
              }
            : null,
    });

    const remoteAdapter = createStorageAdapterMock({
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "remote-rev",
        revisionSeq: 1,
        updatedAt: "2026-03-16T11:00:00.000Z",
        lastMutationKind: "save-page",
      }),
      listPagesDSL: async () => [
        {
          id: "home",
          slug: "home",
          title: "Home",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          version: "v1",
          updatedAt: "2026-03-16T11:00:00.000Z",
        },
        {
          id: "pricing",
          slug: "pricing",
          title: "Pricing",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          version: "v1",
          updatedAt: "2026-03-16T11:30:00.000Z",
        },
      ],
      getPageDSL: async (id) =>
        id === "home"
          ? {
              id: "home",
              slug: "home",
              title: "Home",
              nodes: [],
              version: "v1",
              updatedAt: "2026-03-16T11:00:00.000Z",
            }
          : id === "pricing"
            ? {
                id: "pricing",
                slug: "pricing",
                title: "Pricing",
                nodes: [],
                version: "v1",
                updatedAt: "2026-03-16T11:30:00.000Z",
              }
            : null,
    });

    const result = await planner.plan({
      request: {
        direction: "push",
        conflictPolicy: "local-wins",
        resourceTypes: ["page"],
      },
      localAdapter,
      remoteAdapter,
      actorId: "user-1",
      createdAt: "2026-03-16T12:10:00.000Z",
      jobIdFactory: () => "job-1",
      itemIdFactory: () => "item-id",
    });

    expect(result.plan.summary).toEqual({
      total: 3,
      created: 1,
      updated: 1,
      deleted: 1,
      skipped: 0,
      conflicted: 0,
      failed: 0,
    });
    expect(
      result.plan.items.map((item) => [item.resourceId, item.action]),
    ).toEqual([
      ["contact", "create"],
      ["home", "update"],
      ["pricing", "delete"],
    ]);
    expect(result.job.id).toBe("job-1");
    expect(result.job.localRevisionId).toBe("local-rev");
    expect(result.job.remoteRevisionId).toBe("remote-rev");
    expect(
      result.job.items.every((item) => item.resultStatus === "planned"),
    ).toBe(true);
  });

  it("marks mismatched singleton resources as conflicts for manual policy", async () => {
    const planner = new DefaultContentSyncPlanner();
    const now = "2026-03-16T12:00:00.000Z";
    const localDesignSystem = createDefaultUniversalDesignSystem();
    localDesignSystem.artifacts.globalCSSHash = "local-css";
    localDesignSystem.semanticClasses.hero = {
      id: "hero",
      name: "hero",
      variants: [],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const remoteDesignSystem = createDefaultUniversalDesignSystem();
    remoteDesignSystem.artifacts.globalCSSHash = "remote-css";
    remoteDesignSystem.semanticClasses.hero = {
      id: "hero",
      name: "hero",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "color", value: "red", important: false }],
        },
      ],
      pseudoVariants: [],
      compoundVariants: [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const localAdapter = createStorageAdapterMock({
      getDesignSystem: async () => localDesignSystem,
    });

    const remoteAdapter = createStorageAdapterMock({
      getDesignSystem: async () => remoteDesignSystem,
    });

    const result = await planner.plan({
      request: {
        direction: "push",
        conflictPolicy: "manual",
        resourceTypes: ["styles"],
      },
      localAdapter,
      remoteAdapter,
      createdAt: "2026-03-16T12:15:00.000Z",
      jobIdFactory: () => "job-2",
      itemIdFactory: () => "item-2",
    });

    expect(result.plan.items).toHaveLength(1);
    expect(result.plan.items[0]).toMatchObject({
      resourceType: "styles",
      resourceId: "default",
      action: "conflict",
      reason: "manual-conflict-required",
    });
    expect(result.plan.summary.conflicted).toBe(1);
  });

  it("collects metadata, settings, and ordering resources", async () => {
    const planner = new DefaultContentSyncPlanner();

    const localAdapter = createStorageAdapterMock({
      listPagesDSL: async () => [
        {
          id: "home",
          slug: "home",
          title: "Home",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          updatedAt: "2026-03-16T12:00:00.000Z",
        },
      ],
      getPageMetadata: async (slug) =>
        slug === "home" ? { seoTitle: "Local Home" } : null,
      getSiteSettings: async () => ({
        siteName: "Local Site",
        updated_at: Date.parse("2026-03-16T12:00:00.000Z"),
      }),
      getOrder: async (kind) => (kind === "pages" ? ["home"] : []),
    });

    const remoteAdapter = createStorageAdapterMock({
      listPagesDSL: async () => [
        {
          id: "home",
          slug: "home",
          title: "Home",
          status: "published",
          systemRole: "standard",
          accessMode: "public",
          hasPassword: false,
          isModifiedSincePublish: false,
          updatedAt: "2026-03-16T11:00:00.000Z",
        },
      ],
      getPageMetadata: async (slug) =>
        slug === "home" ? { seoTitle: "Remote Home" } : null,
      getSiteSettings: async () => ({
        siteName: "Remote Site",
        updated_at: Date.parse("2026-03-16T11:00:00.000Z"),
      }),
      getOrder: async (kind) => (kind === "pages" ? ["home", "about"] : []),
    });

    const result = await planner.plan({
      request: {
        direction: "push",
        conflictPolicy: "newest-wins",
        resourceTypes: ["metadata", "site-settings", "order"],
      },
      localAdapter,
      remoteAdapter,
      createdAt: "2026-03-16T12:20:00.000Z",
      jobIdFactory: () => "job-3",
      itemIdFactory: () => crypto.randomUUID(),
    });

    expect(result.plan.items.map((item) => item.resourceType)).toEqual([
      "metadata",
      "order",
      "order",
      "order",
      "site-settings",
    ]);
    expect(
      result.plan.items.every((item) =>
        ["update", "skip", "conflict"].includes(item.action),
      ),
    ).toBe(true);
  });

  it("rejects snapshot sync requests for runtime delivery", async () => {
    const planner = new DefaultContentSyncPlanner();

    await expect(
      planner.plan({
        request: {
          direction: "push",
          conflictPolicy: "newest-wins",
          resourceTypes: ["snapshot"],
        },
        localAdapter: createStorageAdapterMock(),
        remoteAdapter: createStorageAdapterMock(),
      }),
    ).rejects.toThrow(
      "Snapshot sync is no longer supported in the runtime delivery path",
    );
  });

  it("plans CMS collection and entry resources for push", async () => {
    const planner = new DefaultContentSyncPlanner();
    const collection: AriaCollection = {
      id: "articles",
      name: "articles",
      label: "Articles",
      kind: "content",
      schema: {
        id: "articles",
        label: "Articles",
        kind: "content",
        fields: [],
        version: 1,
      },
      scope: "global",
      urlPattern: "/articles/:slug",
      templatePageId: null,
      listPageId: null,
      supports: [],
      createdAt: "2026-03-16T12:00:00.000Z",
      updatedAt: "2026-03-16T12:00:00.000Z",
    };
    const entry: AriaEntryRecord = {
      entry: {
        id: "entry-1",
        collectionId: "articles",
        status: "published",
        version: "v2",
        authorId: "user-1",
        createdAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:05:00.000Z",
        publishedAt: "2026-03-16T12:05:00.000Z",
        scheduledFor: null,
      },
      locales: [
        {
          entryId: "entry-1",
          collectionId: "articles",
          locale: "en",
          slug: "hello",
          title: "Hello",
          frontmatter: {},
          body: null,
          isSource: true,
        },
      ],
      relations: [],
    };

    const result = await planner.plan({
      request: {
        direction: "push",
        conflictPolicy: "local-wins",
        resourceTypes: ["cms-collection", "cms-entry"],
      },
      localAdapter: createStorageAdapterMock({
        listCollections: async () => [collection],
        listEntries: async () => ({
          items: [entry],
          total: 1,
          page: 1,
          limit: 200,
        }),
        getEntry: async () => entry,
      }),
      remoteAdapter: createStorageAdapterMock(),
      createdAt: "2026-03-16T12:10:00.000Z",
      jobIdFactory: () => "job-cms",
      itemIdFactory: () => crypto.randomUUID(),
    });

    expect(
      result.plan.items.map((item) => [
        item.resourceType,
        item.resourceId,
        item.action,
      ]),
    ).toEqual([
      ["cms-collection", "articles", "create"],
      ["cms-entry", "articles/entry-1", "create"],
    ]);
  });
});
