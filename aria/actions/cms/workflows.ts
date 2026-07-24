import { defineAction } from "astro:actions";
import { generateId } from "../../lib/crypto";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  AcquireCmsEntryEditLockRequestSchema,
  CompareCmsEntryRevisionsRequestSchema,
  GetCmsEntryWorkflowRequestSchema,
  UpdateCmsEntryWorkflowRequestSchema,
  ListCmsReviewAnnotationsRequestSchema,
  CreateCmsReviewAnnotationRequestSchema,
  ResolveCmsReviewAnnotationRequestSchema,
  ReopenCmsReviewAnnotationRequestSchema,
  GetCmsEntryAutosaveRequestSchema,
  HeartbeatCmsEntryPresenceRequestSchema,
  ListCmsEntryPresenceRequestSchema,
  SaveCmsEntryAutosaveRequestSchema,
} from "../../lib/cms/actionSchemas";
import { getEntryFromAdapter } from "../../lib/cms/services/entries";
import { requireOperation } from "../_shared";
import { recordCmsAudit, requireCmsCollectionPolicy } from "./accessPolicy";
import { rethrowCmsError } from "../../lib/cms/actionErrors";
import { getRevisionFromAdapter } from "../../lib/cms/services/revisions";
import { diffEntrySnapshots } from "../../lib/cms/services/diffs";
import { CmsServiceError } from "../../lib/cms/errors";

const AUTOSAVE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const LEASE_TTL_MS = 45 * 1_000;

function nowIso(): string {
  return new Date().toISOString();
}
function expiryIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function requireWorkflowEntry(input: {
  context: Parameters<typeof requireOperation>[0];
  collectionId: string;
  entryId: string;
  locale: string;
  operation:
    | "cms.workflows.saveAutosave"
    | "cms.workflows.getAutosave"
    | "cms.workflows.heartbeatPresence"
    | "cms.workflows.listPresence"
    | "cms.workflows.acquireLock"
    | "cms.workflows.releaseLock";
  policyAction: "read" | "update";
}) {
  const user = await requireOperation(input.context, input.operation);
  const adapter = await getStorageAdapterAsync(input.context.locals);
  const entry = await getEntryFromAdapter(adapter, {
    collectionId: input.collectionId,
    idOrSlug: input.entryId,
  });
  await requireCmsCollectionPolicy(adapter, {
    actor: user,
    collectionId: input.collectionId,
    action: input.policyAction,
    locale: input.locale,
    entry,
  });
  return { user, adapter, entry };
}

function assertWorkflowTransition(
  current: "none" | "in_review" | "changes_requested" | "approved" | null,
  next: "none" | "in_review" | "changes_requested" | "approved",
): void {
  const allowed: Record<
    NonNullable<typeof current>,
    readonly (typeof next)[]
  > = {
    none: ["in_review"],
    in_review: ["approved", "changes_requested", "none"],
    changes_requested: ["in_review", "none"],
    approved: ["in_review", "none"],
  };
  const source = current ?? "none";
  if (!allowed[source].includes(next)) {
    throw new CmsServiceError(
      "CONFLICT",
      `Cannot move review from ${source} to ${next}`,
    );
  }
}

export const workflows = {
  saveAutosave: defineAction({
    accept: "json",
    input: SaveCmsEntryAutosaveRequestSchema,
    handler: async (input, context) => {
      try {
        const { user, adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.saveAutosave",
          policyAction: "update",
        });
        return await adapter.saveCmsEntryAutosave({
          id: generateId(),
          entryId: input.entryId,
          collectionId: input.collectionId,
          locale: input.locale,
          baseVersion: input.baseVersion,
          actorId: user.id,
          clientSequence: input.clientSequence,
          payload: input.payload,
          checksum: input.checksum,
          createdAt: nowIso(),
          expiresAt: expiryIso(AUTOSAVE_TTL_MS),
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  getAutosave: defineAction({
    accept: "json",
    input: GetCmsEntryAutosaveRequestSchema,
    handler: async (input, context) => {
      try {
        const { user, adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.getAutosave",
          policyAction: "read",
        });
        return await adapter.getLatestCmsEntryAutosave({
          ...input,
          actorId: user.id,
          now: nowIso(),
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  heartbeatPresence: defineAction({
    accept: "json",
    input: HeartbeatCmsEntryPresenceRequestSchema,
    handler: async (input, context) => {
      try {
        const { user, adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.heartbeatPresence",
          policyAction: "update",
        });
        const updatedAt = nowIso();
        const lease = {
          entryId: input.entryId,
          locale: input.locale,
          actorId: user.id,
          leaseToken: input.leaseToken,
          updatedAt,
          expiresAt: expiryIso(LEASE_TTL_MS),
        };
        await adapter.upsertCmsEntryPresenceLease(lease);
        return lease;
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  listPresence: defineAction({
    accept: "json",
    input: ListCmsEntryPresenceRequestSchema,
    handler: async (input, context) => {
      try {
        const { adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.listPresence",
          policyAction: "read",
        });
        return await adapter.listCmsEntryPresenceLeases({
          ...input,
          now: nowIso(),
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  acquireLock: defineAction({
    accept: "json",
    input: AcquireCmsEntryEditLockRequestSchema,
    handler: async (input, context) => {
      try {
        const { user, adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.acquireLock",
          policyAction: "update",
        });
        const updatedAt = nowIso();
        return await adapter.acquireCmsEntryEditLock({
          entryId: input.entryId,
          locale: input.locale,
          actorId: user.id,
          leaseToken: input.leaseToken,
          updatedAt,
          expiresAt: expiryIso(LEASE_TTL_MS),
          now: updatedAt,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  releaseLock: defineAction({
    accept: "json",
    input: AcquireCmsEntryEditLockRequestSchema,
    handler: async (input, context) => {
      try {
        const { adapter } = await requireWorkflowEntry({
          context,
          ...input,
          operation: "cms.workflows.releaseLock",
          policyAction: "update",
        });
        await adapter.releaseCmsEntryEditLock(input);
        return { released: true };
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  compareRevisions: defineAction({
    accept: "json",
    input: CompareCmsEntryRevisionsRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.compareRevisions",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        const [left, right] = await Promise.all([
          getRevisionFromAdapter(adapter, input.leftRevisionId),
          getRevisionFromAdapter(adapter, input.rightRevisionId),
        ]);
        if (
          left.entryId !== entry.entry.id ||
          right.entryId !== entry.entry.id
        ) {
          throw new CmsServiceError(
            "VALIDATION_ERROR",
            "Revisions must belong to the requested entry",
          );
        }
        const decision = await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "read",
          locale: input.locale,
          entry,
        });
        return diffEntrySnapshots({
          entryId: entry.entry.id,
          locale: input.locale,
          left: left.snapshot,
          right: right.snapshot,
          visibleFields: decision.visibleFields,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  getReview: defineAction({
    accept: "json",
    input: GetCmsEntryWorkflowRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(context, "cms.workflows.getReview");
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "read",
          locale: input.locale,
          entry,
        });
        return await adapter.getCmsEntryWorkflow({
          entryId: entry.entry.id,
          locale: input.locale,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  updateReview: defineAction({
    accept: "json",
    input: UpdateCmsEntryWorkflowRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.updateReview",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale: input.locale,
          entry,
        });
        const current = await adapter.getCmsEntryWorkflow({
          entryId: entry.entry.id,
          locale: input.locale,
        });
        if ((current?.state ?? null) !== input.expectedState) {
          throw new CmsServiceError(
            "CONFLICT",
            "Review state changed; refresh before updating",
          );
        }
        assertWorkflowTransition(current?.state ?? null, input.nextState);
        const updatedAt = nowIso();
        const saved = await adapter.saveCmsEntryWorkflow({
          entryId: entry.entry.id,
          locale: input.locale,
          state: input.nextState,
          reviewedVersion:
            input.nextState === "approved" ? entry.entry.version : null,
          assignedToId:
            input.assignedToId === undefined
              ? (current?.assignedToId ?? null)
              : input.assignedToId,
          updatedById: user.id,
          updatedAt,
          expectedState: input.expectedState,
        });
        if (!saved)
          throw new CmsServiceError(
            "CONFLICT",
            "Review state changed; refresh before updating",
          );
        await recordCmsAudit(adapter, {
          actor: user,
          action: "workflow.review_updated",
          collectionId: input.collectionId,
          entryId: entry.entry.id,
          summary: `Moved review to ${saved.state}`,
          metadata: {
            locale: input.locale,
            reviewedVersion: saved.reviewedVersion,
          },
        });
        return saved;
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  listAnnotations: defineAction({
    accept: "json",
    input: ListCmsReviewAnnotationsRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.listAnnotations",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "read",
          locale: input.locale,
          entry,
        });
        return await adapter.listCmsReviewAnnotations({
          resourceType: "entry",
          resourceId: entry.entry.id,
          locale: input.locale,
          status: input.status,
        });
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  createAnnotation: defineAction({
    accept: "json",
    input: CreateCmsReviewAnnotationRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.createAnnotation",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale: input.locale,
          entry,
        });
        const createdAt = nowIso();
        const annotation = await adapter.createCmsReviewAnnotation({
          id: generateId(),
          resourceType: "entry",
          resourceId: entry.entry.id,
          collectionId: input.collectionId,
          locale: input.locale ?? null,
          fieldPath: input.fieldPath ?? null,
          anchor: input.anchor ?? null,
          fallbackLabel: input.fallbackLabel ?? null,
          body: input.body,
          status: "open",
          authorId: user.id,
          resolvedById: null,
          resolvedAt: null,
          createdAt,
          updatedAt: createdAt,
        });
        await recordCmsAudit(adapter, {
          actor: user,
          action: "workflow.annotation_created",
          collectionId: input.collectionId,
          entryId: entry.entry.id,
          summary: "Created review annotation",
          metadata: {
            annotationId: annotation.id,
            locale: annotation.locale,
            fieldPath: annotation.fieldPath,
          },
        });
        return annotation;
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  resolveAnnotation: defineAction({
    accept: "json",
    input: ResolveCmsReviewAnnotationRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.resolveAnnotation",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale: input.locale,
          entry,
        });
        const annotation = await adapter.resolveCmsReviewAnnotation({
          id: input.annotationId,
          resourceType: "entry",
          resourceId: entry.entry.id,
          actorId: user.id,
          updatedAt: nowIso(),
        });
        if (!annotation) {
          throw new CmsServiceError("NOT_FOUND", "Review annotation not found");
        }
        await recordCmsAudit(adapter, {
          actor: user,
          action: "workflow.annotation_resolved",
          collectionId: input.collectionId,
          entryId: entry.entry.id,
          summary: "Resolved review annotation",
          metadata: { annotationId: annotation.id },
        });
        return annotation;
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
  reopenAnnotation: defineAction({
    accept: "json",
    input: ReopenCmsReviewAnnotationRequestSchema,
    handler: async (input, context) => {
      try {
        const user = await requireOperation(
          context,
          "cms.workflows.reopenAnnotation",
        );
        const adapter = await getStorageAdapterAsync(context.locals);
        const entry = await getEntryFromAdapter(adapter, {
          collectionId: input.collectionId,
          idOrSlug: input.entryId,
        });
        await requireCmsCollectionPolicy(adapter, {
          actor: user,
          collectionId: input.collectionId,
          action: "update",
          locale: input.locale,
          entry,
        });
        const annotation = await adapter.reopenCmsReviewAnnotation({
          id: input.annotationId,
          resourceType: "entry",
          resourceId: entry.entry.id,
          actorId: user.id,
          updatedAt: nowIso(),
        });
        if (!annotation)
          throw new CmsServiceError("NOT_FOUND", "Review annotation not found");
        await recordCmsAudit(adapter, {
          actor: user,
          action: "workflow.annotation_reopened",
          collectionId: input.collectionId,
          entryId: entry.entry.id,
          summary: "Reopened review annotation",
          metadata: { annotationId: annotation.id },
        });
        return annotation;
      } catch (error) {
        rethrowCmsError(error);
      }
    },
  }),
};
