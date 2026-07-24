import { z } from "zod";

import { D1ApiSqlDatabase } from "../lib/api/database";
import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import {
  deliverWebhook,
  fanoutIntegrationOutbox,
  recoverExpiredWebhookLeases,
} from "../lib/integrations/webhooks/delivery";
import { purgeWebhookRetention } from "../lib/integrations/webhooks/maintenance";

const WakeupSchema = z.union([
  z.object({ outboxId: z.uuid() }).strict(),
  z.object({ deliveryId: z.uuid() }).strict(),
]);
export type IntegrationWakeup = z.infer<typeof WakeupSchema>;
export interface IntegrationMessageHandle {
  readonly body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}
export interface IntegrationMessageBatch {
  readonly queue?: string;
  readonly messages: readonly IntegrationMessageHandle[];
}

function database(env: AriaCloudflareEnv): D1ApiSqlDatabase {
  if (!env.aria_db) throw new Error("ARIA_DB_UNAVAILABLE");
  return new D1ApiSqlDatabase(
    env.aria_db as unknown as ConstructorParameters<typeof D1ApiSqlDatabase>[0],
  );
}

async function processOutbox(
  env: AriaCloudflareEnv,
  outboxId: string,
): Promise<void> {
  const db = database(env);
  const now = new Date().toISOString();
  const leaseToken = crypto.randomUUID();
  const claimed = await db.execute(
    `UPDATE aria_event_outbox
     SET state = 'claimed', lease_token = ?, lease_expires_at = ?,
         dispatch_attempts = dispatch_attempts + 1, updated_at = ?
     WHERE id = ? AND state = 'pending' AND available_at <= ?
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    [
      leaseToken,
      new Date(Date.parse(now) + 120_000).toISOString(),
      now,
      outboxId,
      now,
      now,
    ],
  );
  if (claimed === 0) return;
  const deliveryIds = await fanoutIntegrationOutbox(
    db,
    outboxId,
    leaseToken,
    now,
  );
  for (const deliveryId of deliveryIds) {
    await env.aria_integration_queue?.send({ deliveryId });
  }
}

export async function handleIntegrationQueue(
  batch: IntegrationMessageBatch,
  env: AriaCloudflareEnv,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = WakeupSchema.safeParse(message.body);
    if (!parsed.success) {
      message.ack();
      continue;
    }
    if (batch.queue?.endsWith("-dlq")) {
      const now = new Date().toISOString();
      const db = database(env);
      if ("deliveryId" in parsed.data) {
        await db.execute(
          `UPDATE aria_webhook_deliveries
           SET queue_exhausted_at = ?, updated_at = ? WHERE id = ?`,
          [now, now, parsed.data.deliveryId],
        );
      } else {
        await db.execute(
          `UPDATE aria_event_outbox
           SET state = 'pending', lease_token = NULL, lease_expires_at = NULL,
               last_error_code = 'queue_exhausted', updated_at = ?
           WHERE id = ? AND state <> 'dispatched'`,
          [now, parsed.data.outboxId],
        );
      }
      message.ack();
      continue;
    }
    try {
      if ("outboxId" in parsed.data) {
        await processOutbox(env, parsed.data.outboxId);
      } else {
        await deliverWebhook(
          database(env),
          { cfBindings: env },
          parsed.data.deliveryId,
        );
      }
      message.ack();
    } catch {
      message.retry();
    }
  }
}

export async function reconcileIntegrationDeliveries(
  env: AriaCloudflareEnv,
): Promise<void> {
  const db = database(env);
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE aria_event_outbox
     SET state = 'pending', lease_token = NULL, lease_expires_at = NULL,
         last_error_code = 'lease_expired', updated_at = ?
     WHERE state = 'claimed' AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ?`,
    [now, now],
  );
  await recoverExpiredWebhookLeases(db, now);
  const outbox = await db.queryAll<{ id: string }>(
    `SELECT id FROM aria_event_outbox
     WHERE state = 'pending' AND available_at <= ?
     ORDER BY available_at, created_at LIMIT 50`,
    [now],
  );
  for (const row of outbox) await processOutbox(env, row.id);
  const deliveries = await db.queryAll<{ id: string }>(
    `SELECT d.id FROM aria_webhook_deliveries d
     JOIN aria_webhook_endpoints ep ON ep.id = d.endpoint_id
     WHERE d.state IN ('pending', 'retry_wait') AND d.available_at <= ?
       AND ep.status = 'active'
     ORDER BY d.available_at, d.created_at LIMIT 50`,
    [now],
  );
  for (const row of deliveries) {
    await deliverWebhook(db, { cfBindings: env }, row.id, now);
  }
  await purgeWebhookRetention({
    database: db,
    before: new Date(Date.parse(now) - 90 * 86_400_000).toISOString(),
    now,
    limit: 250,
  });
}
