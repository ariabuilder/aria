import { z } from "zod";

export type ScheduleSqlRunResult = Readonly<{ changes: number }>;

export interface ScheduleSqlExecutor {
  run(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<ScheduleSqlRunResult>;
  all(
    sql: string,
    parameters?: readonly unknown[],
  ): Promise<readonly unknown[]>;
}

const DbRowSchema = z.record(z.string(), z.unknown());

export const DueCmsEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    version: z.string().trim().min(1),
    currentVersion: z.string().trim().min(1),
    scheduledFor: z.string().min(1),
    scheduleAttemptCount: z.int().nonnegative(),
    scheduleLeaseToken: z.string().nullable(),
    scheduleLeaseExpiresAt: z.string().nullable(),
    lastScheduleError: z.string().nullable(),
  })
  .strict();

export const DuePageSchema = z
  .object({
    id: z.string().trim().min(1),
    version: z.string().trim().min(1),
    currentVersion: z.string().trim().min(1),
    scheduledFor: z.string().min(1),
    scheduleAttemptCount: z.int().nonnegative(),
    scheduleLeaseToken: z.string().nullable(),
    scheduleLeaseExpiresAt: z.string().nullable(),
    lastScheduleError: z.string().nullable(),
  })
  .strict();

export const ClaimedCmsEntrySchema = DueCmsEntrySchema.extend({
  scheduleLeaseToken: z.string().min(1),
  scheduleLeaseExpiresAt: z.string().min(1),
}).strict();

export const ClaimedPageSchema = DuePageSchema.extend({
  scheduleLeaseToken: z.string().min(1),
  scheduleLeaseExpiresAt: z.string().min(1),
}).strict();

export const ReconcileOptionsSchema = z
  .object({
    now: z.string().min(1).optional(),
    batchLimit: z.int().positive().max(100).optional(),
  })
  .strict();

export const ReconcileResultSchema = z
  .object({
    cmsProcessed: z.int().nonnegative(),
    cmsSucceeded: z.int().nonnegative(),
    cmsFailed: z.int().nonnegative(),
    pagesProcessed: z.int().nonnegative(),
    pagesSucceeded: z.int().nonnegative(),
    pagesFailed: z.int().nonnegative(),
    recoveredCmsLeases: z.int().nonnegative(),
    recoveredPageLeases: z.int().nonnegative(),
  })
  .strict();

export type DueCmsEntry = z.infer<typeof DueCmsEntrySchema>;
export type DuePage = z.infer<typeof DuePageSchema>;
export type ClaimedCmsEntry = z.infer<typeof ClaimedCmsEntrySchema>;
export type ClaimedPage = z.infer<typeof ClaimedPageSchema>;
export type ReconcileOptions = z.infer<typeof ReconcileOptionsSchema>;
export type ReconcileResult = z.infer<typeof ReconcileResultSchema>;

function dueCmsEntryFromRow(input: unknown): DueCmsEntry {
  const row = DbRowSchema.parse(input);
  return DueCmsEntrySchema.parse({
    id: row.id,
    collectionId: row.collection_id,
    version: row.scheduled_version,
    currentVersion: row.version,
    scheduledFor: row.scheduled_for,
    scheduleAttemptCount: row.schedule_attempt_count,
    scheduleLeaseToken:
      typeof row.schedule_lease_token === "string"
        ? row.schedule_lease_token
        : null,
    scheduleLeaseExpiresAt:
      typeof row.schedule_lease_expires_at === "string"
        ? row.schedule_lease_expires_at
        : null,
    lastScheduleError:
      typeof row.last_schedule_error === "string"
        ? row.last_schedule_error
        : null,
  });
}

function duePageFromRow(input: unknown): DuePage {
  const row = DbRowSchema.parse(input);
  return DuePageSchema.parse({
    id: row.id,
    version: row.scheduled_version,
    currentVersion: row.current_version,
    scheduledFor: row.scheduled_for,
    scheduleAttemptCount: row.schedule_attempt_count,
    scheduleLeaseToken:
      typeof row.schedule_lease_token === "string"
        ? row.schedule_lease_token
        : null,
    scheduleLeaseExpiresAt:
      typeof row.schedule_lease_expires_at === "string"
        ? row.schedule_lease_expires_at
        : null,
    lastScheduleError:
      typeof row.last_schedule_error === "string"
        ? row.last_schedule_error
        : null,
  });
}

export function mapDueCmsEntryRow(input: unknown): DueCmsEntry {
  return dueCmsEntryFromRow(input);
}

export function mapDuePageRow(input: unknown): DuePage {
  return duePageFromRow(input);
}

export function mapClaimedCmsEntryRow(input: unknown): ClaimedCmsEntry {
  return ClaimedCmsEntrySchema.parse(dueCmsEntryFromRow(input));
}

export function mapClaimedPageRow(input: unknown): ClaimedPage {
  return ClaimedPageSchema.parse(duePageFromRow(input));
}
