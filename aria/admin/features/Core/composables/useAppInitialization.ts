/**
 * UseAppInitialization Handles app lifecycle: mounting, keyboard
 * shortcuts, watchers, cleanup. Extracted from App.
 */

import { onMounted, onBeforeUnmount, watch, type Ref } from "vue";
import { useRoute } from "vue-router";
import { parseComposerRouteTarget } from "@/lib/router/composerRouteTarget";
import { shouldSkipSessionEditorContentRestore } from "@/lib/session/editorRestoreGuard";
import type {
  BuilderNode,
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../../../lib/types/nodes";
import type { SessionState } from "../../../types/app";
import type { DropComponentPayload } from "../../../types/app";
import type { useKeyboardShortcuts } from "../../Composer/composables/useKeyboardShortcuts";
import type { useSessionState } from "../session/useSessionState";
import type { useAppRouter } from "./useAppRouter";
import type { EditorMutationHandlersReturn } from "./useEditorMutationHandlers";
import { traceStartup } from "@/lib/startupTrace";
import { snapshotLayoutSlots } from "../../../../lib/layouts/slotEditing";
import { isComposerItemFeatureEnabled } from "../../../../lib/features";
import { useHistoryControls } from "../../History";
import { useAppLoading } from "../../Composer/composables/useAppLoading";
import { toast } from "vue-sonner";
import { useStageSignalBridge } from "./useStageSignalBridge";
import { useShellSignalBridge } from "./useShellSignalBridge";
import { useSettingsDialog } from "@/features/Studio/settings/composables/useSettingsDialog";
import { useBeacon } from "../../Beacon";

interface AppInitializationNodeEventHandlers {
  handleDropComponent: (payload: DropComponentPayload) => void;
  handleDeleteBlock: (id: string) => void;
  handleDeleteBlocks: (nodeIds: string[]) => void;
  handleCopyBlock: (id: string) => void;
  handlePasteBlock: (
    id?: string | null,
    options?: {
      clipboardText?: string;
      clipboardHtml?: string;
    },
  ) => void | Promise<void>;
  handleDuplicateBlock: (id: string) => void;
}

interface ComponentPasteEventDetail {
  nodeId?: string | null;
  clipboardText?: string;
  clipboardHtml?: string;
}

export interface AppInitializationDeps {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  hasUnsavedChanges: Ref<boolean>;
  lastSavedSnapshot: Ref<string>;
  layoutSlotsSnapshot: Ref<string>;
  loadingState: Ref<{
    isLoading: boolean;
    isSaving: boolean;
    isPublishing: boolean;
    loadError: string | null;
  }>;
  focusedNodeId: Ref<string | null>;

  keyboardShortcuts: ReturnType<typeof useKeyboardShortcuts>;
  sessionState: ReturnType<typeof useSessionState>;
  nodeManipulation: { clearNodeCache: () => void };
  nodeEventHandlers: AppInitializationNodeEventHandlers;
  editorMutationHandlers: Pick<
    EditorMutationHandlersReturn,
    "handleReorderNode" | "handleNodePropUpdate"
  >;

  handleClearSelection: () => void;
  handleSave: () => Promise<void>;
  createSnapshot: (blocks: BuilderNode[]) => string;
  focusNode: (id: string | null) => void;
  registerNodeUpdateCallback: (
    callback: (params: {
      nodeId: string;
      propName: string;
      value: unknown;
      description?: string;
    }) => void,
  ) => void;

  fetchBuilderData: () => Promise<void>;

  appRouter: ReturnType<typeof useAppRouter>;
}

type ComposerDirtyTrackingDeps = Pick<
  AppInitializationDeps,
  | "pageBlocks"
  | "currentPage"
  | "currentLayout"
  | "hasUnsavedChanges"
  | "lastSavedSnapshot"
  | "layoutSlotsSnapshot"
  | "loadingState"
  | "createSnapshot"
>;

/**
 * Track user-authored Composer changes without classifying load hydration as
 * an edit. Layout attachment is watched synchronously so the.
 */
export function useComposerDirtyTracking(
  deps: ComposerDirtyTrackingDeps,
): void {
  const {
    pageBlocks,
    currentPage,
    currentLayout,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
    loadingState,
    createSnapshot,
  } = deps;

  watch(
    [() => pageBlocks.value, () => currentLayout.value?.slots],
    ([newBlocks]) => {
      if (loadingState.value.isLoading) {
        return;
      }

      const currentPageSnapshot = createSnapshot(newBlocks);
      const currentLayoutSnapshot = snapshotLayoutSlots(currentLayout.value);
      const pageDirty = currentPageSnapshot !== lastSavedSnapshot.value;
      const layoutDirty = currentLayoutSnapshot !== layoutSlotsSnapshot.value;
      hasUnsavedChanges.value = pageDirty || layoutDirty;
    },
    { deep: true },
  );

  watch(
    () => currentPage.value?.layout,
    (newLayout, oldLayout) => {
      if (loadingState.value.isLoading) {
        return;
      }
      if (newLayout === oldLayout) {
        return;
      }
      if (oldLayout === undefined) {
        return;
      }
      hasUnsavedChanges.value = true;
    },
    { flush: "sync" },
  );
}

export function useAppInitialization(deps: AppInitializationDeps): void {
  const {
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
    loadingState,
    focusedNodeId,
    keyboardShortcuts,
    sessionState,
    nodeManipulation,
    nodeEventHandlers,
    editorMutationHandlers,
    handleClearSelection,
    handleSave,
    createSnapshot,
    focusNode,
    registerNodeUpdateCallback,
    fetchBuilderData,
    appRouter,
  } = deps;
  const route = useRoute();
  const { setBuilderDataLoaded, setUIReady, setError } = useAppLoading();
  const { handleUndo, handleRedo } = useHistoryControls();
  const { signalConvertComponent } = useStageSignalBridge();
  const { onDropComponent, onReorderNode } = useShellSignalBridge();
  const settingsDialog = useSettingsDialog();
  const { selectedNodeIds } = useBeacon();

  const handleCanvasPasteRequest = (event: Event): void => {
    const detail = (event as CustomEvent<ComponentPasteEventDetail>).detail;
    const targetNodeId =
      typeof detail?.nodeId === "string" && detail.nodeId.length > 0
        ? detail.nodeId
        : focusedNodeId.value;
    const resolvedTargetNodeId =
      typeof targetNodeId === "string" && targetNodeId.length > 0
        ? targetNodeId
        : undefined;

    const pasteOptions =
      detail?.clipboardText || detail?.clipboardHtml
        ? {
            clipboardText: detail.clipboardText,
            clipboardHtml: detail.clipboardHtml,
          }
        : undefined;

    if (pasteOptions) {
      void nodeEventHandlers.handlePasteBlock(
        resolvedTargetNodeId,
        pasteOptions,
      );
      return;
    }

    if (resolvedTargetNodeId) {
      void nodeEventHandlers.handlePasteBlock(resolvedTargetNodeId);
      return;
    }

    void nodeEventHandlers.handlePasteBlock();
  };

  /**
   * Setup keyboard shortcut handlers
   */
  const setupKeyboardHandlers = (): void => {
    keyboardShortcuts.registerCommonShortcuts({
      onDelete: () => {
        if (selectedNodeIds.value.length > 1) {
          nodeEventHandlers.handleDeleteBlocks(selectedNodeIds.value);
        } else if (focusedNodeId.value) {
          nodeEventHandlers.handleDeleteBlock(focusedNodeId.value);
        }
        nodeManipulation.clearNodeCache();
      },
      onCopy: () => {
        if (focusedNodeId.value) {
          nodeEventHandlers.handleCopyBlock(focusedNodeId.value);
        }
      },
      onPaste: () => {
        void nodeEventHandlers.handlePasteBlock(focusedNodeId.value);
      },
      onDuplicate: () => {
        if (focusedNodeId.value) {
          nodeEventHandlers.handleDuplicateBlock(focusedNodeId.value);
        }
      },
      onSave: () => handleSave(),
      onUndo: () => {
        console.log(
          "[useAppInitialization] ⏪ Undo triggered via keyboard shortcut",
        );
        void handleUndo();
      },
      onRedo: () => {
        console.log(
          "[useAppInitialization] ⏩ Redo triggered via keyboard shortcut",
        );
        void handleRedo();
      },
      onConvertComponent: () => {
        if (focusedNodeId.value) {
          signalConvertComponent(focusedNodeId.value);
        }
      },
      onFullscreen: () => {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void document.documentElement.requestFullscreen();
        }
      },
      onSearch: () => {
        window.dispatchEvent(new CustomEvent("aria:open-search"));
      },
      onSettings: () => {
        window.dispatchEvent(new CustomEvent("aria:open-settings"));
      },
      onAgent: () => {
        window.dispatchEvent(
          new CustomEvent("aria:open-agent", {
            detail: { focusComposer: false },
          }),
        );
      },
    });

    keyboardShortcuts.register({
      key: "Escape",
      callback: (event) => {
        if (settingsDialog.isOpen.value) {
          return;
        }

        if (focusedNodeId.value) {
          event.preventDefault();
          event.stopPropagation();
          handleClearSelection();
        }
      },
      description: "Deselect node",
      preventDefault: false,
    });
  };

  useComposerDirtyTracking({
    pageBlocks,
    currentPage,
    currentLayout,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
    loadingState,
    createSnapshot,
  });

  onMounted(async () => {
    traceStartup("app-initialization:onMounted");

    // Kick off builder data fetch in parallel — keyboard shortcuts, shell
    // signal bridges, and session restore don't read pages/layouts/components,
    // so blocking them behind the network round-trip would only inflate cold
    // boot. The promise chain still drives `setBuilderDataLoaded` / `setUIReady`
    // exactly as before, and we await it at the end so errors propagate.
    traceStartup("builder-data:fetch:start");
    const builderDataPromise = fetchBuilderData()
      .then(() => {
        traceStartup("builder-data:fetch:end");
        setBuilderDataLoaded(true);
        traceStartup("app-loading:builder-data-loaded");
        traceStartup("app-loading:ui-ready:scheduled", { strategy: "raf" });
        requestAnimationFrame(() => {
          traceStartup("app-loading:ui-ready:raf-fired");
          setUIReady(true);
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        traceStartup("builder-data:fetch:error", { error: message });
        setError(message);
        toast.error(message);
        throw error;
      });

    setupKeyboardHandlers();
    traceStartup("app-initialization:keyboard-ready");

    // Register validated shell/runtime listeners
    onDropComponent(nodeEventHandlers.handleDropComponent);
    onReorderNode(editorMutationHandlers.handleReorderNode);
    window.addEventListener("component:paste", handleCanvasPasteRequest);

    // Register node update callback for PropsTab and StylesTab
    registerNodeUpdateCallback(({ nodeId, propName, value, description }) => {
      editorMutationHandlers.handleNodePropUpdate(
        nodeId,
        propName,
        value,
        description,
      );
    });
    traceStartup("app-initialization:signals-registered");

    // Try to restore session state first — this only reads localStorage and
    // updates local refs, so it is safe to run before the builder data lands.
    traceStartup("session-restore:start");
    const restored = sessionState.restoreState((state: SessionState) => {
      traceStartup("session-restore:apply", {
        currentItemType: state.currentItemType,
        hasCurrentPage: Boolean(state.currentPage),
        hasCurrentLayout: Boolean(state.currentLayout),
        hasCurrentComponent: Boolean(state.currentComponent),
        expandedBlocks: state.expandedBlocks?.length ?? 0,
      });
      const composerTarget = parseComposerRouteTarget(route.path, route.query);
      const layoutEditorRestoreBlocked =
        state.currentItemType === "layout" &&
        !isComposerItemFeatureEnabled("layout");
      const skipEditorContentRestore =
        shouldSkipSessionEditorContentRestore({
          composerTarget,
          currentItemType: state.currentItemType,
          currentPage: state.currentPage,
        }) || layoutEditorRestoreBlocked;

      if (state.currentPage && !skipEditorContentRestore) {
        currentPage.value = state.currentPage;
      }
      if (
        state.currentLayout &&
        !skipEditorContentRestore &&
        !layoutEditorRestoreBlocked
      ) {
        currentLayout.value = state.currentLayout;
      }
      if (state.currentComponent && !skipEditorContentRestore) {
        currentComponent.value = state.currentComponent;
      }
      if (!skipEditorContentRestore) {
        currentItemType.value = layoutEditorRestoreBlocked
          ? "page"
          : state.currentItemType;
      } else if (layoutEditorRestoreBlocked) {
        currentItemType.value = "page";
      }
      if (state.selectedBlockId) focusNode(state.selectedBlockId);
      // Sidebar state is restored by appRouter.initialize()
      // Navigation state is restored by appRouter.initialize()

      // Restore expanded blocks instantly (no server call needed!)
      if (state.expandedBlocks && !skipEditorContentRestore) {
        pageBlocks.value = [...state.expandedBlocks];
        lastSavedSnapshot.value = createSnapshot([...state.expandedBlocks]);
        if (!layoutEditorRestoreBlocked && state.currentLayout) {
          layoutSlotsSnapshot.value = snapshotLayoutSlots(currentLayout.value);
        }
        hasUnsavedChanges.value = false;
      }
    });
    traceStartup("session-restore:end", { restored });

    // Don't auto-load a page anymore - Studio mode is the default
    // Pages are loaded only when user explicitly selects one
    if (!restored) {
      traceStartup("session-restore:miss", {
        isEditing: appRouter.isEditing.value,
        studioSection: appRouter.studioSection.value,
      });
    }

    sessionState.setupAutoSave();
    traceStartup("session-auto-save:ready");

    // Finally surface any builder-data error so the original contract holds.
    await builderDataPromise;
  });

  onBeforeUnmount(() => {
    window.removeEventListener("component:paste", handleCanvasPasteRequest);
    console.log("[useAppInitialization] Cleaning up before unmount");
  });
}
