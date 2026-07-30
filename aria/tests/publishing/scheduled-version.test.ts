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
        scheduleLeaseToken: "lease-1",
      }),
    ).rejects.toThrow(/version conflict/u);
    expect(publishPageDSL).not.toHaveBeenCalled();
  });

  it("passes the exact scheduled page version as a publish precondition", async () => {
    const publishPageDSL = vi.fn().mockResolvedValue("published-v2");
    const getPageDSL = vi.fn().mockResolvedValue({
      id: "page-1",
      slug: "page-1",
      version: "scheduled-v1",
      nodes: [],
    });
    const adapter = {
      getPageDSL,
      publishPageDSL,
    } as unknown as StorageAdapter;

    await expect(
      executePagePublication(adapter, {
        id: "page-1",
        version: "scheduled-v1",
        currentVersion: "scheduled-v1",
        scheduleLeaseToken: "lease-1",
      }),
    ).resolves.toBe("published-v2");
    expect(getPageDSL).toHaveBeenCalledWith("page-1", "scheduled-v1");
    expect(publishPageDSL).toHaveBeenCalledWith(
      "page-1",
      expect.any(Object),
      {
        expectedVersion: "scheduled-v1",
        scheduleLeaseToken: "lease-1",
        dependencies: { components: {} },
      },
    );
  });

  it("counts an atomically promoted scheduled page as successful", async () => {
    const scheduledRow = {
      id: "page-1",
      current_version: "scheduled-v1",
      scheduled_version: "scheduled-v1",
      scheduled_for: "2026-07-21T13:20:00.000Z",
      schedule_attempt_count: 0,
      schedule_lease_token: null,
      schedule_lease_expires_at: null,
      last_schedule_error: null,
    };
    const sql: ScheduleSqlExecutor = {
      run: vi.fn().mockResolvedValue({ changes: 1 }),
      all: vi.fn(async (statement) => {
        if (statement.includes("FROM aria_cms_entries")) return [];
        if (
          statement.includes("FROM aria_page_meta") &&
          statement.includes("schedule_lease_token = ?")
        ) {
          return [
            {
              ...scheduledRow,
              schedule_attempt_count: 1,
              schedule_lease_token: "claimed-token",
              schedule_lease_expires_at: "2026-07-21T13:25:30.000Z",
            },
          ];
        }
        if (statement.includes("FROM aria_page_meta")) return [scheduledRow];
        return [];
      }),
    };
    const publishPageDSL = vi.fn().mockResolvedValue("scheduled-v1");
    const getPageDSL = vi.fn().mockResolvedValue({
      id: "page-1",
      slug: "page-1",
      version: "scheduled-v1",
      nodes: [],
    });
    const adapter = {
      getPageDSL,
      publishPageDSL,
    } as unknown as StorageAdapter;

    const result = await reconcileScheduledPublications(adapter, sql, {
      now: "2026-07-21T13:25:00.000Z",
    });

    expect(result.pagesProcessed).toBe(1);
    expect(result.pagesSucceeded).toBe(1);
    expect(result.pagesFailed).toBe(0);
    expect(publishPageDSL).toHaveBeenCalledWith(
      "page-1",
      expect.any(Object),
      expect.objectContaining({
        expectedVersion: "scheduled-v1",
        scheduleLeaseToken: expect.any(String),
        dependencies: { components: {} },
      }),
    );
    expect(
      (sql.run as ReturnType<typeof vi.fn>).mock.calls.some(([statement]) =>
        String(statement).includes("last_schedule_error = ?"),
      ),
    ).toBe(false);
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
