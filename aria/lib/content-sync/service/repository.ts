import type { Client, InArgs } from "@libsql/client";
import { z } from "astro/zod";
import { resolve } from "path";
import { getCloudflareEnv, type RuntimeLocals } from "../../cloudflare/env";
import {
  ContentSyncConflictPolicySchema,
  ContentSyncDirectionSchema,
  ContentSyncEndpointIdSchema,
  ContentSyncHistoryItemSchema,
  ContentSyncHistoryJobSchema,
  ContentSyncItemActionSchema,
  ContentSyncItemResultStatusSchema,
  ContentSyncJobSchema,
  ContentSyncJobStatusSchema,
  ContentSyncModeSchema,
  ContentSyncResourceTypeSchema,
  ContentSyncSummarySchema,
  createEmptyContentSyncSummary,
  type ContentSyncConflictPolicy,
  type ContentSyncDirection,
  type ContentSyncEndpointId,
  type ContentSyncHistoryItem,
  type ContentSyncHistoryJob,
  type ContentSyncItemAction,
  type ContentSyncItemResultStatus,
  type ContentSyncJob,
  type ContentSyncJobStatus,
  type ContentSyncMode,
  type ContentSyncResourceType,
  type ContentSyncSummary,
} from "../schema";

type SqlPrepared = {
  bind: (...args: unknown[]) => SqlPrepared;
  run: () => Promise<unknown>;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results?: T[] }>;
};

type SqlDatabaseLike = {
  prepare: (sql: string) => SqlPrepared;
};

type D1DatabaseLike = SqlDatabaseLike;

const SQLITE_CONTENT_SYNC_DB_PATH = resolve(
  process.cwd(),
  "aria/storage/aria.db",
);

const CONTENT_SYNC_STORAGE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS aria_content_sync_jobs (
    id TEXT PRIMARY KEY,
    direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
    mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'apply')),
    status TEXT NOT NULL CHECK (
      status IN ('planned', 'running', 'completed', 'failed', 'canceled')
    ),
    source_endpoint_id TEXT NOT NULL,
    target_endpoint_id TEXT NOT NULL,
    conflict_policy TEXT NOT NULL CHECK (
      conflict_policy IN ('manual', 'newest-wins', 'local-wins', 'remote-wins')
    ),
    local_revision_id TEXT,
    remote_revision_id TEXT,
    result_local_revision_id TEXT,
    result_remote_revision_id TEXT,
    summary_json TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    plan_job_id TEXT,
    idempotency_key TEXT,
    notes TEXT,
    FOREIGN KEY (plan_job_id) REFERENCES aria_content_sync_jobs(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_mode_created_at
    ON aria_content_sync_jobs(mode, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_direction_created_at
    ON aria_content_sync_jobs(direction, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_status_created_at
    ON aria_content_sync_jobs(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_plan_job_id
    ON aria_content_sync_jobs(plan_job_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_aria_content_sync_jobs_idempotency_key
    ON aria_content_sync_jobs(idempotency_key)
    WHERE idempotency_key IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS aria_content_sync_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    resource_type TEXT NOT NULL CHECK (
      resource_type IN (
        'page',
        'layout',
        'component',
        'styles',
        'site-settings',
        'cms-collection',
        'cms-entry',
        'order',
        'snapshot',
        'metadata'
      )
    ),
    resource_id TEXT NOT NULL,
    resource_label TEXT,
    action TEXT NOT NULL CHECK (
      action IN ('create', 'update', 'delete', 'skip', 'conflict')
    ),
    local_version TEXT,
    remote_version TEXT,
    local_checksum TEXT,
    remote_checksum TEXT,
    result_status TEXT NOT NULL CHECK (
      result_status IN ('planned', 'applied', 'skipped', 'conflicted', 'failed')
    ),
    conflict_reason TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (job_id) REFERENCES aria_content_sync_jobs(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_job_id_created_at
    ON aria_content_sync_items(job_id, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_resource
    ON aria_content_sync_items(resource_type, resource_id)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_action
    ON aria_content_sync_items(action)`,
  `CREATE INDEX IF NOT EXISTS idx_aria_content_sync_items_result_status
    ON aria_content_sync_items(result_status)`,
] as const;

let sqliteDatabasePromise: Promise<SqlDatabaseLike> | null = null;

function asSqlArgs(values: readonly unknown[]): InArgs {
  return values as InArgs;
}

function createLibSqlDatabase(client: Client): SqlDatabaseLike {
  return {
    prepare(sql: string): SqlPrepared {
      const createPrepared = (args: unknown[] = []): SqlPrepared => ({
        bind: (...values: unknown[]) => createPrepared(values),
        async run() {
          return client.execute({ sql, args: asSqlArgs(args) });
        },
        async first<T = unknown>() {
          const result = await client.execute({ sql, args: asSqlArgs(args) });
          return ((result.rows[0] as T | undefined) ?? null) as T | null;
        },
        async all<T = unknown>() {
          const result = await client.execute({ sql, args: asSqlArgs(args) });
          return {
            results: (result.rows as T[]) ?? [],
          };
        },
      });

      return createPrepared();
    },
  };
}

async function getSharedSQLiteDatabase(): Promise<SqlDatabaseLike> {
  if (!sqliteDatabasePromise) {
    sqliteDatabasePromise = (async () => {
      const { createClient } = await import("@libsql/client/node");

      return createLibSqlDatabase(
        createClient({
          url: `file:${SQLITE_CONTENT_SYNC_DB_PATH}`,
        }),
      );
    })();
  }

  return sqliteDatabasePromise;
}

async function resolveDatabase(
  locals?: RuntimeLocals,
  database?: SqlDatabaseLike,
): Promise<SqlDatabaseLike> {
  if (database) {
    return database;
  }

  const d1 = getCloudflareEnv(locals).aria_db as D1DatabaseLike | undefined;

  if (d1 && typeof d1.prepare === "function") {
    return d1;
  }

  return getSharedSQLiteDatabase();
}

const RawSummarySchema = z
  .object({
    total: z.int().nonnegative().optional(),
    created: z.int().nonnegative().optional(),
    updated: z.int().nonnegative().optional(),
    deleted: z.int().nonnegative().optional(),
    skipped: z.int().nonnegative().optional(),
    conflicted: z.int().nonnegative().optional(),
    failed: z.int().nonnegative().optional(),
  })
  .partial()
  .strict();

const ContentSyncJobRowSchema = z.object({
  id: z.string().min(1),
  direction: ContentSyncDirectionSchema,
  mode: ContentSyncModeSchema,
  status: ContentSyncJobStatusSchema,
  sourceEndpointId: ContentSyncEndpointIdSchema,
  targetEndpointId: ContentSyncEndpointIdSchema,
  conflictPolicy: ContentSyncConflictPolicySchema,
  localRevisionId: z.string().nullable().optional(),
  remoteRevisionId: z.string().nullable().optional(),
  resultLocalRevisionId: z.string().nullable().optional(),
  resultRemoteRevisionId: z.string().nullable().optional(),
  summaryJson: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.string().min(1),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  planJobId: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
type ContentSyncJobRow = z.infer<typeof ContentSyncJobRowSchema>;

const ContentSyncItemRowSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  resourceType: ContentSyncResourceTypeSchema,
  resourceId: z.string().min(1),
  resourceLabel: z.string().nullable().optional(),
  action: ContentSyncItemActionSchema,
  localVersion: z.string().nullable().optional(),
  remoteVersion: z.string().nullable().optional(),
  localChecksum: z.string().nullable().optional(),
  remoteChecksum: z.string().nullable().optional(),
  resultStatus: ContentSyncItemResultStatusSchema,
  conflictReason: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
type ContentSyncItemRow = z.infer<typeof ContentSyncItemRowSchema>;

export interface PersistedContentSyncItemInput {
  id: string;
  resourceType: ContentSyncResourceType;
  resourceId: string;
  resourceLabel?: string;
  action: ContentSyncItemAction;
  localVersion?: string;
  remoteVersion?: string;
  localChecksum?: string;
  remoteChecksum?: string;
  resultStatus: ContentSyncItemResultStatus;
  conflictReason?: string;
  errorMessage?: string;
}

export interface PersistedContentSyncItem extends PersistedContentSyncItemInput {
  jobId: string;
  createdAt: string;
}

export interface CreateContentSyncDryRunJobInput {
  id: string;
  direction: ContentSyncDirection;
  sourceEndpointId: ContentSyncEndpointId;
  targetEndpointId: ContentSyncEndpointId;
  conflictPolicy: ContentSyncConflictPolicy;
  localRevisionId?: string;
  remoteRevisionId?: string;
  summary: ContentSyncSummary;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  notes?: string;
  items: readonly PersistedContentSyncItemInput[];
}

export interface CreateContentSyncApplyJobInput {
  id: string;
  planJobId: string;
  direction: ContentSyncDirection;
  sourceEndpointId: ContentSyncEndpointId;
  targetEndpointId: ContentSyncEndpointId;
  conflictPolicy: ContentSyncConflictPolicy;
  localRevisionId?: string;
  remoteRevisionId?: string;
  createdBy?: string;
  createdAt: string;
  startedAt?: string;
  idempotencyKey: string;
  notes?: string;
}

export interface CompleteContentSyncApplyJobInput {
  jobId: string;
  status: ContentSyncJobStatus;
  summary: ContentSyncSummary;
  finishedAt: string;
  resultLocalRevisionId?: string;
  resultRemoteRevisionId?: string;
}

export interface ReconcileStaleApplyJobsInput {
  staleBefore: string;
  finishedAt: string;
  notes?: string;
}

export interface LatestSuccessfulSyncAnchor {
  jobId: string;
  direction: ContentSyncDirection;
  completedAt: string;
  localRevisionId?: string;
  remoteRevisionId?: string;
}

function parseSummary(summaryJson?: string | null): ContentSyncSummary {
  if (!summaryJson) {
    return createEmptyContentSyncSummary();
  }

  try {
    const parsed = RawSummarySchema.parse(JSON.parse(summaryJson));
    return ContentSyncSummarySchema.parse({
      total: parsed.total ?? 0,
      created: parsed.created ?? 0,
      updated: parsed.updated ?? 0,
      deleted: parsed.deleted ?? 0,
      skipped: parsed.skipped ?? 0,
      conflicted: parsed.conflicted ?? 0,
      failed: parsed.failed ?? 0,
    });
  } catch {
    return createEmptyContentSyncSummary();
  }
}

function mapJob(row: ContentSyncJobRow): ContentSyncJob {
  return ContentSyncJobSchema.parse({
    id: row.id,
    direction: row.direction,
    mode: row.mode,
    status: row.status,
    sourceEndpointId: row.sourceEndpointId,
    targetEndpointId: row.targetEndpointId,
    conflictPolicy: row.conflictPolicy,
    localRevisionId:
      typeof row.localRevisionId === "string" ? row.localRevisionId : undefined,
    remoteRevisionId:
      typeof row.remoteRevisionId === "string"
        ? row.remoteRevisionId
        : undefined,
    resultLocalRevisionId:
      typeof row.resultLocalRevisionId === "string"
        ? row.resultLocalRevisionId
        : undefined,
    resultRemoteRevisionId:
      typeof row.resultRemoteRevisionId === "string"
        ? row.resultRemoteRevisionId
        : undefined,
    summary:
      typeof row.summaryJson === "string"
        ? parseSummary(row.summaryJson)
        : createEmptyContentSyncSummary(),
    createdBy: typeof row.createdBy === "string" ? row.createdBy : undefined,
    createdAt: row.createdAt,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : undefined,
    finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : undefined,
    planJobId: typeof row.planJobId === "string" ? row.planJobId : undefined,
    idempotencyKey:
      typeof row.idempotencyKey === "string" ? row.idempotencyKey : undefined,
    notes: typeof row.notes === "string" ? row.notes : undefined,
  });
}

function mapItem(row: ContentSyncItemRow): ContentSyncHistoryItem {
  return ContentSyncHistoryItemSchema.parse({
    id: row.id,
    jobId: row.jobId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    resourceLabel:
      typeof row.resourceLabel === "string" ? row.resourceLabel : undefined,
    action: row.action,
    localVersion:
      typeof row.localVersion === "string" ? row.localVersion : undefined,
    remoteVersion:
      typeof row.remoteVersion === "string" ? row.remoteVersion : undefined,
    localChecksum:
      typeof row.localChecksum === "string" ? row.localChecksum : undefined,
    remoteChecksum:
      typeof row.remoteChecksum === "string" ? row.remoteChecksum : undefined,
    resultStatus: row.resultStatus,
    conflictReason:
      typeof row.conflictReason === "string" ? row.conflictReason : undefined,
    errorMessage:
      typeof row.errorMessage === "string" ? row.errorMessage : undefined,
    createdAt: row.createdAt,
  });
}

function toPersistedItem(
  jobId: string,
  createdAt: string,
  item: PersistedContentSyncItemInput,
): PersistedContentSyncItem {
  return {
    ...item,
    jobId,
    createdAt,
  };
}

export class ContentSyncRepository {
  private initializationPromise?: Promise<SqlDatabaseLike>;

  constructor(
    private readonly locals?: RuntimeLocals,
    private readonly database?: SqlDatabaseLike,
  ) {}

  private async getDb(): Promise<SqlDatabaseLike> {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        const db = await resolveDatabase(this.locals, this.database);

        for (const statement of CONTENT_SYNC_STORAGE_STATEMENTS) {
          await db.prepare(statement).run();
        }

        return db;
      })();
    }

    return this.initializationPromise;
  }

  async createDryRunJob(input: CreateContentSyncDryRunJobInput): Promise<void> {
    const db = await this.getDb();
    const summaryJson = JSON.stringify(
      ContentSyncSummarySchema.parse(input.summary),
    );
    const startedAt = input.startedAt ?? input.createdAt;
    const finishedAt = input.finishedAt ?? input.createdAt;

    await db
      .prepare(
        `INSERT INTO aria_content_sync_jobs (
          id,
          direction,
          mode,
          status,
          source_endpoint_id,
          target_endpoint_id,
          conflict_policy,
          local_revision_id,
          remote_revision_id,
          result_local_revision_id,
          result_remote_revision_id,
          summary_json,
          created_by,
          created_at,
          started_at,
          finished_at,
          plan_job_id,
          idempotency_key,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.direction,
        "dry-run",
        "planned",
        input.sourceEndpointId,
        input.targetEndpointId,
        input.conflictPolicy,
        input.localRevisionId ?? null,
        input.remoteRevisionId ?? null,
        null,
        null,
        summaryJson,
        input.createdBy ?? null,
        input.createdAt,
        startedAt,
        finishedAt,
        null,
        null,
        input.notes ?? null,
      )
      .run();

    for (const item of input.items) {
      const persisted = toPersistedItem(input.id, input.createdAt, item);
      await this.insertJobItem(persisted);
    }

    await db
      .prepare(
        `UPDATE aria_content_sync_jobs
         SET status = ?, summary_json = ?, finished_at = ?
         WHERE id = ?`,
      )
      .bind("completed", summaryJson, finishedAt, input.id)
      .run();
  }

  async createApplyJob(input: CreateContentSyncApplyJobInput): Promise<void> {
    const db = await this.getDb();

    await db
      .prepare(
        `INSERT INTO aria_content_sync_jobs (
          id,
          direction,
          mode,
          status,
          source_endpoint_id,
          target_endpoint_id,
          conflict_policy,
          local_revision_id,
          remote_revision_id,
          result_local_revision_id,
          result_remote_revision_id,
          summary_json,
          created_by,
          created_at,
          started_at,
          finished_at,
          plan_job_id,
          idempotency_key,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.direction,
        "apply",
        "running",
        input.sourceEndpointId,
        input.targetEndpointId,
        input.conflictPolicy,
        input.localRevisionId ?? null,
        input.remoteRevisionId ?? null,
        null,
        null,
        null,
        input.createdBy ?? null,
        input.createdAt,
        input.startedAt ?? input.createdAt,
        null,
        input.planJobId,
        input.idempotencyKey,
        input.notes ?? null,
      )
      .run();
  }

  async completeApplyJob(
    input: CompleteContentSyncApplyJobInput,
  ): Promise<void> {
    const db = await this.getDb();
    const summaryJson = JSON.stringify(
      ContentSyncSummarySchema.parse(input.summary),
    );

    await db
      .prepare(
        `UPDATE aria_content_sync_jobs
         SET
           status = ?,
           summary_json = ?,
           finished_at = ?,
           result_local_revision_id = ?,
           result_remote_revision_id = ?
         WHERE id = ?`,
      )
      .bind(
        input.status,
        summaryJson,
        input.finishedAt,
        input.resultLocalRevisionId ?? null,
        input.resultRemoteRevisionId ?? null,
        input.jobId,
      )
      .run();
  }

  async reconcileStaleApplyJobs(
    input: ReconcileStaleApplyJobsInput,
  ): Promise<number> {
    const db = await this.getDb();
    const fallbackSummary = createEmptyContentSyncSummary();
    fallbackSummary.total = 1;
    fallbackSummary.failed = 1;
    const summaryJson = JSON.stringify(fallbackSummary);

    const result = await db
      .prepare(
        `UPDATE aria_content_sync_jobs
         SET
           status = 'failed',
           summary_json = COALESCE(summary_json, ?),
           finished_at = ?,
           notes = CASE
             WHEN ? IS NULL OR ? = '' THEN notes
             WHEN notes IS NULL OR notes = '' THEN ?
             ELSE notes || '\n' || ?
           END
         WHERE
           mode = 'apply'
           AND status = 'running'
           AND finished_at IS NULL
           AND COALESCE(started_at, created_at) <= ?`,
      )
      .bind(
        summaryJson,
        input.finishedAt,
        input.notes ?? null,
        input.notes ?? null,
        input.notes ?? null,
        input.notes ?? null,
        input.staleBefore,
      )
      .run();

    const rowsAffected =
      typeof (result as { rowsAffected?: unknown }).rowsAffected === "number"
        ? (result as { rowsAffected: number }).rowsAffected
        : Number.parseInt(
            String((result as { rowsAffected?: unknown }).rowsAffected ?? 0),
            10,
          );

    return Number.isFinite(rowsAffected) ? rowsAffected : 0;
  }

  async insertApplyItem(input: {
    jobId: string;
    item: PersistedContentSyncItemInput;
    createdAt: string;
  }): Promise<void> {
    await this.insertJobItem(
      toPersistedItem(input.jobId, input.createdAt, input.item),
    );
  }

  async getJobById(id: string): Promise<ContentSyncJob | null> {
    const db = await this.getDb();

    const row = await db
      .prepare(
        `SELECT
           id,
           direction,
           mode,
           status,
           source_endpoint_id AS sourceEndpointId,
           target_endpoint_id AS targetEndpointId,
           conflict_policy AS conflictPolicy,
           local_revision_id AS localRevisionId,
           remote_revision_id AS remoteRevisionId,
           result_local_revision_id AS resultLocalRevisionId,
           result_remote_revision_id AS resultRemoteRevisionId,
           summary_json AS summaryJson,
           created_by AS createdBy,
           created_at AS createdAt,
           started_at AS startedAt,
           finished_at AS finishedAt,
           plan_job_id AS planJobId,
           idempotency_key AS idempotencyKey,
           notes
         FROM aria_content_sync_jobs
         WHERE id = ?
         LIMIT 1`,
      )
      .bind(id)
      .first<ContentSyncJobRow>();

    if (!row) {
      return null;
    }

    return mapJob(ContentSyncJobRowSchema.parse(row));
  }

  async getApplyJobByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ContentSyncJob | null> {
    const db = await this.getDb();

    const row = await db
      .prepare(
        `SELECT
           id,
           direction,
           mode,
           status,
           source_endpoint_id AS sourceEndpointId,
           target_endpoint_id AS targetEndpointId,
           conflict_policy AS conflictPolicy,
           local_revision_id AS localRevisionId,
           remote_revision_id AS remoteRevisionId,
           result_local_revision_id AS resultLocalRevisionId,
           result_remote_revision_id AS resultRemoteRevisionId,
           summary_json AS summaryJson,
           created_by AS createdBy,
           created_at AS createdAt,
           started_at AS startedAt,
           finished_at AS finishedAt,
           plan_job_id AS planJobId,
           idempotency_key AS idempotencyKey,
           notes
         FROM aria_content_sync_jobs
         WHERE mode = 'apply' AND idempotency_key = ?
         LIMIT 1`,
      )
      .bind(idempotencyKey)
      .first<ContentSyncJobRow>();

    if (!row) {
      return null;
    }

    return mapJob(ContentSyncJobRowSchema.parse(row));
  }

  async listRecentJobs(input: {
    limit: number;
    mode?: ContentSyncMode;
  }): Promise<ContentSyncJob[]> {
    const db = await this.getDb();
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(input.limit)));

    const result = input.mode
      ? await db
          .prepare(
            `SELECT
               id,
               direction,
               mode,
               status,
               source_endpoint_id AS sourceEndpointId,
               target_endpoint_id AS targetEndpointId,
               conflict_policy AS conflictPolicy,
               local_revision_id AS localRevisionId,
               remote_revision_id AS remoteRevisionId,
               result_local_revision_id AS resultLocalRevisionId,
               result_remote_revision_id AS resultRemoteRevisionId,
               summary_json AS summaryJson,
               created_by AS createdBy,
               created_at AS createdAt,
               started_at AS startedAt,
               finished_at AS finishedAt,
               plan_job_id AS planJobId,
               idempotency_key AS idempotencyKey,
               notes
             FROM aria_content_sync_jobs
             WHERE mode = ?
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .bind(input.mode, safeLimit)
          .all<ContentSyncJobRow>()
      : await db
          .prepare(
            `SELECT
               id,
               direction,
               mode,
               status,
               source_endpoint_id AS sourceEndpointId,
               target_endpoint_id AS targetEndpointId,
               conflict_policy AS conflictPolicy,
               local_revision_id AS localRevisionId,
               remote_revision_id AS remoteRevisionId,
               result_local_revision_id AS resultLocalRevisionId,
               result_remote_revision_id AS resultRemoteRevisionId,
               summary_json AS summaryJson,
               created_by AS createdBy,
               created_at AS createdAt,
               started_at AS startedAt,
               finished_at AS finishedAt,
               plan_job_id AS planJobId,
               idempotency_key AS idempotencyKey,
               notes
             FROM aria_content_sync_jobs
             ORDER BY created_at DESC
             LIMIT ?`,
          )
          .bind(safeLimit)
          .all<ContentSyncJobRow>();

    return (result.results ?? [])
      .map((row) => ContentSyncJobRowSchema.parse(row))
      .map((row) => mapJob(row));
  }

  async listItemsByJobId(jobId: string): Promise<ContentSyncHistoryItem[]> {
    const db = await this.getDb();

    const result = await db
      .prepare(
        `SELECT
           id,
           job_id AS jobId,
           resource_type AS resourceType,
           resource_id AS resourceId,
           resource_label AS resourceLabel,
           action,
           local_version AS localVersion,
           remote_version AS remoteVersion,
           local_checksum AS localChecksum,
           remote_checksum AS remoteChecksum,
           result_status AS resultStatus,
           conflict_reason AS conflictReason,
           error_message AS errorMessage,
           created_at AS createdAt
         FROM aria_content_sync_items
         WHERE job_id = ?
         ORDER BY created_at ASC`,
      )
      .bind(jobId)
      .all<ContentSyncItemRow>();

    return (result.results ?? [])
      .map((row) => ContentSyncItemRowSchema.parse(row))
      .map((row) => mapItem(row));
  }

  async getLatestSuccessfulSyncAnchor(): Promise<LatestSuccessfulSyncAnchor | null> {
    const db = await this.getDb();

    const row = await db
      .prepare(
        `SELECT
           id,
           direction,
           finished_at AS finishedAt,
           result_local_revision_id AS resultLocalRevisionId,
           result_remote_revision_id AS resultRemoteRevisionId
         FROM aria_content_sync_jobs
         WHERE
           mode = 'apply'
           AND status = 'completed'
           AND finished_at IS NOT NULL
         ORDER BY finished_at DESC
         LIMIT 1`,
      )
      .first<{
        id: string;
        direction: ContentSyncDirection;
        finishedAt: string;
        resultLocalRevisionId?: string | null;
        resultRemoteRevisionId?: string | null;
      }>();

    if (!row) {
      return null;
    }

    return {
      jobId: row.id,
      direction: ContentSyncDirectionSchema.parse(row.direction),
      completedAt: row.finishedAt,
      localRevisionId:
        typeof row.resultLocalRevisionId === "string"
          ? row.resultLocalRevisionId
          : undefined,
      remoteRevisionId:
        typeof row.resultRemoteRevisionId === "string"
          ? row.resultRemoteRevisionId
          : undefined,
    };
  }

  async getLatestJobByMode(
    mode: ContentSyncMode,
  ): Promise<ContentSyncJob | null> {
    const jobs = await this.listRecentJobs({ mode, limit: 1 });
    return jobs[0] ?? null;
  }

  async getLatestPlanJob(): Promise<ContentSyncJob | null> {
    return this.getLatestJobByMode("dry-run");
  }

  async getLatestApplyJob(): Promise<ContentSyncJob | null> {
    return this.getLatestJobByMode("apply");
  }

  async getHistoryJobsWithItems(input: {
    limit: number;
    mode?: ContentSyncMode;
  }): Promise<ContentSyncHistoryJob[]> {
    const jobs = await this.listRecentJobs(input);

    return Promise.all(
      jobs.map(async (job) => {
        const items = await this.listItemsByJobId(job.id);
        return ContentSyncHistoryJobSchema.parse({
          ...job,
          items,
        });
      }),
    );
  }

  async countJobsByMode(mode: ContentSyncMode): Promise<number> {
    const db = await this.getDb();

    const row = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM aria_content_sync_jobs
         WHERE mode = ?`,
      )
      .bind(mode)
      .first<{ count: number | string }>();

    if (!row) {
      return 0;
    }

    const numericCount =
      typeof row.count === "number"
        ? row.count
        : Number.parseInt(String(row.count), 10);

    return Number.isFinite(numericCount) ? numericCount : 0;
  }

  static parseSummary(summaryJson?: string | null): ContentSyncSummary {
    return parseSummary(summaryJson);
  }

  private async insertJobItem(item: PersistedContentSyncItem): Promise<void> {
    const db = await this.getDb();

    await db
      .prepare(
        `INSERT INTO aria_content_sync_items (
          id,
          job_id,
          resource_type,
          resource_id,
          resource_label,
          action,
          local_version,
          remote_version,
          local_checksum,
          remote_checksum,
          result_status,
          conflict_reason,
          error_message,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        item.id,
        item.jobId,
        item.resourceType,
        item.resourceId,
        item.resourceLabel ?? null,
        item.action,
        item.localVersion ?? null,
        item.remoteVersion ?? null,
        item.localChecksum ?? null,
        item.remoteChecksum ?? null,
        item.resultStatus,
        item.conflictReason ?? null,
        item.errorMessage ?? null,
        item.createdAt,
      )
      .run();
  }
}
