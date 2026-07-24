import { beforeEach, describe, expect, it, vi } from "vitest";

const actionsMock = vi.hoisted(() => ({
  collectionsList: vi.fn(),
  collectionsGet: vi.fn(),
  entriesList: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    cms: {
      collections: {
        list: actionsMock.collectionsList,
        get: actionsMock.collectionsGet,
      },
      entries: {
        list: actionsMock.entriesList,
      },
    },
  },
}));

function collection(id = "collection-posts", name = "posts") {
  return {
    id,
    name,
    label: "Posts",
    kind: "content",
    schema: {
      id,
      label: "Posts",
      kind: "content",
      fields: [],
      version: 1,
    },
    scope: "global",
    urlPattern: null,
    templatePageId: null,
    listPageId: null,
    supports: [],
    createdAt: "2026-06-29T00:00:00.000Z",
    updatedAt: "2026-06-29T00:00:00.000Z",
  };
}

function entryRecord(collectionId = "collection-posts", id = "entry-1") {
  return {
    entry: {
      id,
      collectionId,
      status: "draft",
      version: "version-1",
      authorId: "admin",
      createdAt: "2026-06-29T00:00:00.000Z",
      updatedAt: "2026-06-29T00:00:00.000Z",
      publishedAt: null,
      scheduledFor: null,
    },
    locales: [
      {
        entryId: id,
        collectionId,
        locale: "en",
        slug: "hello",
        title: "Hello",
        frontmatter: {},
        body: null,
        isSource: true,
      },
    ],
  };
}

describe("useCmsDataCache", () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    const { clearCmsDataCache } = await import(
      "../../../admin/features/CMS/composables/useCmsDataCache"
    );
    clearCmsDataCache();
  });

  it("dedupes concurrent collection list requests and returns cached data", async () => {
    const response = {
      data: { collections: [collection()], entryCounts: { "collection-posts": 1 } },
      error: undefined,
    };
    actionsMock.collectionsList.mockResolvedValue(response);
    const { fetchCollections, getCachedCollections } = await import(
      "../../../admin/features/CMS/composables/useCmsDataCache"
    );

    const [first, second] = await Promise.all([
      fetchCollections(),
      fetchCollections(),
    ]);

    expect(actionsMock.collectionsList).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(getCachedCollections()?.collections[0]?.name).toBe("posts");

    await fetchCollections();
    expect(actionsMock.collectionsList).toHaveBeenCalledTimes(1);
  });

  it("invalidates entry list cache by collection id", async () => {
    actionsMock.entriesList.mockResolvedValue({
      data: {
        items: [entryRecord()],
        total: 1,
        page: 1,
        limit: 50,
      },
      error: undefined,
    });
    const { fetchEntryList, getCachedEntryList, invalidateEntryListCache } =
      await import("../../../admin/features/CMS/composables/useCmsDataCache");
    const payload = {
      collectionId: "collection-posts",
      page: 1,
      limit: 50,
      sort: [{ field: "updatedAt" as const, direction: "desc" as const }],
    };

    await fetchEntryList(payload);
    expect(getCachedEntryList(payload)?.total).toBe(1);

    invalidateEntryListCache("collection-posts");
    expect(getCachedEntryList(payload)).toBeNull();
  });

  it("invalidates entry mutation caches without clearing collection detail cache", async () => {
    actionsMock.collectionsList.mockResolvedValue({
      data: { collections: [collection()], entryCounts: { "collection-posts": 1 } },
      error: undefined,
    });
    actionsMock.collectionsGet.mockResolvedValue({
      data: collection(),
      error: undefined,
    });
    actionsMock.entriesList.mockResolvedValue({
      data: {
        items: [entryRecord()],
        total: 1,
        page: 1,
        limit: 50,
      },
      error: undefined,
    });
    const {
      fetchCollection,
      fetchCollections,
      fetchEntryList,
      getCachedCollection,
      getCachedCollections,
      getCachedEntryList,
      invalidateEntryMutationCaches,
    } = await import("../../../admin/features/CMS/composables/useCmsDataCache");
    const payload = {
      collectionId: "collection-posts",
      page: 1,
      limit: 50,
      sort: [{ field: "updatedAt" as const, direction: "desc" as const }],
    };

    await fetchCollections();
    await fetchCollection("collection-posts");
    await fetchEntryList(payload);

    expect(getCachedCollections()).not.toBeNull();
    expect(getCachedCollection("collection-posts")).not.toBeNull();
    expect(getCachedEntryList(payload)).not.toBeNull();

    invalidateEntryMutationCaches("collection-posts");

    expect(getCachedCollections()).toBeNull();
    expect(getCachedEntryList(payload)).toBeNull();
    expect(getCachedCollection("collection-posts")).not.toBeNull();
  });

  it("skips prewarming when an entry list is already fresh", async () => {
    actionsMock.entriesList.mockResolvedValue({
      data: {
        items: [entryRecord()],
        total: 1,
        page: 1,
        limit: 50,
      },
      error: undefined,
    });
    const { fetchEntryList, prewarmEntryList } = await import(
      "../../../admin/features/CMS/composables/useCmsDataCache"
    );
    const payload = {
      collectionId: "collection-posts",
      page: 1,
      limit: 50,
      sort: [{ field: "updatedAt" as const, direction: "desc" as const }],
    };

    await fetchEntryList(payload);
    prewarmEntryList(payload);
    await Promise.resolve();

    expect(actionsMock.entriesList).toHaveBeenCalledTimes(1);
  });
});
