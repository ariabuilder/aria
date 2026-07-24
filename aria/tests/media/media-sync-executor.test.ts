import { describe, it, expect, vi } from "vitest";
import type {
  MediaEndpoint,
  MediaListOptions,
  MediaListResult,
  MediaObjectRef,
  MediaSyncCapabilities,
  MediaSyncPlan,
} from "../../lib/media/types";
import { MediaSyncExecutor } from "../../lib/media/sync/executor";
import { computeSHA256 } from "../../lib/media/utils/checksum";
import type { MediaCatalogRepository } from "../../lib/media/catalog/repository";

class InMemoryEndpoint implements MediaEndpoint {
  readonly kind = "custom" as const;

  private readonly store = new Map<string, Buffer>();

  constructor(
    readonly id: string,
    seed?: Record<string, string>,
  ) {
    if (seed) {
      for (const [key, value] of Object.entries(seed)) {
        this.store.set(key, Buffer.from(value));
      }
    }
  }

  async capabilities(): Promise<MediaSyncCapabilities> {
    return { checksum: true };
  }

  async list(_options?: MediaListOptions): Promise<MediaListResult> {
    return {
      objects: Array.from(this.store.entries()).map(([key, data]) => ({
        key,
        sizeBytes: data.length,
        checksumSha256: computeSHA256(data),
      })),
    };
  }

  async head(key: string): Promise<MediaObjectRef | null> {
    const data = this.store.get(key);
    if (!data) return null;
    return {
      key,
      sizeBytes: data.length,
      checksumSha256: computeSHA256(data),
    };
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key) ?? null;
  }

  async put(
    key: string,
    data: Buffer,
    _meta?: { mimeType?: string },
  ): Promise<MediaObjectRef> {
    this.store.set(key, data);
    return {
      key,
      sizeBytes: data.length,
      checksumSha256: computeSHA256(data),
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

function createPlan(items: MediaSyncPlan["items"]): MediaSyncPlan {
  return {
    sourceEndpointId: "local-fs",
    targetEndpointId: "cloudflare-r2",
    direction: "push",
    conflictPolicy: "manual",
    includeDeletes: true,
    items,
    summary: {
      total: items.length,
      created: items.filter((i) => i.action === "create").length,
      updated: items.filter((i) => i.action === "update").length,
      deleted: items.filter((i) => i.action === "delete").length,
      skipped: items.filter((i) => i.action === "skip").length,
      conflicted: items.filter((i) => i.action === "conflict").length,
    },
  };
}

describe("MediaSyncExecutor", () => {
  it("applies create/update/delete and records skip/conflict", async () => {
    const source = new InMemoryEndpoint("local-fs", {
      "create.jpg": "create-me",
      "update.jpg": "update-me",
    });

    const target = new InMemoryEndpoint("cloudflare-r2", {
      "update.jpg": "old-value",
      "delete.jpg": "remove-me",
    });

    const executor = new MediaSyncExecutor();

    const plan = createPlan([
      { logicalPath: "create.jpg", action: "create", reason: "target-missing" },
      {
        logicalPath: "update.jpg",
        action: "update",
        reason: "checksum-mismatch",
      },
      { logicalPath: "delete.jpg", action: "delete", reason: "source-missing" },
      { logicalPath: "skip.jpg", action: "skip", reason: "same-checksum" },
      {
        logicalPath: "conflict.jpg",
        action: "conflict",
        reason: "manual-conflict-required",
      },
    ]);

    const result = await executor.apply({ plan, source, target });

    expect(result.summary.total).toBe(5);
    expect(result.summary.created).toBe(1);
    expect(result.summary.updated).toBe(1);
    expect(result.summary.deleted).toBe(1);
    expect(result.summary.skipped).toBe(1);
    expect(result.summary.conflicted).toBe(1);
    expect(result.summary.failed).toBe(0);

    expect(target.has("create.jpg")).toBe(true);
    expect(target.has("update.jpg")).toBe(true);
    expect(target.has("delete.jpg")).toBe(false);

    const failedItems = result.items.filter(
      (item) => item.resultStatus === "failed",
    );
    expect(failedItems).toHaveLength(0);
  });

  it("records failures when create/update source object is missing", async () => {
    const source = new InMemoryEndpoint("local-fs", {});
    const target = new InMemoryEndpoint("cloudflare-r2", {});

    const executor = new MediaSyncExecutor();

    const plan = createPlan([
      {
        logicalPath: "missing.jpg",
        action: "create",
        reason: "target-missing",
      },
    ]);

    const result = await executor.apply({ plan, source, target });

    expect(result.summary.failed).toBe(1);
    expect(result.items[0].resultStatus).toBe("failed");
    expect(result.items[0].errorMessage).toContain("Source object not found");
  });

  it("syncs catalog for create and delete actions when configured", async () => {
    const source = new InMemoryEndpoint("local-fs", {
      "create.jpg": "create-me",
    });

    const target = new InMemoryEndpoint("cloudflare-r2", {
      "delete.jpg": "remove-me",
    });

    const upsertUploadedMedia = vi.fn().mockResolvedValue(undefined);
    const markDeleted = vi.fn().mockResolvedValue({ found: true });

    const catalogRepository = {
      upsertUploadedMedia,
      markDeleted,
    } as unknown as MediaCatalogRepository;

    const authorship = {
      actor: {
        id: "sync-user-1",
        username: "sync-user",
        email: "sync@example.com",
      },
      mutationKind: "update" as const,
    };

    const executor = new MediaSyncExecutor();

    const plan = createPlan([
      { logicalPath: "create.jpg", action: "create", reason: "target-missing" },
      { logicalPath: "delete.jpg", action: "delete", reason: "source-missing" },
    ]);

    const result = await executor.apply({
      plan,
      source,
      target,
      catalog: {
        repository: catalogRepository,
        targetEndpointId: "cloudflare-r2",
        authorship,
      },
    });

    expect(result.summary.created).toBe(1);
    expect(result.summary.deleted).toBe(1);
    expect(upsertUploadedMedia).toHaveBeenCalledTimes(1);
    expect(upsertUploadedMedia).toHaveBeenCalledWith(
      expect.objectContaining({ logicalPath: "create.jpg" }),
      expect.objectContaining({
        actor: authorship.actor,
        mutationKind: "restore",
      }),
    );
    expect(markDeleted).toHaveBeenCalledTimes(1);
    expect(markDeleted).toHaveBeenCalledWith(
      expect.objectContaining({ logicalPath: "delete.jpg" }),
      expect.objectContaining({
        actor: authorship.actor,
        mutationKind: "delete",
      }),
    );
  });
});
