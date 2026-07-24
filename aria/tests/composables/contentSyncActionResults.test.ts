import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("contentSyncActionResults", () => {
  it("rejects malformed content sync plan payloads", async () => {
    const { unwrapContentSyncPlanResult } =
      await import("../../admin/features/Studio/history/composables/contentSyncActionResults");

    const result = unwrapContentSyncPlanResult(
      {
        data: {
          success: true,
          data: {
            job: {
              id: "job-1",
              direction: "push",
              mode: "dry-run",
              status: "planned",
              sourceEndpointId: "local-sqlite",
              targetEndpointId: "cloudflare-d1",
              conflictPolicy: "newest-wins",
              createdAt: "2026-03-27T10:00:00.000Z",
            },
            plan: {
              direction: "push",
              mode: "dry-run",
              sourceEndpointId: "local-sqlite",
              targetEndpointId: "cloudflare-d1",
              conflictPolicy: "newest-wins",
              localRevision: null,
              remoteRevision: null,
              items: [],
              summary: {
                total: "1",
                created: 0,
                updated: 0,
                deleted: 0,
                skipped: 0,
                conflicted: 0,
                failed: 0,
              },
              generatedAt: "2026-03-27T10:00:00.000Z",
            },
          },
        },
        error: null,
      },
      {
        source: "useContentSync.runPlan",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Received invalid content sync plan response.",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[ContentSync] Invalid plan response",
      expect.objectContaining({
        source: "useContentSync.runPlan",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded content sync apply failures", async () => {
    const { unwrapContentSyncApplyResult } =
      await import("../../admin/features/Studio/history/composables/contentSyncActionResults");

    const result = unwrapContentSyncApplyResult({
      data: {
        success: false,
        error: {
          code: "APPLY_FAILED",
          message: "Plan expired",
        },
      },
      error: null,
    });

    expect(result).toEqual({
      success: false,
      error: "Plan expired",
    });
  });
});
