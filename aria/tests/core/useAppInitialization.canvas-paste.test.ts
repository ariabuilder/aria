/**
 * useAppInitialization canvas paste tests
 *
 * @vitest-environment jsdom
 */

import { computed, defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { useAppInitialization } from "@/features/Core/composables/useAppInitialization";
import { useSessionState } from "@/features/Core/session/useSessionState";

vi.mock("vue-router", () => ({
  useRoute: () => ({
    path: "/studio/pages",
    query: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/lib/startupTrace", () => ({
  traceStartup: vi.fn(),
}));

function createEmptyRuntimeRefs() {
  return {
    pageBlocks: ref([]),
    currentPage: ref(null),
    currentLayout: ref(null),
    currentComponent: ref(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    hasUnsavedChanges: ref(false),
    lastSavedSnapshot: ref("snapshot:none"),
    layoutSlotsSnapshot: ref(""),
    loadingState: ref({
      isLoading: false,
      isSaving: false,
      isPublishing: false,
      loadError: null,
    }),
    focusedNodeId: ref<string | null>(null),
  };
}

describe("useAppInitialization canvas paste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("routes global canvas paste requests to node paste handling", async () => {
    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.focusedNodeId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "pages"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const handlePasteBlock = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useAppInitialization({
          ...runtimeRefs,
          keyboardShortcuts: {
            registerCommonShortcuts: vi.fn(),
            register: vi.fn(),
          } as unknown as ReturnType<
            typeof import("@/features/Composer/composables/useKeyboardShortcuts").useKeyboardShortcuts
          >,
          sessionState: liveSession,
          nodeManipulation: {
            clearNodeCache: vi.fn(),
          },
          nodeEventHandlers: {
            handleDropComponent: vi.fn(),
            handleDeleteBlock: vi.fn(),
            handleDeleteBlocks: vi.fn(),
            handleCopyBlock: vi.fn(),
            handlePasteBlock,
            handleDuplicateBlock: vi.fn(),
          },
          editorMutationHandlers: {
            handleReorderNode: vi.fn(),
            handleNodePropUpdate: vi.fn(),
          },
          handleClearSelection: vi.fn(),
          handleSave: vi.fn(async () => undefined),
          createSnapshot: vi.fn(() => "snapshot:none"),
          focusNode: vi.fn(),
          registerNodeUpdateCallback: vi.fn(),
          fetchBuilderData: vi.fn(async () => undefined),
          appRouter: {
            isEditing: computed(() => true),
            studioSection: ref("pages"),
          } as unknown as ReturnType<
            typeof import("@/features/Core/composables/useAppRouter").useAppRouter
          >,
        });

        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    await flushPromises();
    await nextTick();

    window.dispatchEvent(
      new CustomEvent("component:paste", {
        detail: { nodeId: "node-from-canvas" },
      }),
    );
    await flushPromises();

    expect(handlePasteBlock).toHaveBeenCalledWith("node-from-canvas");

    wrapper.unmount();
  });

  it("forwards clipboard payload from canvas paste requests", async () => {
    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.focusedNodeId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "pages"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const handlePasteBlock = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useAppInitialization({
          ...runtimeRefs,
          keyboardShortcuts: {
            registerCommonShortcuts: vi.fn(),
            register: vi.fn(),
          } as unknown as ReturnType<
            typeof import("@/features/Composer/composables/useKeyboardShortcuts").useKeyboardShortcuts
          >,
          sessionState: liveSession,
          nodeManipulation: {
            clearNodeCache: vi.fn(),
          },
          nodeEventHandlers: {
            handleDropComponent: vi.fn(),
            handleDeleteBlock: vi.fn(),
            handleDeleteBlocks: vi.fn(),
            handleCopyBlock: vi.fn(),
            handlePasteBlock,
            handleDuplicateBlock: vi.fn(),
          },
          editorMutationHandlers: {
            handleReorderNode: vi.fn(),
            handleNodePropUpdate: vi.fn(),
          },
          handleClearSelection: vi.fn(),
          handleSave: vi.fn(async () => undefined),
          createSnapshot: vi.fn(() => "snapshot:none"),
          focusNode: vi.fn(),
          registerNodeUpdateCallback: vi.fn(),
          fetchBuilderData: vi.fn(async () => undefined),
          appRouter: {
            isEditing: computed(() => true),
            studioSection: ref("pages"),
          } as unknown as ReturnType<
            typeof import("@/features/Core/composables/useAppRouter").useAppRouter
          >,
        });

        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    await flushPromises();
    await nextTick();

    window.dispatchEvent(
      new CustomEvent("component:paste", {
        detail: {
          nodeId: "node-from-canvas",
          clipboardText: '<div class="hero-shell"></div>',
          clipboardHtml: '<div class="hero-shell"><h1>Hero</h1></div>',
        },
      }),
    );
    await flushPromises();

    expect(handlePasteBlock).toHaveBeenCalledWith("node-from-canvas", {
      clipboardText: '<div class="hero-shell"></div>',
      clipboardHtml: '<div class="hero-shell"><h1>Hero</h1></div>',
    });

    wrapper.unmount();
  });

  it("routes zero-state canvas paste requests to root-level paste handling", async () => {
    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.focusedNodeId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "pages"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const handlePasteBlock = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useAppInitialization({
          ...runtimeRefs,
          keyboardShortcuts: {
            registerCommonShortcuts: vi.fn(),
            register: vi.fn(),
          } as unknown as ReturnType<
            typeof import("@/features/Composer/composables/useKeyboardShortcuts").useKeyboardShortcuts
          >,
          sessionState: liveSession,
          nodeManipulation: {
            clearNodeCache: vi.fn(),
          },
          nodeEventHandlers: {
            handleDropComponent: vi.fn(),
            handleDeleteBlock: vi.fn(),
            handleDeleteBlocks: vi.fn(),
            handleCopyBlock: vi.fn(),
            handlePasteBlock,
            handleDuplicateBlock: vi.fn(),
          },
          editorMutationHandlers: {
            handleReorderNode: vi.fn(),
            handleNodePropUpdate: vi.fn(),
          },
          handleClearSelection: vi.fn(),
          handleSave: vi.fn(async () => undefined),
          createSnapshot: vi.fn(() => "snapshot:none"),
          focusNode: vi.fn(),
          registerNodeUpdateCallback: vi.fn(),
          fetchBuilderData: vi.fn(async () => undefined),
          appRouter: {
            isEditing: computed(() => true),
            studioSection: ref("pages"),
          } as unknown as ReturnType<
            typeof import("@/features/Core/composables/useAppRouter").useAppRouter
          >,
        });

        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    await flushPromises();
    await nextTick();

    window.dispatchEvent(new CustomEvent("component:paste"));
    await flushPromises();

    expect(handlePasteBlock).toHaveBeenCalledWith();

    wrapper.unmount();
  });
});
