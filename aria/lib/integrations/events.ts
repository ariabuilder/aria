import { z } from "zod";
import { stableJson } from "../api/crypto";

export const IntegrationEventTypeSchema = z.enum([
  "cms.entry.created.v1",
  "cms.entry.updated.v1",
  "cms.entry.published.v1",
  "cms.entry.updated_published.v1",
  "cms.entry.unpublished.v1",
  "cms.entry.archived.v1",
  "cms.entry.deleted.v1",
  "page.draft.created.v1",
  "page.draft.updated.v1",
  "page.published.v1",
  "page.unpublished.v1",
  "page.archived.v1",
  "page.deleted.v1",
  "cms.collection.deleted.v1",
  "media.created.v1",
  "figma.import.completed.v1",
]);
export type IntegrationEventType = z.infer<typeof IntegrationEventTypeSchema>;

export const IntegrationEventSourceSchema = z.enum([
  "studio",
  "site_api",
  "oauth",
  "system",
  "import",
]);
export type IntegrationEventSource = z.infer<
  typeof IntegrationEventSourceSchema
>;

export const IntegrationEventCommitSchema = z
  .object({
    id: z.uuid(),
    outboxId: z.uuid(),
    type: IntegrationEventTypeSchema,
    aggregateType: z.string().trim().min(1).max(80),
    aggregateId: z.string().trim().min(1).max(200),
    aggregateVersion: z.string().trim().min(1).nullable(),
    actorId: z.string().trim().min(1).nullable(),
    source: IntegrationEventSourceSchema,
    requestId: z.string().trim().min(1).nullable(),
    idempotencyId: z.string().trim().min(1).nullable().default(null),
    payload: z.record(z.string(), z.unknown()),
    snapshot: z.record(z.string(), z.unknown()).nullable().default(null),
    snapshotSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable()
      .default(null),
    isTombstone: z.boolean().default(false),
    occurredAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type IntegrationEventCommit = z.input<
  typeof IntegrationEventCommitSchema
>;

export type IntegrationSqlStatement = Readonly<{
  sql: string;
  args: readonly unknown[];
}>;

export function buildIntegrationEventStatements(
  rawEvent: IntegrationEventCommit,
  guard: Readonly<{ sql: string; args: readonly unknown[] }> = {
    sql: "1 = 1",
    args: [],
  },
): IntegrationSqlStatement[] {
  const event = IntegrationEventCommitSchema.parse(rawEvent);
  const now = event.occurredAt;
  return [
    {
      sql: `INSERT OR IGNORE INTO aria_event_aggregate_heads (
        site_id, aggregate_type, aggregate_id, last_sequence, updated_at
      ) SELECT site_id, ?, ?, 0, ? FROM aria_site_identity
        WHERE singleton_id = 1 AND ${guard.sql}`,
      args: [event.aggregateType, event.aggregateId, now, ...guard.args],
    },
    {
      sql: `UPDATE aria_event_aggregate_heads
        SET last_sequence = last_sequence + 1, updated_at = ?
        WHERE site_id = (SELECT site_id FROM aria_site_identity WHERE singleton_id = 1)
          AND aggregate_type = ? AND aggregate_id = ? AND ${guard.sql}`,
      args: [now, event.aggregateType, event.aggregateId, ...guard.args],
    },
    {
      sql: `INSERT INTO aria_events (
        id, site_id, type, schema_version, aggregate_type, aggregate_id,
        aggregate_version, aggregate_sequence, actor_id, source, request_id,
        idempotency_id, payload_json, snapshot_json, snapshot_sha256,
        is_tombstone, occurred_at, created_at, expires_at
      ) SELECT ?, site_id, ?, 1, ?, ?, ?, last_sequence, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM aria_event_aggregate_heads
        WHERE site_id = (SELECT site_id FROM aria_site_identity WHERE singleton_id = 1)
          AND aggregate_type = ? AND aggregate_id = ? AND ${guard.sql}`,
      args: [
        event.id,
        event.type,
        event.aggregateType,
        event.aggregateId,
        event.aggregateVersion,
        event.actorId,
        event.source,
        event.requestId,
        event.idempotencyId,
        JSON.stringify(event.payload),
        event.snapshot ? JSON.stringify(event.snapshot) : null,
        event.snapshotSha256,
        event.isTombstone ? 1 : 0,
        event.occurredAt,
        now,
        event.expiresAt,
        event.aggregateType,
        event.aggregateId,
        ...guard.args,
      ],
    },
    {
      sql: `INSERT INTO aria_event_outbox (
        id, event_id, state, available_at, created_at, updated_at
      ) SELECT ?, ?, 'pending', ?, ?, ? WHERE ${guard.sql}`,
      args: [event.outboxId, event.id, now, now, now, ...guard.args],
    },
    {
      sql: `INSERT INTO aria_integration_audit (
        id, site_id, request_id, event_type, actor_id, resource_type, resource_id, outcome,
        metadata_json, created_at, expires_at
      ) SELECT ?, site_id, ?, 'event.committed', ?, ?, ?, 'success', ?, ?, ?
        FROM aria_site_identity WHERE singleton_id = 1 AND ${guard.sql}`,
      args: [
        crypto.randomUUID(),
        event.requestId,
        event.actorId,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify({ eventId: event.id, type: event.type }),
        now,
        event.expiresAt,
        ...guard.args,
      ],
    },
  ];
}

export function createIntegrationEvent(input: {
  type: IntegrationEventType;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: string | null;
  actorId?: string | null;
  source: IntegrationEventSource;
  requestId?: string | null;
  idempotencyId?: string | null;
  payload: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
  snapshotSha256?: string | null;
  isTombstone?: boolean;
  occurredAt?: string;
  retentionDays?: number;
}): IntegrationEventCommit {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    outboxId: crypto.randomUUID(),
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion ?? null,
    actorId: input.actorId ?? null,
    source: input.source,
    requestId: input.requestId ?? null,
    idempotencyId: input.idempotencyId ?? null,
    payload: input.payload,
    snapshot: input.snapshot ?? null,
    snapshotSha256: input.snapshotSha256 ?? null,
    isTombstone: input.isTombstone ?? false,
    occurredAt,
    expiresAt: new Date(
      Date.parse(occurredAt) + (input.retentionDays ?? 90) * 86_400_000,
    ).toISOString(),
  };
}

export async function hashIntegrationSnapshot(
  snapshot: Record<string, unknown>,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableJson(snapshot)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
