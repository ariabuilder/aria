import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import type { useContentSync } from "../../admin/features/Studio/history/composables/useContentSync";

const { statusMock, historyMock, planMock, applyMock, loggerMock } = vi.hoisted(
  () => ({
    statusMock: vi.fn(),
    historyMock: vi.fn(),
    planMock: vi.fn(),
    applyMock: vi.fn(),
    loggerMock: vi.fn(),
  }),
);

vi.mock("astro:actions", () => ({
  actions: {
    contentSync: {
      status: (...args: unknown[]) => statusMock(...args),
      history: (...args: unknown[]) => historyMock(...args),
      plan: (...args: unknown[]) => planMock(...args),
      apply: (...args: unknown[]) => applyMock(...args),
    },
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

type UseContentSyncReturn = ReturnType<typeof useContentSync>;

function createStatusResponse() {
  return {
    data: {
      success: true,
      data: {
        status: "in-sync",
        localEndpointId: "local-sqlite",
        remoteEndpointId: "cloudflare-d1",
        localRevision: null,
        remoteRevision: null,
        latestSuccessfulSync: null,
        evaluatedAt: "2026-03-27T10:00:00.000Z",
      },
    },
    error: null,
  };
}

function createPlanResponse() {
  return {
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
          items: [
            {
              resourceType: "page",
              resourceId: "home",
              action: "update",
              reason: "Remote changed",
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
          generatedAt: "2026-03-27T10:00:00.000Z",
        },
      },
    },
    error: null,
  };
}

describe("useContentSync", () => {
  let wrapper: ReturnType<typeof mount> | null = null;
  let contentSync: UseContentSyncReturn;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    statusMock.mockResolvedValue(createStatusResponse());
    historyMock.mockResolvedValue({
      data: {
        success: true,
        mode: "apply",
        jobs: [],
      },
      error: null,
    });
    planMock.mockResolvedValue(createPlanResponse());
    applyMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          job: {
            id: "apply-1",
            direction: "push",
            mode: "apply",
            status: "completed",
            sourceEndpointId: "local-sqlite",
            targetEndpointId: "cloudflare-d1",
            conflictPolicy: "newest-wins",
            createdAt: "2026-03-27T10:05:00.000Z",
          },
          items: [],
          summary: {
            total: 1,
            created: 0,
            updated: 1,
            deleted: 0,
            skipped: 0,
            conflicted: 0,
            failed: 0,
          },
          localRevision: null,
          remoteRevision: null,
        },
      },
      error: null,
    });
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000",
    );
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });

  async function mountComposable() {
    const module =
      await import("../../admin/features/Studio/history/composables/useContentSync");

    const TestComponent = defineComponent({
      setup() {
        contentSync = module.useContentSync();
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await flushPromises();
  }

  it("keeps history empty when the history response is malformed", async () => {
    historyMock.mockResolvedValueOnce({
      data: {
        success: true,
        mode: "apply",
        jobs: [{ id: 42 }],
      },
      error: null,
    });

    await mountComposable();

    expect(contentSync.history.value).toEqual([]);
    expect(contentSync.lastSyncLabel.value).toBe("Last Sync: Never");
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[ContentSync] Invalid history response",
      expect.objectContaining({
        source: "useContentSync.loadHistory",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed sync plans before mutating sync state", async () => {
    await mountComposable();

    planMock.mockResolvedValueOnce({
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
              total: 1,
              created: "bad",
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
    });

    await expect(contentSync.runPlan()).resolves.toBe(false);

    expect(contentSync.plan.value).toBeNull();
    expect(contentSync.planJobId.value).toBeNull();
    expect(contentSync.error.value).toBe(
      "Received invalid content sync plan response.",
    );
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[ContentSync] Invalid plan response",
      expect.objectContaining({
        source: "useContentSync.runPlan",
        issues: expect.any(Array),
      }),
    );
  });

  it("does not refresh history when the apply response is malformed", async () => {
    await mountComposable();

    applyMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          job: {
            id: "apply-1",
            direction: "push",
            mode: "apply",
            status: "completed",
            sourceEndpointId: "local-sqlite",
            targetEndpointId: "cloudflare-d1",
            conflictPolicy: "newest-wins",
            createdAt: "2026-03-27T10:05:00.000Z",
          },
          items: [],
          summary: {
            total: 1,
            created: 0,
            updated: "bad",
            deleted: 0,
            skipped: 0,
            conflicted: 0,
            failed: 0,
          },
          localRevision: null,
          remoteRevision: null,
        },
      },
      error: null,
    });

    await expect(contentSync.runPlan()).resolves.toBe(true);
    await expect(contentSync.applyPlan()).resolves.toBe(false);

    expect(applyMock).toHaveBeenCalledWith({
      jobId: "job-1",
      idempotencyKey: expect.any(String),
      selectedItemKeys: ["page:home:update"],
    });
    expect(contentSync.error.value).toBe(
      "Received invalid content sync apply response.",
    );
    expect(contentSync.plan.value).not.toBeNull();
    expect(historyMock).toHaveBeenCalledTimes(1);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[ContentSync] Invalid apply response",
      expect.objectContaining({
        source: "useContentSync.applyPlan",
        jobId: "job-1",
        issues: expect.any(Array),
      }),
    );
  });
});
