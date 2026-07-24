import { describe, expect, it } from "vitest";
import { ref, type Ref } from "vue";

import { useComposerSavePublishUiState } from "../../admin/features/Composer/composables/useComposerSavePublishUiState";
import type { PageDSL } from "../../lib/types/nodes";

function createPage(overrides: Partial<PageDSL> = {}): PageDSL {
  return {
    id: "page-1",
    slug: "home",
    title: "Home",
    status: "draft",
    layout: "default",
    nodes: [],
    ...overrides,
  };
}

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

describe("useComposerSavePublishUiState", () => {
  it("marks save as enabled when draft has unsaved changes", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("home"),
      currentPage: pageRef(createPage()),
      canSave: ref(true),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.isSaveDisabled.value).toBe(false);
    expect(state.saveTooltipLabel.value).toBe("Save draft");
    expect(state.saveIconClass.value.join(" ")).toContain("text-red-500");
  });

  it("shows spinner while saving", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("home"),
      currentPage: pageRef(createPage({ status: "published" })),
      canSave: ref(true),
      isSaving: ref(true),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(true),
    });

    expect(state.isSaveDisabled.value).toBe(true);
    expect(state.saveTooltipLabel.value).toBe("Saving...");
    expect(state.saveIconClass.value.join(" ")).toContain("animate-spin");
  });

  it("enables visit for draft pages with preview query", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("home"),
      currentPage: pageRef(createPage({ status: "draft" })),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(true),
    });

    expect(state.isVisitDisabled.value).toBe(false);
    expect(state.visitTooltipLabel.value).toBe("Preview page");
    expect(state.livePageHref.value).toBe("/home?preview=1");
  });

  it("builds clean visit href for published pages", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("home"),
      currentPage: pageRef(
        createPage({
          status: "published",
          slug: "home",
          updatedAt: "2026-06-05T12:00:00.000Z",
        }),
      ),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.isVisitDisabled.value).toBe(false);
    expect(state.livePageHref.value).toBe("/home");
    expect(state.visitTooltipLabel.value).toBe("View live page");
  });

  it("builds index page hrefs for draft and published pages", () => {
    const draftState = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("index"),
      currentPage: pageRef(createPage({ slug: "index", status: "draft" })),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(true),
    });

    expect(draftState.livePageHref.value).toBe("/?preview=1");

    const publishedState = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("index"),
      currentPage: pageRef(createPage({ slug: "index", status: "published" })),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(publishedState.livePageHref.value).toBe("/");
  });

  it("builds parent/child href for child pages", () => {
    const childPage = createPage({
      slug: "team",
      parent: "about",
      title: "Team",
      status: "draft",
    });
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("team"),
      currentPage: pageRef(childPage),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(true),
    });

    expect(state.livePageHref.value).toBe("/about/team?preview=1");
  });

  it("builds parent/child href for published child pages without preview param", () => {
    const childPage = createPage({
      slug: "pricing",
      parent: "products",
      title: "Pricing",
      status: "published",
    });
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("pricing"),
      currentPage: pageRef(childPage),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.livePageHref.value).toBe("/products/pricing");
  });

  it("ignores index as parent (index pages live at /)", () => {
    const childPage = createPage({
      slug: "faq",
      parent: "index",
      title: "FAQ",
      status: "published",
    });
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("faq"),
      currentPage: pageRef(childPage),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.livePageHref.value).toBe("/faq");
  });

  it("returns null for non-page items", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("component"),
      currentItemSlug: ref("my-component"),
      currentPage: pageRef(null),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.livePageHref.value).toBeNull();
  });

  it("enters unpublish mode when published and up to date", () => {
    const state = useComposerSavePublishUiState({
      currentItemType: ref("page"),
      currentItemSlug: ref("home"),
      currentPage: pageRef(createPage({ status: "published" })),
      canSave: ref(false),
      isSaving: ref(false),
      isPublishing: ref(false),
      isLoading: ref(false),
      canPublish: ref(false),
    });

    expect(state.showUnpublishAction.value).toBe(true);
    expect(state.publishTooltipLabel.value).toBe("Unpublish");
    expect(state.isPublishDisabled.value).toBe(false);
  });
});
