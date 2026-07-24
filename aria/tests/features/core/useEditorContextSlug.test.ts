import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";

import type { EditingMode } from "@/features/Core/types/router";

const editingModeRef = ref<EditingMode>({
  isEditing: true,
  itemType: "page",
  itemSlug: "about",
});

vi.mock("@/features/Core/composables/useAppRouter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/Core/composables/useAppRouter")>();
  return {
    ...actual,
    useAppRouter: () => ({
      ...actual.useAppRouter(),
      editingMode: editingModeRef,
      isEditing: { value: true },
    }),
  };
});

describe("useEditorContext currentItemSlug", () => {
  beforeEach(() => {
    editingModeRef.value = {
      isEditing: true,
      itemType: "page",
      itemSlug: "about",
    };
  });

  it("uses router slug for pages while editing, not page id", async () => {
    const { useEditorContext } =
      await import("@/features/Core/composables/useEditorContext");

    const ctx = useEditorContext();
    ctx.appState.currentItemType.value = "page";
    ctx.appState.currentPage.value = {
      id: "uuid-page-id",
      title: "About",
      slug: "about",
      nodes: [],
      status: "draft",
    };

    expect(ctx.currentItemSlug.value).toBe("about");
  });

  it("uses router slug for components while editing", async () => {
    editingModeRef.value = {
      isEditing: true,
      itemType: "component",
      itemSlug: "hero-card",
    };

    const { useEditorContext } =
      await import("@/features/Core/composables/useEditorContext");

    const ctx = useEditorContext();
    ctx.appState.currentItemType.value = "component";
    ctx.appState.currentComponent.value = {
      id: "internal-uuid",
      name: "Hero",
      nodes: [],
    };

    expect(ctx.currentItemSlug.value).toBe("hero-card");
  });
});
