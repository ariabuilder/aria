import { z } from "zod";
import { AriaCollectionSchema, type AriaCollection } from "../cms/schemas";
import { cmsUrlPatternParts } from "../cms/routing";
import {
  StoredPageAccessModeSchema,
  StoredPagePolicySchema,
  StoredPageSystemRoleSchema,
  type StoredPageAccessMode,
  type StoredPagePolicy,
  type StoredPageSystemRole,
} from "../storage/adapter";

export const PagePolicyRouteContextSchema = z.enum(["direct", "cms-entry"]);
export type PagePolicyRouteContext = z.infer<
  typeof PagePolicyRouteContextSchema
>;

export const CmsTemplatePolicyPageRefSchema = z
  .object({
    id: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    parent: z.string().trim().min(1).nullable().optional(),
    systemRole: StoredPageSystemRoleSchema.optional(),
  })
  .strict();
export type CmsTemplatePolicyPageRef = z.infer<
  typeof CmsTemplatePolicyPageRefSchema
>;

export const PageCmsRoutingImpactSchema = z
  .object({
    pageId: z.string().trim().min(1),
    templateCollections: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          name: z.string().trim().min(1),
          label: z.string().trim().min(1),
        })
        .strict(),
    ),
    listCollections: z.array(
      z
        .object({
          id: z.string().trim().min(1),
          name: z.string().trim().min(1),
          label: z.string().trim().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type PageCmsRoutingImpact = z.infer<typeof PageCmsRoutingImpactSchema>;

export const CmsTemplatePolicyValidationResultSchema = z
  .object({
    valid: z.boolean(),
    message: z.string().trim().min(1).nullable(),
  })
  .strict();
export type CmsTemplatePolicyValidationResult = z.infer<
  typeof CmsTemplatePolicyValidationResultSchema
>;

export const CollectionAssignmentClearSchema = z
  .object({
    collectionId: z.string().trim().min(1),
    collectionLabel: z.string().trim().min(1),
    field: z.enum(["templatePageId", "listPageId"]),
  })
  .strict();
export type CollectionAssignmentClear = z.infer<
  typeof CollectionAssignmentClearSchema
>;

function collectionRef(collection: Pick<AriaCollection, "id" | "name" | "label">): {
  id: string;
  name: string;
  label: string;
} {
  return {
    id: collection.id,
    name: collection.name,
    label: collection.label,
  };
}

function pageRoutingIdentifiers(input: {
  pageId: string;
  pageSlug?: string | null;
}): Set<string> {
  const pageId = z.string().trim().min(1).parse(input.pageId);
  const identifiers = new Set<string>([pageId]);
  const pageSlug = input.pageSlug?.trim();
  if (pageSlug) {
    identifiers.add(pageSlug);
  }
  return identifiers;
}

export function getPageCmsRoutingImpact(input: {
  pageId: string;
  pageSlug?: string | null;
  collections: readonly Pick<
    AriaCollection,
    "id" | "name" | "label" | "templatePageId" | "listPageId"
  >[];
}): PageCmsRoutingImpact {
  const pageId = z.string().trim().min(1).parse(input.pageId);
  const collections = z
    .array(
      z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1),
        label: z.string().trim().min(1),
        templatePageId: z.string().trim().min(1).nullable(),
        listPageId: z.string().trim().min(1).nullable(),
      }),
    )
    .parse(input.collections);
  const identifiers = pageRoutingIdentifiers({ pageId, pageSlug: input.pageSlug });

  const templateCollections = collections
    .filter(
      (collection) =>
        typeof collection.templatePageId === "string" &&
        identifiers.has(collection.templatePageId),
    )
    .map(collectionRef);
  const listCollections = collections
    .filter(
      (collection) =>
        typeof collection.listPageId === "string" &&
        identifiers.has(collection.listPageId),
    )
    .map(collectionRef);

  return PageCmsRoutingImpactSchema.parse({
    pageId,
    templateCollections,
    listCollections,
  });
}

export function pageHasCmsRoutingAssignments(
  impact: PageCmsRoutingImpact,
): boolean {
  const parsed = PageCmsRoutingImpactSchema.parse(impact);
  return (
    parsed.templateCollections.length > 0 || parsed.listCollections.length > 0
  );
}

export function formatPageCmsRoutingDeleteMessage(
  impact: PageCmsRoutingImpact,
): string {
  const parsed = PageCmsRoutingImpactSchema.parse(impact);
  const parts: string[] = [];

  if (parsed.templateCollections.length > 0) {
    parts.push(
      `entry template for ${parsed.templateCollections.map((c) => c.label).join(", ")}`,
    );
  }
  if (parsed.listCollections.length > 0) {
    parts.push(
      `list template for ${parsed.listCollections.map((c) => c.label).join(", ")}`,
    );
  }

  if (parts.length === 0) {
    return "This page is assigned to a collection route.";
  }

  return `This page is the ${parts.join(" and ")}. Clear the assignment in collection settings before deleting.`;
}

export function findCollectionUsingPageAsList(
  pageId: string,
  collections: readonly AriaCollection[],
): AriaCollection | null {
  return (
    collections.find((collection) => collection.listPageId === pageId) ?? null
  );
}

export function findCollectionUsingPageAsEntry(
  pageId: string,
  collections: readonly AriaCollection[],
): AriaCollection | null {
  return (
    collections.find((collection) => collection.templatePageId === pageId) ??
    null
  );
}

export function pageHasChildPages(
  pageSlug: string,
  pages: readonly CmsTemplatePolicyPageRef[],
): boolean {
  return pages.some((page) => page.parent === pageSlug);
}

function findCollectionWithSharedRoleForPage(
  pageId: string,
  collections: readonly AriaCollection[],
): AriaCollection | null {
  return (
    collections.find(
      (collection) =>
        collection.templatePageId === pageId &&
        collection.listPageId === pageId,
    ) ?? null
  );
}

/**
 * Validates a manual Page Type tab switch to CMS Entry.
 * Cross-collection bindings for the *other* role are auto-cleared by.
 */
export function validateCmsEntryRoleSave(input: {
  policy: StoredPagePolicy;
  nextSystemRole: StoredPageSystemRole;
  nextAccessMode: StoredPageAccessMode;
  collections: readonly AriaCollection[];
  pages: readonly CmsTemplatePolicyPageRef[];
}): CmsTemplatePolicyValidationResult {
  const policy = StoredPagePolicySchema.parse(input.policy);
  const nextSystemRole = StoredPageSystemRoleSchema.parse(input.nextSystemRole);
  const nextAccessMode = StoredPageAccessModeSchema.parse(input.nextAccessMode);
  const collections = z.array(AriaCollectionSchema).parse(input.collections);
  const pages = z.array(CmsTemplatePolicyPageRefSchema).parse(input.pages);

  if (nextSystemRole !== "cms-entry") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: true,
      message: null,
    });
  }

  if (policy.slug === "index") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message: "The homepage cannot be a CMS Entry page.",
    });
  }

  if (pageHasChildPages(policy.slug, pages)) {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "Move or delete child pages before marking this page as a CMS Entry page.",
    });
  }

  const sharedRoleCollection = findCollectionWithSharedRoleForPage(
    policy.id,
    collections,
  );
  if (sharedRoleCollection) {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message: `${sharedRoleCollection.label} uses this page as both its list and entry template. Update the collection's template pages before changing this page's type.`,
    });
  }

  if (nextAccessMode !== "public") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "CMS Entry pages must use public access so collection entry URLs keep working.",
    });
  }

  return CmsTemplatePolicyValidationResultSchema.parse({
    valid: true,
    message: null,
  });
}

/**
 * Validates a manual Page Type tab switch to CMS Collection. Mirrors
 * `validateCmsEntryRoleSave` — only structural blocks, cross-collection
 * clearing is handled separately.
 */
export function validateCmsCollectionRoleSave(input: {
  policy: StoredPagePolicy;
  nextSystemRole: StoredPageSystemRole;
  collections: readonly AriaCollection[];
  pages: readonly CmsTemplatePolicyPageRef[];
}): CmsTemplatePolicyValidationResult {
  const policy = StoredPagePolicySchema.parse(input.policy);
  const nextSystemRole = StoredPageSystemRoleSchema.parse(input.nextSystemRole);
  const collections = z.array(AriaCollectionSchema).parse(input.collections);
  const pages = z.array(CmsTemplatePolicyPageRefSchema).parse(input.pages);

  if (nextSystemRole !== "cms-collection") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: true,
      message: null,
    });
  }

  if (pageHasChildPages(policy.slug, pages)) {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "Move or delete child pages before marking this page as a CMS Collection page.",
    });
  }

  const sharedRoleCollection = findCollectionWithSharedRoleForPage(
    policy.id,
    collections,
  );
  if (sharedRoleCollection) {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message: `${sharedRoleCollection.label} uses this page as both its list and entry template. Update the collection's template pages before changing this page's type.`,
    });
  }

  return CmsTemplatePolicyValidationResultSchema.parse({
    valid: true,
    message: null,
  });
}

export function validateCmsEntryAccessModeSave(input: {
  systemRole: StoredPageSystemRole;
  accessMode: StoredPageAccessMode;
}): CmsTemplatePolicyValidationResult {
  const systemRole = StoredPageSystemRoleSchema.parse(input.systemRole);
  const accessMode = StoredPageAccessModeSchema.parse(input.accessMode);

  if (systemRole !== "cms-entry") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: true,
      message: null,
    });
  }

  if (accessMode !== "public") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "CMS Entry pages must use public access so collection entry URLs keep working.",
    });
  }

  return CmsTemplatePolicyValidationResultSchema.parse({
    valid: true,
    message: null,
  });
}

/**
 * Only `cms-entry` and `not-found` force public access. `cms-collection`
 * keeps whatever access mode the user picked, same as a Standard page.
 */
export function resolveCmsPageRoleAccessMode(
  systemRole: StoredPageSystemRole,
  accessMode: StoredPageAccessMode,
): StoredPageAccessMode {
  const parsedRole = StoredPageSystemRoleSchema.parse(systemRole);
  const parsedMode = StoredPageAccessModeSchema.parse(accessMode);

  if (parsedRole === "not-found" || parsedRole === "cms-entry") {
    return "public";
  }

  return parsedMode;
}

export function pageRoleById(
  pageId: string,
  pages: readonly CmsTemplatePolicyPageRef[],
): StoredPageSystemRole {
  const page = pages.find((entry) => entry.id === pageId);
  return page?.systemRole ?? "standard";
}

/**
 * Determines which collection template/list bindings must be cleared when
 * a page's system role changes. Standard/404 clear both bindings;.
 */
export function collectionsRequiringClearForRoleChange(input: {
  pageId: string;
  nextSystemRole: StoredPageSystemRole;
  collections: readonly AriaCollection[];
}): CollectionAssignmentClear[] {
  const pageId = z.string().trim().min(1).parse(input.pageId);
  const nextSystemRole = StoredPageSystemRoleSchema.parse(input.nextSystemRole);
  const collections = z.array(AriaCollectionSchema).parse(input.collections);

  const clearsTemplate =
    nextSystemRole === "standard" ||
    nextSystemRole === "not-found" ||
    nextSystemRole === "cms-collection";
  const clearsList =
    nextSystemRole === "standard" ||
    nextSystemRole === "not-found" ||
    nextSystemRole === "cms-entry";

  const clears: CollectionAssignmentClear[] = [];
  for (const collection of collections) {
    if (clearsTemplate && collection.templatePageId === pageId) {
      clears.push(
        CollectionAssignmentClearSchema.parse({
          collectionId: collection.id,
          collectionLabel: collection.label,
          field: "templatePageId",
        }),
      );
    }
    if (clearsList && collection.listPageId === pageId) {
      clears.push(
        CollectionAssignmentClearSchema.parse({
          collectionId: collection.id,
          collectionLabel: collection.label,
          field: "listPageId",
        }),
      );
    }
  }

  return clears;
}

export function validateListTemplatePageAssignment(input: {
  listPageId: string;
  pages: readonly CmsTemplatePolicyPageRef[];
}): CmsTemplatePolicyValidationResult {
  const listPageId = z.string().trim().min(1).parse(input.listPageId);
  const pages = z.array(CmsTemplatePolicyPageRefSchema).parse(input.pages);
  const role = pageRoleById(listPageId, pages);

  if (role === "cms-entry") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "CMS Entry pages cannot be used as list templates. Choose a Standard or CMS Collection page for the archive.",
    });
  }

  return CmsTemplatePolicyValidationResultSchema.parse({
    valid: true,
    message: null,
  });
}

export function validateEntryTemplatePageAssignment(input: {
  templatePageId: string;
  pages: readonly CmsTemplatePolicyPageRef[];
}): CmsTemplatePolicyValidationResult {
  const templatePageId = z.string().trim().min(1).parse(input.templatePageId);
  const pages = z.array(CmsTemplatePolicyPageRefSchema).parse(input.pages);
  const role = pageRoleById(templatePageId, pages);

  if (role === "cms-collection") {
    return CmsTemplatePolicyValidationResultSchema.parse({
      valid: false,
      message:
        "CMS Collection pages cannot be used as entry templates. Choose a Standard or CMS Entry page for the entry layout.",
    });
  }

  return CmsTemplatePolicyValidationResultSchema.parse({
    valid: true,
    message: null,
  });
}

export function entrySlugLeafCollisions(input: {
  urlPattern: string;
  pages: readonly CmsTemplatePolicyPageRef[];
}): readonly CmsTemplatePolicyPageRef[] {
  const urlPattern = z.string().trim().min(1).parse(input.urlPattern);
  const pages = z.array(CmsTemplatePolicyPageRefSchema).parse(input.pages);
  const parts = cmsUrlPatternParts(urlPattern);
  if (parts.at(-1) !== "{slug}") {
    return [];
  }

  return pages.filter((page) => page.slug !== "index");
}

export function isCmsEntryDirectRouteBlocked(input: {
  systemRole: StoredPageSystemRole;
  routeContext: PagePolicyRouteContext;
  isAuthenticatedPreview: boolean;
}): boolean {
  const systemRole = StoredPageSystemRoleSchema.parse(input.systemRole);
  const routeContext = PagePolicyRouteContextSchema.parse(input.routeContext);

  if (systemRole !== "cms-entry") {
    return false;
  }

  if (input.isAuthenticatedPreview) {
    return false;
  }

  return routeContext === "direct";
}
