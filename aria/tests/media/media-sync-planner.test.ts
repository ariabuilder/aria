import { describe, it, expect } from "vitest";
import type {
  MediaEndpoint,
  MediaListOptions,
  MediaListResult,
  MediaObjectRef,
  MediaSyncCapabilities,
} from "../../lib/media/types";
import { MediaSyncPlanner } from "../../lib/media/sync/planner";
import { computeSHA256 } from "../../lib/media/utils/checksum";

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
    return { checksum: true, etag: false };
  }

  async list(_options?: MediaListOptions): Promise<MediaListResult> {
    return {
      objects: Array.from(this.store.entries()).map(([key, data]) => ({
        key,
        sizeBytes: data.length,
        checksumSha256: computeSHA256(data),
        updatedAt: "2026-02-15T00:00:00.000Z",
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
      updatedAt: "2026-02-15T00:00:00.000Z",
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
      updatedAt: "2026-02-15T00:00:00.000Z",
    };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

describe("MediaSyncPlanner", () => {
  it("plans create, update, skip, conflict, and delete for manual policy", async () => {
    const source = new InMemoryEndpoint("local-fs", {
      "create.txt": "create-me",
      "update.txt": "source-version",
      "skip.txt": "same-version",
      "conflict.txt": "source-conflict",
    });

    const target = new InMemoryEndpoint("cloudflare-r2", {
      "update.txt": "target-version",
      "skip.txt": "same-version",
      "conflict.txt": "target-conflict",
      "delete-only.txt": "delete-me",
    });

    const planner = new MediaSyncPlanner();
    const plan = await planner.plan({
      direction: "push",
      source,
      target,
      conflictPolicy: "manual",
      includeDeletes: true,
    });

    expect(plan.summary.total).toBe(5);
    expect(plan.summary.created).toBe(1);
    expect(plan.summary.updated).toBe(0);
    expect(plan.summary.deleted).toBe(0);
    expect(plan.summary.skipped).toBe(1);
    expect(plan.summary.conflicted).toBe(3);

    const byPath = new Map(plan.items.map((item) => [item.logicalPath, item]));

    expect(byPath.get("create.txt")?.action).toBe("create");
    expect(byPath.get("update.txt")?.action).toBe("conflict");
    expect(byPath.get("skip.txt")?.action).toBe("skip");
    expect(byPath.get("conflict.txt")?.action).toBe("conflict");
    expect(byPath.get("delete-only.txt")?.action).toBe("conflict");
  });

  it("uses update for changed files when policy is local-wins", async () => {
    const source = new InMemoryEndpoint("local-fs", {
      "update.txt": "source-version",
    });

    const target = new InMemoryEndpoint("cloudflare-r2", {
      "update.txt": "target-version",
    });

    const planner = new MediaSyncPlanner();
    const plan = await planner.plan({
      direction: "push",
      source,
      target,
      conflictPolicy: "local-wins",
      includeDeletes: false,
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].action).toBe("update");
    expect(plan.items[0].reason).toContain("checksum-mismatch");
    expect(plan.summary.updated).toBe(1);
  });
});
