import { ref } from "vue";
import { describe, expect, it } from "vitest";
import type { Page } from "@/composables/useBuilderData";
import {
  parsePagesFilter,
  usePagesListState,
} from "../../../../admin/features/Studio/pages/composables/usePagesListState";

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

describe("usePagesListState", () => {
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

  it("filters scheduled and modified pages with matching counts", () => {
    const pages = ref<Page[]>([
      makePage({ id: "draft", slug: "draft", status: "draft" }),
      makePage({ id: "scheduled", slug: "scheduled", status: "scheduled" }),
      makePage({ id: "archived", slug: "archived", status: "archived" }),
      makePage({ id: "published", slug: "published", status: "published" }),
      makePage({
        id: "modified",
        slug: "modified",
        status: "published",
        isModifiedSincePublish: true,
      }),
    ]);

    const state = usePagesListState(pages);

    state.activeFilter.value = "scheduled";
    expect(state.filteredTree.value.map((node) => node.page.slug)).toEqual([
      "scheduled",
    ]);

    state.activeFilter.value = "modified";
    expect(state.filteredTree.value.map((node) => node.page.slug)).toEqual([
      "modified",
    ]);
    expect(state.counts.value).toEqual({
      all: 5,
      published: 2,
      draft: 1,
      scheduled: 1,
      archived: 1,
      modified: 1,
    });
  });

  it("parses supported route filters and falls back to all", () => {
    expect(parsePagesFilter("scheduled")).toBe("scheduled");
    expect(parsePagesFilter("modified")).toBe("modified");
    expect(parsePagesFilter("unsupported")).toBe("all");
    expect(parsePagesFilter(["scheduled"])).toBe("all");
    expect(parsePagesFilter(undefined)).toBe("all");
  });
});
