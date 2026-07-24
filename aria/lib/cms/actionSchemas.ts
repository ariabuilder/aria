import { z } from "zod";
import { COLLECTION_KINDS } from "./constants";
import {
  AriaCollectionSchema,
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
  AriaCollectionPolicySchema,
  CmsAuditEventSchema,
  CollectionPermissionSchema,
  PublicCommentSchema,
  PublicCommentStatusSchema,
  CmsEntryWorkflowStateSchema,
  CmsReviewAnnotationSchema,
} from "./schemas";
import { CmsPageUsageIndexSchema } from "./pageUsageIndex";
import { CmsCollectionPageBindingImpactSchema } from "./pageBindingCleanup";

export const GetCollectionRequestSchema = z
  .object({
    id: z.string().trim().min(1),
  })
  .strict();

export const DeleteCollectionRequestSchema = GetCollectionRequestSchema;

export const DeleteCollectionResponseSchema = z
  .object({
    success: z.literal(true),
    removedPageBindingCount: z.int().nonnegative(),
    updatedPageIds: z.array(z.string().trim().min(1)),
    updatedPageSlugs: z.array(z.string().trim().min(1)),
  })
  .strict();

export const GetCollectionDeleteImpactRequestSchema = z
  .object({
    ids: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export const GetCollectionDeleteImpactResponseSchema =
  CmsCollectionPageBindingImpactSchema;

export const ListCollectionsRequestSchema = z
  .object({
    query: z.string().trim().optional(),
    kind: z.enum(COLLECTION_KINDS).optional(),
  })
  .strict();

export const ListCollectionsResponseSchema = z
  .object({
    collections: z.array(AriaCollectionSchema),
    entryCounts: z.record(z.string(), z.int().nonnegative()).default({}),
  })
  .strict();

export const CompileSchemaRequestSchema = GetCollectionRequestSchema;

export const CompileSchemaResponseSchema = z
  .object({
    hash: z.string(),
    errors: z.array(z.string()),
  })
  .strict();

export const GetCmsPageUsageIndexRequestSchema = z.object({}).strict();
export const GetCmsPageUsageIndexResponseSchema = CmsPageUsageIndexSchema;

export const SetCollectionTemplateRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    templatePageId: z.string().trim(),
    listPageId: z.string().trim().optional(),
    urlPattern: z.string().trim().optional(),
  })
  .strict();

export const ClearCollectionTemplateRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
  })
  .strict();

export const GetEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    idOrSlug: z.string().trim().min(1),
    locale: z.string().trim().min(1).optional(),
    include: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const CheckEntrySlugAvailabilityRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    slug: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    excludeEntryId: z.string().trim().min(1).optional(),
  })
  .strict();

export const CheckEntrySlugAvailabilityResponseSchema = z
  .object({
    available: z.boolean(),
  })
  .strict();

export const DeleteEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    id: z.string().trim().min(1),
  })
  .strict();

export const DuplicateEntryRequestSchema = DeleteEntryRequestSchema;

export const RestoreEntrySnapshotRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    snapshot: AriaEntryRecordSchema,
    expectedVersion: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
  })
  .strict();

export const PublishEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    id: z.string().trim().min(1),
    version: z.string().trim().min(1),
    scheduledFor: z.string().min(1).optional(),
  })
  .strict();

export const UnpublishEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    id: z.string().trim().min(1),
    version: z.string().trim().min(1),
  })
  .strict();

export const ArchiveEntryRequestSchema = UnpublishEntryRequestSchema;

export const ListEntriesResponseSchema = z
  .object({
    items: z.array(AriaEntryRecordSchema),
    total: z.int().nonnegative(),
    page: z.int().positive(),
    limit: z.int().positive(),
  })
  .strict();

export const ListRevisionsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    page: z.int().positive().optional(),
    limit: z.int().positive().max(200).optional(),
  })
  .strict();

export const ListRevisionsResponseSchema = z
  .object({
    revisions: z.array(AriaEntryRevisionSchema),
    page: z.int().positive(),
    limit: z.int().positive(),
  })
  .strict();

export const GetRevisionRequestSchema = z
  .object({
    revisionId: z.string().trim().min(1),
  })
  .strict();

export const RestoreRevisionRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    revisionId: z.string().trim().min(1),
    expectedVersion: z.string().trim().min(1),
  })
  .strict();

export const ListCollectionPermissionsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
  })
  .strict();

export const CollectionPermissionInputSchema = z
  .object({
    principalId: z.string().trim().min(1),
    action: CollectionPermissionSchema.shape.action,
  })
  .strict();

export const SetCollectionPermissionsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    permissions: z.array(CollectionPermissionInputSchema),
  })
  .strict();

export const ListCollectionPermissionsResponseSchema = z
  .object({
    permissions: z.array(CollectionPermissionSchema),
  })
  .strict();

export const SetCollectionPermissionsResponseSchema =
  ListCollectionPermissionsResponseSchema;

export const GetCollectionPolicyRequestSchema = z
  .object({ collectionId: z.string().trim().min(1) })
  .strict();

export const SetCollectionPolicyRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    mode: AriaCollectionPolicySchema.shape.mode,
    rules: AriaCollectionPolicySchema.shape.rules,
  })
  .strict();

export const CollectionPolicyResponseSchema = z
  .object({ policy: AriaCollectionPolicySchema })
  .strict();

export const ListCollectionPolicyPrincipalsResponseSchema = z
  .object({
    users: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          username: z.string().trim().min(1),
          role: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();

export const GetCollectionAccessRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1).optional(),
    locale: z.string().trim().min(1).optional(),
  })
  .strict();

export const CollectionAccessResponseSchema = z
  .object({
    allowed: z.boolean(),
    mode: AriaCollectionPolicySchema.shape.mode,
    actions: z.record(z.string(), z.boolean()),
    visibleFields: z.array(z.string()),
    editableFields: z.array(z.string()),
    allowedLocales: z.array(z.string()),
    unrestrictedFields: z.boolean(),
    unrestrictedLocales: z.boolean(),
    requiresOwnEntry: z.boolean(),
  })
  .strict();

export const ListCmsAuditEventsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1).optional(),
    entryId: z.string().trim().min(1).optional(),
    limit: z.int().positive().max(500).optional(),
  })
  .strict();

export const ListCmsAuditEventsResponseSchema = z
  .object({ events: z.array(CmsAuditEventSchema) })
  .strict();

export const SearchCmsRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(200),
    locale: z.string().trim().min(1).optional(),
    limit: z.int().positive().max(50).optional(),
  })
  .strict();

export const CmsSearchActionResultSchema = z
  .object({
    entityType: z.enum(["collection", "entry"]),
    entityId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1).nullable(),
    locale: z.string().trim().min(1),
    title: z.string().trim().min(1),
    slug: z.string().trim().min(1).nullable(),
    collectionName: z.string().trim().min(1).nullable(),
    collectionLabel: z.string().trim().min(1).nullable(),
    status: AriaEntryRecordSchema.shape.entry.shape.status.nullable(),
    updatedAt: z.string().min(1),
    rank: z.number().nonnegative(),
  })
  .strict();

export const SearchCmsResponseSchema = z
  .object({ results: z.array(CmsSearchActionResultSchema) })
  .strict();

export const ListModerationCommentsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    status: PublicCommentStatusSchema.optional(),
    limit: z.int().min(1).max(100).optional(),
    offset: z.int().nonnegative().optional(),
  })
  .strict();

export const ModeratePublicCommentRequestSchema = z
  .object({
    commentId: z.string().trim().min(1),
    expectedStatus: PublicCommentStatusSchema,
    nextStatus: z.enum(["approved", "rejected", "spam", "deleted"]),
    reasonCode: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export const ModeratePublicCommentResponseSchema = PublicCommentSchema;
export const GetPublicCommentModerationMetricsRequestSchema = z
  .object({ collectionId: z.string().trim().min(1).optional() })
  .strict();

export const SaveCmsEntryAutosaveRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    baseVersion: z.string().trim().min(1),
    clientSequence: z.int().nonnegative(),
    payload: z.record(z.string(), z.unknown()),
    checksum: z.string().trim().min(16).max(128),
  })
  .strict();

export const GetCmsEntryAutosaveRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
  })
  .strict();

export const HeartbeatCmsEntryPresenceRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    leaseToken: z.string().trim().min(16),
  })
  .strict();

export const AcquireCmsEntryEditLockRequestSchema =
  HeartbeatCmsEntryPresenceRequestSchema;
export const ListCmsEntryPresenceRequestSchema = GetCmsEntryAutosaveRequestSchema;

export const CompareCmsEntryRevisionsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    leftRevisionId: z.string().trim().min(1),
    rightRevisionId: z.string().trim().min(1),
  })
  .strict();

export const GetCmsEntryWorkflowRequestSchema = GetCmsEntryAutosaveRequestSchema;
export const UpdateCmsEntryWorkflowRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    expectedState: CmsEntryWorkflowStateSchema.nullable(),
    nextState: CmsEntryWorkflowStateSchema,
    assignedToId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export const ListCmsReviewAnnotationsRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1).optional(),
    status: CmsReviewAnnotationSchema.shape.status.optional(),
  })
  .strict();
export const CreateCmsReviewAnnotationRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1).optional(),
    fieldPath: z.string().trim().min(1).max(500).optional(),
    anchor: z.record(z.string(), z.unknown()).optional(),
    fallbackLabel: z.string().trim().min(1).max(250).optional(),
    body: z.string().trim().min(1).max(8_000),
  })
  .strict();
export const ResolveCmsReviewAnnotationRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1).optional(),
    annotationId: z.string().trim().min(1),
  })
  .strict();
export const ReopenCmsReviewAnnotationRequestSchema = ResolveCmsReviewAnnotationRequestSchema;
