import type { ApiSqlDatabase } from "../../api/database";
import { readApiKeyring, stableJson } from "../../api/crypto";
import type { RuntimeLocals } from "../../cloudflare/env";
import { decryptWebhookSecret, signWebhookRequest } from "./crypto";
import { readWebhookEgressPolicy, webhookFetchTarget } from "./egress";

const MAX_ATTEMPTS = 8;
const MAX_RESPONSE_EXCERPT_BYTES = 1_000;
const RETRY_DELAYS_MS = [
  30_000, 120_000, 600_000, 3_600_000, 21_600_000, 86_400_000, 172_800_000,
];

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function readWebhookResponseExcerpt(
  response: Response,
  byteLimit = MAX_RESPONSE_EXCERPT_BYTES,
): Promise<string> {
  if (!response.body || byteLimit <= 0) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let complete = false;
  let excerpt = "";
  try {
    while (bytesRead < byteLimit) {
      const next = await reader.read();
      if (next.done) {
        complete = true;
        break;
      }
      const remaining = byteLimit - bytesRead;
      const chunk = next.value.subarray(0, remaining);
      bytesRead += chunk.byteLength;
      excerpt += decoder.decode(chunk, { stream: true });
      if (next.value.byteLength > remaining) break;
    }
    excerpt += decoder.decode();
    return excerpt;
  } finally {
    if (!complete) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

export async function fanoutIntegrationOutbox(
  database: ApiSqlDatabase,
  outboxId: string,
  leaseToken: string,
  now = new Date().toISOString(),
): Promise<string[]> {
  const event = await database.queryFirst<{
    id: string;
    site_id: string;
    type: string;
    schema_version: number;
    aggregate_type: string;
    aggregate_id: string;
    aggregate_version: string | null;
    aggregate_sequence: number;
    actor_id: string | null;
    source: string;
    payload_json: string;
    snapshot_json: string | null;
    occurred_at: string;
  }>(
    `SELECT e.* FROM aria_event_outbox o
     JOIN aria_events e ON e.id = o.event_id
     WHERE o.id = ? AND o.state = 'claimed' AND o.lease_token = ? LIMIT 1`,
    [outboxId, leaseToken],
  );
  if (!event) return [];
  const endpoints = await database.queryAll<{
    id: string;
    url: string;
    payload_mode: "reference" | "published_snapshot";
    active_signing_key_id: string;
  }>(
    `SELECT ep.id, ep.url, ep.payload_mode, ep.active_signing_key_id
     FROM aria_webhook_subscriptions s
     JOIN aria_webhook_endpoints ep ON ep.id = s.endpoint_id
     WHERE s.event_type = ? AND ep.status = 'active'
       AND ep.active_signing_key_id IS NOT NULL`,
    [event.type],
  );
  const statements = [];
  for (const endpoint of endpoints) {
    const id = crypto.randomUUID();
    const body = stableJson({
      id: event.id,
      type: event.type,
      schemaVersion: event.schema_version,
      siteId: event.site_id,
      occurredAt: event.occurred_at,
      aggregate: {
        type: event.aggregate_type,
        id: event.aggregate_id,
        version: event.aggregate_version,
        sequence: event.aggregate_sequence,
      },
      actor: event.actor_id ? { id: event.actor_id } : null,
      source: event.source,
      data:
        endpoint.payload_mode === "published_snapshot" && event.snapshot_json
          ? JSON.parse(event.snapshot_json)
          : JSON.parse(event.payload_json),
    });
    statements.push({
      sql: `INSERT OR IGNORE INTO aria_webhook_deliveries (
        id, event_id, endpoint_id, endpoint_url, payload_mode, body_json,
        body_sha256, webhook_signing_key_id, state, available_at,
        created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM aria_event_outbox
          WHERE id = ? AND state = 'claimed' AND lease_token = ?
        )`,
      params: [
        id,
        event.id,
        endpoint.id,
        endpoint.url,
        endpoint.payload_mode,
        body,
        await sha256Hex(body),
        endpoint.active_signing_key_id,
        now,
        now,
        now,
        outboxId,
        leaseToken,
      ],
    });
  }
  statements.push({
    sql: `UPDATE aria_event_outbox
          SET state = 'dispatched', lease_token = NULL,
              lease_expires_at = NULL, dispatched_at = ?, updated_at = ?
          WHERE id = ? AND state = 'claimed' AND lease_token = ?`,
    params: [now, now, outboxId, leaseToken],
  });
  await database.executeBatch(statements);
  const persistedDeliveries = await database.queryAll<{ id: string }>(
    `SELECT id FROM aria_webhook_deliveries
     WHERE event_id = ? AND state IN ('pending', 'retry_wait')
     ORDER BY created_at, id`,
    [event.id],
  );
  return persistedDeliveries.map((delivery) => delivery.id);
}

export async function deliverWebhook(
  database: ApiSqlDatabase,
  locals: RuntimeLocals,
  deliveryId: string,
  now = new Date().toISOString(),
): Promise<"missing" | "leased" | "delivered" | "retry" | "terminal"> {
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.parse(now) + 120_000).toISOString();
  const claimed = await database.execute(
    `UPDATE aria_webhook_deliveries
     SET state = 'claimed', lease_token = ?, lease_expires_at = ?,
         attempt_count = attempt_count + 1,
         first_attempt_at = COALESCE(first_attempt_at, ?), last_attempt_at = ?,
         updated_at = ?
     WHERE id = ? AND state IN ('pending', 'retry_wait') AND available_at <= ?
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
       AND EXISTS (
         SELECT 1 FROM aria_webhook_endpoints ep
         WHERE ep.id = aria_webhook_deliveries.endpoint_id
           AND ep.status = 'active'
       )`,
    [leaseToken, leaseExpiresAt, now, now, now, deliveryId, now, now],
  );
  if (claimed === 0) {
    const exists = await database.queryFirst<{ id: string }>(
      `SELECT id FROM aria_webhook_deliveries WHERE id = ?`,
      [deliveryId],
    );
    return exists ? "leased" : "missing";
  }
  const row = await database.queryFirst<{
    event_id: string;
    endpoint_id: string;
    endpoint_url: string;
    body_json: string;
    webhook_signing_key_id: string;
    attempt_count: number;
    secret_ciphertext: string;
    key_id: string;
  }>(
    `SELECT d.event_id, d.endpoint_id, d.endpoint_url, d.body_json,
            d.webhook_signing_key_id, d.attempt_count,
            k.secret_ciphertext, k.key_id
     FROM aria_webhook_deliveries d
     JOIN aria_webhook_signing_keys k ON k.id = d.webhook_signing_key_id
     WHERE d.id = ? AND d.lease_token = ? LIMIT 1`,
    [deliveryId, leaseToken],
  );
  if (!row) return "missing";
  const started = Date.now();
  const timestamp = Math.floor(started / 1000);
  let responseStatus: number | null = null;
  let excerpt: string | null = null;
  let errorCode: string | null = null;
  let retryable = false;
  try {
    const secret = await decryptWebhookSecret(
      readApiKeyring(locals, row.key_id),
      row.secret_ciphertext,
      row.endpoint_id,
    );
    const target = webhookFetchTarget(
      row.endpoint_url,
      readWebhookEgressPolicy(locals),
    );
    const response = await fetch(target.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        ...target.headers,
        "Content-Type": "application/json",
        "User-Agent": "Aria-Webhooks/1",
        "X-Aria-Event-Id": row.event_id,
        "X-Aria-Delivery-Id": deliveryId,
        "X-Aria-Timestamp": String(timestamp),
        "X-Aria-Signature": await signWebhookRequest(
          secret,
          timestamp,
          row.event_id,
          row.body_json,
        ),
      },
      body: row.body_json,
    });
    responseStatus = response.status;
    excerpt = await readWebhookResponseExcerpt(response);
    retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500;
    if (response.status >= 300 && response.status < 400) errorCode = "redirect";
    else if (!response.ok)
      errorCode = retryable ? "remote_retryable" : "remote_rejected";
  } catch (error) {
    errorCode =
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "network_error";
    retryable = true;
  }
  const completedAt = new Date().toISOString();
  const delivered =
    responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
  const terminal =
    !delivered && (!retryable || row.attempt_count >= MAX_ATTEMPTS);
  const nextState = delivered
    ? "delivered"
    : terminal
      ? "terminal"
      : "retry_wait";
  const delay =
    RETRY_DELAYS_MS[
      Math.min(row.attempt_count - 1, RETRY_DELAYS_MS.length - 1)
    ] ?? 172_800_000;
  const availableAt = new Date(Date.parse(completedAt) + delay).toISOString();
  await database.executeBatch([
    {
      sql: `INSERT INTO aria_webhook_delivery_attempts (
        id, delivery_id, attempt_number, request_timestamp,
        webhook_signing_key_id, started_at, duration_ms, outcome,
        response_status, response_excerpt, error_code, completed_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM aria_webhook_deliveries
          WHERE id = ? AND lease_token = ?)`,
      params: [
        crypto.randomUUID(),
        deliveryId,
        row.attempt_count,
        timestamp,
        row.webhook_signing_key_id,
        now,
        Math.max(0, Date.now() - started),
        nextState,
        responseStatus,
        excerpt,
        errorCode,
        completedAt,
        deliveryId,
        leaseToken,
      ],
    },
    {
      sql: `UPDATE aria_webhook_deliveries
        SET state = ?, available_at = ?, lease_token = NULL,
            lease_expires_at = NULL, last_status = ?, last_error_code = ?,
            delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
            terminal_at = CASE WHEN ? = 'terminal' THEN ? ELSE terminal_at END,
            updated_at = ?
        WHERE id = ? AND state = 'claimed' AND lease_token = ?`,
      params: [
        nextState,
        availableAt,
        responseStatus,
        errorCode,
        nextState,
        completedAt,
        nextState,
        completedAt,
        completedAt,
        deliveryId,
        leaseToken,
      ],
    },
  ]);
  return delivered ? "delivered" : terminal ? "terminal" : "retry";
}

export async function recoverExpiredWebhookLeases(
  database: ApiSqlDatabase,
  now = new Date().toISOString(),
): Promise<number> {
  return database.execute(
    `UPDATE aria_webhook_deliveries
     SET state = 'retry_wait', lease_token = NULL, lease_expires_at = NULL,
         available_at = ?, last_error_code = 'lease_expired', updated_at = ?
     WHERE state = 'claimed' AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ?`,
    [now, now, now],
  );
}
