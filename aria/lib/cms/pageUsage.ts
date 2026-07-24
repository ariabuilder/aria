import { z } from "zod";
import { AriaCollectionSchema, type AriaCollection } from "./schemas";
import {
  cmsUrlPatternParts,
  cmsUrlPatternSpecificity,
  normalizeCmsRoutePath,
  validateCmsUrlPattern,
} from "./routing";
import {
  entrySlugLeafCollisions,
  findCollectionUsingPageAsEntry,
  findCollectionUsingPageAsList,
  pageHasChildPages,
  pageRoleById,
  type CmsTemplatePolicyPageRef,
} from "../pages/cmsTemplatePolicy";
import { StoredPageSystemRoleSchema } from "../storage/adapter";

export const CmsPageUsageKindSchema = z.enum([
  "template",
  "list",
  "cms-bound",
]);
export type CmsPageUsageKind = z.infer<typeof CmsPageUsageKindSchema>;

export const CmsPageUsageSchema = z
  .object({
    kind: CmsPageUsageKindSchema,
    collectionId: z.string().trim().min(1).optional(),
    collectionName: z.string().trim().min(1).optional(),
    collectionLabel: z.string().trim().min(1).optional(),
    nodeId: z.string().trim().min(1).optional(),
    bindingCount: z.int().nonnegative().optional(),
    loop: z.boolean().optional(),
  })
  .strict();
export type CmsPageUsage = z.infer<typeof CmsPageUsageSchema>;

export const CmsRouteWarningSeveritySchema = z.enum(["blocking", "advisory"]);
export type CmsRouteWarningSeverity = z.infer<
  typeof CmsRouteWarningSeveritySchema
>;

export const CmsRouteWarningCodeSchema = z.enum([
  "invalid-url-pattern",
  "missing-template-page",
  "missing-list-page",
  "route-pattern-without-template",
  "template-without-url-pattern",
  "shared-template-list-page",
  "static-page-conflict",
  "overlapping-collection-pattern",
  "invalid-list-page-role",
  "invalid-template-page-role",
  "cross-collection-role-conflict",
  "entry-slug-page-collision",
]);
export type CmsRouteWarningCode = z.infer<typeof CmsRouteWarningCodeSchema>;

export const CmsRouteWarningSchema = z
  .object({
    code: CmsRouteWarningCodeSchema,
    severity: CmsRouteWarningSeveritySchema.default("advisory"),
    message: z.string().trim().min(1),
    relatedCollectionId: z.string().trim().min(1).optional(),
    relatedPageId: z.string().trim().min(1).optional(),
  })
  .strict();
export type CmsRouteWarning = z.infer<typeof CmsRouteWarningSchema>;

export const CmsPageReferenceSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    parent: z.string().trim().min(1).nullable().optional(),
    systemRole: StoredPageSystemRoleSchema.optional(),
  })
  .strict();
export type CmsPageReference = z.infer<typeof CmsPageReferenceSchema>;

function toPolicyPageRef(page: CmsPageReference): CmsTemplatePolicyPageRef {
  return {
    id: page.id,
    slug: page.slug,
    parent: page.parent ?? null,
    systemRole: page.systemRole,
  };
}

function collectionUsage(
  kind: "template" | "list",
  collection: AriaCollection,
): CmsPageUsage {
  return CmsPageUsageSchema.parse({
    kind,
    collectionId: collection.id,
    collectionName: collection.name,
    collectionLabel: collection.label,
  });
}

function cmsUsageCollectionLabel(usage: CmsPageUsage): string {
  return usage.collectionLabel ?? usage.collectionName ?? "Unknown";
}

export function cmsPageUsageBadgeLabels(
  usages: readonly CmsPageUsage[] | undefined,
): string[] {
  if (!usages?.length) return [];

  const labels: string[] = [];

  for (const usage of usages) {
    if (usage.kind === "template") {
      labels.push(`CMS: ${cmsUsageCollectionLabel(usage)} Entries`);
    } else if (usage.kind === "list") {
      labels.push(`CMS: ${cmsUsageCollectionLabel(usage)}`);
    }
  }

  return labels;
}

export function cmsPageUsageDetailLabels(
  usages: readonly CmsPageUsage[] | undefined,
): string[] {
  if (!usages?.length) return [];

  return usages.map((usage) => {
    const label = cmsUsageCollectionLabel(usage);
    if (usage.kind === "template") {
      return `Entry template for ${label}`;
    }
    if (usage.kind === "list") {
      return `List template for ${label}`;
    }
    const bindingType = usage.loop ? "list block" : "single binding";
    const nodeLabel = usage.nodeId ? ` (${usage.nodeId})` : "";
    return `${label} ${bindingType}${nodeLabel}`;
  });
}

export function deriveCmsPageUsages(input: {
  pages: readonly CmsPageReference[];
  collections: readonly AriaCollection[];
}): Map<string, CmsPageUsage[]> {
  const pages = z.array(CmsPageReferenceSchema).parse(input.pages);
  const collections = z.array(AriaCollectionSchema).parse(input.collections);
  const usages = new Map<string, CmsPageUsage[]>(
    pages.map((page) => [page.id, []]),
  );

  for (const collection of collections) {
    if (collection.templatePageId) {
      const existing = usages.get(collection.templatePageId) ?? [];
      usages.set(collection.templatePageId, [
        ...existing,
        collectionUsage("template", collection),
      ]);
    }
    if (collection.listPageId) {
      const existing = usages.get(collection.listPageId) ?? [];
      usages.set(collection.listPageId, [
        ...existing,
        collectionUsage("list", collection),
      ]);
    }
  }

  return new Map(
    Array.from(usages.entries()).map(([pageId, pageUsages]) => [
      pageId,
      z.array(CmsPageUsageSchema).parse(pageUsages),
    ]),
  );
}

function pagePath(page: CmsPageReference): string {
  return page.slug === "index" ? "/" : normalizeCmsRoutePath(page.slug);
}

function pageDisplayPath(page: CmsPageReference): string {
  return pagePath(page);
}

function patternCouldMatchPath(pattern: string, pathname: string): boolean {
  const patternParts = cmsUrlPatternParts(pattern);
  const pathParts = cmsUrlPatternParts(pathname);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => {
    if (part === "{slug}") return true;
    return part === pathParts[index];
  });
}

function patternsCouldOverlap(leftPattern: string, rightPattern: string): boolean {
  const leftParts = cmsUrlPatternParts(leftPattern);
  const rightParts = cmsUrlPatternParts(rightPattern);
  if (leftParts.length !== rightParts.length) return false;
  return leftParts.every((leftPart, index) => {
    const rightPart = rightParts[index];
    return (
      leftPart === rightPart ||
      leftPart === "{slug}" ||
      rightPart === "{slug}"
    );
  });
}

function validateListPageRole(input: {
  collection: AriaCollection;
  collections: readonly AriaCollection[];
  policyPages: readonly CmsTemplatePolicyPageRef[];
}): CmsRouteWarning | null {
  const { collection, collections, policyPages } = input;
  const listPageId = collection.listPageId;
  if (!listPageId) return null;

  const listRole = pageRoleById(listPageId, policyPages);
  if (listRole === "cms-entry") {
    return CmsRouteWarningSchema.parse({
      code: "invalid-list-page-role",
      severity: "blocking",
      message:
        "This page is a CMS Entry page and can't be used as a list template. Choose a Standard or CMS Collection page.",
      relatedPageId: listPageId,
    });
  }
  if (listRole === "not-found") {
    return CmsRouteWarningSchema.parse({
      code: "invalid-list-page-role",
      severity: "blocking",
      message:
        "The 404 page can't be used as a list template. Choose a different page.",
      relatedPageId: listPageId,
    });
  }

  const page = policyPages.find((entry) => entry.id === listPageId);
  if (page && pageHasChildPages(page.slug, policyPages)) {
    return CmsRouteWarningSchema.parse({
      code: "invalid-list-page-role",
      severity: "blocking",
      message:
        "This page has child pages and can't be used as a list template. Move or delete its children first.",
      relatedPageId: listPageId,
    });
  }

  const entryConflict = findCollectionUsingPageAsEntry(
    listPageId,
    collections.filter((other) => other.id !== collection.id),
  );
  if (entryConflict) {
    return CmsRouteWarningSchema.parse({
      code: "cross-collection-role-conflict",
      severity: "blocking",
      message: `This page is already the entry template for ${entryConflict.label}. A page can only hold one CMS role — choose a different page or update ${entryConflict.label} first.`,
      relatedPageId: listPageId,
      relatedCollectionId: entryConflict.id,
    });
  }

  return null;
}

function validateTemplatePageRole(input: {
  collection: AriaCollection;
  collections: readonly AriaCollection[];
  policyPages: readonly CmsTemplatePolicyPageRef[];
}): CmsRouteWarning | null {
  const { collection, collections, policyPages } = input;
  const templatePageId = collection.templatePageId;
  if (!templatePageId) return null;

  const page = policyPages.find((entry) => entry.id === templatePageId);
  if (page?.slug === "index") {
    return CmsRouteWarningSchema.parse({
      code: "invalid-template-page-role",
      severity: "blocking",
      message: "The homepage can't be used as an entry template.",
      relatedPageId: templatePageId,
    });
  }

  const templateRole = pageRoleById(templatePageId, policyPages);
  if (templateRole === "cms-collection") {
    return CmsRouteWarningSchema.parse({
      code: "invalid-template-page-role",
      severity: "blocking",
      message:
        "This page is a CMS Collection page and can't be used as an entry template. Choose a Standard or CMS Entry page.",
      relatedPageId: templatePageId,
    });
  }
  if (templateRole === "not-found") {
    return CmsRouteWarningSchema.parse({
      code: "invalid-template-page-role",
      severity: "blocking",
      message:
        "The 404 page can't be used as an entry template. Choose a different page.",
      relatedPageId: templatePageId,
    });
  }

  if (page && pageHasChildPages(page.slug, policyPages)) {
    return CmsRouteWarningSchema.parse({
      code: "invalid-template-page-role",
      severity: "blocking",
      message:
        "This page has child pages and can't be used as an entry template. Move or delete its children first.",
      relatedPageId: templatePageId,
    });
  }

  const listConflict = findCollectionUsingPageAsList(
    templatePageId,
    collections.filter((other) => other.id !== collection.id),
  );
  if (listConflict) {
    return CmsRouteWarningSchema.parse({
      code: "cross-collection-role-conflict",
      severity: "blocking",
      message: `This page is already the list template for ${listConflict.label}. A page can only hold one CMS role — choose a different page or update ${listConflict.label} first.`,
      relatedPageId: templatePageId,
      relatedCollectionId: listConflict.id,
    });
  }

  return null;
}

export function validateCollectionRouteUsage(input: {
  collection: AriaCollection;
  collections: readonly AriaCollection[];
  pages: readonly CmsPageReference[];
}): readonly CmsRouteWarning[] {
  const collection = AriaCollectionSchema.parse(input.collection);
  const collections = z.array(AriaCollectionSchema).parse(input.collections);
  const pages = z.array(CmsPageReferenceSchema).parse(input.pages);
  const pageIds = new Set(pages.map((page) => page.id));
  const warnings: CmsRouteWarning[] = [];

  if (collection.templatePageId && !pageIds.has(collection.templatePageId)) {
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "missing-template-page",
        message: "The selected template page no longer exists.",
        relatedPageId: collection.templatePageId,
      }),
    );
  }

  if (collection.listPageId && !pageIds.has(collection.listPageId)) {
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "missing-list-page",
        message: "The selected list page no longer exists.",
        relatedPageId: collection.listPageId,
      }),
    );
  }

  const policyPages = pages.map(toPolicyPageRef);

  if (
    collection.templatePageId &&
    collection.listPageId &&
    collection.templatePageId === collection.listPageId
  ) {
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "shared-template-list-page",
        severity: "blocking",
        message:
          "A page can't be both the list template and the entry template for the same collection. Choose separate pages.",
        relatedPageId: collection.templatePageId,
      }),
    );
  } else {
    if (collection.listPageId && pageIds.has(collection.listPageId)) {
      const warning = validateListPageRole({ collection, collections, policyPages });
      if (warning) warnings.push(warning);
    }
    if (collection.templatePageId && pageIds.has(collection.templatePageId)) {
      const warning = validateTemplatePageRole({
        collection,
        collections,
        policyPages,
      });
      if (warning) warnings.push(warning);
    }
  }

  if (!collection.urlPattern) {
    return z.array(CmsRouteWarningSchema).parse(warnings);
  }

  const validation = validateCmsUrlPattern(collection.urlPattern);
  if (!validation.valid) {
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "invalid-url-pattern",
        message: validation.message ?? "URL pattern is invalid.",
      }),
    );
    return z.array(CmsRouteWarningSchema).parse(warnings);
  }

  const collectionSpecificity = cmsUrlPatternSpecificity(collection.urlPattern);
  for (const page of pages) {
    if (patternCouldMatchPath(collection.urlPattern, pagePath(page))) {
      warnings.push(
        CmsRouteWarningSchema.parse({
          code: "static-page-conflict",
          message: `The page ${pageDisplayPath(page)} will win before this collection route.`,
          relatedPageId: page.id,
        }),
      );
    }
  }

  for (const page of entrySlugLeafCollisions({
    urlPattern: collection.urlPattern,
    pages: policyPages,
  })) {
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "entry-slug-page-collision",
        message: `Page /${page.slug} may take precedence over entry URLs like ${collection.urlPattern.replace("{slug}", page.slug)}.`,
        relatedPageId: page.id,
      }),
    );
  }

  for (const other of collections) {
    if (other.id === collection.id || !other.urlPattern) {
      continue;
    }
    const otherValidation = validateCmsUrlPattern(other.urlPattern);
    if (!otherValidation.valid) {
      continue;
    }
    if (!patternsCouldOverlap(collection.urlPattern, other.urlPattern)) {
      continue;
    }
    const otherSpecificity = cmsUrlPatternSpecificity(other.urlPattern);
    const sameSpecificity =
      collectionSpecificity &&
      otherSpecificity &&
      collectionSpecificity.segmentCount === otherSpecificity.segmentCount &&
      collectionSpecificity.staticSegmentCount ===
        otherSpecificity.staticSegmentCount &&
      collectionSpecificity.staticPrefixSegmentCount ===
        otherSpecificity.staticPrefixSegmentCount &&
      collectionSpecificity.literalLength === otherSpecificity.literalLength;
    warnings.push(
      CmsRouteWarningSchema.parse({
        code: "overlapping-collection-pattern",
        message: sameSpecificity
          ? `${other.label} uses an overlapping URL pattern. Stable collection order will decide matching.`
          : `${other.label} uses a URL pattern that can overlap this route.`,
        relatedCollectionId: other.id,
      }),
    );
  }

  return z.array(CmsRouteWarningSchema).parse(warnings);
}
