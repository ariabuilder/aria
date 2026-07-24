import { generateId } from "../../crypto";
import type { SessionUser } from "../../auth";
import type { StorageAdapter } from "../../storage/adapter";
import type {
  PublicComment,
  PublicCommentProjection,
} from "../schemas";
import { CmsServiceError } from "../errors";
import { getCollectionFromAdapter } from "./collections";
import { getEntryFromAdapter } from "./entries";
import { buildCmsEntryPublicPath } from "../publicPaths";
import { resolveCollectionTemplateRoute } from "../../rendering/resolvePublicPageRoute";

const PUBLIC_COMMENT_RATE_WINDOW_MS = 10 * 60 * 1_000;
const PUBLIC_COMMENT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MAX_COMMENTS_PER_AUTHOR_WINDOW = 5;
const MAX_COMMENTS_PER_ENTRY_WINDOW = 20;
const MAX_COMMENT_LINKS = 5;

function unavailable(): CmsServiceError {
  // Keep public callers from learning whether a draft, a disabled collection,
  // or a missing locale is the reason that a target is unavailable.
  return new CmsServiceError("NOT_FOUND", "Comment target is not available");
}

function commentNow(): string {
  return new Date().toISOString();
}

export function normalizePublicCommentBody(body: string): string {
  const normalized = body.normalize("NFC").trim();
  if (normalized.length === 0 || normalized.length > 4_000) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Comment must be between 1 and 4000 characters",
    );
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) {
    throw new CmsServiceError("VALIDATION_ERROR", "Comment contains control characters");
  }
  const linkCount = (normalized.match(/(?:https?:\/\/|www\.)\S+/giu) ?? [])
    .length;
  if (linkCount > MAX_COMMENT_LINKS) {
    throw new CmsServiceError("VALIDATION_ERROR", "Comment contains too many links");
  }
  return normalized;
}

export function projectPublicComment(
  comment: PublicComment,
): PublicCommentProjection {
  return {
    id: comment.id,
    locale: comment.locale,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
  };
}

export async function assertPublicCommentTarget(
  adapter: StorageAdapter,
  input: { collectionId: string; entryId: string; locale: string },
) {
  const collection = await getCollectionFromAdapter(adapter, input.collectionId);
  if (
    !collection.supports.includes("comments") ||
    !collection.schema.comments?.enabled ||
    !collection.urlPattern ||
    !collection.templatePageId
  ) {
    throw unavailable();
  }

  const entry = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.entryId,
  });
  const localeRecord = entry.locales.find(
    (candidate) => candidate.locale === input.locale,
  );
  if (
    entry.entry.status !== "published" ||
    !localeRecord ||
    localeRecord.commentsClosed
  ) {
    throw unavailable();
  }

  const pathname = buildCmsEntryPublicPath(collection.urlPattern, localeRecord.slug);
  if (!pathname) throw unavailable();
  const route = await resolveCollectionTemplateRoute(adapter, {
    pathname,
    stage: "published",
    locale: input.locale,
  });
  if (!route || route.collectionId !== collection.id || route.entryId !== entry.entry.id) {
    throw unavailable();
  }
  const policy = await adapter.getPagePolicy(route.templatePageId);
  if (!policy || policy.accessMode !== "public") {
    throw unavailable();
  }
  return { collection, entry, locale: localeRecord };
}

export async function listApprovedPublicComments(
  adapter: StorageAdapter,
  input: { collectionId: string; entryId: string; locale: string; limit?: number; offset?: number },
): Promise<PublicCommentProjection[]> {
  await assertPublicCommentTarget(adapter, input);
  const comments = await adapter.listPublicComments({
    entryId: input.entryId,
    locale: input.locale,
    status: "approved",
    limit: input.limit,
    offset: input.offset,
  });
  return comments.map(projectPublicComment);
}

export async function submitPublicComment(
  adapter: StorageAdapter,
  input: {
    collectionId: string;
    entryId: string;
    locale: string;
    body: string;
    idempotencyKey: string;
  },
  author: Pick<SessionUser, "id" | "username">,
): Promise<PublicCommentProjection> {
  await assertPublicCommentTarget(adapter, input);
  const body = normalizePublicCommentBody(input.body);
  const retried = await adapter.getPublicCommentByIdempotency({
    authorId: author.id,
    entryId: input.entryId,
    locale: input.locale,
    idempotencyKey: input.idempotencyKey,
  });
  if (retried) return projectPublicComment(retried);
  const now = commentNow();
  const duplicate = await adapter.getPublicCommentSubmissionStats({
      entryId: input.entryId,
      locale: input.locale,
      authorId: author.id,
      body,
      after: new Date(Date.now() - PUBLIC_COMMENT_DUPLICATE_WINDOW_MS).toISOString(),
    });
  if (duplicate.hasRecentDuplicateBody) {
    throw new CmsServiceError("RATE_LIMITED", "Comment submission is temporarily unavailable");
  }
  const reserved = await adapter.reservePublicCommentRateSlot({
    id: generateId(), authorId: author.id, entryId: input.entryId,
    locale: input.locale, idempotencyKey: input.idempotencyKey, createdAt: now,
    windowStart: new Date(Date.now() - PUBLIC_COMMENT_RATE_WINDOW_MS).toISOString(),
    authorLimit: MAX_COMMENTS_PER_AUTHOR_WINDOW,
    entryLimit: MAX_COMMENTS_PER_ENTRY_WINDOW,
  });
  if (!reserved) {
    // A retry racing an original request may have reserved the same key. Read
    // once more so a successful original remains idempotent rather than flaky.
    const original = await adapter.getPublicCommentByIdempotency({
      authorId: author.id, entryId: input.entryId, locale: input.locale,
      idempotencyKey: input.idempotencyKey,
    });
    if (original) return projectPublicComment(original);
    throw new CmsServiceError("RATE_LIMITED", "Comment submission is temporarily unavailable");
  }
  const comment = await adapter.createPublicComment({
    id: generateId(),
    collectionId: input.collectionId,
    entryId: input.entryId,
    locale: input.locale,
    authorId: author.id,
    authorName: author.username,
    body,
    status: "pending",
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
    moderatedAt: null,
    moderatedById: null,
  });
  return projectPublicComment(comment);
}
