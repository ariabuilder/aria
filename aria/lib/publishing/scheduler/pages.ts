import {
  mapClaimedPageRow,
  mapDuePageRow,
  type ClaimedPage,
  type DuePage,
  type ScheduleSqlExecutor,
} from "./schemas";

function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), 100);
}

export async function findDuePages(
  sql: ScheduleSqlExecutor,
  now: string,
  limit: number,
): Promise<DuePage[]> {
  const rows = await sql.all(
    `SELECT id, current_version, scheduled_version, scheduled_for, schedule_attempt_count,
            schedule_lease_token, schedule_lease_expires_at,
            last_schedule_error
     FROM aria_page_meta
     WHERE status = 'scheduled'
       AND scheduled_for IS NOT NULL
       AND scheduled_version IS NOT NULL
       AND scheduled_for <= ?
       AND (schedule_lease_expires_at IS NULL OR schedule_lease_expires_at <= ?)
     ORDER BY scheduled_for ASC
     LIMIT ?`,
    [now, now, clampLimit(limit)],
  );
  return rows.map(mapDuePageRow);
}

export async function claimDuePage(
  sql: ScheduleSqlExecutor,
  input: Pick<DuePage, "id">,
  now: string,
  leaseToken: string,
  leaseExpiresAt: string,
): Promise<ClaimedPage | null> {
  await sql.run(
    `UPDATE aria_page_meta
     SET schedule_lease_token = ?,
         schedule_lease_expires_at = ?,
         schedule_attempt_count = schedule_attempt_count + 1,
         updated_at = ?
     WHERE id = ?
       AND status = 'scheduled'
       AND scheduled_for IS NOT NULL
       AND scheduled_version IS NOT NULL
       AND scheduled_for <= ?
       AND (schedule_lease_expires_at IS NULL OR schedule_lease_expires_at <= ?)`,
    [leaseToken, leaseExpiresAt, now, input.id, now, now],
  );

  const rows = await sql.all(
    `SELECT id, current_version, scheduled_version, scheduled_for, schedule_attempt_count,
            schedule_lease_token, schedule_lease_expires_at,
            last_schedule_error
     FROM aria_page_meta
     WHERE id = ?
       AND schedule_lease_token = ?
     LIMIT 1`,
    [input.id, leaseToken],
  );

  const row = rows[0];
  return row === undefined ? null : mapClaimedPageRow(row);
}

export async function recoverExpiredPageScheduleLeases(
  sql: ScheduleSqlExecutor,
  now: string,
): Promise<number> {
  const result = await sql.run(
    `UPDATE aria_page_meta
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

export async function releasePageScheduleLease(
  sql: ScheduleSqlExecutor,
  input: Pick<DuePage, "id">,
  leaseToken: string,
  now: string,
): Promise<boolean> {
  const result = await sql.run(
    `UPDATE aria_page_meta
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         scheduled_for = NULL,
         scheduled_version = NULL,
         last_schedule_error = NULL,
         updated_at = ?
     WHERE id = ?
       AND schedule_lease_token = ?`,
    [now, input.id, leaseToken],
  );
  return result.changes > 0;
}

export async function recordPageScheduleFailure(
  sql: ScheduleSqlExecutor,
  input: Pick<DuePage, "id">,
  leaseToken: string,
  errorMessage: string,
  now: string,
  maxAttempts: number,
): Promise<boolean> {
  const message = errorMessage.slice(0, 500);
  const exhausted = await sql.run(
    `UPDATE aria_page_meta
     SET status = 'draft',
         scheduled_for = NULL,
         scheduled_version = NULL,
         schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = ?,
         updated_at = ?
     WHERE id = ?
       AND schedule_lease_token = ?
       AND schedule_attempt_count >= ?`,
    [message, now, input.id, leaseToken, maxAttempts],
  );
  if (exhausted.changes > 0) {
    return true;
  }

  const result = await sql.run(
    `UPDATE aria_page_meta
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = ?,
         updated_at = ?
     WHERE id = ?
       AND schedule_lease_token = ?`,
    [message, now, input.id, leaseToken],
  );
  return result.changes > 0;
}

export async function clearPageScheduleFailure(
  sql: ScheduleSqlExecutor,
  input: Pick<DuePage, "id">,
  now: string,
): Promise<void> {
  await sql.run(
    `UPDATE aria_page_meta
     SET schedule_lease_token = NULL,
         schedule_lease_expires_at = NULL,
         last_schedule_error = NULL,
         updated_at = ?
     WHERE id = ?`,
    [now, input.id],
  );
}
