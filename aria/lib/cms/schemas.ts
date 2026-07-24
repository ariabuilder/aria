import { z } from "zod";
import {
  COLLECTION_KINDS,
  COLLECTION_POLICY_DOCUMENT_SCOPES,
  COLLECTION_POLICY_MODES,
  COLLECTION_PERMISSION_ACTIONS,
  COLLECTION_SCOPES,
  COLLECTION_SUPPORTS,
  ENTRY_STATUSES,
  FIELD_TYPES,
} from "./constants";
import type { FieldSchema } from "./fieldSchema";
import { LocaleCodeSchema } from "../localization/contentLocale";

export type { FieldSchema } from "./fieldSchema";

export const CollectionSupportSchema = z.enum(COLLECTION_SUPPORTS);

export const SystemEntryFieldKeySchema = z.enum(["title", "slug", "body"]);

export const EntryFieldPlacementSchema = z.enum(["main", "sidebar"]);
export const EntryFieldWidthSchema = z.enum([
  "full",
  "half",
  "third",
  "quarter",
]);

export const EntryFieldOrderItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("system"),
      key: SystemEntryFieldKeySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("field"),
      key: z.string().trim().min(1),
      placement: EntryFieldPlacementSchema.optional(),
      width: EntryFieldWidthSchema.optional(),
    })
    .strict(),
]);

export const CollectionNavigationSchema = z
  .object({
    showInSidebar: z.boolean().default(true),
  })
  .strict();

/** Explicit opt-in configuration for a public collection RSS feed. */
export const CollectionRssSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    title: z.string().trim().min(1).max(180).optional(),
    description: z.string().trim().max(1_000).optional(),
    itemLimit: z.int().min(1).max(100).default(20),
  })
  .strict();

/** Public comments are disabled until a collection explicitly opts in. */
export const CollectionCommentsSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .strict();

const RepeaterDisplaySettingsInputSchema = z
  .object({
    titleFieldKey: z.string().trim().min(1).optional(),
    addButtonLabel: z.string().trim().min(1).optional(),
  })
  .strict();

const FieldSchemaInput: z.ZodType<FieldSchema> = z.lazy(() =>
  z
    .object({
      key: z.string().trim().min(1),
      label: z.string().trim().min(1),
      type: z.enum(FIELD_TYPES),
      required: z.boolean().optional(),
      default: z.unknown().optional(),
      options: z.array(z.string().trim().min(1)).optional(),
      targetCollection: z.string().trim().min(1).optional(),
      fields: z.array(FieldSchemaInput).optional(),
      searchable: z.boolean().optional(),
      showInEntryList: z.boolean().optional(),
      inlineEditable: z.boolean().optional(),
      repeaterDisplay: RepeaterDisplaySettingsInputSchema.optional(),
    })
    .strict(),
);

export const CollectionSchemaInputSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    kind: z.enum(COLLECTION_KINDS),
    icon: z.string().trim().min(1).optional(),
    fields: z.array(FieldSchemaInput),
    entryFieldOrder: z.array(EntryFieldOrderItemSchema).optional(),
    navigation: CollectionNavigationSchema.optional(),
    rss: CollectionRssSettingsSchema.optional(),
    comments: CollectionCommentsSettingsSchema.optional(),
    version: z.int().positive(),
    ownerCollectionId: z.string().trim().min(1).optional(),
  })
  .strict();

export const AriaCollectionSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1),
    kind: z.enum(COLLECTION_KINDS),
    schema: CollectionSchemaInputSchema,
    scope: z.enum(COLLECTION_SCOPES).default("global"),
    urlPattern: z.string().trim().min(1).nullable(),
    templatePageId: z.string().trim().min(1).nullable(),
    listPageId: z.string().trim().min(1).nullable(),
    supports: z.array(CollectionSupportSchema).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const EntryScheduleLeaseSchema = z
  .object({
    scheduleLeaseToken: z.string().nullable(),
    scheduleLeaseExpiresAt: z.string().nullable(),
    scheduleAttemptCount: z.int().nonnegative(),
    lastScheduleError: z.string().nullable(),
  })
  .strict();

export const AriaEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    status: z.enum(ENTRY_STATUSES),
    version: z.string().trim().min(1),
    authorId: z.string().trim().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    publishedAt: z.string().min(1).nullable(),
    scheduledFor: z.string().min(1).nullable(),
  })
  .strict();

export const AriaEntryLocaleSchema = z
  .object({
    entryId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    locale: z.string().trim().min(1),
    slug: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string(),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    body: z.unknown().nullable(),
    isSource: z.boolean(),
    // Older baseline exports and fixtures have no per-locale comment setting.
    // Missing is interpreted as open at every storage/public-policy boundary.
    commentsClosed: z.boolean().optional(),
    translationMeta: z
      .object({
        method: z.enum(["ai", "manual", "import"]),
        sourceLocale: z.string().trim().min(1),
        sourceContentHash: z.string().trim().min(1),
        generatedAt: z.string().min(1),
        translatedFieldPaths: z.array(z.string().trim().min(1)).default([]),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

export const AriaEntryRelationSchema = z
  .object({
    sourceEntryId: z.string().trim().min(1),
    fieldKey: z.string().trim().min(1),
    targetEntryId: z.string().trim().min(1),
    position: z.int().nonnegative(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const AriaEntryAuthorDisplaySchema = z
  .object({
    id: z.string().trim().min(1),
    username: z.string().trim().min(1),
    email: z.string().trim().min(1).optional(),
    avatarUrl: z.string().trim().nullable().optional(),
  })
  .strict();

export const AriaEntryAuthorshipSchema = z
  .object({
    author: AriaEntryAuthorDisplaySchema.nullable(),
    createdBy: AriaEntryAuthorDisplaySchema.nullable().optional(),
    updatedBy: AriaEntryAuthorDisplaySchema.nullable().optional(),
    publishedBy: AriaEntryAuthorDisplaySchema.nullable().optional(),
  })
  .strict();

export const AriaEntryRecordSchema = z
  .object({
    entry: AriaEntrySchema,
    locales: z.array(AriaEntryLocaleSchema).min(1),
    relations: z.array(AriaEntryRelationSchema).optional(),
    authorship: AriaEntryAuthorshipSchema.optional(),
  })
  .strict();

export const AriaEntrySnapshotSchema = z
  .object({
    entry: AriaEntrySchema,
    locales: z.array(AriaEntryLocaleSchema).min(1),
    relations: z.array(AriaEntryRelationSchema).optional(),
  })
  .strict();

export const AriaEntryRevisionSchema = z
  .object({
    id: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: z.string().trim().min(1).nullable(),
    version: z.string().trim().min(1),
    snapshot: AriaEntrySnapshotSchema,
    actorId: z.string().trim().min(1),
    message: z.string().optional(),
    createdAt: z.string().min(1),
    authorship: z
      .object({
        actor: AriaEntryAuthorDisplaySchema.nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const PublicCommentStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "spam",
  "deleted",
]);
export type PublicCommentStatus = z.infer<typeof PublicCommentStatusSchema>;

export const PublicCommentSchema = z
  .object({
    id: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    authorId: z.string().trim().min(1),
    authorName: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4_000),
    status: PublicCommentStatusSchema,
    idempotencyKey: z.string().trim().min(16).max(200),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    moderatedAt: z.string().min(1).nullable(),
    moderatedById: z.string().trim().min(1).nullable(),
  })
  .strict();
export type PublicComment = z.infer<typeof PublicCommentSchema>;

/** The only comment shape that may leave a public server boundary. */
export const PublicCommentProjectionSchema = z
  .object({
    id: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    authorName: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(4_000),
    createdAt: z.string().min(1),
  })
  .strict();
export type PublicCommentProjection = z.infer<
  typeof PublicCommentProjectionSchema
>;

export const PublicCommentModerationEventSchema = z
  .object({
    id: z.string().trim().min(1),
    commentId: z.string().trim().min(1),
    fromStatus: PublicCommentStatusSchema.nullable(),
    toStatus: PublicCommentStatusSchema,
    actorId: z.string().trim().min(1),
    reasonCode: z.string().trim().min(1).max(80).nullable(),
    createdAt: z.string().min(1),
  })
  .strict();
export type PublicCommentModerationEvent = z.infer<
  typeof PublicCommentModerationEventSchema
>;

export const CmsEntryAutosaveSchema = z
  .object({
    id: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    baseVersion: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
    clientSequence: z.int().nonnegative(),
    payload: z.record(z.string(), z.unknown()),
    checksum: z.string().trim().min(16).max(128),
    createdAt: z.string().min(1),
    expiresAt: z.string().min(1),
  })
  .strict();
export type CmsEntryAutosave = z.infer<typeof CmsEntryAutosaveSchema>;

export const CmsEntryPresenceLeaseSchema = z
  .object({
    entryId: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    actorId: z.string().trim().min(1),
    leaseToken: z.string().trim().min(16),
    expiresAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type CmsEntryPresenceLease = z.infer<typeof CmsEntryPresenceLeaseSchema>;

export const CmsEntryEditLockSchema = CmsEntryPresenceLeaseSchema;
export type CmsEntryEditLock = z.infer<typeof CmsEntryEditLockSchema>;

export const CmsEntryDiffChangeSchema = z
  .object({
    field: z.string().trim().min(1),
    kind: z.enum(["scalar", "body", "relation", "field_presence"]),
    before: z.unknown(),
    after: z.unknown(),
    truncated: z.boolean().default(false),
  })
  .strict();
export const CmsEntryDiffSchema = z
  .object({
    entryId: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    changes: z.array(CmsEntryDiffChangeSchema),
    truncated: z.boolean(),
  })
  .strict();
export type CmsEntryDiff = z.infer<typeof CmsEntryDiffSchema>;

export const CmsEntryWorkflowStateSchema = z.enum([
  "none",
  "in_review",
  "changes_requested",
  "approved",
]);
export const CmsEntryWorkflowSchema = z
  .object({
    entryId: z.string().trim().min(1),
    locale: LocaleCodeSchema,
    state: CmsEntryWorkflowStateSchema,
    reviewedVersion: z.string().trim().min(1).nullable(),
    assignedToId: z.string().trim().min(1).nullable(),
    updatedById: z.string().trim().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type CmsEntryWorkflow = z.infer<typeof CmsEntryWorkflowSchema>;

export const CmsReviewAnnotationSchema = z
  .object({
    id: z.string().trim().min(1),
    resourceType: z.enum([
      "entry",
      "page",
      "media",
      "redirect",
      "settings",
      "design_system",
    ]),
    resourceId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1).nullable(),
    locale: LocaleCodeSchema.nullable(),
    fieldPath: z.string().trim().min(1).max(500).nullable(),
    anchor: z.record(z.string(), z.unknown()).nullable(),
    fallbackLabel: z.string().trim().min(1).max(250).nullable(),
    body: z.string().trim().min(1).max(8_000),
    status: z.enum(["open", "resolved"]),
    authorId: z.string().trim().min(1),
    resolvedById: z.string().trim().min(1).nullable(),
    resolvedAt: z.string().min(1).nullable(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type CmsReviewAnnotation = z.infer<typeof CmsReviewAnnotationSchema>;

export const EntrySortSchema = z
  .object({
    field: z.enum(["title", "slug", "updatedAt", "publishedAt", "createdAt"]),
    direction: z.enum(["asc", "desc"]),
  })
  .strict();

export const EntrySortListSchema = z.array(EntrySortSchema);

const OptionalRouteSettingSchema = z.string().trim().optional();
const OptionalNullableRouteSettingSchema = z
  .string()
  .trim()
  .nullable()
  .optional();

export const CreateCollectionRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    label: z.string().trim().min(1),
    kind: z.enum(COLLECTION_KINDS),
    icon: z.string().trim().min(1).optional(),
    fields: z.array(FieldSchemaInput).default([]),
    entryFieldOrder: z.array(EntryFieldOrderItemSchema).optional(),
    navigation: CollectionNavigationSchema.optional(),
    rss: CollectionRssSettingsSchema.optional(),
    comments: CollectionCommentsSettingsSchema.optional(),
    urlPattern: OptionalRouteSettingSchema,
    templatePageId: OptionalRouteSettingSchema,
    listPageId: OptionalRouteSettingSchema,
    supports: z.array(CollectionSupportSchema).optional(),
    scope: z.enum(COLLECTION_SCOPES).optional(),
  })
  .strict();

export const UpdateCollectionRequestSchema = z
  .object({
    id: z.string().trim().min(1),
    patch: z
      .object({
        label: z.string().trim().min(1).optional(),
        kind: z.enum(COLLECTION_KINDS).optional(),
        icon: z.string().trim().min(1).nullable().optional(),
        fields: z.array(FieldSchemaInput).optional(),
        entryFieldOrder: z.array(EntryFieldOrderItemSchema).optional(),
        navigation: CollectionNavigationSchema.optional(),
        rss: CollectionRssSettingsSchema.nullable().optional(),
        comments: CollectionCommentsSettingsSchema.nullable().optional(),
        urlPattern: OptionalNullableRouteSettingSchema,
        templatePageId: OptionalNullableRouteSettingSchema,
        listPageId: OptionalNullableRouteSettingSchema,
        supports: z.array(CollectionSupportSchema).optional(),
        scope: z.enum(COLLECTION_SCOPES).optional(),
      })
      .strict(),
    expectedUpdatedAt: z.string().min(1).optional(),
  })
  .strict();

export const CreateEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    slug: z
      .string()
      .trim()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    title: z.string().trim().min(1),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    body: z.unknown().optional(),
    commentsClosed: z.boolean().optional(),
    locale: z.string().trim().min(1).optional(),
    status: z.enum(ENTRY_STATUSES).optional(),
    relations: z.array(AriaEntryRelationSchema).optional(),
  })
  .strict();

export const UpdateEntryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    id: z.string().trim().min(1),
    version: z.string().trim().min(1),
    patch: z
      .object({
        slug: z
          .string()
          .trim()
          .min(1)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .optional(),
        title: z.string().trim().min(1).optional(),
        frontmatter: z.record(z.string(), z.unknown()).optional(),
        body: z.unknown().nullable().optional(),
        commentsClosed: z.boolean().optional(),
        locale: z.string().trim().min(1).optional(),
        status: z.enum(ENTRY_STATUSES).optional(),
        relations: z.array(AriaEntryRelationSchema).optional(),
        translationMeta: AriaEntryLocaleSchema.shape.translationMeta,
      })
      .strict(),
  })
  .strict();

export const EntryListRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    status: z
      .union([z.enum(ENTRY_STATUSES), z.array(z.enum(ENTRY_STATUSES))])
      .optional(),
    query: z.string().trim().optional(),
    page: z.int().positive().optional(),
    limit: z.int().positive().max(200).optional(),
    sort: EntrySortListSchema.optional(),
    locale: z.string().trim().min(1).optional(),
  })
  .strict();

export const EntryQueryRequestSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    filter: z.record(z.string(), z.unknown()).optional(),
    sort: EntrySortListSchema.optional(),
    limit: z.int().positive().max(200).optional(),
    offset: z.int().nonnegative().optional(),
    status: z
      .union([z.enum(ENTRY_STATUSES), z.array(z.enum(ENTRY_STATUSES))])
      .optional(),
    locale: z.string().trim().min(1).optional(),
    include: z.array(z.string().trim().min(1)).optional(),
    entryContext: z
      .object({
        collectionId: z.string().trim().min(1),
        entryId: z.string().trim().min(1),
        slug: z.string().trim().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export const CollectionPermissionSchema = z
  .object({
    principalId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1),
    action: z.enum(COLLECTION_PERMISSION_ACTIONS),
  })
  .strict();

export const CollectionPolicyModeSchema = z.enum(COLLECTION_POLICY_MODES);
export const CollectionPolicyDocumentScopeSchema = z.enum(
  COLLECTION_POLICY_DOCUMENT_SCOPES,
);
export const CmsPolicyFieldKeySchema = z.string().trim().min(1);

export const CollectionPolicyRuleSchema = z
  .object({
    principalId: z.string().trim().min(1),
    actions: z.array(z.enum(COLLECTION_PERMISSION_ACTIONS)).min(1).max(7),
    documentScope: CollectionPolicyDocumentScopeSchema.default("all"),
    locales: z.array(LocaleCodeSchema).max(50).default([]),
    visibleFields: z.array(CmsPolicyFieldKeySchema).max(200).optional(),
    editableFields: z.array(CmsPolicyFieldKeySchema).max(200).optional(),
  })
  .strict();

export const AriaCollectionPolicySchema = z
  .object({
    collectionId: z.string().trim().min(1),
    mode: CollectionPolicyModeSchema.default("inherit"),
    rules: z.array(CollectionPolicyRuleSchema).max(100).default([]),
    updatedAt: z.string().min(1),
  })
  .strict();

export const CmsAuditEventSchema = z
  .object({
    id: z.string().trim().min(1),
    action: z.string().trim().min(1),
    actorId: z.string().trim().min(1),
    actorUsername: z.string().trim().min(1).optional(),
    collectionId: z.string().trim().min(1).optional(),
    entryId: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.string().min(1),
  })
  .strict();

export const CmsSearchDocumentSchema = z
  .object({
    entityType: z.enum(["collection", "entry"]),
    entityId: z.string().trim().min(1),
    collectionId: z.string().trim().min(1).nullable(),
    locale: z.string().trim().min(1),
    title: z.string().trim().min(1),
    slug: z.string().trim().min(1).nullable(),
    collectionName: z.string().trim().min(1).nullable(),
    collectionLabel: z.string().trim().min(1).nullable(),
    status: z.enum(ENTRY_STATUSES).nullable(),
    searchableText: z.string(),
    sourceVersion: z.string().trim().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const CmsSearchResultSchema = CmsSearchDocumentSchema.extend({
  rank: z.number().nonnegative(),
}).strict();

export type CollectionSchema = z.infer<typeof CollectionSchemaInputSchema>;
export type SystemEntryFieldKey = z.infer<typeof SystemEntryFieldKeySchema>;
export type EntryFieldPlacement = z.infer<typeof EntryFieldPlacementSchema>;
export type EntryFieldWidth = z.infer<typeof EntryFieldWidthSchema>;
export type EntryFieldOrderItem = z.infer<typeof EntryFieldOrderItemSchema>;
export type AriaCollection = z.infer<typeof AriaCollectionSchema>;
export type EntryScheduleLease = z.infer<typeof EntryScheduleLeaseSchema>;
export type AriaEntry = z.infer<typeof AriaEntrySchema>;
export type AriaEntryLocale = z.infer<typeof AriaEntryLocaleSchema>;
export type AriaEntryRelation = z.infer<typeof AriaEntryRelationSchema>;
export type AriaEntryAuthorDisplay = z.infer<
  typeof AriaEntryAuthorDisplaySchema
>;
export type AriaEntryAuthorship = z.infer<typeof AriaEntryAuthorshipSchema>;
export type AriaEntryRecord = z.infer<typeof AriaEntryRecordSchema>;
export type AriaEntrySnapshot = z.infer<typeof AriaEntrySnapshotSchema>;
export type AriaEntryRevision = z.infer<typeof AriaEntryRevisionSchema>;
export type AriaCollectionPolicy = z.infer<typeof AriaCollectionPolicySchema>;
export type CollectionPolicyRule = z.infer<typeof CollectionPolicyRuleSchema>;
export type CmsAuditEvent = z.infer<typeof CmsAuditEventSchema>;
export type CmsSearchDocument = z.infer<typeof CmsSearchDocumentSchema>;
export type CmsSearchResult = z.infer<typeof CmsSearchResultSchema>;
