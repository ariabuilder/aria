/**
 * useAppInitialization session restore tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h, nextTick, ref, computed, type Ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";
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

import {
  createNode,
  createSimpleComponent,
  createSimpleLayout,
  createSimplePage,
} from "../fixtures/testDataGenerator";

const handleUndoMock = vi.fn();
const handleRedoMock = vi.fn();
const setBuilderDataLoadedMock = vi.fn();
const setUIReadyMock = vi.fn();

vi.mock("@/lib/startupTrace", () => ({
  traceStartup: vi.fn(),
}));

vi.mock("@/features/History", () => ({
  useHistoryControls: () => ({
    handleUndo: handleUndoMock,
    handleRedo: handleRedoMock,
  }),
}));

vi.mock("@/features/Composer/composables/useAppLoading", () => ({
  useAppLoading: () => ({
    setBuilderDataLoaded: setBuilderDataLoadedMock,
    setUIReady: setUIReadyMock,
  }),
}));

const SESSION_STORAGE_KEY = "aria-builder-session";

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function componentRef(component: ComponentDSL | null): Ref<ComponentDSL | null> {
  return ref(component as unknown) as Ref<ComponentDSL | null>;
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function createSessionStorageMock() {
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
}

function createSessionRefs() {
  return {
    currentPage: pageRef(
      createSimplePage("Session Page", { slug: "session-page" }),
    ),
    currentLayout: layoutRef(
      createSimpleLayout("Session Layout", { id: "session-layout" }),
    ),
    currentComponent: componentRef(
      createSimpleComponent("Session Component", { id: "session-component" }),
    ),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    selectedBlockId: ref("restored-node"),
    leftSidebarOpen: computed(() => true),
    rightSidebarOpen: computed(() => false),
    studioSection: computed(() => "pages"),
    pageBlocks: pageBlocksRef([
      createNode({ id: "restored-node" }),
      createNode({ id: "restored-node-2" }),
    ]),
  };
}

function createEmptyRuntimeRefs() {
  return {
    pageBlocks: pageBlocksRef([]),
    currentPage: pageRef(null),
    currentLayout: layoutRef(null),
    currentComponent: componentRef(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    hasUnsavedChanges: ref(true),
    lastSavedSnapshot: ref("stale-snapshot"),
    layoutSlotsSnapshot: ref(""),
    loadingState: ref({
      isLoading: false,
      isSaving: false,
      isPublishing: false,
      loadError: null,
    }),
    focusedNodeId: ref<string | null>(null),
    selectedBlockId: ref<string | null>(null),
  };
}

describe("useAppInitialization session restore", () => {
  const sessionStorageMock = createSessionStorageMock();

  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();

    Object.defineProperty(window, "sessionStorage", {
      value: sessionStorageMock,
      writable: true,
    });

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

  it("restores persisted session state through the startup lifecycle", async () => {
    const seededRefs = createSessionRefs();
    const seedSession = useSessionState(seededRefs);
    expect(seedSession.saveState()).toBe(true);
    expect(sessionStorageMock.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.selectedBlockId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "pages"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const fetchBuilderData = vi.fn(async () => undefined);
    const handleDropComponent = vi.fn();
    const handleDeleteBlock = vi.fn();
    const handleCopyBlock = vi.fn();
    const handlePasteBlock = vi.fn();
    const handleDuplicateBlock = vi.fn();
    const handleReorderNode = vi.fn();
    const handleNodePropUpdate = vi.fn();
    const handleClearSelection = vi.fn();
    const handleSave = vi.fn(async () => undefined);
    const registerNodeUpdateCallback = vi.fn();
    const focusNode = vi.fn();
    const setupAutoSaveSpy = vi.spyOn(liveSession, "setupAutoSave");
    const createSnapshot = vi.fn(
      (blocks: Array<{ id: string }>) =>
        `snapshot:${blocks.map((block) => block.id).join(",")}`,
    );

    const appRouter = {
      isEditing: computed(() => false),
      studioSection: ref("pages"),
    } as unknown as ReturnType<
      typeof import("@/features/Core/composables/useAppRouter").useAppRouter
    >;

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
            handleDropComponent,
            handleDeleteBlock,
            handleDeleteBlocks: vi.fn(),
            handleCopyBlock,
            handlePasteBlock,
            handleDuplicateBlock,
          },
          editorMutationHandlers: {
            handleReorderNode,
            handleNodePropUpdate,
          },
          handleClearSelection,
          handleSave,
          createSnapshot,
          focusNode,
          registerNodeUpdateCallback,
          fetchBuilderData,
          appRouter,
        });

        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    await flushPromises();
    await nextTick();
    await nextTick();

    expect(fetchBuilderData).toHaveBeenCalledTimes(1);
    expect(setBuilderDataLoadedMock).toHaveBeenCalledWith(true);
    expect(setUIReadyMock).toHaveBeenCalledWith(true);
    expect(setupAutoSaveSpy).toHaveBeenCalledTimes(1);
    expect(runtimeRefs.currentPage.value?.slug).toBe("session-page");
    expect(runtimeRefs.currentLayout.value?.id).toBe("session-layout");
    expect(runtimeRefs.currentComponent.value?.id).toBe("session-component");
    expect(runtimeRefs.currentItemType.value).toBe("page");
    expect(focusNode).toHaveBeenCalledWith("restored-node");
    expect(runtimeRefs.pageBlocks.value.map((block) => block.id)).toEqual([
      "restored-node",
      "restored-node-2",
    ]);
    expect(runtimeRefs.lastSavedSnapshot.value).toBe(
      "snapshot:restored-node,restored-node-2",
    );
    expect(runtimeRefs.hasUnsavedChanges.value).toBe(false);

    wrapper.unmount();
  });

  it("keeps startup state untouched when no persisted session exists", async () => {
    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.selectedBlockId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "media"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const fetchBuilderData = vi.fn(async () => undefined);
    const focusNode = vi.fn();
    const setupAutoSaveSpy = vi.spyOn(liveSession, "setupAutoSave");
    const restoreStateSpy = vi.spyOn(liveSession, "restoreState");

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
            handlePasteBlock: vi.fn(),
            handleDuplicateBlock: vi.fn(),
          },
          editorMutationHandlers: {
            handleReorderNode: vi.fn(),
            handleNodePropUpdate: vi.fn(),
          },
          handleClearSelection: vi.fn(),
          handleSave: vi.fn(async () => undefined),
          createSnapshot: vi.fn(() => "snapshot:none"),
          focusNode,
          registerNodeUpdateCallback: vi.fn(),
          fetchBuilderData,
          appRouter: {
            isEditing: computed(() => true),
            studioSection: ref("media"),
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

    expect(fetchBuilderData).toHaveBeenCalledTimes(1);
    expect(restoreStateSpy).toHaveBeenCalledTimes(1);
    expect(setupAutoSaveSpy).toHaveBeenCalledTimes(1);
    expect(runtimeRefs.currentPage.value).toBeNull();
    expect(runtimeRefs.currentLayout.value).toBeNull();
    expect(runtimeRefs.currentComponent.value).toBeNull();
    expect(runtimeRefs.pageBlocks.value).toEqual([]);

    wrapper.unmount();
  });

  it("routes keyboard undo and redo through semantic history actions", async () => {
    const runtimeRefs = createEmptyRuntimeRefs();
    const liveSession = useSessionState({
      currentPage: runtimeRefs.currentPage,
      currentLayout: runtimeRefs.currentLayout,
      currentComponent: runtimeRefs.currentComponent,
      currentItemType: runtimeRefs.currentItemType,
      selectedBlockId: runtimeRefs.selectedBlockId,
      leftSidebarOpen: computed(() => true),
      rightSidebarOpen: computed(() => false),
      studioSection: computed(() => "pages"),
      pageBlocks: runtimeRefs.pageBlocks,
    });

    const focusNode = vi.fn();
    const registerCommonShortcuts = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useAppInitialization({
          ...runtimeRefs,
          keyboardShortcuts: {
            registerCommonShortcuts,
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
            handlePasteBlock: vi.fn(),
            handleDuplicateBlock: vi.fn(),
          },
          editorMutationHandlers: {
            handleReorderNode: vi.fn(),
            handleNodePropUpdate: vi.fn(),
          },
          handleClearSelection: vi.fn(),
          handleSave: vi.fn(async () => undefined),
          createSnapshot: vi.fn(() => "snapshot:none"),
          focusNode,
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

    expect(registerCommonShortcuts).toHaveBeenCalledTimes(1);

    const shortcuts = registerCommonShortcuts.mock.calls[0]?.[0];
    expect(shortcuts).toBeDefined();

    shortcuts.onUndo();
    shortcuts.onRedo();

    expect(handleUndoMock).toHaveBeenCalledTimes(1);
    expect(handleRedoMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
