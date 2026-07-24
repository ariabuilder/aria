import type { ApiSqlDatabase } from "../../api/database";

export type WebhookDeliveryPublic = Readonly<{
  id: string;
  eventId: string;
  eventType: string;
  endpointId: string;
  endpointName: string;
  state:
    | "pending"
    | "claimed"
    | "retry_wait"
    | "delivered"
    | "terminal"
    | "cancelled";
  attemptCount: number;
  lastStatus: number | null;
  lastErrorCode: string | null;
  availableAt: string;
  updatedAt: string;
}>;

export async function getWebhookDeliveryOverview(database: ApiSqlDatabase) {
  const rows = await database.queryAll<{
    state: string;
    total: number;
    oldest: string | null;
  }>(
    `SELECT state, COUNT(*) AS total, MIN(created_at) AS oldest
     FROM aria_webhook_deliveries GROUP BY state ORDER BY state`,
  );
  return rows.map((row) => ({
    state: row.state,
    total: Number(row.total),
    oldest: row.oldest,
  }));
}

export async function listRecentWebhookDeliveries(
  database: ApiSqlDatabase,
  limit = 30,
): Promise<WebhookDeliveryPublic[]> {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const rows = await database.queryAll<{
    id: string;
    event_id: string;
    event_type: string;
    endpoint_id: string;
    endpoint_name: string;
    state: WebhookDeliveryPublic["state"];
    attempt_count: number;
    last_status: number | null;
    last_error_code: string | null;
    available_at: string;
    updated_at: string;
  }>(
    `SELECT d.id, d.event_id, e.type AS event_type, d.endpoint_id,
            ep.name AS endpoint_name, d.state, d.attempt_count,
            d.last_status, d.last_error_code, d.available_at, d.updated_at
     FROM aria_webhook_deliveries d
     JOIN aria_events e ON e.id = d.event_id
     JOIN aria_webhook_endpoints ep ON ep.id = d.endpoint_id
     ORDER BY d.updated_at DESC, d.id DESC LIMIT ?`,
    [boundedLimit],
  );
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    endpointId: row.endpoint_id,
    endpointName: row.endpoint_name,
    state: row.state,
    attemptCount: Number(row.attempt_count),
    lastStatus: row.last_status == null ? null : Number(row.last_status),
    lastErrorCode: row.last_error_code,
    availableAt: row.available_at,
    updatedAt: row.updated_at,
  }));
}

export async function retryTerminalWebhookDelivery(input: {
  database: ApiSqlDatabase;
  deliveryId: string;
  actorId: string;
  reason: string;
  now?: string;
}): Promise<boolean> {
  const now = input.now ?? new Date().toISOString();
  const results = await input.database.executeBatch([
    {
      sql: `UPDATE aria_webhook_deliveries
            SET state = 'pending', available_at = ?, terminal_at = NULL,
                last_error_code = NULL, updated_at = ?
            WHERE id = ? AND state = 'terminal'`,
      params: [now, now, input.deliveryId],
    },
    {
      sql: `INSERT INTO aria_integration_audit (
        id, event_type, actor_id, resource_type, resource_id, outcome,
        metadata_json, created_at, expires_at
      ) SELECT ?, 'webhook.delivery.manual_retry', ?, 'webhook.delivery', id,
               'success', ?, ?, ?
        FROM aria_webhook_deliveries WHERE id = ? AND changes() > 0`,
      params: [
        crypto.randomUUID(),
        input.actorId,
        JSON.stringify({ reason: input.reason }),
        now,
        new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
        input.deliveryId,
      ],
    },
  ]);
  return (results[0] ?? 0) > 0;
}

export async function purgeWebhookRetention(input: {
  database: ApiSqlDatabase;
  before: string;
  now?: string;
  limit?: number;
}): Promise<number> {
  const limit = Math.min(Math.max(input.limit ?? 250, 1), 1_000);
  const now = input.now ?? new Date().toISOString();
  let purged = 0;
  purged += await input.database.execute(
    `DELETE FROM aria_webhook_delivery_attempts WHERE id IN (
       SELECT a.id FROM aria_webhook_delivery_attempts a
       JOIN aria_webhook_deliveries d ON d.id = a.delivery_id
       WHERE d.state IN ('delivered', 'terminal', 'cancelled')
         AND a.completed_at < ? ORDER BY a.completed_at LIMIT ?
     )`,
    [input.before, limit],
  );
  purged += await input.database.execute(
    `DELETE FROM aria_webhook_deliveries WHERE id IN (
       SELECT id FROM aria_webhook_deliveries
       WHERE state IN ('delivered', 'cancelled') AND updated_at < ?
       ORDER BY updated_at LIMIT ?
     )`,
    [input.before, limit],
  );
  await input.database.execute(
    `UPDATE aria_webhook_signing_keys
     SET secret_ciphertext = '', status = 'retired', destroyed_at = ?
     WHERE status = 'retiring' AND retire_after <= ?
       AND NOT EXISTS (
         SELECT 1 FROM aria_webhook_deliveries d
         WHERE d.webhook_signing_key_id = aria_webhook_signing_keys.id
           AND d.state IN ('pending', 'claimed', 'retry_wait')
       )`,
    [now, now],
  );
  purged += await input.database.execute(
    `DELETE FROM aria_event_outbox WHERE id IN (
       SELECT id FROM aria_event_outbox
       WHERE state = 'dispatched' AND updated_at < ?
       ORDER BY updated_at LIMIT ?
     )`,
    [input.before, limit],
  );
  purged += await input.database.execute(
    `DELETE FROM aria_events WHERE id IN (
       SELECT e.id FROM aria_events e
       WHERE e.expires_at < ?
         AND NOT EXISTS (SELECT 1 FROM aria_webhook_deliveries d WHERE d.event_id = e.id)
       ORDER BY e.expires_at LIMIT ?
     )`,
    [input.before, limit],
  );
  return purged;
}
