import { describe, expect, it, vi } from "vitest";
import type { AriaCollection } from "../../../lib/cms/schemas";
import {
  ensureCmsSearchIndex,
  getCmsSearchIndexHealth,
  rebuildCmsCollectionSearchDocuments,
  searchCanonicalCmsDocuments,
} from "../../../lib/cms/services/search";
import type { StorageAdapter } from "../../../lib/storage/adapter";

const collection: AriaCollection = {
  id: "posts",
  name: "posts",
  label: "Posts",
  kind: "content",
  schema: {
    id: "posts",
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
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

describe("CMS search maintenance", () => {
  it("calculates health from bounded adapter aggregates", async () => {
    const adapter = {
      getCmsSearchDocumentStats: vi.fn(async () => ({
        documents: 4,
        collections: 1,
        entries: 3,
        expectedDocuments: 4,
        expectedCollections: 1,
        expectedEntries: 3,
        missingDocuments: 0,
        orphanedDocuments: 0,
        staleDocuments: 0,
        countsByScope: [],
      })),
      listCollections: vi.fn(() => {
        throw new Error("health must not scan collections");
      }),
      listEntries: vi.fn(() => {
        throw new Error("health must not scan entries");
      }),
    } as unknown as StorageAdapter;

    await expect(getCmsSearchIndexHealth(adapter)).resolves.toMatchObject({
      documents: 4,
      expectedDocuments: 4,
      isHealthy: true,
    });
    expect(adapter.listCollections).not.toHaveBeenCalled();
    expect(adapter.listEntries).not.toHaveBeenCalled();
  });

  it("activates and cleans a completed collection generation", async () => {
    const adapter = {
      beginCmsSearchScopeRebuild: vi.fn(async () => true),
      listEntries: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
      })),
      writeCmsSearchScopeGeneration: vi.fn(async () => undefined),
      commitCmsSearchScopeRebuild: vi.fn(async () => true),
      abortCmsSearchScopeRebuild: vi.fn(async () => undefined),
      cleanupInactiveCmsSearchDocuments: vi.fn(async () => undefined),
    } as unknown as StorageAdapter;

    await rebuildCmsCollectionSearchDocuments(adapter, collection);

    expect(adapter.commitCmsSearchScopeRebuild).toHaveBeenCalledOnce();
    expect(adapter.cleanupInactiveCmsSearchDocuments).toHaveBeenCalledWith(
      collection.id,
    );
    expect(adapter.abortCmsSearchScopeRebuild).not.toHaveBeenCalled();
  });

  it("aborts a failed collection generation without cleaning the active one", async () => {
    const adapter = {
      beginCmsSearchScopeRebuild: vi.fn(async () => true),
      listEntries: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
      })),
      writeCmsSearchScopeGeneration: vi.fn(async () => {
        throw new Error("write failed");
      }),
      commitCmsSearchScopeRebuild: vi.fn(async () => true),
      abortCmsSearchScopeRebuild: vi.fn(async () => undefined),
      cleanupInactiveCmsSearchDocuments: vi.fn(async () => undefined),
    } as unknown as StorageAdapter;

    await expect(
      rebuildCmsCollectionSearchDocuments(adapter, collection),
    ).rejects.toThrow("write failed");
    expect(adapter.abortCmsSearchScopeRebuild).toHaveBeenCalledOnce();
    expect(adapter.cleanupInactiveCmsSearchDocuments).not.toHaveBeenCalled();
  });

  it("repairs drift automatically before CMS search uses the index", async () => {
    const adapter = {
      getCmsSearchDocumentStats: vi
        .fn()
        .mockResolvedValueOnce({
          documents: 0,
          collections: 0,
          entries: 0,
          expectedDocuments: 1,
          expectedCollections: 1,
          expectedEntries: 0,
          missingDocuments: 1,
          orphanedDocuments: 0,
          staleDocuments: 0,
          countsByScope: [],
        })
        .mockResolvedValueOnce({
          documents: 1,
          collections: 1,
          entries: 0,
          expectedDocuments: 1,
          expectedCollections: 1,
          expectedEntries: 0,
          missingDocuments: 0,
          orphanedDocuments: 0,
          staleDocuments: 0,
          countsByScope: [],
        }),
      listCollections: vi.fn(async () => [collection]),
      beginCmsSearchScopeRebuild: vi.fn(async () => true),
      listEntries: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
      })),
      writeCmsSearchScopeGeneration: vi.fn(async () => undefined),
      commitCmsSearchScopeRebuild: vi.fn(async () => true),
      abortCmsSearchScopeRebuild: vi.fn(async () => undefined),
      cleanupInactiveCmsSearchDocuments: vi.fn(async () => undefined),
    } as unknown as StorageAdapter;

    await expect(ensureCmsSearchIndex(adapter)).resolves.toEqual({
      ready: true,
      repairAttempted: true,
      failedCollectionIds: [],
    });
    expect(adapter.beginCmsSearchScopeRebuild).toHaveBeenCalledWith(
      expect.objectContaining({ collectionId: collection.id }),
    );
  });

  it("can search canonical CMS records while an index repair is deferred", async () => {
    const adapter = {
      listCollections: vi.fn(async () => [collection]),
      listEntries: vi.fn(async () => ({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
      })),
    } as unknown as StorageAdapter;

    await expect(
      searchCanonicalCmsDocuments(adapter, {
        query: "posts",
        locales: ["global"],
        limit: 20,
      }),
    ).resolves.toMatchObject([
      { entityType: "collection", entityId: collection.id, rank: 0 },
    ]);
  });
});
