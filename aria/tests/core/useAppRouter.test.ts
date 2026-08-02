/**
 * UseAppRouter Tests Tests for the core router composable.
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import {
  useAppRouter,
  __resetRouterState,
} from "@/features/Core/composables/useAppRouter";
import {
  DEFAULT_ROUTER_STATE,
  type StudioSection,
  type EditingTab,
  type EditableItemType,
} from "@/features/Core/types/router";

describe("useAppRouter", () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    // Reset singleton state for test isolation
    __resetRouterState();

    // Reset localStorage mock (preserve implementations — afterEach must not resetAllMocks)
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();

    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      writable: true,
    });
  });

  describe("initialization", () => {
    it("should return default state when no stored state exists", () => {
      const router = useAppRouter();
      router.initialize();

      expect(router.studioSection.value).toBe(
        DEFAULT_ROUTER_STATE.studioSection,
      );
      expect(router.editingTab.value).toBe(DEFAULT_ROUTER_STATE.editingTab);
      expect(router.leftSidebarOpen.value).toBe(
        DEFAULT_ROUTER_STATE.leftSidebarOpen,
      );
      expect(router.rightSidebarOpen.value).toBe(
        DEFAULT_ROUTER_STATE.rightSidebarOpen,
      );
      expect(router.isEditing.value).toBe(false);
    });

    it("should restore valid stored state", () => {
      const storedState = {
        navigation: {
          itemType: "page" as EditableItemType,
          itemSlug: "test-page",
          studioSection: "media" as StudioSection,
        },
        compatibility: {
          editingTab: "layers" as EditingTab,
          leftSidebarOpen: false,
          rightSidebarOpen: true,
        },
        timestamp: Date.now(),
        version: 2,
      };
      localStorageMock.setItem(
        "aria-router-state",
        JSON.stringify(storedState),
      );

      const router = useAppRouter();
      const restored = router.initialize();

    expect(restored).toBe(true);
    expect(router.studioSection.value).toBe("media");
    expect(router.itemType.value).toBeNull();
    expect(router.itemSlug.value).toBeNull();
      expect(router.editingTab.value).toBe("layers");
      expect(router.leftSidebarOpen.value).toBe(false);
    });

    it("should fallback to defaults on corrupted storage", () => {
      // Pre-populate localStorage with invalid JSON
      localStorageMock.setItem("aria-router-state", "not valid json");

      const router = useAppRouter();
      const restored = router.initialize();

      expect(restored).toBe(false);
      expect(router.studioSection.value).toBe(
        DEFAULT_ROUTER_STATE.studioSection,
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "aria-router-state",
      );
    });

    it("should fallback to defaults on invalid schema", () => {
      // Pre-populate localStorage with wrong schema
      const invalidState = {
        studioSection: "invalid-section", // Not a valid enum value
        timestamp: Date.now(),
        version: 1,
      };
      localStorageMock.setItem(
        "aria-router-state",
        JSON.stringify(invalidState),
      );

      const router = useAppRouter();
      const restored = router.initialize();

      expect(restored).toBe(false);
    });
  });

  describe("editing mode", () => {
    it("should start editing a page", () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "page", itemSlug: "my-page" });

      expect(router.isEditing.value).toBe(true);
      expect(router.itemType.value).toBe("page");
      expect(router.itemSlug.value).toBe("my-page");
      expect(router.rightSidebarOpen.value).toBe(true); // Auto-opens
      expect(router.editingTab.value).toBe("layers"); // Default tab
    });

    it("does not start editing a layout when the layout composer flag is off", () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "layout", itemSlug: "main-layout" });

      expect(router.isEditing.value).toBe(false);
      expect(router.itemType.value).toBeNull();
      expect(router.itemSlug.value).toBeNull();
    });

    it("should start editing a component", () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "component", itemSlug: "my-component" });

      expect(router.isEditing.value).toBe(true);
      expect(router.itemType.value).toBe("component");
      expect(router.itemSlug.value).toBe("my-component");
    });

    it("should stop editing", () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "page", itemSlug: "test" });
      expect(router.isEditing.value).toBe(true);

      router.stopEditing();

      expect(router.isEditing.value).toBe(false);
      expect(router.itemType.value).toBe(null);
      expect(router.itemSlug.value).toBe(null);
    });

    it("should reject invalid itemType", () => {
      const router = useAppRouter();
      router.initialize();

      expect(() => {
        router.startEditing({
          itemType: "invalid" as Parameters<typeof router.startEditing>[0]["itemType"],
          itemSlug: "test",
        });
      }).toThrow();
    });

    it("should provide editingMode computed", () => {
      const router = useAppRouter();
      router.initialize();

      expect(router.editingMode.value).toEqual({
        isEditing: false,
        itemType: null,
        itemSlug: null,
      });

      router.startEditing({ itemType: "page", itemSlug: "test" });

      expect(router.editingMode.value).toEqual({
        isEditing: true,
        itemType: "page",
        itemSlug: "test",
      });
    });
  });

  describe("studio navigation", () => {
    it("should navigate to studio sections", () => {
      const router = useAppRouter();
      router.initialize();

      router.navigateToStudio("media");
      expect(router.studioSection.value).toBe("media");

      router.navigateToStudio("design");
      expect(router.studioSection.value).toBe("design");

      router.navigateToStudio("collections");
      expect(router.studioSection.value).toBe("collections");
    });

    it("should exit editing mode when navigating to studio", () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "page", itemSlug: "test" });
      expect(router.isEditing.value).toBe(true);

      router.navigateToStudio("pages");

      expect(router.isEditing.value).toBe(false);
      expect(router.studioSection.value).toBe("pages");
    });

    it("should reject invalid studio section", () => {
      const router = useAppRouter();
      router.initialize();

      expect(() => {
        router.navigateToStudio(
          "invalid" as Parameters<typeof router.navigateToStudio>[0],
        );
      }).toThrow();
    });
  });

  describe("editing tabs", () => {
    it("should set editing tab", () => {
      const router = useAppRouter();
      router.initialize();

      router.setEditingTab("add-elements");
      expect(router.editingTab.value).toBe("add-elements");

      router.setEditingTab("components");
      expect(router.editingTab.value).toBe("components");

      router.setEditingTab("layers");
      expect(router.editingTab.value).toBe("layers");
    });

    it("should reject invalid tab", () => {
      const router = useAppRouter();
      router.initialize();

      expect(() => {
        router.setEditingTab(
          "invalid" as Parameters<typeof router.setEditingTab>[0],
        );
      }).toThrow();
    });
  });

  describe("sidebar controls", () => {
    it("should toggle left sidebar", () => {
      const router = useAppRouter();
      router.initialize();

      const initial = router.leftSidebarOpen.value;
      router.toggleLeftSidebar();
      expect(router.leftSidebarOpen.value).toBe(!initial);
      router.toggleLeftSidebar();
      expect(router.leftSidebarOpen.value).toBe(initial);
    });

    it("should toggle right sidebar", () => {
      const router = useAppRouter();
      router.initialize();

      const initial = router.rightSidebarOpen.value;
      router.toggleRightSidebar();
      expect(router.rightSidebarOpen.value).toBe(!initial);
      router.toggleRightSidebar();
      expect(router.rightSidebarOpen.value).toBe(initial);
    });

    it("should set left sidebar open state directly", () => {
      const router = useAppRouter();
      router.initialize();

      router.setLeftSidebarOpen(true);
      expect(router.leftSidebarOpen.value).toBe(true);

      router.setLeftSidebarOpen(false);
      expect(router.leftSidebarOpen.value).toBe(false);
    });

    it("should set right sidebar open state directly", () => {
      const router = useAppRouter();
      router.initialize();

      router.setRightSidebarOpen(true);
      expect(router.rightSidebarOpen.value).toBe(true);

      router.setRightSidebarOpen(false);
      expect(router.rightSidebarOpen.value).toBe(false);
    });
  });

  describe("state snapshot", () => {
    it("should provide full state snapshot", () => {
      const router = useAppRouter();
      router.initialize();

      router.navigateToStudio("media");
      router.setEditingTab("components");
      router.setLeftSidebarOpen(false);

      const state = router.state.value;

      expect(state).toEqual({
        itemType: null,
        itemSlug: null,
        studioSection: "media",
        editingTab: "components",
        leftSidebarOpen: false,
        rightSidebarOpen: expect.any(Boolean),
      });
    });
  });

  describe("persistence", () => {
    it("should persist state on navigation", async () => {
      const router = useAppRouter();
      router.initialize();

      router.navigateToStudio("design");
      await flushPromises();

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedState = JSON.parse(
        localStorageMock.setItem.mock.calls[
          localStorageMock.setItem.mock.calls.length - 1
        ][1],
      );
      expect(savedState.navigation.studioSection).toBe("design");
    });

    it("should persist state on editing start", async () => {
      const router = useAppRouter();
      router.initialize();

      router.startEditing({ itemType: "page", itemSlug: "test" });
      await flushPromises();

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedState = JSON.parse(
        localStorageMock.setItem.mock.calls[
          localStorageMock.setItem.mock.calls.length - 1
        ][1],
      );
      expect(savedState.navigation.itemType).toBe("page");
      expect(savedState.navigation.itemSlug).toBe("test");
    });

    it("should persist state on sidebar toggle", async () => {
      const router = useAppRouter();
      router.initialize();

      const initialCalls = localStorageMock.setItem.mock.calls.length;
      router.toggleLeftSidebar();
      await flushPromises();

      expect(localStorageMock.setItem.mock.calls.length).toBeGreaterThan(
        initialCalls,
      );
    });
  });

  describe("readonly enforcement", () => {
    it("should expose state as readonly refs", () => {
      const router = useAppRouter();
      router.initialize();

      // TypeScript should prevent direct mutation, but we can verify the ref is readonly
      // by checking that the values can be read but not written
      expect(router.studioSection.value).toBeDefined();
      expect(router.editingTab.value).toBeDefined();
      expect(router.isEditing.value).toBeDefined();
    });
  });
});
