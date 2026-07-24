import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type { Page } from "@/composables/useBuilderData";
import { usePagesListState } from "../../../../admin/features/Studio/pages/composables/usePagesListState";

function makePage(overrides: Partial<Page> = {}): Page {
  return {
    id: "about",
    title: "About",
    slug: "about",
    status: "draft",
    isModifiedSincePublish: false,
    layout: "",
    systemRole: "standard",
    accessMode: "public",
    hasPassword: false,
    updatedAt: null,
    scheduledFor: null,
    ...overrides,
  };
}

describe("usePagesListState description support", () => {
  it("filters pages by description in search", () => {
    const pages = ref<Page[]>([
      makePage({ id: "home", slug: "home", title: "Home" }),
      makePage({
        id: "about",
        slug: "about",
        title: "About",
        description: "Company overview",
      }),
    ]);

    const state = usePagesListState(pages);
    state.searchQuery.value = "overview";

    expect(state.filteredTree.value.map((node) => node.page.slug)).toEqual([
      "about",
    ]);
  });

  it("sorts pages by description", () => {
    const pages = ref<Page[]>([
      makePage({
        id: "z-page",
        slug: "z-page",
        title: "Z Page",
        description: "Zebra note",
      }),
      makePage({
        id: "a-page",
        slug: "a-page",
        title: "A Page",
        description: "Alpha note",
      }),
    ]);

    const state = usePagesListState(pages);
    state.sortBy.value = { key: "description", direction: "asc" };

    expect(state.filteredTree.value.map((node) => node.page.slug)).toEqual([
      "a-page",
      "z-page",
    ]);
  });
});
