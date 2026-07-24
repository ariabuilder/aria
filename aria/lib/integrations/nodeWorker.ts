import type { ApiSqlDatabase } from "../api/database";
import type { RuntimeLocals } from "../cloudflare/env";
import {
  deliverWebhook,
  fanoutIntegrationOutbox,
  recoverExpiredWebhookLeases,
} from "./webhooks/delivery";
import { readWebhookEgressPolicy } from "./webhooks/egress";
import { purgeWebhookRetention } from "./webhooks/maintenance";
import { runOAuthMaintenance } from "../oauth/maintenance";

const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 60_000;
const MIN_HEARTBEAT_LEASE_MS = 30_000;
const RETENTION_MS = 90 * 86_400_000;
const MAINTENANCE_INTERVAL_MS = 5 * 60_000;

async function writeNodeWorkerHeartbeat(input: {
  database: ApiSqlDatabase;
  workerId: string;
  intervalMs: number;
  stopped: boolean;
}): Promise<void> {
  const heartbeatAt = new Date().toISOString();
  const readyUntil = new Date(
    Date.parse(heartbeatAt) +
      (input.stopped
        ? 0
        : Math.max(input.intervalMs * 3, MIN_HEARTBEAT_LEASE_MS)),
  ).toISOString();
  await input.database.execute(
    `INSERT INTO aria_integration_worker_heartbeats (
       worker_id, runtime, heartbeat_at, ready_until, stopped_at
     ) VALUES (?, 'node', ?, ?, ?)
     ON CONFLICT(worker_id) DO UPDATE SET
       heartbeat_at = excluded.heartbeat_at,
       ready_until = excluded.ready_until,
       stopped_at = excluded.stopped_at`,
    [
      input.workerId,
      heartbeatAt,
      readyUntil,
      input.stopped ? heartbeatAt : null,
    ],
  );
}

export async function isNodeIntegrationWorkerReady(
  database: ApiSqlDatabase,
  now = new Date().toISOString(),
): Promise<boolean> {
  const row = await database.queryFirst<{ worker_id: string }>(
    `SELECT worker_id FROM aria_integration_worker_heartbeats
     WHERE runtime = 'node' AND stopped_at IS NULL AND ready_until > ?
     ORDER BY ready_until DESC LIMIT 1`,
    [now],
  );
  return Boolean(row);
}

export async function waitForIntegrationWorkerInterval(
  signal: AbortSignal,
  intervalMs: number,
): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, intervalMs);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function drainNodeIntegrationWork(input: {
  database: ApiSqlDatabase;
  locals?: RuntimeLocals;
  now?: string;
  limit?: number;
  signal?: AbortSignal;
  onProgress?: () => Promise<void>;
  runMaintenance?: boolean;
}): Promise<{ outbox: number; deliveries: number }> {
  const policy = readWebhookEgressPolicy(input.locals);
  if (policy.mode !== "proxy") {
    throw new Error("NODE_WEBHOOK_EGRESS_PROXY_REQUIRED");
  }
  const now = input.now ?? new Date().toISOString();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  await input.database.execute(
    `UPDATE aria_event_outbox
     SET state = 'pending', lease_token = NULL, lease_expires_at = NULL,
         last_error_code = 'lease_expired', updated_at = ?
     WHERE state = 'claimed' AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ?`,
    [now, now],
  );
  await recoverExpiredWebhookLeases(input.database, now);
  await input.onProgress?.();
  const outbox = await input.database.queryAll<{ id: string }>(
    `SELECT id FROM aria_event_outbox
     WHERE state = 'pending' AND available_at <= ?
     ORDER BY available_at, created_at LIMIT ?`,
    [now, limit],
  );
  let outboxProcessed = 0;
  for (const item of outbox) {
    if (input.signal?.aborted) break;
    await input.onProgress?.();
    const leaseToken = crypto.randomUUID();
    const claimed = await input.database.execute(
      `UPDATE aria_event_outbox
       SET state = 'claimed', lease_token = ?, lease_expires_at = ?,
           dispatch_attempts = dispatch_attempts + 1, updated_at = ?
       WHERE id = ? AND state = 'pending' AND available_at <= ?`,
      [
        leaseToken,
        new Date(Date.parse(now) + 120_000).toISOString(),
        now,
        item.id,
        now,
      ],
    );
    if (claimed > 0) {
      await fanoutIntegrationOutbox(input.database, item.id, leaseToken, now);
      outboxProcessed += 1;
      await input.onProgress?.();
    }
  }
  const deliveries = await input.database.queryAll<{ id: string }>(
    `SELECT d.id FROM aria_webhook_deliveries d
     JOIN aria_webhook_endpoints ep ON ep.id = d.endpoint_id
     WHERE d.state IN ('pending', 'retry_wait') AND d.available_at <= ?
       AND ep.status = 'active'
     ORDER BY d.available_at, d.created_at LIMIT ?`,
    [now, limit],
  );
  let deliveriesProcessed = 0;
  for (const delivery of deliveries) {
    if (input.signal?.aborted) break;
    await input.onProgress?.();
    await deliverWebhook(input.database, input.locals ?? {}, delivery.id, now);
    deliveriesProcessed += 1;
    await input.onProgress?.();
  }
  if (!input.signal?.aborted && input.runMaintenance !== false) {
    await purgeWebhookRetention({
      database: input.database,
      before: new Date(Date.parse(now) - RETENTION_MS).toISOString(),
      now,
      limit: 250,
    });
  }
  return { outbox: outboxProcessed, deliveries: deliveriesProcessed };
}

export async function runNodeIntegrationWorker(input: {
  database: ApiSqlDatabase;
  locals?: RuntimeLocals;
  signal: AbortSignal;
  intervalMs?: number;
  workerId?: string;
}): Promise<void> {
  const requestedInterval = input.intervalMs ?? 5_000;
  if (
    !Number.isFinite(requestedInterval) ||
    !Number.isInteger(requestedInterval) ||
    requestedInterval < MIN_INTERVAL_MS ||
    requestedInterval > MAX_INTERVAL_MS
  ) {
    throw new Error("INTEGRATION_WORKER_INTERVAL_INVALID");
  }
  const intervalMs = Math.floor(requestedInterval);
  const workerId = input.workerId ?? crypto.randomUUID();
  const heartbeat = () =>
    writeNodeWorkerHeartbeat({
      database: input.database,
      workerId,
      intervalMs,
      stopped: false,
    });
  await heartbeat();
  let lastMaintenanceAt = 0;
  try {
    while (!input.signal.aborted) {
      const cycleStartedAt = Date.now();
      const runMaintenance =
        cycleStartedAt - lastMaintenanceAt >= MAINTENANCE_INTERVAL_MS;
      let drainError: unknown;
      try {
        await drainNodeIntegrationWork({
          ...input,
          signal: input.signal,
          onProgress: heartbeat,
          runMaintenance,
        });
      } catch (cause) {
        drainError = cause;
      }
      if (runMaintenance && !input.signal.aborted) {
        try {
          await runOAuthMaintenance({
            database: input.database,
            now: new Date().toISOString(),
            limit: 250,
          });
        } catch (oauthCause) {
          const oauthError =
            oauthCause instanceof Error
              ? oauthCause
              : new Error("Unknown OAuth maintenance error");
          if (drainError) {
            const drain =
              drainError instanceof Error
                ? drainError
                : new Error("Unknown integration drain error");
            throw new AggregateError(
              [drain, oauthError],
              "Integration drain and OAuth maintenance failed",
            );
          }
          throw oauthError;
        }
        lastMaintenanceAt = cycleStartedAt;
      }
      if (drainError) throw drainError;
      await heartbeat();
      await waitForIntegrationWorkerInterval(input.signal, intervalMs);
    }
  } finally {
    await writeNodeWorkerHeartbeat({
      database: input.database,
      workerId,
      intervalMs,
      stopped: true,
    });
  }
}
