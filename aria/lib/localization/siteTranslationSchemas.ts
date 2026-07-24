import { z } from "zod";

import { LocaleCodeSchema } from "./contentLocale";

/** A stable resource identifier shared by page/layout localization storage. */
export const LocalizedResourceIdSchema = z.string().trim().min(1).max(160);
export const LocalizedVersionIdSchema = z.string().trim().min(1).max(160);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

export const LocalePublicationSchema = z.enum([
  "missing",
  "draft",
  "published",
]);
export type LocalePublication = z.infer<typeof LocalePublicationSchema>;

export const LocaleFreshnessSchema = z.enum(["current", "outdated"]);
export type LocaleFreshness = z.infer<typeof LocaleFreshnessSchema>;

export const LocaleSuppressionReasonSchema = z.enum([
  "locale",
  "canonical",
  "ancestor",
  "access",
  "route",
  "invalidation",
]);
export type LocaleSuppressionReason = z.infer<
  typeof LocaleSuppressionReasonSchema
>;

/**
 * Public matrix state intentionally uses independent axes: a published
 * translation can also have draft changes, be outdated, and be temporarily
 * suppressed at the same time.
 */
export const LocalePublicationStateSchema = z
  .object({
    publication: LocalePublicationSchema,
    localeEnabled: z.boolean(),
    hasUnpublishedChanges: z.boolean(),
    draftFreshness: LocaleFreshnessSchema.nullable(),
    publishedFreshness: LocaleFreshnessSchema.nullable(),
    suppressedBy: z.array(LocaleSuppressionReasonSchema),
  })
  .strict();
export type LocalePublicationState = z.infer<
  typeof LocalePublicationStateSchema
>;

/** Keeps publication, draft freshness, and suppression independent in the UI. */
export function deriveLocalePublicationState(input: {
  enabled: boolean;
  meta: {
    currentVersion: string;
    publishedVersion: string | null;
  } | null;
  currentSourceVersion: string | null;
  publishedSourceVersion: string | null;
  currentTranslationSourceVersion: string | null;
  publishedTranslationSourceVersion: string | null;
  suppressedBy?: LocaleSuppressionReason[];
}): LocalePublicationState {
  const { meta } = input;
  const publication = !meta
    ? "missing"
    : meta.publishedVersion
      ? "published"
      : "draft";
  const freshness = (
    translationSourceVersion: string | null,
    sourceVersion: string | null,
  ) =>
    translationSourceVersion === null || sourceVersion === null
      ? null
      : translationSourceVersion === sourceVersion
        ? "current"
        : "outdated";

  return LocalePublicationStateSchema.parse({
    publication,
    localeEnabled: input.enabled,
    hasUnpublishedChanges: Boolean(
      meta && meta.currentVersion !== meta.publishedVersion,
    ),
    draftFreshness: freshness(
      input.currentTranslationSourceVersion,
      input.currentSourceVersion,
    ),
    publishedFreshness: freshness(
      input.publishedTranslationSourceVersion,
      input.publishedSourceVersion,
    ),
    suppressedBy: [
      ...(input.enabled ? [] : ["locale" as const]),
      ...(input.suppressedBy ?? []),
    ],
  });
}

export const LocalizedRouteSchema = z
  .object({
    locale: LocaleCodeSchema,
    pathname: z.string().trim().min(1).max(2_048),
    pathnameKey: z.string().trim().min(1).max(2_048),
    pageId: LocalizedResourceIdSchema,
    draftClaim: z.boolean(),
    publishedClaim: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.pathname.startsWith("/")) {
      context.addIssue({
        code: "custom",
        path: ["pathname"],
        message: "Localized pathname must begin with '/'.",
      });
    }
    if (!value.draftClaim && !value.publishedClaim) {
      context.addIssue({
        code: "custom",
        message: "A localized route must have a draft or published claim.",
      });
    }
  });
export type LocalizedRoute = z.infer<typeof LocalizedRouteSchema>;

export const TranslationPathKindSchema = z.enum([
  "text",
  "rich-text",
  "plain-url",
  "head-meta",
  "media-alt",
  "access-prompt",
]);
export type TranslationPathKind = z.infer<typeof TranslationPathKindSchema>;

/**
 * Paths are stable node-id/property addresses (not mutable array indexes).
 * The service owns their exact grammar; storage only persists the issued set.
 */
export const TranslationManifestEntrySchema = z
  .object({
    path: z.string().trim().min(1).max(512),
    kind: TranslationPathKindSchema,
    required: z.boolean(),
    nullable: z.boolean(),
    allowEmpty: z.boolean(),
    maxBytes: z.int().positive().max(262_144),
  })
  .strict();
export type TranslationManifestEntry = z.infer<
  typeof TranslationManifestEntrySchema
>;

export const TranslationManifestSchema = z
  .object({
    entries: z.array(TranslationManifestEntrySchema).max(4_000),
    hash: z.string().trim().min(16).max(256),
    structureHash: z.string().trim().min(16).max(256),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const entry of value.entries) {
      if (seen.has(entry.path)) {
        context.addIssue({
          code: "custom",
          path: ["entries"],
          message: `Translation path ${entry.path} is configured more than once.`,
        });
      }
      seen.add(entry.path);
    }
  });
export type TranslationManifest = z.infer<typeof TranslationManifestSchema>;

export const TranslatedFieldPatchSchema = z
  .object({
    path: z.string().trim().min(1).max(512),
    value: z.unknown(),
    /** False restores the frozen source value; true preserves explicit empty values. */
    translated: z.boolean(),
  })
  .strict();
export type TranslatedFieldPatch = z.infer<typeof TranslatedFieldPatchSchema>;

export const LocalizedActorSnapshotSchema = z
  .object({
    id: z.string().trim().min(1).max(160).nullable(),
    username: z.string().trim().min(1).max(160).nullable(),
    email: z.email().trim().max(320).nullable(),
    avatarUrl: z.url().trim().max(2_048).nullable(),
  })
  .strict();
export type LocalizedActorSnapshot = z.infer<
  typeof LocalizedActorSnapshotSchema
>;

const LocalizedDslSchema = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
  "A localized DSL snapshot must be an object.",
);

/**
 * SEO is versioned alongside the translated page, never read from a
 * newer source. Localized canonicals are resolver-owned so a target locale.
 */
export const LocalizedSeoSchema = z
  .object({
    title: z.string().max(300).nullable(),
    description: z.string().max(2_000).nullable(),
    canonicalPath: z.null(),
    noindex: z.boolean(),
    nofollow: z.boolean(),
    ogTitle: z.string().max(300).nullable(),
    ogDescription: z.string().max(2_000).nullable(),
    ogImage: z.string().trim().max(2_048).nullable(),
  })
  .strict();
export type LocalizedSeo = z.infer<typeof LocalizedSeoSchema>;

export const PageLocaleVersionSchema = z
  .object({
    pageId: LocalizedResourceIdSchema,
    locale: LocaleCodeSchema,
    version: LocalizedVersionIdSchema,
    sourceVersion: LocalizedVersionIdSchema,
    slug: z.string().trim().min(1).max(255).nullable(),
    accessPromptTitle: z.string().max(300).nullable(),
    accessPromptDescription: z.string().max(2_000).nullable(),
    seo: LocalizedSeoSchema,
    dsl: LocalizedDslSchema,
    translatedPaths: z.array(z.string().trim().min(1).max(512)).max(4_000),
    sourceManifestHash: z.string().trim().min(16).max(256),
    sourceStructureHash: z.string().trim().min(16).max(256),
    layoutId: LocalizedResourceIdSchema.nullable(),
    fallbackLayoutVersion: LocalizedVersionIdSchema.nullable(),
    contentHash: z.string().trim().min(16).max(256).nullable(),
    createdAt: IsoDateTimeSchema,
    actor: LocalizedActorSnapshotSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.layoutId === null) !== (value.fallbackLayoutVersion === null)) {
      context.addIssue({
        code: "custom",
        message:
          "Localized page layout fallback must include both id and version.",
      });
    }
  });
export type PageLocaleVersion = z.infer<typeof PageLocaleVersionSchema>;

export const LayoutLocaleVersionSchema = z
  .object({
    layoutId: LocalizedResourceIdSchema,
    locale: LocaleCodeSchema,
    version: LocalizedVersionIdSchema,
    sourceVersion: LocalizedVersionIdSchema,
    dsl: LocalizedDslSchema,
    translatedPaths: z.array(z.string().trim().min(1).max(512)).max(4_000),
    sourceManifestHash: z.string().trim().min(16).max(256),
    sourceStructureHash: z.string().trim().min(16).max(256),
    contentHash: z.string().trim().min(16).max(256).nullable(),
    createdAt: IsoDateTimeSchema,
    actor: LocalizedActorSnapshotSchema,
  })
  .strict();
export type LayoutLocaleVersion = z.infer<typeof LayoutLocaleVersionSchema>;

export const PageLocaleMetaSchema = z
  .object({
    pageId: LocalizedResourceIdSchema,
    locale: LocaleCodeSchema,
    draftVersion: LocalizedVersionIdSchema,
    publishedVersion: LocalizedVersionIdSchema.nullable(),
    currentVersion: LocalizedVersionIdSchema,
    publishedAt: IsoDateTimeSchema.nullable(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type PageLocaleMeta = z.infer<typeof PageLocaleMetaSchema>;

export const LayoutLocaleMetaSchema = z
  .object({
    layoutId: LocalizedResourceIdSchema,
    locale: LocaleCodeSchema,
    draftVersion: LocalizedVersionIdSchema,
    publishedVersion: LocalizedVersionIdSchema.nullable(),
    currentVersion: LocalizedVersionIdSchema,
    publishedAt: IsoDateTimeSchema.nullable(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type LayoutLocaleMeta = z.infer<typeof LayoutLocaleMetaSchema>;

/**
 * A complete portable localized page record. Immutable versions are retained
 * so an export or content-sync transfer never silently loses rollback state.
 */
export const PageLocaleRecordSchema = z
  .object({
    meta: PageLocaleMetaSchema,
    versions: z.array(PageLocaleVersionSchema).min(1).max(10_000),
    routes: z.array(LocalizedRouteSchema).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    const versions = new Set(value.versions.map((version) => version.version));
    const { meta } = value;
    if (
      value.versions.some(
        (version) =>
          version.pageId !== meta.pageId || version.locale !== meta.locale,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["versions"],
        message: "Localized page versions must belong to the record owner.",
      });
    }
    for (const version of [
      meta.draftVersion,
      meta.currentVersion,
      meta.publishedVersion,
    ]) {
      if (version && !versions.has(version)) {
        context.addIssue({
          code: "custom",
          path: ["meta"],
          message: "Localized page metadata points at a missing version.",
        });
      }
    }
    const draftRoutes = value.routes.filter((route) => route.draftClaim);
    const publishedRoutes = value.routes.filter((route) => route.publishedClaim);
    if (draftRoutes.length > 1 || publishedRoutes.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "A localized page can have at most one draft and published route.",
      });
    }
    if (
      value.routes.some(
        (route) => route.pageId !== meta.pageId || route.locale !== meta.locale,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Localized page routes must belong to the record owner.",
      });
    }
    if (meta.publishedVersion && publishedRoutes.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "A published localized page requires a published route.",
      });
    }
  });
export type PageLocaleRecord = z.infer<typeof PageLocaleRecordSchema>;

/** A complete portable localized layout record, including immutable history. */
export const LayoutLocaleRecordSchema = z
  .object({
    meta: LayoutLocaleMetaSchema,
    versions: z.array(LayoutLocaleVersionSchema).min(1).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const versions = new Set(value.versions.map((version) => version.version));
    const { meta } = value;
    if (
      value.versions.some(
        (version) =>
          version.layoutId !== meta.layoutId || version.locale !== meta.locale,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["versions"],
        message: "Localized layout versions must belong to the record owner.",
      });
    }
    for (const version of [
      meta.draftVersion,
      meta.currentVersion,
      meta.publishedVersion,
    ]) {
      if (version && !versions.has(version)) {
        context.addIssue({
          code: "custom",
          path: ["meta"],
          message: "Localized layout metadata points at a missing version.",
        });
      }
    }
  });
export type LayoutLocaleRecord = z.infer<typeof LayoutLocaleRecordSchema>;

export const CacheInvalidationScopeSchema = z.enum([
  "public-route",
  "discovery",
  "rss",
  "locale-policy",
  "all",
]);
export const CacheInvalidationStatusSchema = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
]);
export type CacheInvalidationStatus = z.infer<
  typeof CacheInvalidationStatusSchema
>;

export const CacheInvalidationJobSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    idempotencyKey: z.string().trim().min(1).max(512),
    scope: CacheInvalidationScopeSchema,
    payload: z.record(z.string(), z.unknown()),
    status: CacheInvalidationStatusSchema,
    attemptCount: z.int().nonnegative(),
    nextAttemptAt: IsoDateTimeSchema,
    leaseToken: z.string().trim().min(1).max(160).nullable(),
    leaseExpiresAt: IsoDateTimeSchema.nullable(),
    lastError: z.string().max(2_000).nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    completedAt: IsoDateTimeSchema.nullable(),
  })
  .strict();
export type CacheInvalidationJob = z.infer<typeof CacheInvalidationJobSchema>;

export const RouteLeaseSchema = z
  .object({
    locale: LocaleCodeSchema,
    leaseToken: z.string().trim().min(1).max(160),
    expiresAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type RouteLease = z.infer<typeof RouteLeaseSchema>;
