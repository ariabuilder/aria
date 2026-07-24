import { z } from "zod";
import type { RuntimeLocals } from "../../../../../lib/cloudflare/env";
import { getTokenDb } from "../mcp/tokenDb";
import type { TokenDb } from "../mcp/tokenDb";
import {
  AiQuotaExceededSchema,
  AiQuotaMetricSchema,
  AiQuotaPolicySchema,
  CompleteInferenceRunInputSchema,
  DeleteAiQuotaPolicyInputSchema,
  InferenceRunSchema,
  InferenceBillingModeSchema,
  SaveAiQuotaPolicyInputSchema,
  StartInferenceRunInputSchema,
  type AiQuotaExceeded,
  type AiQuotaMetric,
  type AiQuotaPolicy,
  type CompleteInferenceRunInput,
  type InferenceRun,
  type StartInferenceRunInput,
} from "./schemas";

export class AiQuotaExceededError extends Error {
  constructor(readonly details: AiQuotaExceeded) {
    super(`AI quota exceeded for ${details.metric}`);
    this.name = "AiQuotaExceededError";
  }
}

const InferenceRunRowSchema = z
  .object({
    id: z.string(),
    request_id: z.string(),
    turn_id: z.string(),
    site_id: z.string(),
    user_id: z.string(),
    provider_instance_id: z.string(),
    backend: z.string(),
    model_id: z.string(),
    billing_mode: z.string(),
    route_type: z.string(),
    transport: z.string(),
    feature: z.string(),
    status: z.string(),
    started_at: z.string(),
    finished_at: z.string().nullable(),
    finish_reason: z.string().nullable(),
    error_code: z.string().nullable(),
  })
  .loose();

const ENSURE_USAGE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS aria_ai_inference_runs (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    turn_id TEXT NOT NULL,
    site_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    provider_instance_id TEXT NOT NULL,
    backend TEXT NOT NULL,
    model_id TEXT NOT NULL,
    billing_mode TEXT NOT NULL,
    route_type TEXT NOT NULL,
    transport TEXT NOT NULL,
    feature TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    finish_reason TEXT,
    error_code TEXT,
    UNIQUE(site_id, request_id)
  )`,
  `CREATE TABLE IF NOT EXISTS aria_ai_usage_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    reasoning_tokens INTEGER,
    cached_input_tokens INTEGER,
    estimated_cost_micros INTEGER,
    provider_reported_cost_micros INTEGER,
    currency TEXT NOT NULL,
    pricing_source TEXT,
    pricing_version TEXT,
    provider_request_id TEXT,
    gateway_request_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(run_id, attempt),
    FOREIGN KEY(run_id) REFERENCES aria_ai_inference_runs(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_runs_site_started ON aria_ai_inference_runs(site_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_runs_user_started ON aria_ai_inference_runs(user_id, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_usage_run ON aria_ai_usage_events(run_id, attempt)`,
  `CREATE TABLE IF NOT EXISTS aria_ai_quota_policies (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT,
    metric TEXT NOT NULL,
    window_seconds INTEGER NOT NULL,
    warning_limit INTEGER,
    hard_limit INTEGER NOT NULL,
    reservation_units INTEGER NOT NULL,
    billing_modes_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS aria_ai_quota_reservations (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    window_start TEXT NOT NULL,
    reserved_units INTEGER NOT NULL,
    actual_units INTEGER,
    status TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    reconciled_at TEXT,
    UNIQUE(run_id, policy_id)
  )`,
  `CREATE TABLE IF NOT EXISTS aria_ai_quota_buckets (
    policy_id TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    window_start TEXT NOT NULL,
    reserved_units INTEGER NOT NULL DEFAULT 0,
    consumed_units INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(policy_id, subject_key, window_start)
  )`,
] as const;

/**
 * The quota reservation table was initially introduced without the fields needed
 * to reconcile a reservation back to its quota bucket. `CREATE.
 */
async function ensureUsageSchemaUpgrades(db: TokenDb): Promise<void> {
  const columns = await db.queryAll(
    "PRAGMA table_info(aria_ai_quota_reservations)",
  );
  const names = new Set(
    columns
      .map((column) => column.name)
      .filter((name): name is string => typeof name === "string"),
  );

  if (!names.has("subject_key")) {
    // Existing reservations predate subject-level buckets. An empty default
    // lets those legacy rows complete safely; all new reservations carry the
    // real subject key when they are created.
    await db.execute(
      "ALTER TABLE aria_ai_quota_reservations ADD COLUMN subject_key TEXT NOT NULL DEFAULT ''",
    );
  }
  if (!names.has("window_start")) {
    await db.execute(
      "ALTER TABLE aria_ai_quota_reservations ADD COLUMN window_start TEXT NOT NULL DEFAULT ''",
    );
  }
}

const QuotaPolicyRowSchema = z
  .object({
    id: z.string(),
    site_id: z.string(),
    subject_type: z.string(),
    subject_id: z.string().nullable(),
    metric: z.string(),
    window_seconds: z.number(),
    warning_limit: z.number().nullable(),
    hard_limit: z.number(),
    reservation_units: z.number(),
    billing_modes_json: z.string(),
    enabled: z.union([z.boolean(), z.number()]),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .loose();

function rowToQuotaPolicy(input: unknown): AiQuotaPolicy {
  const row = QuotaPolicyRowSchema.parse(input);
  const billingModes: unknown = JSON.parse(row.billing_modes_json);
  return AiQuotaPolicySchema.parse({
    id: row.id,
    siteId: row.site_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    metric: row.metric,
    windowSeconds: row.window_seconds,
    warningLimit: row.warning_limit,
    hardLimit: row.hard_limit,
    reservationUnits: row.reservation_units,
    billingModes,
    enabled: row.enabled === true || row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

type AcquiredReservation = {
  policyId: string;
  subjectKey: string;
  windowStart: string;
  reservedUnits: number;
};

async function releaseReservations(
  db: TokenDb,
  runId: string,
  reservations: readonly AcquiredReservation[],
): Promise<void> {
  for (const reservation of reservations) {
    await db.execute(
      `UPDATE aria_ai_quota_buckets
       SET reserved_units = MAX(0, reserved_units - ?)
       WHERE policy_id = ? AND subject_key = ? AND window_start = ?`,
      [
        reservation.reservedUnits,
        reservation.policyId,
        reservation.subjectKey,
        reservation.windowStart,
      ],
    );
  }
  await db.execute(`DELETE FROM aria_ai_quota_reservations WHERE run_id = ?`, [
    runId,
  ]);
}

async function reserveQuotaPolicies(
  db: TokenDb,
  runId: string,
  input: StartInferenceRunInput,
): Promise<AcquiredReservation[]> {
  const rows = await db.queryAll(
    `SELECT * FROM aria_ai_quota_policies
     WHERE site_id = ? AND enabled = 1
       AND (subject_type = 'site' OR (subject_type = 'user' AND subject_id = ?))`,
    [input.siteId, input.userId],
  );
  const policies = rows
    .map(rowToQuotaPolicy)
    .filter((policy) => policy.billingModes.includes(input.billingMode));
  const acquired: AcquiredReservation[] = [];

  try {
    for (const policy of policies) {
      const subjectKey =
        policy.subjectType === "site" ? input.siteId : input.userId;
      const windowMs = policy.windowSeconds * 1000;
      const windowStartMs = Math.floor(Date.now() / windowMs) * windowMs;
      const windowStart = new Date(windowStartMs).toISOString();
      const resetAt = new Date(windowStartMs + windowMs).toISOString();
      await db.execute(
        `INSERT OR IGNORE INTO aria_ai_quota_buckets
         (policy_id, subject_key, window_start, reserved_units, consumed_units)
         VALUES (?, ?, ?, 0, 0)`,
        [policy.id, subjectKey, windowStart],
      );
      const changes = await db.execute(
        `UPDATE aria_ai_quota_buckets
         SET reserved_units = reserved_units + ?
         WHERE policy_id = ? AND subject_key = ? AND window_start = ?
           AND reserved_units + consumed_units + ? <= ?`,
        [
          policy.reservationUnits,
          policy.id,
          subjectKey,
          windowStart,
          policy.reservationUnits,
          policy.hardLimit,
        ],
      );
      if (changes !== 1) {
        throw new AiQuotaExceededError(
          AiQuotaExceededSchema.parse({
            policyId: policy.id,
            metric: policy.metric,
            hardLimit: policy.hardLimit,
            resetAt,
          }),
        );
      }
      const reservation = {
        policyId: policy.id,
        subjectKey,
        windowStart,
        reservedUnits: policy.reservationUnits,
      } satisfies AcquiredReservation;
      acquired.push(reservation);
      await db.execute(
        `INSERT INTO aria_ai_quota_reservations
         (id, run_id, policy_id, subject_key, window_start, reserved_units,
          status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'reserved', ?)`,
        [
          crypto.randomUUID(),
          runId,
          policy.id,
          subjectKey,
          windowStart,
          policy.reservationUnits,
          resetAt,
        ],
      );
    }
  } catch (error) {
    await releaseReservations(db, runId, acquired);
    throw error;
  }
  return acquired;
}

function actualUnits(
  metric: AiQuotaMetric,
  reservedUnits: number,
  input: CompleteInferenceRunInput,
): number {
  if (metric === "requests") return 1;
  if (!input.usage) return reservedUnits;
  if (metric === "tokens") {
    return (input.usage.inputTokens ?? 0) + (input.usage.outputTokens ?? 0);
  }
  return (
    input.usage.providerReportedCostMicros ??
    input.usage.estimatedCostMicros ??
    reservedUnits
  );
}

async function reconcileQuotaReservations(
  db: TokenDb,
  input: CompleteInferenceRunInput,
): Promise<void> {
  const rows = await db.queryAll(
    `SELECT r.policy_id, r.subject_key, r.window_start, r.reserved_units,
            p.metric
     FROM aria_ai_quota_reservations r
     JOIN aria_ai_quota_policies p ON p.id = r.policy_id
     WHERE r.run_id = ? AND r.status = 'reserved'`,
    [input.runId],
  );
  const RowSchema = z
    .object({
      policy_id: z.string(),
      subject_key: z.string(),
      window_start: z.string(),
      reserved_units: z.number(),
      metric: AiQuotaMetricSchema,
    })
    .loose();
  const now = new Date().toISOString();
  for (const raw of rows) {
    const row = RowSchema.parse(raw);
    const units = actualUnits(row.metric, row.reserved_units, input);
    await db.execute(
      `UPDATE aria_ai_quota_buckets
       SET reserved_units = MAX(0, reserved_units - ?),
           consumed_units = consumed_units + ?
       WHERE policy_id = ? AND subject_key = ? AND window_start = ?`,
      [
        row.reserved_units,
        units,
        row.policy_id,
        row.subject_key,
        row.window_start,
      ],
    );
    await db.execute(
      `UPDATE aria_ai_quota_reservations
       SET actual_units = ?, status = 'reconciled', reconciled_at = ?
       WHERE run_id = ? AND policy_id = ?`,
      [units, now, input.runId, row.policy_id],
    );
  }
}

function rowToInferenceRun(row: unknown): InferenceRun {
  const parsed = InferenceRunRowSchema.parse(row);
  return InferenceRunSchema.parse({
    id: parsed.id,
    requestId: parsed.request_id,
    turnId: parsed.turn_id,
    siteId: parsed.site_id,
    userId: parsed.user_id,
    providerInstanceId: parsed.provider_instance_id,
    backend: parsed.backend,
    modelId: parsed.model_id,
    billingMode: parsed.billing_mode,
    routeType: parsed.route_type,
    transport: parsed.transport,
    feature: parsed.feature,
    status: parsed.status,
    startedAt: parsed.started_at,
    finishedAt: parsed.finished_at,
    finishReason: parsed.finish_reason,
    errorCode: parsed.error_code,
  });
}

export class AiUsageRepository {
  constructor(private readonly locals: RuntimeLocals | App.Locals) {}

  async ensureSchema(): Promise<void> {
    const db = await getTokenDb(this.locals);
    for (const statement of ENSURE_USAGE_SCHEMA_SQL) {
      await db.execute(statement);
    }
    await ensureUsageSchemaUpgrades(db);
  }

  async startRun(input: StartInferenceRunInput): Promise<InferenceRun> {
    const parsed = StartInferenceRunInputSchema.parse(input);
    await this.ensureSchema();
    const db = await getTokenDb(this.locals);
    const existing = await db.queryFirst(
      `SELECT * FROM aria_ai_inference_runs WHERE site_id = ? AND request_id = ? LIMIT 1`,
      [parsed.siteId, parsed.requestId],
    );
    if (existing) return rowToInferenceRun(existing);

    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const reservations = await reserveQuotaPolicies(db, id, parsed);
    try {
      await db.execute(
        `INSERT INTO aria_ai_inference_runs
       (id, request_id, turn_id, site_id, user_id, provider_instance_id,
        backend, model_id, billing_mode, route_type, transport, feature,
        status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'started', ?)`,
        [
          id,
          parsed.requestId,
          parsed.turnId,
          parsed.siteId,
          parsed.userId,
          parsed.providerInstanceId,
          parsed.backend,
          parsed.modelId,
          parsed.billingMode,
          parsed.routeType,
          parsed.transport,
          parsed.feature,
          startedAt,
        ],
      );
    } catch (error) {
      await releaseReservations(db, id, reservations);
      const concurrent = await db.queryFirst(
        `SELECT * FROM aria_ai_inference_runs WHERE site_id = ? AND request_id = ? LIMIT 1`,
        [parsed.siteId, parsed.requestId],
      );
      if (concurrent) return rowToInferenceRun(concurrent);
      throw error;
    }
    return InferenceRunSchema.parse({
      ...parsed,
      id,
      status: "started",
      startedAt,
      finishedAt: null,
      finishReason: null,
      errorCode: null,
    });
  }

  async completeRun(input: CompleteInferenceRunInput): Promise<void> {
    const parsed = CompleteInferenceRunInputSchema.parse(input);
    await this.ensureSchema();
    const db = await getTokenDb(this.locals);
    const finishedAt = new Date().toISOString();
    await db.execute(
      `UPDATE aria_ai_inference_runs
       SET status = ?, finished_at = ?, finish_reason = ?, error_code = ?
       WHERE id = ? AND status = 'started'`,
      [
        parsed.status,
        finishedAt,
        parsed.finishReason,
        parsed.errorCode,
        parsed.runId,
      ],
    );

    if (parsed.usage) {
      await db.execute(
        `INSERT OR IGNORE INTO aria_ai_usage_events
       (id, run_id, attempt, input_tokens, output_tokens, reasoning_tokens,
        cached_input_tokens, estimated_cost_micros,
        provider_reported_cost_micros, currency, pricing_source,
        pricing_version, provider_request_id, gateway_request_id, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          parsed.runId,
          parsed.usage.inputTokens,
          parsed.usage.outputTokens,
          parsed.usage.reasoningTokens,
          parsed.usage.cachedInputTokens,
          parsed.usage.estimatedCostMicros,
          parsed.usage.providerReportedCostMicros,
          parsed.usage.currency,
          parsed.usage.pricingSource,
          parsed.usage.pricingVersion,
          parsed.usage.providerRequestId,
          parsed.usage.gatewayRequestId,
          finishedAt,
        ],
      );
    }
    await reconcileQuotaReservations(db, parsed);
  }

  async listQuotaPolicies(siteId: string): Promise<AiQuotaPolicy[]> {
    await this.ensureSchema();
    const db = await getTokenDb(this.locals);
    const rows = await db.queryAll(
      `SELECT * FROM aria_ai_quota_policies WHERE site_id = ? ORDER BY created_at`,
      [z.string().min(1).parse(siteId)],
    );
    return rows.map(rowToQuotaPolicy);
  }

  async saveQuotaPolicy(
    siteIdInput: string,
    input: z.input<typeof SaveAiQuotaPolicyInputSchema>,
  ): Promise<AiQuotaPolicy> {
    const siteId = z.string().min(1).parse(siteIdInput);
    const parsed = SaveAiQuotaPolicyInputSchema.parse(input);
    await this.ensureSchema();
    const db = await getTokenDb(this.locals);
    const now = new Date().toISOString();
    const id = parsed.id ?? crypto.randomUUID();
    await db.execute(
      `INSERT INTO aria_ai_quota_policies
       (id, site_id, subject_type, subject_id, metric, window_seconds,
        warning_limit, hard_limit, reservation_units, billing_modes_json,
        enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         subject_type = excluded.subject_type,
         subject_id = excluded.subject_id,
         metric = excluded.metric,
         window_seconds = excluded.window_seconds,
         warning_limit = excluded.warning_limit,
         hard_limit = excluded.hard_limit,
         reservation_units = excluded.reservation_units,
         billing_modes_json = excluded.billing_modes_json,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at
       WHERE aria_ai_quota_policies.site_id = excluded.site_id`,
      [
        id,
        siteId,
        parsed.subjectType,
        parsed.subjectId,
        parsed.metric,
        parsed.windowSeconds,
        parsed.warningLimit,
        parsed.hardLimit,
        parsed.reservationUnits,
        JSON.stringify(
          parsed.billingModes.map((mode) =>
            InferenceBillingModeSchema.parse(mode),
          ),
        ),
        parsed.enabled ? 1 : 0,
        now,
        now,
      ],
    );
    const row = await db.queryFirst(
      `SELECT * FROM aria_ai_quota_policies WHERE id = ? AND site_id = ? LIMIT 1`,
      [id, siteId],
    );
    if (!row) throw new Error("AI quota policy was not saved");
    return rowToQuotaPolicy(row);
  }

  async deleteQuotaPolicy(
    siteIdInput: string,
    input: z.input<typeof DeleteAiQuotaPolicyInputSchema>,
  ): Promise<boolean> {
    const siteId = z.string().min(1).parse(siteIdInput);
    const parsed = DeleteAiQuotaPolicyInputSchema.parse(input);
    await this.ensureSchema();
    const db = await getTokenDb(this.locals);
    const existing = await db.queryFirst(
      `SELECT id FROM aria_ai_quota_policies WHERE id = ? AND site_id = ? LIMIT 1`,
      [parsed.id, siteId],
    );
    if (!existing) return false;
    await db.execute(
      `DELETE FROM aria_ai_quota_policies WHERE id = ? AND site_id = ?`,
      [parsed.id, siteId],
    );
    return true;
  }
}
