import {
  mapClaimedCmsEntryRow,
  mapDueCmsEntryRow,
  type ClaimedCmsEntry,
  type DueCmsEntry,
  type ScheduleSqlExecutor,
} from "./schemas";

function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 100);
}

export async function findDueCmsEntries(
  sql: ScheduleSqlExecutor,
  now: string,
  limit: number,
): Promise<DueCmsEntry[]> {
  const rows = await sql.all(
    `SELECT id, collection_id, version, scheduled_version, scheduled_for,
            schedule_attempt_count, schedule_lease_token,
            schedule_lease_expires_at, last_schedule_error
     FROM aria_entries
     WHERE status = 'scheduled'
       AND scheduled_for IS NOT NULL
       AND scheduled_version IS NOT NULL
       AND scheduled_for <= ?
       AND (schedule_lease_expires_at IS NULL OR schedule_lease_expires_at <= ?)
     ORDER BY scheduled_for ASC
     LIMIT ?`,
    [now, now, clampLimit(limit)],
  );
  return rows.map(mapDueCmsEntryRow);
}

export async function claimDueCmsEntry(
  sql: ScheduleSqlExecutor,
  input: Pick<DueCmsEntry, "id" | "collectionId">,
  now: string,
  leaseToken: string,
  leaseExpiresAt: string,
): Promise<ClaimedCmsEntry | null> {
  await sql.run(
    `UPDATE aria_entries
     SET schedule_lease_token = ?,
         schedule_lease_expires_at = ?,
         schedule_attempt_count = schedule_attempt_count + 1,
         updated_at = ?
     WHERE id = ?
       AND collection_id = ?
       AND status = 'scheduled'
       AND scheduled_for IS NOT NULL
       AND scheduled_version IS NOT NULL
       AND scheduled_for <= ?
       AND (schedule_lease_expires_at IS NULL OR schedule_lease_expires_at <= ?)`,
    [leaseToken, leaseExpiresAt, now, input.id, input.collectionId, now, now],
  );

  const rows = await sql.all(
    `SELECT id, collection_id, version, scheduled_version, scheduled_for,
            schedule_attempt_count, schedule_lease_token,
            schedule_lease_expires_at, last_schedule_error
     FROM aria_entries
     WHERE id = ?
       AND collection_id = ?
       AND schedule_lease_token = ?
     LIMIT 1`,
    [input.id, input.collectionId, leaseToken],
  );

  const row = rows[0];
  return row === undefined ? null : mapClaimedCmsEntryRow(row);
}

export async function recoverExpiredCmsScheduleLeases(
  sql: ScheduleSqlExecutor,
  now: string,
): Promise<number> {
  const result = await sql.run(
    `UPDATE aria_entries
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         updated_at = ?
     WHERE status = 'scheduled'
       AND schedule_lease_token IS NOT NULL
       AND schedule_lease_expires_at IS NOT NULL
       AND schedule_lease_expires_at <= ?`,
    [now, now],
  );
  return result.changes;
}

export async function releaseCmsScheduleLease(
  sql: ScheduleSqlExecutor,
  input: Pick<DueCmsEntry, "id" | "collectionId">,
  leaseToken: string,
  now: string,
): Promise<boolean> {
  const result = await sql.run(
    `UPDATE aria_entries
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         scheduled_for = NULL,
         scheduled_version = NULL,
         last_schedule_error = NULL,
         updated_at = ?
     WHERE id = ?
       AND collection_id = ?
       AND schedule_lease_token = ?`,
    [now, input.id, input.collectionId, leaseToken],
  );
  return result.changes > 0;
}

export async function recordCmsScheduleFailure(
  sql: ScheduleSqlExecutor,
  input: Pick<DueCmsEntry, "id" | "collectionId">,
  leaseToken: string,
  errorMessage: string,
  now: string,
  maxAttempts: number,
): Promise<boolean> {
  const message = errorMessage.slice(0, 500);
  const exhausted = await sql.run(
    `UPDATE aria_entries
     SET status = 'draft',
         scheduled_for = NULL,
         scheduled_version = NULL,
         schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = ?,
         updated_at = ?
     WHERE id = ?
       AND collection_id = ?
       AND schedule_lease_token = ?
       AND schedule_attempt_count >= ?`,
    [message, now, input.id, input.collectionId, leaseToken, maxAttempts],
  );
  if (exhausted.changes > 0) {
    return true;
  }

  const result = await sql.run(
    `UPDATE aria_entries
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = ?,
         updated_at = ?
     WHERE id = ?
       AND collection_id = ?
       AND schedule_lease_token = ?`,
    [message, now, input.id, input.collectionId, leaseToken],
  );
  return result.changes > 0;
}

export async function clearCmsScheduleFailure(
  sql: ScheduleSqlExecutor,
  input: Pick<DueCmsEntry, "id" | "collectionId">,
  now: string,
): Promise<void> {
  await sql.run(
    `UPDATE aria_entries
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = NULL,
         updated_at = ?
     WHERE id = ?
       AND collection_id = ?`,
    [now, input.id, input.collectionId],
  );
}
