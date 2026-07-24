import { describe, expect, it } from "vitest";

import {
  collectionsRequiringClearForRoleChange,
  entrySlugLeafCollisions,
  formatPageCmsRoutingDeleteMessage,
  getPageCmsRoutingImpact,
  isCmsEntryDirectRouteBlocked,
  pageHasCmsRoutingAssignments,
  pageRoleById,
  resolveCmsPageRoleAccessMode,
  validateCmsCollectionRoleSave,
  validateCmsEntryAccessModeSave,
  validateCmsEntryRoleSave,
  validateEntryTemplatePageAssignment,
  validateListTemplatePageAssignment,
} from "../../../lib/pages/cmsTemplatePolicy";
import { AriaCollectionSchema, type AriaCollection } from "../../../lib/cms/schemas";
import type { StoredPagePolicy } from "../../../lib/storage/adapter";

function collection(
  overrides: Partial<AriaCollection> & Pick<AriaCollection, "id" | "name" | "label">,
): AriaCollection {
  const kind = overrides.kind ?? "content";
  return AriaCollectionSchema.parse({
    ...overrides,
    id: overrides.id,
    name: overrides.name,
    label: overrides.label,
    kind,
    schema: overrides.schema ?? {
      id: overrides.id,
      label: overrides.label,
      kind,
      fields: [],
      version: 1,
    },
    scope: overrides.scope ?? "global",
    urlPattern: overrides.urlPattern ?? null,
    templatePageId: overrides.templatePageId ?? null,
    listPageId: overrides.listPageId ?? null,
    supports: overrides.supports ?? [],
    createdAt: overrides.createdAt ?? "2026-07-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-01T00:00:00.000Z",
  });
}

const basePolicy: StoredPagePolicy = {
  id: "page-entry",
  slug: "post-template",
  systemRole: "standard",
  accessMode: "public",
  accessPasswordHash: null,
  accessPromptTitle: null,
  accessPromptDescription: null,
  accessRememberForDays: null,
  accessPolicyVersion: 1,
  publishedVersion: null,
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("cms template policy", () => {
  describe("validateCmsEntryRoleSave", () => {
    it("is a no-op when the next role isn't cms-entry", () => {
      expect(
        validateCmsEntryRoleSave({
          policy: basePolicy,
          nextSystemRole: "standard",
          nextAccessMode: "public",
          collections: [],
          pages: [],
        }).valid,
      ).toBe(true);
    });

    it("blocks the homepage from becoming a CMS Entry page", () => {
      const result = validateCmsEntryRoleSave({
        policy: { ...basePolicy, slug: "index", id: "page-index" },
        nextSystemRole: "cms-entry",
        nextAccessMode: "public",
        collections: [],
        pages: [{ id: "page-index", slug: "index" }],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("homepage");
    });

    it("blocks pages with children from becoming a CMS Entry page", () => {
      const result = validateCmsEntryRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-entry",
        nextAccessMode: "public",
        collections: [],
        pages: [
          { id: "page-entry", slug: "post-template" },
          { id: "page-child", slug: "child", parent: "post-template" },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("child pages");
    });

    it("blocks a page from becoming CMS Entry when it's already the list+entry template for the same collection", () => {
      const result = validateCmsEntryRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-entry",
        nextAccessMode: "public",
        collections: [
          collection({
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "page-entry",
            listPageId: "page-entry",
          }),
        ],
        pages: [{ id: "page-entry", slug: "post-template" }],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("Blog");
    });

    it("blocks non-public access modes for CMS Entry pages", () => {
      const result = validateCmsEntryRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-entry",
        nextAccessMode: "private",
        collections: [],
        pages: [{ id: "page-entry", slug: "post-template" }],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("public access");
    });

    it("allows a valid CMS Entry switch", () => {
      const result = validateCmsEntryRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-entry",
        nextAccessMode: "public",
        collections: [],
        pages: [{ id: "page-entry", slug: "post-template" }],
      });

      expect(result.valid).toBe(true);
      expect(result.message).toBeNull();
    });
  });

  describe("validateCmsCollectionRoleSave", () => {
    it("is a no-op when the next role isn't cms-collection", () => {
      expect(
        validateCmsCollectionRoleSave({
          policy: basePolicy,
          nextSystemRole: "standard",
          collections: [],
          pages: [],
        }).valid,
      ).toBe(true);
    });

    it("blocks pages with children from becoming a CMS Collection page", () => {
      const result = validateCmsCollectionRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-collection",
        collections: [],
        pages: [
          { id: "page-entry", slug: "post-template" },
          { id: "page-child", slug: "child", parent: "post-template" },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("child pages");
    });

    it("blocks a page from becoming CMS Collection when it's already the list+entry template for the same collection", () => {
      const result = validateCmsCollectionRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-collection",
        collections: [
          collection({
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "page-entry",
            listPageId: "page-entry",
          }),
        ],
        pages: [{ id: "page-entry", slug: "post-template" }],
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("Blog");
    });

    it("allows a valid CMS Collection switch", () => {
      const result = validateCmsCollectionRoleSave({
        policy: basePolicy,
        nextSystemRole: "cms-collection",
        collections: [],
        pages: [{ id: "page-entry", slug: "post-template" }],
      });

      expect(result.valid).toBe(true);
      expect(result.message).toBeNull();
    });
  });

  describe("validateCmsEntryAccessModeSave", () => {
    it("allows any access mode for non cms-entry roles", () => {
      expect(
        validateCmsEntryAccessModeSave({
          systemRole: "cms-collection",
          accessMode: "private",
        }).valid,
      ).toBe(true);
    });

    it("blocks non-public access mode for cms-entry pages", () => {
      const result = validateCmsEntryAccessModeSave({
        systemRole: "cms-entry",
        accessMode: "password",
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain("public access");
    });

    it("allows public access mode for cms-entry pages", () => {
      expect(
        validateCmsEntryAccessModeSave({
          systemRole: "cms-entry",
          accessMode: "public",
        }).valid,
      ).toBe(true);
    });
  });

  describe("resolveCmsPageRoleAccessMode", () => {
    it("forces public access for not-found and cms-entry roles", () => {
      expect(resolveCmsPageRoleAccessMode("not-found", "private")).toBe(
        "public",
      );
      expect(resolveCmsPageRoleAccessMode("cms-entry", "password")).toBe(
        "public",
      );
    });

    it("keeps the chosen access mode for standard and cms-collection roles", () => {
      expect(resolveCmsPageRoleAccessMode("standard", "unlisted")).toBe(
        "unlisted",
      );
      expect(resolveCmsPageRoleAccessMode("cms-collection", "private")).toBe(
        "private",
      );
    });
  });

  describe("pageRoleById", () => {
    it("returns the matching page's role, defaulting to standard", () => {
      const pages = [
        { id: "page-a", slug: "a", systemRole: "cms-entry" as const },
      ];

      expect(pageRoleById("page-a", pages)).toBe("cms-entry");
      expect(pageRoleById("page-missing", pages)).toBe("standard");
    });
  });

  describe("collectionsRequiringClearForRoleChange", () => {
    it("clears both bindings when switching to standard or not-found", () => {
      const collections = [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
          templatePageId: "page-entry",
          listPageId: "page-entry",
        }),
      ];

      const clears = collectionsRequiringClearForRoleChange({
        pageId: "page-entry",
        nextSystemRole: "standard",
        collections,
      });

      expect(clears).toEqual([
        expect.objectContaining({
          collectionId: "collection-blog",
          field: "templatePageId",
        }),
        expect.objectContaining({
          collectionId: "collection-blog",
          field: "listPageId",
        }),
      ]);
    });

    it("clears only the opposite role's bindings when switching to cms-entry", () => {
      const collections = [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
          templatePageId: "page-entry",
          listPageId: "page-entry",
        }),
      ];

      const clears = collectionsRequiringClearForRoleChange({
        pageId: "page-entry",
        nextSystemRole: "cms-entry",
        collections,
      });

      expect(clears).toEqual([
        expect.objectContaining({
          collectionId: "collection-blog",
          field: "listPageId",
        }),
      ]);
    });

    it("clears only the opposite role's bindings when switching to cms-collection", () => {
      const collections = [
        collection({
          id: "collection-blog",
          name: "blog",
          label: "Blog",
          templatePageId: "page-entry",
          listPageId: "page-entry",
        }),
      ];

      const clears = collectionsRequiringClearForRoleChange({
        pageId: "page-entry",
        nextSystemRole: "cms-collection",
        collections,
      });

      expect(clears).toEqual([
        expect.objectContaining({
          collectionId: "collection-blog",
          field: "templatePageId",
        }),
      ]);
    });

    it("returns no clears when the page has no collection bindings", () => {
      expect(
        collectionsRequiringClearForRoleChange({
          pageId: "page-unbound",
          nextSystemRole: "standard",
          collections: [],
        }),
      ).toEqual([]);
    });
  });

  describe("validateListTemplatePageAssignment", () => {
    it("blocks cms-entry pages from being used as list templates", () => {
      const result = validateListTemplatePageAssignment({
        listPageId: "page-entry",
        pages: [{ id: "page-entry", slug: "post-template", systemRole: "cms-entry" }],
      });

      expect(result.valid).toBe(false);
    });

    it("allows standard and cms-collection pages as list templates", () => {
      expect(
        validateListTemplatePageAssignment({
          listPageId: "page-standard",
          pages: [{ id: "page-standard", slug: "blog", systemRole: "standard" }],
        }).valid,
      ).toBe(true);
      expect(
        validateListTemplatePageAssignment({
          listPageId: "page-collection",
          pages: [
            { id: "page-collection", slug: "blog", systemRole: "cms-collection" },
          ],
        }).valid,
      ).toBe(true);
    });
  });

  describe("validateEntryTemplatePageAssignment", () => {
    it("blocks cms-collection pages from being used as entry templates", () => {
      const result = validateEntryTemplatePageAssignment({
        templatePageId: "page-collection",
        pages: [
          { id: "page-collection", slug: "blog", systemRole: "cms-collection" },
        ],
      });

      expect(result.valid).toBe(false);
    });

    it("allows standard and cms-entry pages as entry templates", () => {
      expect(
        validateEntryTemplatePageAssignment({
          templatePageId: "page-standard",
          pages: [{ id: "page-standard", slug: "post", systemRole: "standard" }],
        }).valid,
      ).toBe(true);
      expect(
        validateEntryTemplatePageAssignment({
          templatePageId: "page-entry",
          pages: [{ id: "page-entry", slug: "post", systemRole: "cms-entry" }],
        }).valid,
      ).toBe(true);
    });
  });

  describe("entrySlugLeafCollisions", () => {
    it("returns non-index pages when the URL pattern ends with {slug}", () => {
      const pages = [
        { id: "page-index", slug: "index" },
        { id: "page-about", slug: "about" },
      ];

      expect(
        entrySlugLeafCollisions({ urlPattern: "/blog/{slug}", pages }),
      ).toEqual([{ id: "page-about", slug: "about" }]);
    });

    it("returns no collisions when the pattern doesn't end with {slug}", () => {
      const pages = [{ id: "page-about", slug: "about" }];

      expect(
        entrySlugLeafCollisions({ urlPattern: "/blog/archive", pages }),
      ).toEqual([]);
    });
  });

  describe("routing impact helpers", () => {
    it("describes CMS routing impact for delete guards", () => {
      const impact = getPageCmsRoutingImpact({
        pageId: "page-entry",
        collections: [
          collection({
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "page-entry",
          }),
          collection({
            id: "collection-news",
            name: "news",
            label: "News",
            listPageId: "page-entry",
          }),
        ],
      });

      expect(formatPageCmsRoutingDeleteMessage(impact)).toContain(
        "entry template",
      );
      expect(formatPageCmsRoutingDeleteMessage(impact)).toContain(
        "list template",
      );
    });

    it("matches CMS routing impact when collection references page slug instead of id", () => {
      const impact = getPageCmsRoutingImpact({
        pageId: "blog-posts",
        pageSlug: "blog-post",
        collections: [
          collection({
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "blog-posts",
          }),
        ],
      });

      expect(pageHasCmsRoutingAssignments(impact)).toBe(true);
      expect(impact.templateCollections).toHaveLength(1);
      expect(impact.templateCollections[0]?.label).toBe("Blog");
    });

    it("matches CMS routing impact when only page slug is known to the caller", () => {
      const impact = getPageCmsRoutingImpact({
        pageId: "blog-post",
        pageSlug: "blog-post",
        collections: [
          collection({
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "blog-post",
          }),
        ],
      });

      expect(pageHasCmsRoutingAssignments(impact)).toBe(true);
    });

    it("matches routing impact with minimal collection routing fields", () => {
      const impact = getPageCmsRoutingImpact({
        pageId: "blog-posts",
        pageSlug: "blog-post",
        collections: [
          {
            id: "collection-blog",
            name: "blog",
            label: "Blog",
            templatePageId: "blog-posts",
            listPageId: null,
          },
        ],
      });

      expect(pageHasCmsRoutingAssignments(impact)).toBe(true);
    });
  });

  describe("isCmsEntryDirectRouteBlocked", () => {
    it("blocks direct routes for cms-entry pages but not preview or cms-entry route context", () => {
      expect(
        isCmsEntryDirectRouteBlocked({
          systemRole: "cms-entry",
          routeContext: "direct",
          isAuthenticatedPreview: false,
        }),
      ).toBe(true);

      expect(
        isCmsEntryDirectRouteBlocked({
          systemRole: "cms-entry",
          routeContext: "direct",
          isAuthenticatedPreview: true,
        }),
      ).toBe(false);

      expect(
        isCmsEntryDirectRouteBlocked({
          systemRole: "cms-entry",
          routeContext: "cms-entry",
          isAuthenticatedPreview: false,
        }),
      ).toBe(false);
    });

    it("never blocks cms-collection or standard pages", () => {
      expect(
        isCmsEntryDirectRouteBlocked({
          systemRole: "cms-collection",
          routeContext: "direct",
          isAuthenticatedPreview: false,
        }),
      ).toBe(false);

      expect(
        isCmsEntryDirectRouteBlocked({
          systemRole: "standard",
          routeContext: "direct",
          isAuthenticatedPreview: false,
        }),
      ).toBe(false);
    });
  });
});
