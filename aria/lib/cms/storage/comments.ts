import type {
  PublicComment,
  PublicCommentModerationEvent,
} from "../schemas";
import {
  PublicCommentModerationEventSchema,
  PublicCommentSchema,
} from "../schemas";
import { runCmsBatch, type CmsStorageExecutor } from "./executor";

type PublicCommentRow = {
  id: string; collection_id: string; entry_id: string; locale: string;
  author_id: string; author_name: string; body: string;
  status: PublicComment["status"]; idempotency_key: string;
  created_at: string; updated_at: string; moderated_at: string | null;
  moderated_by_id: string | null;
};

function mapPublicComment(row: PublicCommentRow): PublicComment {
  return PublicCommentSchema.parse({
    id: row.id, collectionId: row.collection_id, entryId: row.entry_id,
    locale: row.locale, authorId: row.author_id, authorName: row.author_name,
    body: row.body, status: row.status, idempotencyKey: row.idempotency_key,
    createdAt: row.created_at, updatedAt: row.updated_at,
    moderatedAt: row.moderated_at, moderatedById: row.moderated_by_id,
  });
}

export async function cmsCreatePublicComment(executor: CmsStorageExecutor, comment: PublicComment): Promise<PublicComment> {
  const parsed = PublicCommentSchema.parse(comment);
  await executor.run(
    `INSERT INTO aria_public_comments
      (id, collection_id, entry_id, locale, author_id, author_name, body, status, idempotency_key, created_at, updated_at, moderated_at, moderated_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(author_id, entry_id, locale, idempotency_key) DO NOTHING`,
    [parsed.id, parsed.collectionId, parsed.entryId, parsed.locale, parsed.authorId,
      parsed.authorName, parsed.body, parsed.status, parsed.idempotencyKey,
      parsed.createdAt, parsed.updatedAt, parsed.moderatedAt, parsed.moderatedById],
  );
  const stored = await executor.queryFirst<PublicCommentRow>(
    `SELECT * FROM aria_public_comments
     WHERE author_id = ? AND entry_id = ? AND locale = ? AND idempotency_key = ?`,
    [parsed.authorId, parsed.entryId, parsed.locale, parsed.idempotencyKey],
  );
  if (!stored) throw new Error("Public comment insert did not return an idempotency record");
  return mapPublicComment(stored);
}

export async function cmsListPublicComments(
  executor: CmsStorageExecutor,
  options: { entryId?: string; collectionId?: string; locale?: string; status?: PublicComment["status"]; limit?: number; offset?: number },
): Promise<PublicComment[]> {
  if (!options.entryId && !options.collectionId) {
    throw new Error("Public comment listing requires an entry or collection");
  }
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const offset = Math.max(0, options.offset ?? 0);
  const filters: string[] = [];
  const args: unknown[] = [];
  if (options.entryId) { filters.push("entry_id = ?"); args.push(options.entryId); }
  if (options.collectionId) { filters.push("collection_id = ?"); args.push(options.collectionId); }
  if (options.locale) { filters.push("locale = ?"); args.push(options.locale); }
  if (options.status) { filters.push("status = ?"); args.push(options.status); }
  const rows = await executor.queryAll<PublicCommentRow>(
    `SELECT * FROM aria_public_comments
     WHERE ${filters.join(" AND ")}
     ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    [...args, limit, offset],
  );
  return rows.map(mapPublicComment);
}

export async function cmsGetPublicComment(executor: CmsStorageExecutor, id: string): Promise<PublicComment | null> {
  const row = await executor.queryFirst<PublicCommentRow>(
    `SELECT * FROM aria_public_comments WHERE id = ?`, [id],
  );
  return row ? mapPublicComment(row) : null;
}

export async function cmsGetPublicCommentByIdempotency(
  executor: CmsStorageExecutor,
  input: { authorId: string; entryId: string; locale: string; idempotencyKey: string },
): Promise<PublicComment | null> {
  const row = await executor.queryFirst<PublicCommentRow>(
    `SELECT * FROM aria_public_comments
     WHERE author_id = ? AND entry_id = ? AND locale = ? AND idempotency_key = ?`,
    [input.authorId, input.entryId, input.locale, input.idempotencyKey],
  );
  return row ? mapPublicComment(row) : null;
}

export async function cmsGetPublicCommentSubmissionStats(
  executor: CmsStorageExecutor,
  input: { entryId: string; locale: string; authorId: string; body: string; after: string },
): Promise<{ authorCount: number; entryCount: number; hasRecentDuplicateBody: boolean }> {
  const row = await executor.queryFirst<{ author_count: number; entry_count: number; duplicate_count: number }>(
    `SELECT
       SUM(CASE WHEN author_id = ? THEN 1 ELSE 0 END) AS author_count,
       COUNT(*) AS entry_count,
       SUM(CASE WHEN author_id = ? AND body = ? THEN 1 ELSE 0 END) AS duplicate_count
     FROM aria_public_comments
     WHERE entry_id = ? AND locale = ? AND created_at >= ?`,
    [input.authorId, input.authorId, input.body, input.entryId, input.locale, input.after],
  );
  return {
    authorCount: Number(row?.author_count ?? 0),
    entryCount: Number(row?.entry_count ?? 0),
    hasRecentDuplicateBody: Number(row?.duplicate_count ?? 0) > 0,
  };
}

/** Reserve one accepted submission atomically against both rolling limits. */
export async function cmsReservePublicCommentRateSlot(
  executor: CmsStorageExecutor,
  input: { id: string; authorId: string; entryId: string; locale: string; idempotencyKey: string; createdAt: string; windowStart: string; authorLimit: number; entryLimit: number },
): Promise<boolean> {
  await executor.run(
    `INSERT INTO aria_public_comment_rate_reservations
       (id, author_id, entry_id, locale, idempotency_key, created_at)
     SELECT ?, ?, ?, ?, ?, ?
     WHERE
       (SELECT COUNT(*) FROM aria_public_comment_rate_reservations
        WHERE author_id = ? AND created_at >= ?) < ?
       AND
       (SELECT COUNT(*) FROM aria_public_comment_rate_reservations
        WHERE entry_id = ? AND locale = ? AND created_at >= ?) < ?
     ON CONFLICT(author_id, entry_id, locale, idempotency_key) DO NOTHING`,
    [input.id, input.authorId, input.entryId, input.locale, input.idempotencyKey, input.createdAt,
      input.authorId, input.windowStart, input.authorLimit,
      input.entryId, input.locale, input.windowStart, input.entryLimit],
  );
  const row = await executor.queryFirst<{ id: string }>(
    `SELECT id FROM aria_public_comment_rate_reservations
     WHERE author_id = ? AND entry_id = ? AND locale = ? AND idempotency_key = ?`,
    [input.authorId, input.entryId, input.locale, input.idempotencyKey],
  );
  return row?.id === input.id;
}

export async function cmsAnonymizePublicCommentsForDeletedAuthor(executor: CmsStorageExecutor, authorId: string): Promise<void> {
  await runCmsBatch(executor, [
    { sql: `UPDATE aria_public_comments
            SET author_id = ?, author_name = 'Deleted user'
            WHERE author_id = ?`, args: [`deleted:${authorId}`, authorId] },
    { sql: `DELETE FROM aria_public_comment_rate_reservations WHERE author_id = ?`, args: [authorId] },
  ]);
}

export async function cmsPrunePublicCommentRateReservations(executor: CmsStorageExecutor, before: string): Promise<void> {
  await executor.run(`DELETE FROM aria_public_comment_rate_reservations WHERE created_at < ?`, [before]);
}

export async function cmsGetPublicCommentModerationMetrics(
  executor: CmsStorageExecutor,
  input?: { collectionId?: string },
): Promise<{ pending: number; approved: number; rejected: number; spam: number; deleted: number; oldestPendingAt: string | null }> {
  const collectionClause = input?.collectionId ? "WHERE collection_id = ?" : "";
  const args = input?.collectionId ? [input.collectionId] : [];
  const row = await executor.queryFirst<{
    pending: number | null; approved: number | null; rejected: number | null;
    spam: number | null; deleted: number | null; oldest_pending_at: string | null;
  }>(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
       SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS spam,
       SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted,
       MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at
     FROM aria_public_comments ${collectionClause}`,
    args,
  );
  return {
    pending: Number(row?.pending ?? 0), approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0), spam: Number(row?.spam ?? 0),
    deleted: Number(row?.deleted ?? 0), oldestPendingAt: row?.oldest_pending_at ?? null,
  };
}

export async function cmsModeratePublicComment(
  executor: CmsStorageExecutor,
  input: { commentId: string; expectedStatus: PublicComment["status"]; nextStatus: PublicComment["status"]; actorId: string; reasonCode?: string | null; event: PublicCommentModerationEvent },
): Promise<PublicComment | null> {
  const event = PublicCommentModerationEventSchema.parse(input.event);
  const now = event.createdAt;
  await runCmsBatch(executor, [
    {
      sql: `UPDATE aria_public_comments
            SET status = ?, updated_at = ?, moderated_at = ?, moderated_by_id = ?
            WHERE id = ? AND status = ?`,
      args: [input.nextStatus, now, now, input.actorId, input.commentId, input.expectedStatus],
    },
    {
      sql: `INSERT INTO aria_public_comment_moderation_events
              (id, comment_id, from_status, to_status, actor_id, reason_code, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?
            WHERE changes() = 1`,
      args: [event.id, input.commentId, input.expectedStatus, input.nextStatus,
        input.actorId, input.reasonCode ?? null, now],
    },
  ]);
  const updated = await executor.queryFirst<PublicCommentRow>(
    `SELECT * FROM aria_public_comments
     WHERE id = ? AND status = ? AND updated_at = ? AND moderated_by_id = ?`,
    [input.commentId, input.nextStatus, now, input.actorId],
  );
  return updated ? mapPublicComment(updated) : null;
}
