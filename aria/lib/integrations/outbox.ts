import { z } from "zod";

export interface IntegrationSqlExecutor {
  run(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<{ changes: number }>;
  all(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<readonly unknown[]>;
}

const OutboxRowSchema = z.looseObject({
  id: z.string().min(1),
  event_id: z.string().min(1),
  state: z.enum(["pending", "claimed", "dispatched"]),
  available_at: z.string().min(1),
  lease_token: z.string().nullable(),
  lease_expires_at: z.string().nullable(),
  dispatch_attempts: z.coerce.number().int().nonnegative(),
});

export type IntegrationOutboxItem = Readonly<{
  id: string;
  eventId: string;
  state: "pending" | "claimed" | "dispatched";
  availableAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  dispatchAttempts: number;
}>;

function mapRow(input: unknown): IntegrationOutboxItem {
  const row = OutboxRowSchema.parse(input);
  return {
    id: row.id,
    eventId: row.event_id,
    state: row.state,
    availableAt: row.available_at,
    leaseToken: row.lease_token,
    leaseExpiresAt: row.lease_expires_at,
    dispatchAttempts: row.dispatch_attempts,
  };
}

export async function findDueIntegrationOutbox(
  sql: IntegrationSqlExecutor,
  now: string,
  limit = 50,
): Promise<IntegrationOutboxItem[]> {
  const rows = await sql.all(
    `SELECT id, event_id, state, available_at, lease_token, lease_expires_at,
            dispatch_attempts
     FROM aria_event_outbox
     WHERE state = 'pending' AND available_at <= ?
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
     ORDER BY available_at, created_at, id LIMIT ?`,
    [now, now, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(mapRow);
}

export async function claimIntegrationOutbox(
  sql: IntegrationSqlExecutor,
  id: string,
  now: string,
  leaseToken: string,
  leaseExpiresAt: string,
): Promise<IntegrationOutboxItem | null> {
  const claimed = await sql.run(
    `UPDATE aria_event_outbox
     SET state = 'claimed', lease_token = ?, lease_expires_at = ?,
         dispatch_attempts = dispatch_attempts + 1, updated_at = ?
     WHERE id = ? AND state = 'pending' AND available_at <= ?
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    [leaseToken, leaseExpiresAt, now, id, now, now],
  );
  if (claimed.changes === 0) return null;
  const rows = await sql.all(
    `SELECT id, event_id, state, available_at, lease_token, lease_expires_at,
            dispatch_attempts FROM aria_event_outbox
     WHERE id = ? AND lease_token = ? LIMIT 1`,
    [id, leaseToken],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function releaseIntegrationOutbox(
  sql: IntegrationSqlExecutor,
  id: string,
  leaseToken: string,
  availableAt: string,
  errorCode: string,
  now: string,
): Promise<boolean> {
  const result = await sql.run(
    `UPDATE aria_event_outbox
     SET state = 'pending', available_at = ?, lease_token = NULL,
         lease_expires_at = NULL, last_error_code = ?, updated_at = ?
     WHERE id = ? AND state = 'claimed' AND lease_token = ?`,
    [availableAt, errorCode.slice(0, 80), now, id, leaseToken],
  );
  return result.changes > 0;
}

export async function markIntegrationOutboxDispatched(
  sql: IntegrationSqlExecutor,
  id: string,
  leaseToken: string,
  now: string,
): Promise<boolean> {
  const result = await sql.run(
    `UPDATE aria_event_outbox
     SET state = 'dispatched', lease_token = NULL, lease_expires_at = NULL,
         last_error_code = NULL, dispatched_at = ?, updated_at = ?
     WHERE id = ? AND state = 'claimed' AND lease_token = ?`,
    [now, now, id, leaseToken],
  );
  return result.changes > 0;
}

export async function recoverExpiredIntegrationOutboxLeases(
  sql: IntegrationSqlExecutor,
  now: string,
): Promise<number> {
  const result = await sql.run(
    `UPDATE aria_event_outbox
     SET state = 'pending', lease_token = NULL, lease_expires_at = NULL,
         last_error_code = 'lease_expired', updated_at = ?
     WHERE state = 'claimed' AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= ?`,
    [now, now],
  );
  return result.changes;
}
