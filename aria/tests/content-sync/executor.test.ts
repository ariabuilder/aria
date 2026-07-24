import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../../lib/storage/adapter";
import { ContentSyncExecutor } from "../../lib/content-sync/service/executor";
import type {
  AriaCollection,
  AriaEntryRecord,
  AriaEntryRevision,
} from "../../lib/cms/types";

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
      currentRevisionId: "rev-1",
      revisionSeq: 1,
      updatedAt: "2026-03-16T13:00:00.000Z",
      lastMutationKind: "push" as const,
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

describe("ContentSyncExecutor", () => {
  it("copies a complete localized page record after its pinned source revision", async () => {
    const record = {
      meta: {
        pageId: "about",
        locale: "fr",
        draftVersion: "fr-v2",
        publishedVersion: "fr-v1",
        currentVersion: "fr-v2",
        publishedAt: "2026-03-16T12:00:00.000Z",
        updatedAt: "2026-03-16T12:05:00.000Z",
      },
      versions: [
        { sourceVersion: "source-v1", layoutId: null, fallbackLayoutVersion: null },
        { sourceVersion: "source-v2", layoutId: null, fallbackLayoutVersion: null },
      ],
      routes: [],
    } as any;
    const savePageDSL = vi.fn(async () => "source-v2");
    const replacePageLocaleRecord = vi.fn(async () => undefined);
    const executor = new ContentSyncExecutor();

    const result = await executor.apply({
      dryRunJob: {
        id: "plan-localized-page",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "local-wins",
        createdAt: "2026-03-16T12:10:00.000Z",
      },
      dryRunItems: [
        {
          id: "item-localized-page",
          jobId: "plan-localized-page",
          resourceType: "page-locale",
          resourceId: "about|fr",
          action: "create",
          resultStatus: "planned",
          createdAt: "2026-03-16T12:10:00.000Z",
        },
      ],
      localAdapter: createStorageAdapterMock({
        listPageLocaleRecords: async () => [record],
        getPageDSL: async (_id, version) => ({
          id: "about",
          slug: "about",
          title: "About",
          nodes: [],
          version: version ?? "source-v2",
        }),
      }),
      remoteAdapter: createStorageAdapterMock({
        savePageDSL,
        replacePageLocaleRecord,
      }),
    });

    expect(savePageDSL).toHaveBeenCalledTimes(3);
    expect(replacePageLocaleRecord).toHaveBeenCalledWith(record);
    expect(result.items[0].resultStatus).toBe("applied");
  });

  it("applies update and delete items on push and stamps the target revision", async () => {
    const savePageDSL = vi.fn(async () => "v2");
    const deleteComponentDSL = vi.fn(async () => undefined);
    const touchContentRevision = vi.fn(async () => ({
      scope: "default",
      currentRevisionId: "remote-rev-2",
      revisionSeq: 2,
      updatedAt: "2026-03-16T13:01:00.000Z",
      lastMutationKind: "push" as const,
      lastMutationTarget: "cloudflare-d1",
    }));

    const localAdapter = createStorageAdapterMock({
      getPageDSL: async (id) =>
        id === "home"
          ? {
              id: "home",
              slug: "home",
              title: "Home",
              nodes: [],
              updatedAt: "2026-03-16T13:00:00.000Z",
            }
          : null,
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "local-rev-1",
        revisionSeq: 1,
        updatedAt: "2026-03-16T13:00:00.000Z",
        lastMutationKind: "save-page",
      }),
    });

    const remoteAdapter = createStorageAdapterMock({
      savePageDSL,
      deleteComponentDSL,
      touchContentRevision,
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "remote-rev-2",
        revisionSeq: 2,
        updatedAt: "2026-03-16T13:01:00.000Z",
        lastMutationKind: "push",
      }),
    });

    const executor = new ContentSyncExecutor();
    const result = await executor.apply({
      dryRunJob: {
        id: "plan-1",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        localRevisionId: "local-rev-1",
        remoteRevisionId: "remote-rev-1",
        createdAt: "2026-03-16T13:00:00.000Z",
      },
      dryRunItems: [
        {
          id: "item-1",
          jobId: "plan-1",
          resourceType: "page",
          resourceId: "home",
          action: "update",
          localVersion: "1776200000001",
          resultStatus: "planned",
          createdAt: "2026-03-16T13:00:00.000Z",
        },
        {
          id: "item-2",
          jobId: "plan-1",
          resourceType: "component",
          resourceId: "hero-banner",
          action: "delete",
          resultStatus: "planned",
          createdAt: "2026-03-16T13:00:00.000Z",
        },
      ],
      localAdapter,
      remoteAdapter,
      actorId: "user-1",
    });

    expect(savePageDSL).toHaveBeenCalledWith(
      "home",
      expect.objectContaining({ id: "home" }),
      {
        overwriteVersionIfExists: true,
        preserveVersion: true,
        skipIfContentUnchanged: true,
        versionHint: "1776200000001",
      },
      undefined,
    );
    expect(deleteComponentDSL).toHaveBeenCalledWith("hero-banner");
    expect(touchContentRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationKind: "push",
        mutationTarget: "cloudflare-d1",
        updatedBy: "user-1",
      }),
    );
    expect(result.summary).toEqual({
      total: 2,
      created: 0,
      updated: 1,
      deleted: 1,
      skipped: 0,
      conflicted: 0,
      failed: 0,
    });
    expect(result.items.map((item) => item.resultStatus)).toEqual([
      "applied",
      "applied",
    ]);
  });

  it("returns conflicted, skipped, and failed items without stamping when nothing applied", async () => {
    const touchContentRevision = vi.fn(async () => ({
      scope: "default",
      currentRevisionId: "remote-rev-2",
      revisionSeq: 2,
      updatedAt: "2026-03-16T13:05:00.000Z",
      lastMutationKind: "push" as const,
    }));

    const localAdapter = createStorageAdapterMock({
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "local-rev-2",
        revisionSeq: 2,
        updatedAt: "2026-03-16T13:05:00.000Z",
        lastMutationKind: "save-page",
      }),
    });
    const remoteAdapter = createStorageAdapterMock({
      touchContentRevision,
      getContentSiteState: async () => ({
        scope: "default",
        currentRevisionId: "remote-rev-2",
        revisionSeq: 2,
        updatedAt: "2026-03-16T13:05:00.000Z",
        lastMutationKind: "save-page",
      }),
    });

    const executor = new ContentSyncExecutor();
    const result = await executor.apply({
      dryRunJob: {
        id: "plan-2",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "manual",
        createdAt: "2026-03-16T13:05:00.000Z",
      },
      dryRunItems: [
        {
          id: "item-1",
          jobId: "plan-2",
          resourceType: "page",
          resourceId: "home",
          action: "skip",
          resultStatus: "planned",
          createdAt: "2026-03-16T13:05:00.000Z",
        },
        {
          id: "item-2",
          jobId: "plan-2",
          resourceType: "page",
          resourceId: "about",
          action: "conflict",
          resultStatus: "planned",
          createdAt: "2026-03-16T13:05:00.000Z",
        },
        {
          id: "item-3",
          jobId: "plan-2",
          resourceType: "metadata",
          resourceId: "home",
          action: "delete",
          resultStatus: "planned",
          createdAt: "2026-03-16T13:05:00.000Z",
        },
      ],
      localAdapter,
      remoteAdapter,
    });

    expect(touchContentRevision).not.toHaveBeenCalled();
    expect(result.summary).toEqual({
      total: 3,
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 1,
      conflicted: 1,
      failed: 1,
    });
    expect(result.items.map((item) => item.resultStatus)).toEqual([
      "skipped",
      "conflicted",
      "failed",
    ]);
    expect(result.items[2].errorMessage).toContain("Delete is not supported");
  });

  it("applies CMS entries with relation and locale replacement and copies missing revisions", async () => {
    const record: AriaEntryRecord = {
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
    const revision: AriaEntryRevision = {
      id: "rev-1",
      entryId: "entry-1",
      locale: null,
      version: "v2",
      snapshot: {
        entry: record.entry,
        locales: record.locales,
        relations: record.relations,
      },
      actorId: "user-1",
      createdAt: "2026-03-16T12:05:00.000Z",
    };
    const saveEntry = vi.fn(async () => record);
    const saveEntryRevision = vi.fn(async () => revision);

    const executor = new ContentSyncExecutor();
    const result = await executor.apply({
      dryRunJob: {
        id: "plan-cms",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "local-wins",
        createdAt: "2026-03-16T12:10:00.000Z",
      },
      dryRunItems: [
        {
          id: "item-cms",
          jobId: "plan-cms",
          resourceType: "cms-entry",
          resourceId: "articles/entry-1",
          action: "update",
          resultStatus: "planned",
          createdAt: "2026-03-16T12:10:00.000Z",
        },
      ],
      localAdapter: createStorageAdapterMock({
        getEntry: async () => record,
        listEntryRevisions: async () => [revision],
      }),
      remoteAdapter: createStorageAdapterMock({
        saveEntry,
        getEntryRevision: async () => null,
        saveEntryRevision,
      }),
    });

    expect(saveEntry).toHaveBeenCalledWith(record, {
      relations: record.relations,
      replaceLocales: true,
    });
    expect(saveEntryRevision).toHaveBeenCalledWith(revision);
    expect(result.summary.updated).toBe(1);
    expect(result.items[0].resultStatus).toBe("applied");
  });
});
