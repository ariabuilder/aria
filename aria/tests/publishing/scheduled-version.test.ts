import { describe, expect, it, vi } from "vitest";

import {
  executeCmsEntryPublication,
  executePagePublication,
} from "../../lib/publishing/scheduler/execute";
import { reconcileScheduledPublications } from "../../lib/publishing/scheduler/reconcile";
import type { ScheduleSqlExecutor } from "../../lib/publishing/scheduler/schemas";
import type { RuntimeLocals } from "../../lib/cloudflare/env";
import type { StorageAdapter } from "../../lib/storage/adapter";

describe("scheduled publication version fencing", () => {
  it("accepts runtime cache locals without passing them into strict option validation", async () => {
    const sql: ScheduleSqlExecutor = {
      run: vi.fn().mockResolvedValue({ changes: 0 }),
      all: vi.fn().mockResolvedValue([]),
    };

    await expect(
      reconcileScheduledPublications({} as StorageAdapter, sql, {
        now: "2026-07-21T13:25:00.000Z",
        cacheLocals: {} as RuntimeLocals,
      }),
    ).resolves.toEqual({
      cmsProcessed: 0,
      cmsSucceeded: 0,
      cmsFailed: 0,
      pagesProcessed: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      recoveredCmsLeases: 0,
      recoveredPageLeases: 0,
    });
  });

  it("refuses to publish a page whose current version drifted", async () => {
    const publishPageDSL = vi.fn();
    const adapter = { publishPageDSL } as unknown as StorageAdapter;

    await expect(
      executePagePublication(adapter, {
        id: "page-1",
        version: "scheduled-v1",
        currentVersion: "draft-v2",
      }),
    ).rejects.toThrow(/version conflict/u);
    expect(publishPageDSL).not.toHaveBeenCalled();
  });

  it("passes the exact scheduled page version as a publish precondition", async () => {
    const publishPageDSL = vi.fn().mockResolvedValue("published-v2");
    const adapter = { publishPageDSL } as unknown as StorageAdapter;

    await expect(
      executePagePublication(adapter, {
        id: "page-1",
        version: "scheduled-v1",
        currentVersion: "scheduled-v1",
      }),
    ).resolves.toBe("published-v2");
    expect(publishPageDSL).toHaveBeenCalledWith("page-1", expect.any(Object), {
      expectedVersion: "scheduled-v1",
    });
  });

  it("refuses to publish a CMS entry whose current version drifted", async () => {
    const adapter = {} as StorageAdapter;
    await expect(
      executeCmsEntryPublication(adapter, {
        id: "entry-1",
        collectionId: "posts",
        version: "scheduled-v1",
        currentVersion: "draft-v2",
      }),
    ).rejects.toThrow(/version conflict/u);
  });
});
