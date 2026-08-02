import { actionsSharedMocks } from "../mocks/actions-shared-state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActionsSharedAuthMockModule,
  createTestSessionUser,
  resetActionsSharedAuthMocks,
} from "../mocks/actions-shared";
import { getActionHandler } from "../helpers/actionHandler";

type CreateApplyResponseInput = Parameters<
  (typeof import("../../lib/content-sync/service/executor"))["createContentSyncApplyResponseData"]
>[0];

const mockPlannerPlan = vi.fn();
const mockExecutorApply = vi.fn();
const mockCreateDryRunJob = vi.fn();
const mockCreateApplyJob = vi.fn();
const mockCompleteApplyJob = vi.fn();
const mockInsertApplyItem = vi.fn();
const mockGetJobById = vi.fn();
const mockGetApplyJobByIdempotencyKey = vi.fn();
const mockListItemsByJobId = vi.fn();
const mockDeriveContentSyncStatus = vi.fn();
const mockGetHistoryJobsWithItems = vi.fn();
const mockGetLatestSuccessfulSyncAnchor = vi.fn();
const mockListRecentJobs = vi.fn();
const mockReconcileStaleApplyJobs = vi.fn();
const mockLocalGetContentSiteState = vi.fn();
const mockRemoteGetContentSiteState = vi.fn();

vi.mock("../../actions/_shared", () =>
  createActionsSharedAuthMockModule(actionsSharedMocks),
);

vi.mock("../../lib/content-sync/service/status", () => ({
  deriveContentSyncStatus: mockDeriveContentSyncStatus,
}));

vi.mock("../../lib/content-sync/service/default-planner", () => ({
  DefaultContentSyncPlanner: class {
    plan = mockPlannerPlan;
  },
}));

vi.mock("../../lib/content-sync/service/executor", () => ({
  ContentSyncExecutor: class {
    apply = mockExecutorApply;
  },
  createContentSyncApplyResponseData: (input: CreateApplyResponseInput) => ({
    job: input.job,
    items: input.items,
    summary: input.summary,
    localRevision: input.localState
      ? {
          scope: input.localState.scope,
          revisionId: input.localState.currentRevisionId,
          revisionSeq: input.localState.revisionSeq,
          updatedAt: input.localState.updatedAt,
          lastMutationKind: input.localState.lastMutationKind,
          lastMutationTarget: input.localState.lastMutationTarget,
        }
      : null,
    remoteRevision: input.remoteState
      ? {
          scope: input.remoteState.scope,
          revisionId: input.remoteState.currentRevisionId,
          revisionSeq: input.remoteState.revisionSeq,
          updatedAt: input.remoteState.updatedAt,
          lastMutationKind: input.remoteState.lastMutationKind,
          lastMutationTarget: input.remoteState.lastMutationTarget,
        }
      : null,
  }),
}));

vi.mock("../../lib/content-sync/service/repository", () => ({
  ContentSyncRepository: class {
    createDryRunJob = mockCreateDryRunJob;
    createApplyJob = mockCreateApplyJob;
    completeApplyJob = mockCompleteApplyJob;
    insertApplyItem = mockInsertApplyItem;
    getJobById = mockGetJobById;
    getApplyJobByIdempotencyKey = mockGetApplyJobByIdempotencyKey;
    listItemsByJobId = mockListItemsByJobId;
    getHistoryJobsWithItems = mockGetHistoryJobsWithItems;
    getLatestSuccessfulSyncAnchor = mockGetLatestSuccessfulSyncAnchor;
    listRecentJobs = mockListRecentJobs;
    reconcileStaleApplyJobs = mockReconcileStaleApplyJobs;
  },
}));

vi.mock("../../lib/storage/sqlite", () => ({
  SQLiteStorageAdapter: class {
    getContentSiteState = mockLocalGetContentSiteState;
  },
}));

vi.mock("../../lib/storage/cloudflare", () => ({
  CloudflareStorageAdapter: class {
    getContentSiteState = mockRemoteGetContentSiteState;
  },
}));

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  clearStorageAdapterCache: vi.fn(),
  getStorageAdapterAsync: vi.fn(async () => ({
    getContentSiteState: mockLocalGetContentSiteState,
  })),
}));

describe("contentSync actions", () => {
  beforeEach(() => {
    resetActionsSharedAuthMocks(actionsSharedMocks, {
      user: createTestSessionUser({
        id: "user-1",
        role: "content-editor",
      }),
    });
    mockReconcileStaleApplyJobs.mockResolvedValue(0);
  });

  it("applies a dry-run content sync job and persists apply history", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockGetApplyJobByIdempotencyKey.mockResolvedValue(null);
    mockGetJobById
      .mockResolvedValueOnce({
        id: "plan-1",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        localRevisionId: "local-rev-3",
        remoteRevisionId: "remote-rev-2",
        createdAt: "2026-03-16T12:40:00.000Z",
        summary: {
          total: 1,
          created: 0,
          updated: 1,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
      })
      .mockResolvedValueOnce({
        id: "apply-1",
        direction: "push",
        mode: "apply",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        planJobId: "plan-1",
        idempotencyKey: "8b4a3fd7-77fd-42b2-bf2d-d30ca822ae8c",
        resultLocalRevisionId: "local-rev-3",
        resultRemoteRevisionId: "remote-rev-3",
        createdAt: "2026-03-16T12:41:00.000Z",
        summary: {
          total: 1,
          created: 0,
          updated: 1,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
      });
    mockListItemsByJobId.mockResolvedValue([
      {
        id: "item-1",
        jobId: "plan-1",
        resourceType: "page",
        resourceId: "home",
        action: "update",
        localVersion: "v3",
        remoteVersion: "v2",
        localChecksum: "a".repeat(64),
        remoteChecksum: "b".repeat(64),
        resultStatus: "planned",
        createdAt: "2026-03-16T12:40:00.000Z",
      },
    ]);
    mockLocalGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "local-rev-3",
      revisionSeq: 3,
      updatedAt: "2026-03-16T12:40:00.000Z",
      lastMutationKind: "save-page",
    });
    mockRemoteGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "remote-rev-2",
      revisionSeq: 2,
      updatedAt: "2026-03-16T11:40:00.000Z",
      lastMutationKind: "save-page",
    });
    mockExecutorApply.mockResolvedValue({
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      items: [
        {
          id: "apply-item-1",
          jobId: "plan-1",
          resourceType: "page",
          resourceId: "home",
          action: "update",
          localVersion: "v3",
          remoteVersion: "v2",
          localChecksum: "a".repeat(64),
          remoteChecksum: "b".repeat(64),
          resultStatus: "applied",
          createdAt: "2026-03-16T12:41:00.000Z",
        },
      ],
      localState: {
        scope: "default",
        currentRevisionId: "local-rev-3",
        revisionSeq: 3,
        updatedAt: "2026-03-16T12:40:00.000Z",
        lastMutationKind: "save-page",
      },
      remoteState: {
        scope: "default",
        currentRevisionId: "remote-rev-3",
        revisionSeq: 3,
        updatedAt: "2026-03-16T12:41:10.000Z",
        lastMutationKind: "push",
      },
    });

    const result = await getActionHandler(contentSync.apply)(
      {
        jobId: "plan-1",
        idempotencyKey: "8b4a3fd7-77fd-42b2-bf2d-d30ca822ae8c",
      },
      {
        locals: {
          cfBindings: {
              aria_db: {},
            },
        },
      } as never,
    );

    expect(actionsSharedMocks.resolveAuthorizedMutation).toHaveBeenCalledWith(
      expect.anything(),
      "contentSync.apply",
      "save-page",
    );
    expect(mockReconcileStaleApplyJobs).toHaveBeenCalledTimes(1);
    expect(mockCreateApplyJob).toHaveBeenCalledWith(
      expect.objectContaining({ planJobId: "plan-1" }),
    );
    expect(mockExecutorApply).toHaveBeenCalled();
    expect(mockInsertApplyItem).toHaveBeenCalledWith({
      jobId: expect.any(String),
      item: expect.objectContaining({
        id: expect.any(String),
        resourceId: "home",
        resourceType: "page",
        resultStatus: "applied",
      }),
      createdAt: "2026-03-16T12:41:00.000Z",
    });
    expect(mockCompleteApplyJob).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        resultRemoteRevisionId: "remote-rev-3",
      }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        job: expect.objectContaining({
          id: "apply-1",
          mode: "apply",
          status: "completed",
        }),
        items: [
          expect.objectContaining({
            id: expect.any(String),
            jobId: expect.any(String),
            resourceId: "home",
            resourceType: "page",
            resultStatus: "applied",
          }),
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
        localRevision: expect.objectContaining({ revisionId: "local-rev-3" }),
        remoteRevision: expect.objectContaining({ revisionId: "remote-rev-3" }),
      },
    });
  });

  it("replays an existing apply job by idempotency key", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockGetApplyJobByIdempotencyKey.mockResolvedValue({
      id: "apply-2",
      direction: "push",
      mode: "apply",
      status: "completed",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      planJobId: "plan-2",
      idempotencyKey: "494a1ea1-ddf7-40c5-aaaf-e7ddcce8f341",
      createdAt: "2026-03-16T12:50:00.000Z",
      summary: {
        total: 1,
        created: 1,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
    });
    mockListItemsByJobId.mockResolvedValue([
      {
        id: "apply-item-2",
        jobId: "apply-2",
        resourceType: "page",
        resourceId: "about",
        action: "create",
        resultStatus: "applied",
        createdAt: "2026-03-16T12:50:00.000Z",
      },
    ]);
    mockLocalGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "local-rev-5",
      revisionSeq: 5,
      updatedAt: "2026-03-16T12:50:00.000Z",
      lastMutationKind: "save-page",
    });
    mockRemoteGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "remote-rev-5",
      revisionSeq: 5,
      updatedAt: "2026-03-16T12:50:00.000Z",
      lastMutationKind: "push",
    });

    const result = await getActionHandler(contentSync.apply)(
      {
        jobId: "plan-2",
        idempotencyKey: "494a1ea1-ddf7-40c5-aaaf-e7ddcce8f341",
      },
      {
        locals: {
          cfBindings: {
              aria_db: {},
            },
        },
      } as never,
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    expect(mockCreateApplyJob).not.toHaveBeenCalled();
    expect(mockExecutorApply).not.toHaveBeenCalled();
    expect(result.data.job.id).toBe("apply-2");
    expect(result.data.items[0].id).toBe("apply-item-2");
    expect(result.data.remoteRevision?.revisionId).toBe("remote-rev-5");
  });

  it("applies only the selected preview items", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockGetApplyJobByIdempotencyKey.mockResolvedValue(null);
    mockGetJobById
      .mockResolvedValueOnce({
        id: "plan-3",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "local-wins",
        localRevisionId: "local-rev-9",
        remoteRevisionId: "remote-rev-8",
        createdAt: "2026-03-16T13:00:00.000Z",
      })
      .mockResolvedValueOnce({
        id: "apply-3",
        direction: "push",
        mode: "apply",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "local-wins",
        planJobId: "plan-3",
        createdAt: "2026-03-16T13:01:00.000Z",
        summary: {
          total: 1,
          created: 0,
          updated: 1,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
      });
    mockListItemsByJobId.mockResolvedValue([
      {
        id: "item-home-update",
        jobId: "plan-3",
        resourceType: "page",
        resourceId: "home",
        action: "update",
        resultStatus: "planned",
        createdAt: "2026-03-16T13:00:00.000Z",
      },
      {
        id: "item-about-delete",
        jobId: "plan-3",
        resourceType: "page",
        resourceId: "about",
        action: "delete",
        resultStatus: "planned",
        createdAt: "2026-03-16T13:00:01.000Z",
      },
    ]);
    mockLocalGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "local-rev-9",
      revisionSeq: 9,
      updatedAt: "2026-03-16T13:00:00.000Z",
      lastMutationKind: "save-page",
    });
    mockRemoteGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "remote-rev-8",
      revisionSeq: 8,
      updatedAt: "2026-03-16T12:59:00.000Z",
      lastMutationKind: "save-page",
    });
    mockExecutorApply.mockResolvedValue({
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
      items: [
        {
          id: "apply-item-3",
          jobId: "plan-3",
          resourceType: "page",
          resourceId: "home",
          action: "update",
          resultStatus: "applied",
          createdAt: "2026-03-16T13:01:00.000Z",
        },
      ],
      localState: {
        scope: "default",
        currentRevisionId: "local-rev-9",
        revisionSeq: 9,
        updatedAt: "2026-03-16T13:00:00.000Z",
        lastMutationKind: "save-page",
      },
      remoteState: {
        scope: "default",
        currentRevisionId: "remote-rev-9",
        revisionSeq: 9,
        updatedAt: "2026-03-16T13:01:05.000Z",
        lastMutationKind: "push",
      },
    });

    await getActionHandler(contentSync.apply)(
      {
        jobId: "plan-3",
        idempotencyKey: "22222222-3333-4444-8555-666666666666",
        selectedItemKeys: ["page:home:update"],
      },
      {
        locals: {
          cfBindings: {
              aria_db: {},
            },
        },
      } as never,
    );

    expect(mockExecutorApply).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRunItems: [
          expect.objectContaining({
            id: "item-home-update",
            resourceId: "home",
            action: "update",
          }),
        ],
      }),
    );
  });

  it("marks an apply job failed when execution throws after job creation", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockGetApplyJobByIdempotencyKey.mockResolvedValue(null);
    mockGetJobById.mockResolvedValueOnce({
      id: "plan-1",
      direction: "push",
      mode: "dry-run",
      status: "completed",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-3",
      remoteRevisionId: "remote-rev-2",
      createdAt: "2026-03-16T12:40:00.000Z",
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
    });
    mockListItemsByJobId.mockResolvedValue([
      {
        id: "item-1",
        jobId: "plan-1",
        resourceType: "page",
        resourceId: "home",
        action: "update",
        resultStatus: "planned",
        createdAt: "2026-03-16T12:40:00.000Z",
      },
    ]);
    mockLocalGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "local-rev-3",
      revisionSeq: 3,
      updatedAt: "2026-03-16T12:40:00.000Z",
      lastMutationKind: "save-page",
    });
    mockRemoteGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "remote-rev-2",
      revisionSeq: 2,
      updatedAt: "2026-03-16T11:40:00.000Z",
      lastMutationKind: "save-page",
    });
    mockExecutorApply.mockRejectedValue(new Error("boom"));

    await expect(
      getActionHandler(contentSync.apply)(
        {
          jobId: "plan-1",
          idempotencyKey: "8b4a3fd7-77fd-42b2-bf2d-d30ca822ae8c",
        },
        {
          locals: {
            cfBindings: {
                aria_db: {},
              },
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to apply content sync job",
    });

    expect(mockCreateApplyJob).toHaveBeenCalledTimes(1);
    expect(mockCompleteApplyJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: expect.any(String),
        status: "failed",
        summary: {
          total: 1,
          created: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 1,
        },
      }),
    );
  });

  it("creates and returns a persisted dry-run content sync plan", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockPlannerPlan.mockResolvedValue({
      job: {
        id: "plan-1",
        direction: "push",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        localRevisionId: "local-rev-3",
        remoteRevisionId: "remote-rev-2",
        summary: {
          total: 1,
          created: 0,
          updated: 1,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
        createdBy: "user-1",
        createdAt: "2026-03-16T12:30:00.000Z",
        startedAt: "2026-03-16T12:30:00.000Z",
        finishedAt: "2026-03-16T12:30:00.000Z",
        items: [
          {
            id: "item-1",
            resourceType: "page",
            resourceId: "home",
            action: "update",
            resultStatus: "planned",
          },
        ],
      },
      plan: {
        direction: "push",
        mode: "dry-run",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        localRevision: {
          scope: "default",
          revisionId: "local-rev-3",
          revisionSeq: 3,
          updatedAt: "2026-03-16T12:30:00.000Z",
          lastMutationKind: "save-page",
        },
        remoteRevision: {
          scope: "default",
          revisionId: "remote-rev-2",
          revisionSeq: 2,
          updatedAt: "2026-03-16T11:30:00.000Z",
          lastMutationKind: "save-page",
        },
        items: [
          {
            resourceType: "page",
            resourceId: "home",
            action: "update",
            reason: "newest-wins-source-newer",
            localVersion: "v3",
            remoteVersion: "v2",
            localChecksum: "a".repeat(64),
            remoteChecksum: "b".repeat(64),
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
        generatedAt: "2026-03-16T12:30:00.000Z",
      },
    });
    mockGetJobById.mockResolvedValue({
      id: "plan-1",
      direction: "push",
      mode: "dry-run",
      status: "completed",
      sourceEndpointId: "local-sqlite",
      targetEndpointId: "cloudflare-d1",
      conflictPolicy: "newest-wins",
      localRevisionId: "local-rev-3",
      remoteRevisionId: "remote-rev-2",
      createdBy: "user-1",
      createdAt: "2026-03-16T12:30:00.000Z",
      startedAt: "2026-03-16T12:30:00.000Z",
      finishedAt: "2026-03-16T12:30:00.000Z",
      summary: {
        total: 1,
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      },
    });

    const result = await getActionHandler(contentSync.plan)(
      { direction: "push", conflictPolicy: "newest-wins" },
      {
        locals: {
          cfBindings: {
              aria_db: {},
            },
        },
      } as never,
    );

    expect(mockPlannerPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          direction: "push",
          conflictPolicy: "newest-wins",
        },
        actorId: "user-1",
      }),
    );
    expect(mockCreateDryRunJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-1" }),
    );
    expect(mockGetJobById).toHaveBeenCalledWith("plan-1");
    expect(result).toEqual({
      success: true,
      data: {
        job: {
          id: "plan-1",
          direction: "push",
          mode: "dry-run",
          status: "completed",
          sourceEndpointId: "local-sqlite",
          targetEndpointId: "cloudflare-d1",
          conflictPolicy: "newest-wins",
          localRevisionId: "local-rev-3",
          remoteRevisionId: "remote-rev-2",
          createdBy: "user-1",
          createdAt: "2026-03-16T12:30:00.000Z",
          startedAt: "2026-03-16T12:30:00.000Z",
          finishedAt: "2026-03-16T12:30:00.000Z",
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
        plan: {
          direction: "push",
          mode: "dry-run",
          sourceEndpointId: "local-sqlite",
          targetEndpointId: "cloudflare-d1",
          conflictPolicy: "newest-wins",
          localRevision: {
            scope: "default",
            revisionId: "local-rev-3",
            revisionSeq: 3,
            updatedAt: "2026-03-16T12:30:00.000Z",
            lastMutationKind: "save-page",
          },
          remoteRevision: {
            scope: "default",
            revisionId: "remote-rev-2",
            revisionSeq: 2,
            updatedAt: "2026-03-16T11:30:00.000Z",
            lastMutationKind: "save-page",
          },
          items: [
            {
              resourceType: "page",
              resourceId: "home",
              action: "update",
              reason: "newest-wins-source-newer",
              localVersion: "v3",
              remoteVersion: "v2",
              localChecksum: "a".repeat(64),
              remoteChecksum: "b".repeat(64),
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
          generatedAt: "2026-03-16T12:30:00.000Z",
        },
      },
    });
  });

  it("rejects plan requests when the remote D1 binding is unavailable", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    await expect(
      getActionHandler(contentSync.plan)(
        { direction: "push", conflictPolicy: "newest-wins" },
        {
          locals: {
            cfBindings: {},
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Remote content sync endpoint is unavailable: cloudflare-d1",
    });

    expect(mockPlannerPlan).not.toHaveBeenCalled();
    expect(mockCreateDryRunJob).not.toHaveBeenCalled();
  });

  it("returns typed content sync status using the shared status service", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockDeriveContentSyncStatus.mockResolvedValue({
      status: "ahead",
      localEndpointId: "local-sqlite",
      remoteEndpointId: "cloudflare-d1",
      localRevision: {
        scope: "default",
        revisionId: "local-rev-2",
        revisionSeq: 2,
        updatedAt: "2026-03-16T12:00:00.000Z",
        lastMutationKind: "save-page",
      },
      remoteRevision: {
        scope: "default",
        revisionId: "remote-rev-1",
        revisionSeq: 1,
        updatedAt: "2026-03-16T11:00:00.000Z",
        lastMutationKind: "save-page",
      },
      latestSuccessfulSync: null,
      latestPlanJobId: "plan-1",
      latestApplyJobId: undefined,
      evaluatedAt: "2026-03-16T12:05:00.000Z",
    });

    const result = await getActionHandler(contentSync.status)(undefined, {
      locals: {
        cfBindings: {
          aria_db: {},
        },
      },
    } as never);

    expect(actionsSharedMocks.requireOperation).toHaveBeenCalledWith(
      expect.anything(),
      "contentSync.status",
    );
    expect(mockDeriveContentSyncStatus).toHaveBeenCalled();
    expect(mockReconcileStaleApplyJobs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      data: {
        status: "ahead",
        localEndpointId: "local-sqlite",
        remoteEndpointId: "cloudflare-d1",
        localRevision: {
          scope: "default",
          revisionId: "local-rev-2",
          revisionSeq: 2,
          updatedAt: "2026-03-16T12:00:00.000Z",
          lastMutationKind: "save-page",
        },
        remoteRevision: {
          scope: "default",
          revisionId: "remote-rev-1",
          revisionSeq: 1,
          updatedAt: "2026-03-16T11:00:00.000Z",
          lastMutationKind: "save-page",
        },
        latestSuccessfulSync: null,
        latestPlanJobId: "plan-1",
        latestApplyJobId: undefined,
        evaluatedAt: "2026-03-16T12:05:00.000Z",
      },
    });
  });

  it("returns unknown status when no remote D1 binding is available", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockLocalGetContentSiteState.mockResolvedValue({
      scope: "default",
      currentRevisionId: "local-only-rev",
      revisionSeq: 3,
      updatedAt: "2026-03-16T12:10:00.000Z",
      lastMutationKind: "save-styles",
      lastMutationTarget: "default",
    });
    mockGetLatestSuccessfulSyncAnchor.mockResolvedValue(null);
    mockListRecentJobs.mockResolvedValue([
      {
        id: "plan-2",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        createdAt: "2026-03-16T12:08:00.000Z",
        summary: {
          total: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
      },
    ]);

    const result = await getActionHandler(contentSync.status)(undefined, {
      locals: {
        cfBindings: {},
      },
    } as never);

    expect(mockDeriveContentSyncStatus).not.toHaveBeenCalled();
    expect(mockReconcileStaleApplyJobs).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.data.status).toBe("unknown");
    expect(result.data.remoteRevision).toBeNull();
    expect(result.data.localRevision?.revisionId).toBe("local-only-rev");
    expect(result.data.latestPlanJobId).toBe("plan-2");
  });

  it("rejects status when auth is unavailable", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    actionsSharedMocks.requireOperation.mockRejectedValueOnce({
      code: "UNAUTHORIZED",
      message: "Session expired or invalid",
    });

    await expect(
      (contentSync.status as unknown as { handler: (...args: unknown[]) => unknown }).handler(
        {},
        {
          locals: {
            cfBindings: {},
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Session expired or invalid",
    });

    expect(mockDeriveContentSyncStatus).not.toHaveBeenCalled();
  });

  it("returns typed content sync history", async () => {
    const { contentSync } = await import("../../actions/content-sync");

    mockGetHistoryJobsWithItems.mockResolvedValue([
      {
        id: "apply-1",
        direction: "push",
        mode: "apply",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        createdAt: "2026-03-16T12:15:00.000Z",
        startedAt: "2026-03-16T12:15:00.000Z",
        finishedAt: "2026-03-16T12:16:00.000Z",
        summary: {
          total: 1,
          created: 0,
          updated: 1,
          deleted: 0,
          skipped: 0,
          conflicted: 0,
          failed: 0,
        },
        items: [
          {
            id: "item-1",
            jobId: "apply-1",
            resourceType: "page",
            resourceId: "home",
            action: "update",
            resultStatus: "applied",
            createdAt: "2026-03-16T12:15:30.000Z",
          },
        ],
      },
    ]);

    const result = await getActionHandler(contentSync.history)(
      { mode: "apply", limit: 5 },
      { locals: { cfBindings: {} } } as never,
    );

    expect(mockGetHistoryJobsWithItems).toHaveBeenCalledWith({
      mode: "apply",
      limit: 5,
    });
    expect(mockReconcileStaleApplyJobs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      mode: "apply",
      jobs: [
        {
          id: "apply-1",
          direction: "push",
          mode: "apply",
          status: "completed",
          sourceEndpointId: "local-sqlite",
          targetEndpointId: "cloudflare-d1",
          conflictPolicy: "newest-wins",
          createdAt: "2026-03-16T12:15:00.000Z",
          startedAt: "2026-03-16T12:15:00.000Z",
          finishedAt: "2026-03-16T12:16:00.000Z",
          summary: {
            total: 1,
            created: 0,
            updated: 1,
            deleted: 0,
            skipped: 0,
            conflicted: 0,
            failed: 0,
          },
          items: [
            {
              id: "item-1",
              jobId: "apply-1",
              resourceType: "page",
              resourceId: "home",
              action: "update",
              resultStatus: "applied",
              createdAt: "2026-03-16T12:15:30.000Z",
            },
          ],
        },
      ],
    });
  });
});
