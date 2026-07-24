import { describe, expect, it } from "vitest";

import {
  buildCollectionSettingsUpdate,
  createCollectionSettingsDraft,
  deriveInitialUrlPatternSource,
  resolveCollectionSettingsUrlPattern,
  syncUrlPatternForTemplatePage,
} from "../../../admin/features/CMS/lib/collectionSettingsForm";
import {
  collectionSupportsBody,
  collectionSupportsCover,
  collectionSupportsRevisions,
} from "../../../admin/features/CMS/lib/collectionBodySupport";
import type { AriaCollection } from "../../../lib/cms/schemas";

const collection = {
  id: "collection-posts",
  name: "posts",
  label: "Posts",
  kind: "content",
  schema: {
    id: "collection-posts",
    label: "Posts",
    kind: "content",
    fields: [],
    icon: "i-lucide:book-open",
    navigation: {
      showInSidebar: true,
    },
    version: 1,
  },
  scope: "global",
  urlPattern: "/posts/{slug}",
  templatePageId: null,
  listPageId: null,
  supports: ["body", "cover", "drafts", "revisions"],
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
} satisfies AriaCollection;

describe("CMS collection settings form", () => {
  it("creates a typed draft from a collection", () => {
    const draft = createCollectionSettingsDraft(collection);

    expect(draft.label).toBe("Posts");
    expect(draft.iconName).toBe("i-lucide:book-open");
    expect(draft.kind).toBe("content");
    expect(draft.scope).toBe("global");
    expect(draft.urlPattern).toBe("/posts/{slug}");
    expect(draft.templatePageId).toBe("");
    expect(draft.showInSidebar).toBe(true);
    expect(draft.supports.body).toBe(true);
    expect(draft.supports.cover).toBe(true);
    expect(draft.supports.drafts).toBe(true);
    expect(draft.supports.search).toBe(false);
    expect(collectionSupportsBody(collection)).toBe(true);
    expect(collectionSupportsCover(collection)).toBe(true);
    expect(collectionSupportsRevisions(collection)).toBe(true);
  });

  it("builds an update payload with nulls and selected supports", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.label = " Articles ";
    draft.iconName = "i-lucide:newspaper";
    draft.kind = "tags";
    draft.scope = "collection";
    draft.urlPattern = " ";
    draft.templatePageId = "";
    draft.listPageId = "";
    draft.showInSidebar = false;
    draft.supports.body = false;
    draft.supports.cover = false;
    draft.supports.drafts = false;
    draft.supports.search = true;

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.payload).toEqual({
      id: "collection-posts",
      expectedUpdatedAt: "2026-06-02T00:00:00.000Z",
      patch: {
        label: "Articles",
        icon: "i-lucide:newspaper",
        kind: "tags",
        scope: "collection",
        urlPattern: null,
        templatePageId: null,
        listPageId: null,
        navigation: {
          showInSidebar: false,
        },
        rss: { enabled: false, itemLimit: 20 },
        comments: { enabled: false },
        supports: ["revisions", "search"],
      },
    });
  });

  it("auto-fills the URL pattern when a template page is set on save", () => {
    const draft = createCollectionSettingsDraft({
      ...collection,
      urlPattern: null,
      templatePageId: null,
    });
    draft.templatePageId = "page-entry-template";
    draft.urlPattern = "";

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.payload.patch.urlPattern).toBe("/posts/{slug}");
    expect(result.payload.patch.templatePageId).toBe("page-entry-template");
  });

  it("derives manual url pattern source from saved collections", () => {
    expect(deriveInitialUrlPatternSource(collection)).toBe("manual");
    expect(
      deriveInitialUrlPatternSource({
        ...collection,
        urlPattern: null,
      }),
    ).toBe("auto");
  });

  it("syncs auto url patterns for template page selection", () => {
    const draft = createCollectionSettingsDraft({
      ...collection,
      urlPattern: null,
      templatePageId: null,
    });
    draft.templatePageId = "page-entry-template";

    const synced = syncUrlPatternForTemplatePage({
      collection,
      draft,
      source: "auto",
    });

    expect(synced).toEqual({
      urlPattern: "/posts/{slug}",
      source: "auto",
    });
  });

  it("preserves manual url patterns when template page changes", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.templatePageId = "page-entry-template";
    draft.urlPattern = "/articles/{slug}";

    const synced = syncUrlPatternForTemplatePage({
      collection,
      draft,
      source: "manual",
    });

    expect(synced).toEqual({
      urlPattern: "/articles/{slug}",
      source: "manual",
    });
  });

  it("resets to auto url pattern when source switches back to auto", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.templatePageId = "page-entry-template";
    draft.urlPattern = "/articles/{slug}";

    const synced = syncUrlPatternForTemplatePage({
      collection,
      draft,
      source: "auto",
    });

    expect(synced).toEqual({
      urlPattern: "/posts/{slug}",
      source: "auto",
    });
  });

  it("resolves draft url patterns before validation", () => {
    const draft = createCollectionSettingsDraft({
      ...collection,
      urlPattern: null,
      templatePageId: "page-entry-template",
    });

    expect(resolveCollectionSettingsUrlPattern(collection, draft)).toBe(
      "/posts/{slug}",
    );
  });

  it("keeps body disabled as an explicit collection setting", () => {
    const bodylessCollection = {
      ...collection,
      supports: ["revisions"],
    } satisfies AriaCollection;
    const draft = createCollectionSettingsDraft(bodylessCollection);

    expect(draft.supports.body).toBe(false);
    expect(draft.supports.cover).toBe(false);
    expect(collectionSupportsBody(bodylessCollection)).toBe(false);
    expect(collectionSupportsCover(bodylessCollection)).toBe(false);
    expect(collectionSupportsRevisions(bodylessCollection)).toBe(true);
  });

  it("treats manual cover-like image fields as cover support", () => {
    const manualCoverCollection = {
      ...collection,
      supports: ["body"],
      schema: {
        ...collection.schema,
        fields: [{ key: "coverPhoto", label: "Cover Photo", type: "image" }],
      },
    } satisfies AriaCollection;

    expect(collectionSupportsCover(manualCoverCollection)).toBe(true);
  });

  it("builds template and list page references for the action payload", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.templatePageId = "page-entry-template";
    draft.listPageId = "page-post-index";

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.payload.patch.templatePageId).toBe("page-entry-template");
    expect(result.payload.patch.listPageId).toBe("page-post-index");
  });

  it("rejects URL patterns without a leading slash", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.urlPattern = "posts/{slug}";

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.urlPattern).toBe("URL pattern must start with /");
  });

  it("rejects URL patterns without a slug token", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.urlPattern = "/posts";

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.urlPattern).toBe("URL pattern must include {slug}");
  });

  it("rejects a blank label before creating the action payload", () => {
    const draft = createCollectionSettingsDraft(collection);
    draft.label = " ";

    const result = buildCollectionSettingsUpdate(collection, draft);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.label).toContain("required");
  });
});
