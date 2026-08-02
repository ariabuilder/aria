import { ActionError, defineAction } from "astro:actions";
import { requireOperation, resolveAuthorizedMutation } from "./_shared";
import { log as baseLog } from "../lib/utils/logger";
import {
  ContentSyncApplyInputSchema,
  ContentSyncApplyResponseSchema,
  ContentSyncPlanInputSchema,
  ContentSyncPlanResponseSchema,
  ContentSyncHistoryInputSchema,
  ContentSyncHistoryResponseSchema,
  ContentSyncStatusDataSchema,
  ContentSyncStatusInputSchema,
  ContentSyncStatusResponseSchema,
  createEmptyContentSyncSummary,
  toContentSyncRevisionSnapshot,
} from "../lib/content-sync/schema";
import { ContentSyncRepository } from "../lib/content-sync/service/repository";
import { DefaultContentSyncPlanner } from "../lib/content-sync/service/default-planner";
import {
  ContentSyncExecutor,
  createContentSyncApplyResponseData,
} from "../lib/content-sync/service/executor";
import { deriveContentSyncStatus } from "../lib/content-sync/service/status";
import {
  getCloudflareEnv,
  getStringRuntimeSetting,
  type AriaCloudflareEnv,
} from "../lib/cloudflare/env";
import type { StorageAdapter } from "../lib/storage/adapter";
import {
  getStorageAdapterAsync,
  type RuntimeLocals,
} from "../lib/storage/getStorageAdapter";

type ContentSyncRuntimeEnv = Pick<
  AriaCloudflareEnv,
  "aria_db" | "aria_cache" | "aria_r2" | "R2_PUBLIC_URL"
>;

type ContentSyncActionContext = {
  locals?: RuntimeLocals;
};

type ContentSyncActionErrorCode = "BAD_REQUEST" | "INTERNAL_SERVER_ERROR";

function isActionError(error: unknown): error is ActionError {
  return (
    (typeof ActionError === "function" && error instanceof ActionError) ||
    (typeof error === "object" &&
      error !== null &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { message?: unknown }).message === "string")
  );
}

function createActionError(input: {
  code: ContentSyncActionErrorCode;
  message: string;
}): Error {
  if (typeof ActionError === "function") {
    return new ActionError(input);
  }

  const error = new Error(input.message) as Error & {
    code: ContentSyncActionErrorCode;
  };
  error.code = input.code;
  return error;
}

function getRuntimeEnv(
  context: ContentSyncActionContext,
): ContentSyncRuntimeEnv | undefined {
  const cloudflareEnv = getCloudflareEnv(context.locals);

  const env: ContentSyncRuntimeEnv = {
    aria_db: cloudflareEnv.aria_db,
    aria_cache: cloudflareEnv.aria_cache,
    aria_r2: cloudflareEnv.aria_r2,
    R2_PUBLIC_URL:
      typeof cloudflareEnv.R2_PUBLIC_URL === "string"
        ? cloudflareEnv.R2_PUBLIC_URL
        : undefined,
  };

  if (
    env.aria_db ||
    env.aria_cache ||
    env.aria_r2 ||
    typeof env.R2_PUBLIC_URL === "string"
  ) {
    return env;
  }

  return undefined;
}

function getContentSyncRepository(
  context: ContentSyncActionContext,
): ContentSyncRepository {
  if (import.meta.env.DEV && process.env.VITEST !== "true") {
    return new ContentSyncRepository();
  }

  return new ContentSyncRepository(context.locals);
}

function getDryRunItemSelectionKey(input: {
  resourceType: string;
  resourceId: string;
  action: string;
}): string {
  return `${input.resourceType}:${input.resourceId}:${input.action}`;
}

async function reconcileStaleApplyJobs(
  repository: ContentSyncRepository,
  reason: string,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  const staleBefore = finishedAt;

  const recoveredCount = await repository.reconcileStaleApplyJobs({
    staleBefore,
    finishedAt,
    notes: reason,
  });

  if (recoveredCount > 0) {
    baseLog("warn", "[contentSync] Reconciled stale apply jobs", {
      recoveredCount,
      reason,
      staleBefore,
      finishedAt,
    });
  }
}

async function getLocalContentAdapter(
  context: ContentSyncActionContext,
): Promise<StorageAdapter> {
  return getStorageAdapterAsync(context.locals);
}

function shouldUseRemoteContentSyncInDev(): boolean {
  const setting = getStringRuntimeSetting("ARIA_CONTENT_SYNC_REMOTE");

  return setting === "1" || setting === "true";
}

async function getRemoteContentAdapter(
  context: ContentSyncActionContext,
): Promise<StorageAdapter | null> {
  if (import.meta.env.DEV && process.env.VITEST !== "true") {
    if (!shouldUseRemoteContentSyncInDev()) {
      return null;
    }

    const { CloudflareStorageAdapter } =
      await import("../lib/storage/cloudflare");
    const { createRemoteD1Database } = await import("../lib/storage/remote-d1");

    return new CloudflareStorageAdapter({
      aria_db: await createRemoteD1Database(),
    });
  }

  const env = getRuntimeEnv(context);

  if (!env?.aria_db) {
    return null;
  }

  const { CloudflareStorageAdapter } =
    await import("../lib/storage/cloudflare");

  const adapter = new CloudflareStorageAdapter({
    aria_db: env.aria_db,
    aria_cache: env.aria_cache,
    aria_r2: env.aria_r2,
    R2_PUBLIC_URL:
      typeof env.R2_PUBLIC_URL === "string" ? env.R2_PUBLIC_URL : undefined,
  });
  return adapter;
}

export const contentSync = {
  apply: defineAction({
    accept: "json",
    input: ContentSyncApplyInputSchema,
    handler: async (rawInput, context) => {
      const { user: actor, authorship } = await resolveAuthorizedMutation(
        context,
        "contentSync.apply",
        "save-page",
      );
      const startedAt = Date.now();
      let repository: ContentSyncRepository | null = null;
      let applyJobId: string | null = null;
      let applyJobCompleted = false;

      try {
        const input = ContentSyncApplyInputSchema.parse(rawInput);
        repository = getContentSyncRepository(context);
        await reconcileStaleApplyJobs(
          repository,
          "Recovered stale content sync apply job before starting a new apply.",
        );
        const localAdapter = await getLocalContentAdapter(context);
        const remoteAdapter = await getRemoteContentAdapter(context);

        if (!remoteAdapter) {
          throw createActionError({
            code: "BAD_REQUEST",
            message:
              "Remote content sync endpoint is unavailable: cloudflare-d1",
          });
        }

        const existingApplyJob = await repository.getApplyJobByIdempotencyKey(
          input.idempotencyKey,
        );

        if (existingApplyJob) {
          if (existingApplyJob.planJobId !== input.jobId) {
            throw createActionError({
              code: "BAD_REQUEST",
              message: "Idempotency key was already used for a different job",
            });
          }

          const existingItems = await repository.listItemsByJobId(
            existingApplyJob.id,
          );
          const [localState, remoteState] = await Promise.all([
            localAdapter.getContentSiteState(),
            remoteAdapter.getContentSiteState(),
          ]);

          return ContentSyncApplyResponseSchema.parse({
            success: true,
            data: createContentSyncApplyResponseData({
              job: existingApplyJob,
              items: existingItems,
              summary: existingApplyJob.summary ?? {
                total: existingItems.length,
                created: 0,
                updated: 0,
                deleted: 0,
                skipped: 0,
                conflicted: 0,
                failed: 0,
              },
              localState,
              remoteState,
            }),
          });
        }

        const dryRunJob = await repository.getJobById(input.jobId);
        if (!dryRunJob) {
          throw createActionError({
            code: "BAD_REQUEST",
            message: "Dry-run job not found",
          });
        }

        if (dryRunJob.mode !== "dry-run") {
          throw createActionError({
            code: "BAD_REQUEST",
            message: "Apply requires a dry-run job",
          });
        }

        if (dryRunJob.status !== "completed") {
          throw createActionError({
            code: "BAD_REQUEST",
            message: "Dry-run job must be completed before apply",
          });
        }

        const [currentLocalState, currentRemoteState, dryRunItems] =
          await Promise.all([
            localAdapter.getContentSiteState(),
            remoteAdapter.getContentSiteState(),
            repository.listItemsByJobId(dryRunJob.id),
          ]);

        if (
          currentLocalState?.currentRevisionId !== dryRunJob.localRevisionId ||
          currentRemoteState?.currentRevisionId !== dryRunJob.remoteRevisionId
        ) {
          throw createActionError({
            code: "BAD_REQUEST",
            message: "Dry-run plan is stale and must be regenerated",
          });
        }

        const executableDryRunItems = dryRunItems.filter(
          (item) =>
            item.action === "create" ||
            item.action === "update" ||
            item.action === "delete",
        );

        const selectedDryRunItems = input.selectedItemKeys?.length
          ? (() => {
              const executableById = new Map(
                executableDryRunItems.map(
                  (item) => [getDryRunItemSelectionKey(item), item] as const,
                ),
              );

              const selectedItems = input.selectedItemKeys.map((itemKey) => {
                const selectedItem = executableById.get(itemKey);

                if (!selectedItem) {
                  throw createActionError({
                    code: "BAD_REQUEST",
                    message:
                      "Selected changes are invalid or no longer applyable",
                  });
                }

                return selectedItem;
              });

              return selectedItems;
            })()
          : executableDryRunItems;

        if (selectedDryRunItems.length === 0) {
          throw createActionError({
            code: "BAD_REQUEST",
            message: "Select at least one change before applying",
          });
        }

        applyJobId = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        await repository.createApplyJob({
          id: applyJobId,
          planJobId: dryRunJob.id,
          direction: dryRunJob.direction,
          sourceEndpointId: dryRunJob.sourceEndpointId,
          targetEndpointId: dryRunJob.targetEndpointId,
          conflictPolicy: dryRunJob.conflictPolicy,
          localRevisionId: dryRunJob.localRevisionId,
          remoteRevisionId: dryRunJob.remoteRevisionId,
          createdBy: actor.id,
          createdAt,
          idempotencyKey: input.idempotencyKey,
        });

        const executor = new ContentSyncExecutor();
        const applied = await executor.apply({
          dryRunJob,
          dryRunItems: selectedDryRunItems,
          localAdapter,
          remoteAdapter,
          actorId: actor.id,
          authorship,
        });

        const persistedJobId = applyJobId;
        if (!persistedJobId) {
          throw createActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to persist content sync apply job id",
          });
        }

        const persistedApplyItems = applied.items.map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          jobId: persistedJobId,
        }));

        for (const item of persistedApplyItems) {
          await repository.insertApplyItem({
            jobId: applyJobId,
            item: {
              id: item.id,
              resourceType: item.resourceType,
              resourceId: item.resourceId,
              resourceLabel: item.resourceLabel,
              action: item.action,
              localVersion: item.localVersion,
              remoteVersion: item.remoteVersion,
              localChecksum: item.localChecksum,
              remoteChecksum: item.remoteChecksum,
              resultStatus: item.resultStatus,
              conflictReason: item.conflictReason,
              errorMessage: item.errorMessage,
            },
            createdAt: item.createdAt,
          });
        }

        const status = applied.summary.failed > 0 ? "failed" : "completed";

        await repository.completeApplyJob({
          jobId: applyJobId,
          status,
          summary: applied.summary,
          finishedAt: new Date().toISOString(),
          resultLocalRevisionId: applied.localState?.currentRevisionId,
          resultRemoteRevisionId: applied.remoteState?.currentRevisionId,
        });
        applyJobCompleted = true;

        const job = await repository.getJobById(applyJobId);
        if (!job) {
          throw createActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to load persisted content sync apply job",
          });
        }

        const response = ContentSyncApplyResponseSchema.parse({
          success: true,
          data: createContentSyncApplyResponseData({
            job,
            items: persistedApplyItems,
            summary: applied.summary,
            localState: applied.localState,
            remoteState: applied.remoteState,
          }),
        });

        baseLog("info", "[contentSync.apply] Completed", {
          actorId: actor.id,
          applyJobId,
          planJobId: dryRunJob.id,
          direction: dryRunJob.direction,
          sourceEndpointId: dryRunJob.sourceEndpointId,
          targetEndpointId: dryRunJob.targetEndpointId,
          status,
          summary: applied.summary,
          durationMs: Date.now() - startedAt,
        });

        return response;
      } catch (error) {
        if (repository && applyJobId && !applyJobCompleted) {
          const summary = createEmptyContentSyncSummary();
          summary.total = 1;
          summary.failed = 1;

          try {
            await repository.completeApplyJob({
              jobId: applyJobId,
              status: "failed",
              summary,
              finishedAt: new Date().toISOString(),
            });
          } catch (finalizeError) {
            baseLog(
              "error",
              "[contentSync.apply] Failed to finalize errored job",
              {
                applyJobId,
                error:
                  finalizeError instanceof Error
                    ? finalizeError.message
                    : String(finalizeError),
              },
            );
          }
        }

        if (isActionError(error)) throw error;

        baseLog("error", "[contentSync.apply] Error", {
          error: error instanceof Error ? error.message : String(error),
        });

        throw createActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to apply content sync job",
        });
      }
    },
  }),

  plan: defineAction({
    accept: "json",
    input: ContentSyncPlanInputSchema,
    handler: async (rawInput, context) => {
      const actor = await requireOperation(context, "contentSync.plan");
      const startedAt = Date.now();

      try {
        const input = ContentSyncPlanInputSchema.parse(rawInput);
        const repository = getContentSyncRepository(context);
        const localAdapter = await getLocalContentAdapter(context);
        const remoteAdapter = await getRemoteContentAdapter(context);

        if (!remoteAdapter) {
          throw createActionError({
            code: "BAD_REQUEST",
            message:
              "Remote content sync endpoint is unavailable: cloudflare-d1",
          });
        }

        const planner = new DefaultContentSyncPlanner();
        const result = await planner.plan({
          request: input,
          localAdapter,
          remoteAdapter,
          actorId: actor.id,
        });

        await repository.createDryRunJob(result.job);
        const job = await repository.getJobById(result.job.id);

        if (!job) {
          throw createActionError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to load persisted content sync plan job",
          });
        }

        const response = ContentSyncPlanResponseSchema.parse({
          success: true,
          data: {
            job,
            plan: result.plan,
          },
        });

        baseLog("info", "[contentSync.plan] Completed", {
          actorId: actor.id,
          direction: input.direction,
          sourceEndpointId: result.plan.sourceEndpointId,
          targetEndpointId: result.plan.targetEndpointId,
          conflictPolicy: input.conflictPolicy,
          summary: result.plan.summary,
          durationMs: Date.now() - startedAt,
        });

        return response;
      } catch (error) {
        if (isActionError(error)) throw error;

        baseLog("error", "[contentSync.plan] Error", {
          error: error instanceof Error ? error.message : String(error),
        });

        throw createActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate content sync plan",
        });
      }
    },
  }),

  status: defineAction({
    accept: "json",
    input: ContentSyncStatusInputSchema.optional(),
    handler: async (rawInput, context) => {
      await requireOperation(context, "contentSync.status");
      const startedAt = Date.now();

      try {
        const input = ContentSyncStatusInputSchema.parse(rawInput ?? {});
        const repository = getContentSyncRepository(context);
        await reconcileStaleApplyJobs(
          repository,
          "Recovered stale content sync apply job during status refresh.",
        );
        const localAdapter = await getLocalContentAdapter(context);
        const remoteAdapter = await getRemoteContentAdapter(context);

        if (remoteAdapter) {
          try {
            const data = await deriveContentSyncStatus({
              localAdapter,
              remoteAdapter,
              repository,
              localEndpointId: input.localEndpointId,
              remoteEndpointId: input.remoteEndpointId,
            });

            const response = ContentSyncStatusResponseSchema.parse({
              success: true,
              data,
            });

            baseLog("info", "[contentSync.status] Completed", {
              status: response.data.status,
              durationMs: Date.now() - startedAt,
            });

            return response;
          } catch (error) {
            if (isActionError(error)) {
              throw error;
            }

            baseLog(
              "warn",
              "[contentSync.status] Remote status check failed; falling back to local-only status",
              {
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }
        }

        const [localState, latestSuccessfulSync, recentJobs] =
          await Promise.all([
            localAdapter.getContentSiteState(),
            repository.getLatestSuccessfulSyncAnchor(),
            repository.listRecentJobs({ limit: 10 }),
          ]);

        const data = ContentSyncStatusDataSchema.parse({
          status: "unknown",
          localEndpointId: input.localEndpointId,
          remoteEndpointId: input.remoteEndpointId,
          localRevision: toContentSyncRevisionSnapshot(localState),
          remoteRevision: null,
          latestSuccessfulSync: latestSuccessfulSync
            ? {
                jobId: latestSuccessfulSync.jobId,
                direction: latestSuccessfulSync.direction,
                completedAt: latestSuccessfulSync.completedAt,
                localRevisionId: latestSuccessfulSync.localRevisionId,
                remoteRevisionId: latestSuccessfulSync.remoteRevisionId,
              }
            : null,
          latestPlanJobId:
            recentJobs.find((job) => job.mode === "dry-run")?.id ?? undefined,
          latestApplyJobId:
            recentJobs.find((job) => job.mode === "apply")?.id ?? undefined,
          evaluatedAt: new Date().toISOString(),
        });

        const response = ContentSyncStatusResponseSchema.parse({
          success: true,
          data,
        });

        baseLog("info", "[contentSync.status] Completed without remote", {
          status: response.data.status,
          durationMs: Date.now() - startedAt,
        });

        return response;
      } catch (error) {
        if (isActionError(error)) {
          throw error;
        }

        baseLog("error", "[contentSync.status] Error", {
          error: error instanceof Error ? error.message : String(error),
        });

        throw createActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch content sync status",
        });
      }
    },
  }),

  history: defineAction({
    accept: "json",
    input: ContentSyncHistoryInputSchema.optional(),
    handler: async (rawInput, context) => {
      await requireOperation(context, "contentSync.history");
      const startedAt = Date.now();

      try {
        const input = ContentSyncHistoryInputSchema.parse(rawInput ?? {});
        const repository = getContentSyncRepository(context);
        await reconcileStaleApplyJobs(
          repository,
          "Recovered stale content sync apply job during history refresh.",
        );
        const jobs = await repository.getHistoryJobsWithItems({
          mode: input.mode,
          limit: input.limit,
        });

        const response = ContentSyncHistoryResponseSchema.parse({
          success: true,
          mode: input.mode,
          jobs,
        });

        baseLog("info", "[contentSync.history] Completed", {
          mode: input.mode,
          limit: input.limit,
          jobsReturned: response.jobs.length,
          durationMs: Date.now() - startedAt,
        });

        return response;
      } catch (error) {
        if (isActionError(error)) throw error;

        baseLog("error", "[contentSync.history] Error", {
          error: error instanceof Error ? error.message : String(error),
        });

        throw createActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch content sync history",
        });
      }
    },
  }),
};
