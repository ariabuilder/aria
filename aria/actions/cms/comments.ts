import { defineAction } from "astro:actions";
import { generateId } from "../../lib/crypto";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  ListModerationCommentsRequestSchema,
  GetPublicCommentModerationMetricsRequestSchema,
  ModeratePublicCommentRequestSchema,
  ModeratePublicCommentResponseSchema,
} from "../../lib/cms/actionSchemas";
import { CmsServiceError } from "../../lib/cms/errors";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import { requireOperation } from "../_shared";
import { recordCmsAudit, requireCmsCollectionPolicy } from "./accessPolicy";
import { invalidateCmsEntryCacheFromAction } from "../../lib/cms/invalidateEntryCacheFromAction";
import { getCollectionFromAdapter } from "../../lib/cms/services/collections";
import { resolveCmsPolicyLocale } from "./accessPolicy";

function assertModerationTransition(
  current: "pending" | "approved" | "rejected" | "spam" | "deleted",
  next: "approved" | "rejected" | "spam" | "deleted",
): void {
  const allowed: Record<typeof current, readonly typeof next[]> = {
    pending: ["approved", "rejected", "spam", "deleted"],
    approved: ["rejected", "spam", "deleted"],
    rejected: ["deleted"],
    spam: ["deleted"],
    deleted: [],
  };
  if (!allowed[current].includes(next)) {
    throw new CmsServiceError(
      "CONFLICT",
      `Cannot move a ${current} comment to ${next}`,
    );
  }
}

export const comments = {
  metrics: defineAction({
    accept: "json",
    input: GetPublicCommentModerationMetricsRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(context, "cms.comments.metrics");
        const adapter = await getStorageAdapterAsync(context.locals);
        if (input.collectionId) {
          const collection = await getCollectionFromAdapter(adapter, input.collectionId);
          await requireCmsCollectionPolicy(adapter, { actor: user, collectionId: collection.id, action: "update", locale: await resolveCmsPolicyLocale(adapter) });
        }
        return await adapter.getPublicCommentModerationMetrics(input);
      } catch (error) { rethrowCmsError(error); }
    },
  }),
  listModerationQueue: defineAction({
    accept: "json",
    input: ListModerationCommentsRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.comments.list");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
        });
        return await adapter.listPublicComments({
          collectionId: input.collectionId,
          status: input.status ?? "pending",
          limit: input.limit,
          offset: input.offset,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),

  moderate: defineAction({
    accept: "json",
    input: ModeratePublicCommentRequestSchema,
    handler: async (input, context) => {
      const user = await requireOperation(context, "cms.comments.moderate");
      const adapter = await getStorageAdapterAsync(context.locals);
      try {
        const comment = await adapter.getPublicComment(input.commentId);
        if (!comment) {
          throw new CmsServiceError("NOT_FOUND", "Comment not found");
        }
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: comment.collectionId,
          action: "update",
          locale: comment.locale,
        });
        assertModerationTransition(comment.status, input.nextStatus);
        const now = new Date().toISOString();
        const moderated = await adapter.moderatePublicComment({
          commentId: comment.id,
          expectedStatus: input.expectedStatus,
          nextStatus: input.nextStatus,
          actorId: user.id,
          reasonCode: input.reasonCode,
          event: {
            id: generateId(),
            commentId: comment.id,
            fromStatus: input.expectedStatus,
            toStatus: input.nextStatus,
            actorId: user.id,
            reasonCode: input.reasonCode ?? null,
            createdAt: now,
          },
        });
        if (!moderated) {
          throw new CmsServiceError(
            "CONFLICT",
            "Comment status changed; refresh the moderation queue",
          );
        }
        await recordCmsAudit(adapter, {
          actor: user,
          action: "comments.moderated",
          collectionId: moderated.collectionId,
          entryId: moderated.entryId,
          summary: `Changed public comment to ${moderated.status}`,
          metadata: {
            commentId: moderated.id,
            fromStatus: input.expectedStatus,
            toStatus: moderated.status,
            locale: moderated.locale,
            reasonCode: input.reasonCode ?? null,
          },
        });
        await invalidateCmsEntryCacheFromAction(context, {
          collectionId: moderated.collectionId,
          entryId: moderated.entryId,
        });
        return ModeratePublicCommentResponseSchema.parse(moderated);
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
