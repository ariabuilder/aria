import { describe, expect, it } from "vitest";
import { shouldSkipSessionEditorContentRestore } from "@/lib/session/editorRestoreGuard";

describe("shouldSkipSessionEditorContentRestore", () => {
  it("skips whenever a composer deep link is present", () => {
    expect(
      shouldSkipSessionEditorContentRestore({
        composerTarget: { itemType: "page", itemSlug: "about" },
        currentItemType: "page",
        currentPage: {
          id: "page-home",
          title: "Home",
          slug: "home",
          nodes: [],
          status: "draft",
        },
      }),
    ).toBe(true);

    expect(
      shouldSkipSessionEditorContentRestore({
        composerTarget: { itemType: "page", itemSlug: "home" },
        currentItemType: "page",
        currentPage: {
          id: "page-home",
          title: "Home",
          slug: "home",
          nodes: [],
          status: "draft",
        },
      }),
    ).toBe(true);
  });

  it("allows restore outside composer routes", () => {
    expect(
      shouldSkipSessionEditorContentRestore({
        composerTarget: null,
        currentItemType: "page",
        currentPage: {
          id: "page-home",
          title: "Home",
          slug: "home",
          nodes: [],
          status: "draft",
        },
      }),
    ).toBe(false);
  });
});
