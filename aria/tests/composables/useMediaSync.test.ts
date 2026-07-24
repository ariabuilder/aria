import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { historyMock, planMock, applyMock, loggerMock, refreshAssetsMock } =
  vi.hoisted(() => ({
    historyMock: vi.fn(),
    planMock: vi.fn(),
    applyMock: vi.fn(),
    loggerMock: vi.fn(),
    refreshAssetsMock: vi.fn(),
  }));

vi.mock("astro:actions", () => ({
  actions: {
    media: {
      sync: {
        history: (...args: unknown[]) => historyMock(...args),
        plan: (...args: unknown[]) => planMock(...args),
        apply: (...args: unknown[]) => applyMock(...args),
      },
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("useMediaSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshAssetsMock.mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000",
    );
  });

  it("keeps sync history empty when the history response is malformed", async () => {
    const { useMediaSync } =
      await import("../../admin/features/Studio/media/composables/useMediaSync");

    historyMock.mockResolvedValue({
      data: {
        success: true,
        mode: "apply",
        jobs: [
          {
            id: 42,
          },
        ],
      },
      error: null,
    });

    const mediaSync = useMediaSync({
      assets: ref([]),
      formatUploadedAt: (value?: string) => value ?? "Never",
      refreshAssets: refreshAssetsMock,
    });

    await mediaSync.loadSyncHistory();

    expect(mediaSync.lastSyncLabel.value).toBe("Last Sync: Never");
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid sync history response",
      expect.objectContaining({
        source: "useMediaSync.loadSyncHistory",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed sync plans before mutating sync state", async () => {
    const { useMediaSync } =
      await import("../../admin/features/Studio/media/composables/useMediaSync");

    planMock.mockResolvedValue({
      data: {
        success: true,
        mode: "dry-run",
        jobId: "job-1",
        plan: {
          sourceEndpointId: "local",
          targetEndpointId: "remote",
          direction: "push",
          conflictPolicy: "newest-wins",
          includeDeletes: false,
          items: [],
          summary: {
            total: 1,
            created: "bad",
            updated: 0,
            deleted: 0,
            skipped: 0,
            conflicted: 0,
            failed: 0,
          },
        },
      },
      error: null,
    });

    const mediaSync = useMediaSync({
      assets: ref([]),
      formatUploadedAt: (value?: string) => value ?? "Never",
      refreshAssets: refreshAssetsMock,
    });

    await expect(mediaSync.runSyncPlan()).resolves.toBe(false);

    expect(mediaSync.syncPlan.value).toBeNull();
    expect(mediaSync.syncError.value).toBe("Failed to generate sync plan");
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid sync plan response",
      expect.objectContaining({
        source: "useMediaSync.runSyncPlan",
        issues: expect.any(Array),
      }),
    );
  });

  it("does not refresh assets when the apply response is malformed", async () => {
    const { useMediaSync } =
      await import("../../admin/features/Studio/media/composables/useMediaSync");

    planMock.mockResolvedValue({
      data: {
        success: true,
        mode: "dry-run",
        jobId: "job-1",
        plan: {
          sourceEndpointId: "local",
          targetEndpointId: "remote",
          direction: "push",
          conflictPolicy: "newest-wins",
          includeDeletes: false,
          items: [
            {
              logicalPath: "uploads/hero.png",
              action: "update",
              reason: "newer local file",
              sourceSizeBytes: 12,
            },
          ],
          summary: {
            total: 1,
            created: 0,
            updated: 1,
            deleted: 0,
            skipped: 0,
            conflicted: 0,
            failed: 0,
          },
        },
      },
      error: null,
    });
    applyMock.mockResolvedValue({
      data: {
        success: true,
        idempotentReplay: false,
        applyJobId: "apply-1",
        planJobId: "job-1",
        status: "completed",
        summary: {
          total: 1,
          created: 0,
          updated: "bad",
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
      },
      error: null,
    });

    const mediaSync = useMediaSync({
      assets: ref([]),
      formatUploadedAt: (value?: string) => value ?? "Never",
      refreshAssets: refreshAssetsMock,
    });

    await mediaSync.runSyncPlan();
    await mediaSync.applySyncPlan();

    expect(applyMock).toHaveBeenCalledWith({
      jobId: "job-1",
      idempotencyKey: expect.any(String),
    });
    expect(mediaSync.syncError.value).toBe("Failed to apply sync plan");
    expect(refreshAssetsMock).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Media] Invalid sync apply response",
      expect.objectContaining({
        source: "useMediaSync.applySyncPlan",
        jobId: "job-1",
        issues: expect.any(Array),
      }),
    );
  });
});
