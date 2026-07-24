import { ActionError } from "astro:actions";
import { z } from "astro/zod";
import { getCloudflareEnv, type RuntimeLocals } from "../../cloudflare/env";
import {
  ConflictPolicySchema,
  MediaPlanActionSchema,
  MediaSyncHistorySummarySchema,
  MediaSyncItemResultStatusSchema,
  MediaSyncJobStatusSchema,
  MediaSyncModeSchema,
  MediaSyncPlanSchema,
  SyncDirectionSchema,
  type MediaSyncPlan,
} from "../types";

type D1Prepared = {
  bind: (...args: unknown[]) => D1Prepared;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Prepared;
};

const SyncJobRowSchema = z.object({
  id: z.string(),
  direction: SyncDirectionSchema,
  source_endpoint_id: z.string().min(1),
  target_endpoint_id: z.string().min(1),
  mode: MediaSyncModeSchema,
  conflict_policy: ConflictPolicySchema,
  status: MediaSyncJobStatusSchema,
  summary_json: z.string().nullable().optional(),
  started_at: z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
  created_at: z.string(),
  plan_job_id: z.string().nullable().optional(),
  idempotency_key: z.string().nullable().optional(),
});

type SyncJobRow = z.infer<typeof SyncJobRowSchema>;

const SyncItemRowSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  media_id: z.string().nullable().optional(),
  logical_path: z.string(),
  action: MediaPlanActionSchema,
  reason: z.string().nullable().optional(),
  source_checksum: z.string().nullable().optional(),
  target_checksum: z.string().nullable().optional(),
  source_etag: z.string().nullable().optional(),
  target_etag: z.string().nullable().optional(),
  result_status: MediaSyncItemResultStatusSchema,
  error_message: z.string().nullable().optional(),
  created_at: z.string(),
});

type SyncItemRow = z.infer<typeof SyncItemRowSchema>;

export type PersistedSyncItem = {
  id: string;
  logicalPath: string;
  action: z.infer<typeof MediaPlanActionSchema>;
  reason: string;
  sourceChecksum?: string;
  targetChecksum?: string;
  sourceEtag?: string;
  targetEtag?: string;
  resultStatus: z.infer<typeof MediaSyncItemResultStatusSchema>;
  errorMessage?: string;
};

export type PersistedSyncJob = {
  id: string;
  direction: z.infer<typeof SyncDirectionSchema>;
  sourceEndpointId: string;
  targetEndpointId: string;
  mode: z.infer<typeof MediaSyncModeSchema>;
  conflictPolicy: z.infer<typeof ConflictPolicySchema>;
  status: z.infer<typeof MediaSyncJobStatusSchema>;
  summary?: string;
  startedAt?: string;
  finishedAt?: string;
  createdBy?: string;
  createdAt: string;
  planJobId?: string;
  idempotencyKey?: string;
};

export class MediaSyncRepository {
  private readonly db: D1DatabaseLike;

  constructor(locals?: RuntimeLocals) {
    const db = getCloudflareEnv(locals).aria_db as D1DatabaseLike | undefined;

    if (!db || typeof db.prepare !== "function") {
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "D1 database binding (aria_db) is required for media sync",
      });
    }

    this.db = db;
  }

  async createDryRunJob(input: {
    id: string;
    plan: MediaSyncPlan;
    createdBy?: string;
    createdAt: string;
  }): Promise<void> {
    const summaryJson = JSON.stringify(input.plan.summary);

    await this.db
      .prepare(
        `INSERT INTO aria_media_sync_jobs (
          id,
          direction,
          source_endpoint_id,
          target_endpoint_id,
          mode,
          conflict_policy,
          status,
          summary_json,
          started_at,
          finished_at,
          created_by,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.plan.direction,
        input.plan.sourceEndpointId,
        input.plan.targetEndpointId,
        "dry-run",
        input.plan.conflictPolicy,
        "completed",
        summaryJson,
        input.createdAt,
        input.createdAt,
        input.createdBy ?? null,
        input.createdAt,
      )
      .run();

    for (const planItem of input.plan.items) {
      await this.db
        .prepare(
          `INSERT INTO aria_media_sync_items (
            id,
            job_id,
            media_id,
            logical_path,
            action,
            reason,
            source_checksum,
            target_checksum,
            source_etag,
            target_etag,
            result_status,
            error_message,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.id,
          null,
          planItem.logicalPath,
          planItem.action,
          planItem.reason,
          planItem.sourceChecksum ?? null,
          planItem.targetChecksum ?? null,
          planItem.sourceEtag ?? null,
          planItem.targetEtag ?? null,
          "planned",
          null,
          input.createdAt,
        )
        .run();
    }
  }

  async createApplyJob(input: {
    id: string;
    planJobId: string;
    direction: z.infer<typeof SyncDirectionSchema>;
    sourceEndpointId: string;
    targetEndpointId: string;
    conflictPolicy: z.infer<typeof ConflictPolicySchema>;
    idempotencyKey: string;
    createdBy?: string;
    createdAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO aria_media_sync_jobs (
          id,
          direction,
          source_endpoint_id,
          target_endpoint_id,
          mode,
          conflict_policy,
          status,
          summary_json,
          started_at,
          finished_at,
          created_by,
          created_at,
          plan_job_id,
          idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.direction,
        input.sourceEndpointId,
        input.targetEndpointId,
        "apply",
        input.conflictPolicy,
        "running",
        null,
        input.createdAt,
        null,
        input.createdBy ?? null,
        input.createdAt,
        input.planJobId,
        input.idempotencyKey,
      )
      .run();
  }

  async completeApplyJob(input: {
    jobId: string;
    status: z.infer<typeof MediaSyncJobStatusSchema>;
    summary: Record<string, number>;
    finishedAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE aria_media_sync_jobs
         SET status = ?, summary_json = ?, finished_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        JSON.stringify(input.summary),
        input.finishedAt,
        input.jobId,
      )
      .run();
  }

  async insertApplyItem(input: {
    jobId: string;
    item: PersistedSyncItem;
    createdAt: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO aria_media_sync_items (
          id,
          job_id,
          media_id,
          logical_path,
          action,
          reason,
          source_checksum,
          target_checksum,
          source_etag,
          target_etag,
          result_status,
          error_message,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.item.id,
        input.jobId,
        null,
        input.item.logicalPath,
        input.item.action,
        input.item.reason,
        input.item.sourceChecksum ?? null,
        input.item.targetChecksum ?? null,
        input.item.sourceEtag ?? null,
        input.item.targetEtag ?? null,
        input.item.resultStatus,
        input.item.errorMessage ?? null,
        input.createdAt,
      )
      .run();
  }

  async getJobById(id: string): Promise<PersistedSyncJob | null> {
    const row = await this.db
      .prepare(
        `SELECT
           id,
           direction,
           source_endpoint_id,
           target_endpoint_id,
           mode,
           conflict_policy,
           status,
           summary_json,
           started_at,
           finished_at,
           created_by,
           created_at,
           plan_job_id,
           idempotency_key
         FROM aria_media_sync_jobs
         WHERE id = ?`,
      )
      .bind(id)
      .first<SyncJobRow>();

    if (!row) return null;

    const parsed = SyncJobRowSchema.parse(row);
    return this.mapJob(parsed);
  }

  async getApplyJobByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PersistedSyncJob | null> {
    const row = await this.db
      .prepare(
        `SELECT
           id,
           direction,
           source_endpoint_id,
           target_endpoint_id,
           mode,
           conflict_policy,
           status,
           summary_json,
           started_at,
           finished_at,
           created_by,
           created_at,
           plan_job_id,
           idempotency_key
         FROM aria_media_sync_jobs
         WHERE mode = 'apply' AND idempotency_key = ?
         LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<SyncJobRow>();

    if (!row) return null;

    const parsed = SyncJobRowSchema.parse(row);
    return this.mapJob(parsed);
  }

  async listRecentJobsByMode(input: {
    mode: z.infer<typeof MediaSyncModeSchema>;
    limit: number;
  }): Promise<PersistedSyncJob[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(input.limit)));

    const result = await this.db
      .prepare(
        `SELECT
           id,
           direction,
           source_endpoint_id,
           target_endpoint_id,
           mode,
           conflict_policy,
           status,
           summary_json,
           started_at,
           finished_at,
           created_by,
           created_at,
           plan_job_id,
           idempotency_key
         FROM aria_media_sync_jobs
         WHERE mode = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(input.mode, safeLimit)
      .all<SyncJobRow>();

    return result.results
      .map((row) => SyncJobRowSchema.parse(row))
      .map((row) => this.mapJob(row));
  }

  async listItemsByJobId(jobId: string): Promise<PersistedSyncItem[]> {
    const result = await this.db
      .prepare(
        `SELECT
           id,
           job_id,
           media_id,
           logical_path,
           action,
           reason,
           source_checksum,
           target_checksum,
           source_etag,
           target_etag,
           result_status,
           error_message,
           created_at
         FROM aria_media_sync_items
         WHERE job_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(jobId)
      .all<SyncItemRow>();

    return result.results
      .map((item) => SyncItemRowSchema.parse(item))
      .map((item) => ({
        id: item.id,
        logicalPath: item.logical_path,
        action: item.action,
        reason: item.reason ?? "",
        sourceChecksum: item.source_checksum ?? undefined,
        targetChecksum: item.target_checksum ?? undefined,
        sourceEtag: item.source_etag ?? undefined,
        targetEtag: item.target_etag ?? undefined,
        resultStatus: item.result_status,
        errorMessage: item.error_message ?? undefined,
      }));
  }

  private mapJob(row: SyncJobRow): PersistedSyncJob {
    return {
      id: row.id,
      direction: row.direction,
      sourceEndpointId: row.source_endpoint_id,
      targetEndpointId: row.target_endpoint_id,
      mode: row.mode,
      conflictPolicy: row.conflict_policy,
      status: row.status,
      summary: row.summary_json ?? undefined,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
      planJobId: row.plan_job_id ?? undefined,
      idempotencyKey: row.idempotency_key ?? undefined,
    };
  }

  static parsePlanFromItems(input: {
    job: PersistedSyncJob;
    items: PersistedSyncItem[];
  }): MediaSyncPlan {
    const parsedPlan = MediaSyncPlanSchema.parse({
      sourceEndpointId: input.job.sourceEndpointId,
      targetEndpointId: input.job.targetEndpointId,
      direction: input.job.direction,
      conflictPolicy: input.job.conflictPolicy,
      includeDeletes: input.items.some((item) => item.action === "delete"),
      items: input.items.map((item) => ({
        logicalPath: item.logicalPath,
        action: item.action,
        reason: item.reason || "planned",
        sourceChecksum: item.sourceChecksum,
        targetChecksum: item.targetChecksum,
        sourceEtag: item.sourceEtag,
        targetEtag: item.targetEtag,
      })),
      summary:
        input.job.summary && input.job.summary.length > 0
          ? JSON.parse(input.job.summary)
          : {
              total: input.items.length,
              created: input.items.filter((item) => item.action === "create")
                .length,
              updated: input.items.filter((item) => item.action === "update")
                .length,
              deleted: input.items.filter((item) => item.action === "delete")
                .length,
              skipped: input.items.filter((item) => item.action === "skip")
                .length,
              conflicted: input.items.filter(
                (item) => item.action === "conflict",
              ).length,
            },
    });

    return parsedPlan;
  }

  static parseSummary(
    summary?: string,
  ): z.infer<typeof MediaSyncHistorySummarySchema> {
    if (!summary || summary.length === 0) {
      return {
        total: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicted: 0,
        failed: 0,
      };
    }

    const parsed = JSON.parse(summary) as unknown;
    return MediaSyncHistorySummarySchema.parse(parsed);
  }
}
