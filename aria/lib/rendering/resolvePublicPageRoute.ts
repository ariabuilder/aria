import { z } from "zod";
import type { StorageAdapter } from "../storage/adapter";
import type { PageDSL } from "../types/nodes";
import {
  CmsUrlPatternSpecificitySchema,
  cmsUrlPatternSpecificity,
  compareCmsUrlPatternSpecificity,
  matchCmsUrlPattern,
} from "../cms/routing";

export const PublicPageRouteStageSchema = z.enum(["draft", "published"]);
/** `"draft"` is the authenticated preview stage (draft, scheduled, and published entries). */
export type PublicPageRouteStage = z.infer<typeof PublicPageRouteStageSchema>;

export const CollectionTemplateRouteSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    entrySlug: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
    templatePageId: z.string().trim().min(1),
  })
  .strict();
export type CollectionTemplateRoute = z.infer<
  typeof CollectionTemplateRouteSchema
>;

export const CollectionEntryContextSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    entryId: z.string().trim().min(1),
  })
  .strict();
export type CollectionEntryContext = z.infer<
  typeof CollectionEntryContextSchema
>;

export const CollectionPublicPageRouteSchema = z
  .object({
    kind: z.literal("collection"),
    templatePage: z.custom<PageDSL>(
      (value) => value !== null && typeof value === "object",
    ),
    templateRoute: CollectionTemplateRouteSchema,
    entryContext: CollectionEntryContextSchema,
    pathname: z.string().trim().min(1),
  })
  .strict();
export type CollectionPublicPageRoute = z.infer<
  typeof CollectionPublicPageRouteSchema
>;

const CollectionTemplateRouteCandidateSchema =
  CollectionTemplateRouteSchema.omit({ entryId: true })
    .extend({
      order: z.int().nonnegative(),
      specificity: CmsUrlPatternSpecificitySchema,
      entryId: z.string().trim().min(1),
    })
    .strict();
type CollectionTemplateRouteCandidate = z.infer<
  typeof CollectionTemplateRouteCandidateSchema
>;

export const ResolveCollectionTemplateRouteInputSchema = z
  .object({
    pathname: z.string().trim().min(1),
    stage: PublicPageRouteStageSchema,
    /** A public locale path only resolves an explicitly stored locale row. */
    locale: z.string().trim().min(1).optional(),
  })
  .strict();

function isInvalidSlugError(value: unknown): boolean {
  return (
    value instanceof Error &&
    typeof value.message === "string" &&
    value.message.toLowerCase().includes("invalid slug")
  );
}

async function getPageDslSafe(
  adapter: StorageAdapter,
  pageIdOrSlug: string,
  stage: PublicPageRouteStage,
): Promise<PageDSL | null> {
  try {
    return stage === "published"
      ? await adapter.getPublishedPageDSL(pageIdOrSlug)
      : await adapter.getPageDSL(pageIdOrSlug);
  } catch (error: unknown) {
    if (isInvalidSlugError(error)) {
      return null;
    }
    throw error;
  }
}

function compareCollectionRouteCandidates(
  left: CollectionTemplateRouteCandidate,
  right: CollectionTemplateRouteCandidate,
): number {
  return (
    compareCmsUrlPatternSpecificity(left.specificity, right.specificity) ||
    left.order - right.order
  );
}

export async function resolveCollectionTemplateRoute(
  adapter: StorageAdapter,
  input: z.input<typeof ResolveCollectionTemplateRouteInputSchema>,
): Promise<CollectionTemplateRoute | null> {
  const { pathname, stage, locale } =
    ResolveCollectionTemplateRouteInputSchema.parse(input);
  const collections = await adapter.listCollections();
  const candidates: CollectionTemplateRouteCandidate[] = [];

  for (const [order, collection] of collections.entries()) {
    if (!collection.urlPattern || !collection.templatePageId) {
      continue;
    }

    const entrySlug = matchCmsUrlPattern(collection.urlPattern, pathname);
    if (!entrySlug) {
      continue;
    }

    const specificity = cmsUrlPatternSpecificity(collection.urlPattern);
    if (!specificity) {
      continue;
    }

    const entry = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: entrySlug,
      locale,
    });
    if (!entry) {
      continue;
    }

    if (stage === "published" && entry.entry.status !== "published") {
      continue;
    }

    if (entry.entry.status === "archived") {
      continue;
    }

    candidates.push(
      CollectionTemplateRouteCandidateSchema.parse({
        collectionId: collection.id,
        entrySlug,
        entryId: entry.entry.id,
        templatePageId: collection.templatePageId,
        order,
        specificity,
      }),
    );
  }

  const [match] = candidates.sort(compareCollectionRouteCandidates);
  if (!match) {
    return null;
  }

  return CollectionTemplateRouteSchema.parse({
    collectionId: match.collectionId,
    entrySlug: match.entrySlug,
    entryId: match.entryId,
    templatePageId: match.templatePageId,
  });
}

export const LoadCollectionPublicPageRouteInputSchema = z
  .object({
    pathname: z.string().trim().min(1),
    stage: PublicPageRouteStageSchema,
    locale: z.string().trim().min(1).optional(),
  })
  .strict();

export async function loadCollectionPublicPageRoute(
  adapter: StorageAdapter,
  input: z.input<typeof LoadCollectionPublicPageRouteInputSchema>,
): Promise<CollectionPublicPageRoute | null> {
  const parsed = LoadCollectionPublicPageRouteInputSchema.parse(input);
  const templateRoute = await resolveCollectionTemplateRoute(adapter, parsed);
  if (!templateRoute) {
    return null;
  }

  const templatePage = await getPageDslSafe(
    adapter,
    templateRoute.templatePageId,
    parsed.stage,
  );
  if (!templatePage) {
    return null;
  }

  return CollectionPublicPageRouteSchema.parse({
    kind: "collection",
    templatePage,
    templateRoute,
    entryContext: CollectionEntryContextSchema.parse({
      collectionId: templateRoute.collectionId,
      slug: templateRoute.entrySlug,
      entryId: templateRoute.entryId,
    }),
    pathname: parsed.pathname,
  });
}
