import { describe, expect, it, vi } from "vitest";

import { rebuildMediaUsageBatch } from "../../lib/media/catalog/rebuildUsage";
import type { StorageAdapter } from "../../lib/storage/adapter";

function createAdapter() {
  const pages = ["page-1", "page-2", "page-3"].map((id) => ({
    id,
    slug: id,
    title: id,
    status: "draft" as const,
    isModifiedSincePublish: true,
    systemRole: "standard" as const,
    accessMode: "public" as const,
    hasPassword: false,
  }));
  const syncMediaUsage = vi.fn(async () => ({
    scanned: 1,
    inserted: 1,
    unresolved: 0,
  }));
  const adapter = {
    listPagesDSL: vi.fn(async ({ limit, offset }) =>
      pages.slice(offset, offset + limit),
    ),
    getPageDSL: vi.fn(async (id: string) => ({ id, nodes: [] })),
    getPublishedPageDSL: vi.fn(async () => null),
    syncMediaUsage,
  } as unknown as StorageAdapter;
  return { adapter, syncMediaUsage };
}

describe("rebuildMediaUsageBatch", () => {
  it("is bounded, cursor-based, and only replaces rows for visited resources", async () => {
    const { adapter, syncMediaUsage } = createAdapter();

    const first = await rebuildMediaUsageBatch(adapter, { limit: 2 });
    expect(first).toMatchObject({
      processed: 2,
      scanned: 2,
      inserted: 2,
      unresolved: 0,
      done: false,
    });
    expect(first.nextCursor).not.toBeNull();
    expect((syncMediaUsage.mock.calls as unknown as Array<[{ refId: string }]>).map(([input]) => input.refId)).toEqual([
      "page-1",
      "page-2",
    ]);

    const second = await rebuildMediaUsageBatch(adapter, {
      cursor: first.nextCursor!,
      limit: 2,
    });
    expect(second).toMatchObject({ processed: 1, done: false });
    expect((syncMediaUsage.mock.calls as unknown as Array<[{ refId: string }]>).map(([input]) => input.refId)).toEqual([
      "page-1",
      "page-2",
      "page-3",
    ]);
  });

  it("rejects malformed cursors before changing usage rows", async () => {
    const { adapter, syncMediaUsage } = createAdapter();
    await expect(
      rebuildMediaUsageBatch(adapter, { cursor: "not-json", limit: 2 }),
    ).rejects.toThrow("Invalid media usage rebuild cursor");
    expect(syncMediaUsage).not.toHaveBeenCalled();
  });
});
