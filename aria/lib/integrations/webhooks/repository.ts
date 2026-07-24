import { z } from "zod";

import type { ApiKeyring } from "../../api/crypto";
import type { ApiSqlDatabase } from "../../api/database";
import {
  IntegrationEventTypeSchema,
  type IntegrationEventType,
} from "../events";
import { createWebhookSigningSecret, encryptWebhookSecret } from "./crypto";

export const EnabledWebhookEventTypes = [
  "cms.entry.created.v1",
  "cms.entry.updated.v1",
  "cms.entry.published.v1",
  "cms.entry.updated_published.v1",
  "cms.entry.unpublished.v1",
  "cms.entry.archived.v1",
] as const satisfies readonly IntegrationEventType[];

export const EnabledWebhookEventTypeSchema = z.enum(EnabledWebhookEventTypes);

export type EnabledWebhookEventType = z.infer<
  typeof EnabledWebhookEventTypeSchema
>;

export type WebhookEndpointPublic = Readonly<{
  id: string;
  name: string;
  url: string;
  status: "active" | "paused" | "disabled";
  secretPrefix: string;
  payloadMode: "reference" | "published_snapshot";
  eventTypes: IntegrationEventType[];
  createdAt: string;
  updatedAt: string;
}>;

export const CreateWebhookEndpointSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: z.url(),
    payloadMode: z
      .enum(["reference", "published_snapshot"])
      .default("reference"),
    eventTypes: z.array(EnabledWebhookEventTypeSchema).min(1).max(30),
  })
  .strict();

export const UpdateWebhookSubscriptionsSchema = z
  .object({
    id: z.uuid(),
    eventTypes: z.array(EnabledWebhookEventTypeSchema).min(1).max(30),
  })
  .strict();

function assertSnapshotEventsAllowed(
  payloadMode: "reference" | "published_snapshot",
  eventTypes: readonly IntegrationEventType[],
): void {
  if (
    payloadMode === "published_snapshot" &&
    eventTypes.some(
      (eventType) =>
        eventType !== "cms.entry.published.v1" &&
        eventType !== "cms.entry.updated_published.v1",
    )
  ) {
    throw new Error("WEBHOOK_SNAPSHOT_EVENT_NOT_ALLOWED");
  }
}

export class WebhookRepository {
  constructor(private readonly database: ApiSqlDatabase) {}

  async createEndpoint(input: {
    siteId: string;
    actorId: string;
    name: string;
    normalizedUrl: string;
    payloadMode: "reference" | "published_snapshot";
    eventTypes: readonly EnabledWebhookEventType[];
    keyring: ApiKeyring;
    now?: string;
  }): Promise<{ id: string; secret: string; secretPrefix: string }> {
    assertSnapshotEventsAllowed(input.payloadMode, input.eventTypes);
    const now = input.now ?? new Date().toISOString();
    const id = crypto.randomUUID();
    const keyId = crypto.randomUUID();
    const generated = createWebhookSigningSecret();
    const ciphertext = await encryptWebhookSecret(
      input.keyring,
      generated.secret,
      id,
    );
    await this.database.executeBatch([
      {
        sql: `INSERT INTO aria_webhook_endpoints (
          id, site_id, name, url, status, active_signing_key_id,
          secret_prefix, created_by_id, payload_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?)`,
        params: [
          id,
          input.siteId,
          input.name,
          input.normalizedUrl,
          generated.prefix,
          input.actorId,
          input.payloadMode,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO aria_webhook_signing_keys (
          id, endpoint_id, version, secret_ciphertext, key_id, status, created_at
        ) VALUES (?, ?, 1, ?, ?, 'active', ?)`,
        params: [keyId, id, ciphertext, input.keyring.keyId, now],
      },
      {
        sql: `UPDATE aria_webhook_endpoints
              SET active_signing_key_id = ? WHERE id = ?`,
        params: [keyId, id],
      },
      ...Array.from(new Set(input.eventTypes)).map((eventType) => ({
        sql: `INSERT INTO aria_webhook_subscriptions (
          id, endpoint_id, event_type, filters_json, created_by_id, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?)`,
        params: [crypto.randomUUID(), id, eventType, input.actorId, now],
      })),
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) VALUES (?, ?, 'webhook.endpoint.created', ?, 'webhook.endpoint', ?,
                  'success', ?, ?, ?)`,
        params: [
          crypto.randomUUID(),
          input.siteId,
          input.actorId,
          id,
          JSON.stringify({ eventTypes: input.eventTypes }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
        ],
      },
    ]);
    return { id, secret: generated.secret, secretPrefix: generated.prefix };
  }

  async getEndpointUrl(id: string): Promise<string | null> {
    const row = await this.database.queryFirst<{ url: string }>(
      `SELECT url FROM aria_webhook_endpoints WHERE id = ? LIMIT 1`,
      [id],
    );
    return row?.url ?? null;
  }

  async rotateSigningKey(input: {
    endpointId: string;
    actorId: string;
    keyring: ApiKeyring;
    overlapMs?: number;
    now?: string;
  }): Promise<{ secret: string; secretPrefix: string; version: number }> {
    const now = input.now ?? new Date().toISOString();
    const endpoint = await this.database.queryFirst<{
      active_signing_key_id: string;
      site_id: string;
    }>(
      `SELECT active_signing_key_id FROM aria_webhook_endpoints
       WHERE id = ? LIMIT 1`,
      [input.endpointId],
    );
    if (!endpoint?.active_signing_key_id) throw new Error("WEBHOOK_NOT_FOUND");
    const versionRow = await this.database.queryFirst<{ next_version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM aria_webhook_signing_keys WHERE endpoint_id = ?`,
      [input.endpointId],
    );
    const version = Number(versionRow?.next_version ?? 1);
    const generated = createWebhookSigningSecret();
    const keyId = crypto.randomUUID();
    const ciphertext = await encryptWebhookSecret(
      input.keyring,
      generated.secret,
      input.endpointId,
    );
    const retireAfter = new Date(
      Date.parse(now) + (input.overlapMs ?? 7 * 86_400_000),
    ).toISOString();
    await this.database.executeBatch([
      {
        sql: `UPDATE aria_webhook_signing_keys
              SET status = 'retiring', retire_after = ?
              WHERE id = ? AND endpoint_id = ? AND status = 'active'`,
        params: [retireAfter, endpoint.active_signing_key_id, input.endpointId],
      },
      {
        sql: `INSERT INTO aria_webhook_signing_keys (
          id, endpoint_id, version, secret_ciphertext, key_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        params: [
          keyId,
          input.endpointId,
          version,
          ciphertext,
          input.keyring.keyId,
          now,
        ],
      },
      {
        sql: `UPDATE aria_webhook_endpoints
              SET active_signing_key_id = ?, secret_prefix = ?, updated_at = ?
              WHERE id = ? AND active_signing_key_id = ?`,
        params: [
          keyId,
          generated.prefix,
          now,
          input.endpointId,
          endpoint.active_signing_key_id,
        ],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, site_id, 'webhook.signing_key.rotated', ?,
                 'webhook.endpoint', id, 'success', ?, ?, ?
          FROM aria_webhook_endpoints
          WHERE id = ? AND active_signing_key_id = ?`,
        params: [
          crypto.randomUUID(),
          input.actorId,
          JSON.stringify({ version, retireAfter }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
          input.endpointId,
          keyId,
        ],
      },
    ]);
    return { ...generated, secretPrefix: generated.prefix, version };
  }

  async listEndpoints(): Promise<WebhookEndpointPublic[]> {
    const endpoints = await this.database.queryAll<{
      id: string;
      name: string;
      url: string;
      status: WebhookEndpointPublic["status"];
      secret_prefix: string;
      payload_mode: WebhookEndpointPublic["payloadMode"];
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, url, status, secret_prefix, payload_mode,
              created_at, updated_at
       FROM aria_webhook_endpoints ORDER BY created_at DESC`,
    );
    const subscriptions = await this.database.queryAll<{
      endpoint_id: string;
      event_type: string;
    }>(
      `SELECT endpoint_id, event_type FROM aria_webhook_subscriptions
       ORDER BY event_type`,
    );
    const eventTypesByEndpoint = new Map<string, IntegrationEventType[]>();
    for (const subscription of subscriptions) {
      const eventType = IntegrationEventTypeSchema.parse(
        subscription.event_type,
      );
      const eventTypes =
        eventTypesByEndpoint.get(subscription.endpoint_id) ?? [];
      eventTypes.push(eventType);
      eventTypesByEndpoint.set(subscription.endpoint_id, eventTypes);
    }
    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      status: endpoint.status,
      secretPrefix: endpoint.secret_prefix,
      payloadMode: endpoint.payload_mode,
      eventTypes: eventTypesByEndpoint.get(endpoint.id) ?? [],
      createdAt: endpoint.created_at,
      updatedAt: endpoint.updated_at,
    }));
  }

  async updateSubscriptions(input: {
    endpointId: string;
    actorId: string;
    eventTypes: readonly EnabledWebhookEventType[];
    now?: string;
  }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    const endpoint = await this.database.queryFirst<{
      payload_mode: "reference" | "published_snapshot";
    }>(`SELECT payload_mode FROM aria_webhook_endpoints WHERE id = ? LIMIT 1`, [
      input.endpointId,
    ]);
    if (!endpoint) throw new Error("WEBHOOK_NOT_FOUND");
    assertSnapshotEventsAllowed(endpoint.payload_mode, input.eventTypes);
    const eventTypes = Array.from(new Set(input.eventTypes));
    const results = await this.database.executeBatch([
      {
        sql: `UPDATE aria_webhook_endpoints SET updated_at = ? WHERE id = ?`,
        params: [now, input.endpointId],
      },
      {
        sql: `DELETE FROM aria_webhook_subscriptions WHERE endpoint_id = ?`,
        params: [input.endpointId],
      },
      ...eventTypes.map((eventType) => ({
        sql: `INSERT INTO aria_webhook_subscriptions (
          id, endpoint_id, event_type, filters_json, created_by_id, created_at
        ) VALUES (?, ?, ?, NULL, ?, ?)`,
        params: [
          crypto.randomUUID(),
          input.endpointId,
          eventType,
          input.actorId,
          now,
        ],
      })),
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, site_id, 'webhook.subscriptions.updated', ?,
                 'webhook.endpoint', id, 'success', ?, ?, ?
          FROM aria_webhook_endpoints WHERE id = ?`,
        params: [
          crypto.randomUUID(),
          input.actorId,
          JSON.stringify({ eventTypes }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
          input.endpointId,
        ],
      },
    ]);
    return (results[0] ?? 0) > 0;
  }

  async setEndpointStatus(input: {
    endpointId: string;
    actorId: string;
    status: "active" | "paused" | "disabled";
    reason?: string | null;
    now?: string;
  }): Promise<boolean> {
    const now = input.now ?? new Date().toISOString();
    const results = await this.database.executeBatch([
      {
        sql: `UPDATE aria_webhook_endpoints
              SET status = ?, disabled_at = ?, disabled_reason = ?, updated_at = ?
              WHERE id = ?`,
        params: [
          input.status,
          input.status === "disabled" ? now : null,
          input.status === "disabled"
            ? (input.reason ?? "administrator")
            : null,
          now,
          input.endpointId,
        ],
      },
      {
        sql: `UPDATE aria_webhook_deliveries
              SET state = 'cancelled', terminal_at = ?,
                  lease_token = NULL, lease_expires_at = NULL,
                  last_error_code = 'endpoint_disabled', updated_at = ?
              WHERE endpoint_id = ? AND ? = 'disabled'
                AND state IN ('pending', 'claimed', 'retry_wait')`,
        params: [now, now, input.endpointId, input.status],
      },
      {
        sql: `INSERT INTO aria_integration_audit (
          id, site_id, event_type, actor_id, resource_type, resource_id,
          outcome, metadata_json, created_at, expires_at
        ) SELECT ?, site_id, 'webhook.endpoint.status_changed', ?,
                 'webhook.endpoint', id, 'success', ?, ?, ?
          FROM aria_webhook_endpoints WHERE id = ?`,
        params: [
          crypto.randomUUID(),
          input.actorId,
          JSON.stringify({
            status: input.status,
            reason: input.reason ?? null,
          }),
          now,
          new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
          input.endpointId,
        ],
      },
    ]);
    return (results[0] ?? 0) > 0;
  }
}
