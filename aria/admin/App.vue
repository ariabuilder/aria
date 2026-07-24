<!-- Aria Builder admin shell — mounts at /admin -->
<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgentFloatingSheet,
  AgentDockedPanel,
  useGlobalAgentShortcuts,
  useAgentAvailability,
  useAgentShellVisibility,
  useAgentPanel,
  useAgentDockMode,
} from "@/features/Agent";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useStudioI18n } from "@/i18n";

// DEV-only floating panel that surfaces `traceStartup` events live so we can
// capture hard before/after timing numbers without messin the console.
// Bundled away in production via Vite's `import.meta.env.DEV` constant
// folding + dead-code elimination on the async loader. (Ctrl+Shift+T to toggle)
const isDev = import.meta.env.DEV;
const { t } = useStudioI18n();
const StartupTracePanel = isDev
  ? defineAsyncComponent(() => import("./lib/StartupTracePanel.vue"))
  : null;

import type { BuilderNode } from "../lib/types/nodes";

import { useHistory } from "./features/History";
import { useAppearance } from "./features/Design";
import { StudioSidebar } from "./features/Studio/core/components";
import {
  StageSidebar,
  StageCommandRail,
  useStageWorkspaceBindings,
} from "./features/Stage";

import { useBeacon } from "./features/Beacon";
import { useBuilderData } from "./composables/useBuilderData";
import { registerNodeUpdateCallback } from "./features/Nodes/mutations/useNodeUpdater";
import { useKeyboardShortcuts } from "./features/Composer/composables/useKeyboardShortcuts";
import { useAutoLoadOnEdit } from "./composables/useAutoLoadOnEdit";
import { useItemLoading } from "./composables/useItemLoading";
import { useSidebarState } from "./features/Studio/core/composables";
import ShellModeTransitionOverlay from "./features/Core/components/ShellModeTransitionOverlay.vue";
import {
  useAppInitialization,
  useAppBootstrap,
  useAppEditorRuntime,
  useAppRouter,
  useAppRouterBootstrap,
  useAppSessionState,
  useAppProvides,
  useComposerDraftPersistence,
  useSavePublish,
  useEditorContext,
  useAppAsyncViews,
  useShellModeTransitionOrchestration,
  useSelectionTreeSync,
} from "./features/Core";
import { preloadBuilderShell } from "./features/Core/composables/useAppAsyncViews";
import { useStudioRouteGuards } from "./composables/useStudioRouteGuards";
import { useStudioCapabilities } from "./composables/useStudioCapabilities";
import { useSearchDialog } from "./features/Studio/search";
import { useSettingsDialog } from "./features/Studio/settings";
import DesignWorkbenchDialog from "./features/Design/dialogs/DesignWorkbenchDialog.vue";
import { useGlobalSearchShortcuts } from "./composables/useGlobalSearchShortcuts";
import {
  buildComposerPath,
  parseComposerRouteTarget,
} from "@/lib/router/composerRouteTarget";
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../lib/features";
import { toast } from "vue-sonner";
import { isComponentThumbnailStale } from "./features/Studio/components/composables/componentThumbnailInvalidation";
import { refreshComponentThumbnail } from "./features/Studio/components/composables/componentThumbnailRefresh";
import { useStudioLive } from "./features/Studio/realtime/useStudioLive";
import { editorContentMatchesTarget } from "./features/Core/schemas/shellTransition";

// APP STATE & SETUP

const {
  loadingState,
  pageBlocks,
  appState,
  stageEditorState,
  currentPage,
  currentLayout,
  currentComponent,
  currentItemType,
  selectedLayoutRegion,
  hasUnsavedChanges,
  lastSavedSnapshot,
  layoutSlotsSnapshot,
  currentItemSlug,
} = useEditorContext();

// Core setup
const route = useRoute();
const vueRouter = useRouter();
const history = useHistory();
useAppearance();
const appRouter = useAppRouter();
const studioCaps = useStudioCapabilities();
useStudioRouteGuards();
useAppRouterBootstrap(appRouter);
const { StudioApp, StageApp } = useAppAsyncViews();
void preloadBuilderShell();

const { focusedNodeId, illuminate: focusNode } = useBeacon();
const { fetchBuilderData, pages, layouts, components } = useBuilderData();

const showCanvas = computed(() => "composer" in route.query);
const showStudio = computed(() => !("composer" in route.query));
const isOnboardingRoute = computed(() => route.path === "/onboarding");
const studioLive = useStudioLive();

const liveResource = computed(() => {
  const composerTarget = parseComposerRouteTarget(route.path, route.query);
  if (composerTarget) {
    let resourceId = composerTarget.itemSlug;
    if (composerTarget.itemType === "page") {
      resourceId =
        (currentPage.value?.slug === composerTarget.itemSlug
          ? currentPage.value.id
          : pages.value.find((page) => page.slug === composerTarget.itemSlug)?.id) ??
        composerTarget.itemSlug;
    } else if (composerTarget.itemType === "component") {
      resourceId = currentComponent.value?.id ?? composerTarget.itemSlug;
    } else if (composerTarget.itemType === "layout") {
      resourceId = currentLayout.value?.id ?? composerTarget.itemSlug;
    }

    return {
      surface: "composer" as const,
      resourceType: composerTarget.itemType,
      resourceId,
      state: "editing" as const,
      dirty: appState.hasUnsavedChanges.value,
    };
  }

  const parts = route.path.split("/").filter(Boolean);
  const collection = parts[0];
  const slug = parts[1];
  if (!slug || !["pages", "components", "layouts"].includes(collection ?? "")) {
    return {
      surface: "studio" as const,
      resourceType: null,
      resourceId: null,
      state: "viewing" as const,
      dirty: false,
    };
  }

  const resourceType = collection.slice(0, -1) as
    | "page"
    | "component"
    | "layout";
  const resourceId =
    resourceType === "page"
      ? pages.value.find((page) => page.slug === slug)?.id ?? slug
      : resourceType === "component"
        ? components.value.find((component) => component.id === slug)?.id ?? slug
        : layouts.value.find((layout) => layout.id === slug)?.id ?? slug;

  return {
    surface: "studio" as const,
    resourceType,
    resourceId,
    state: "viewing" as const,
    dirty: false,
  };
});

watch(liveResource, (resource) => studioLive.setPresence(resource), {
  immediate: true,
});

onMounted(() => studioLive.connect());
onBeforeUnmount(() => studioLive.disconnect());

const currentPageSlugForGates = computed(() => currentPage.value?.slug ?? null);
const currentLayoutSlugForGates = computed(
  () => currentLayout.value?.slug ?? currentLayout.value?.id ?? null,
);
const currentComponentSlugForGates = computed(
  () => currentComponent.value?.id ?? null,
);
const readyCanvasStageKey = ref<string | null>(null);
const isItemTransitioning = computed(() => {
  if (!showCanvas.value || !appRouter.isEditing.value) {
    return false;
  }

  if (loadingState.value.isLoading) {
    return true;
  }

  if (loadingState.value.loadError) {
    return false;
  }

  const contentMatchesTarget = editorContentMatchesTarget({
    editingItemType: appRouter.itemType.value,
    editingItemSlug: appRouter.itemSlug.value,
    currentPageSlug: currentPageSlugForGates.value,
    currentLayoutSlug: currentLayoutSlugForGates.value,
    currentComponentSlug: currentComponentSlugForGates.value,
  });

  return (
    !contentMatchesTarget ||
    readyCanvasStageKey.value !== stageEditorState.stageKey.value
  );
});

async function handleComposerRouteExit(): Promise<void> {
  const exitingItemType = appRouter.itemType.value;
  const exitingItemSlug = appRouter.itemSlug.value;

  appRouter.stopEditing();

  if (
    exitingItemType === "component" &&
    exitingItemSlug &&
    isComponentThumbnailStale(exitingItemSlug)
  ) {
    void refreshComponentThumbnail(exitingItemSlug, { force: true }).catch(
      (error: unknown) => {
        console.warn("[App] Failed to refresh component thumbnail", {
          componentId: exitingItemSlug,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }
}

const showLayoutSlotGroups = ref(true);

const {
  nodeManipulation,
  nodeEventHandlers,
  editorMutationHandlers,
  activeLayoutSlot,
  editorNodeRegistry,
} = useAppEditorRuntime({
  pageBlocks,
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  hasUnsavedChanges,
  history,
  focusNode: (id) => focusNode(id),
  showLayoutSlotGroups,
});

const composerDrafts = useComposerDraftPersistence({
  enabled: computed(() => showCanvas.value && appRouter.isEditing.value),
  pageBlocks: appState.pageBlocks,
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  hasUnsavedChanges: appState.hasUnsavedChanges,
});

const COMPOSER_DRAFT_RECOVERY_TOAST_ID = "composer-draft-recovery";
const COMPOSER_DRAFT_RECOVERY_TOAST_DURATION_MS = 12_000;
const announcedComposerDrafts = new Set<string>();
const canAnnounceDraftForComposerEntry = ref(showCanvas.value);

watch(showCanvas, (isComposerVisible, wasComposerVisible) => {
  if (isComposerVisible && !wasComposerVisible) {
    canAnnounceDraftForComposerEntry.value = true;
    return;
  }

  if (!isComposerVisible) {
    canAnnounceDraftForComposerEntry.value = false;
    toast.dismiss(COMPOSER_DRAFT_RECOVERY_TOAST_ID);
  }
});

watch(
  [composerDrafts.pendingDraft, isItemTransitioning],
  ([draft, transitioning]) => {
    if (!draft) {
      toast.dismiss(COMPOSER_DRAFT_RECOVERY_TOAST_ID);
      if (!transitioning && canAnnounceDraftForComposerEntry.value) {
        canAnnounceDraftForComposerEntry.value = false;
      }
      return;
    }

    if (
      transitioning ||
      !showCanvas.value ||
      !canAnnounceDraftForComposerEntry.value
    ) {
      return;
    }

    canAnnounceDraftForComposerEntry.value = false;
    const announcementKey = `${draft.collection}:${draft.id}`;
    if (announcedComposerDrafts.has(announcementKey)) {
      return;
    }
    announcedComposerDrafts.add(announcementKey);

    if (composerDrafts.hasDraftConflict.value) {
      toast.error(t("composer.drafts.conflict"), {
        id: COMPOSER_DRAFT_RECOVERY_TOAST_ID,
        duration: COMPOSER_DRAFT_RECOVERY_TOAST_DURATION_MS,
        closeButton: true,
        action: {
          label: t("composer.drafts.discardLocal"),
          onClick: () => void composerDrafts.discardPendingDraft(),
        },
      });
      return;
    }

    toast.info(t("composer.drafts.available"), {
      id: COMPOSER_DRAFT_RECOVERY_TOAST_ID,
      duration: COMPOSER_DRAFT_RECOVERY_TOAST_DURATION_MS,
      closeButton: true,
      action: {
        label: t("composer.drafts.restore"),
        onClick: () => void composerDrafts.restorePendingDraft(),
      },
      cancel: {
        label: t("composer.drafts.discard"),
        onClick: () => void composerDrafts.discardPendingDraft(),
      },
    });
  },
);

watch(composerDrafts.localError, (error) => {
  if (error) {
    toast.error(
      t("composer.drafts.recoveryUnavailable"),
    );
  }
});

useSelectionTreeSync({
  pageBlocks,
  currentLayout: appState.currentLayout,
  editorNodeRegistry,
});

const {
  handleSave,
  handlePublish,
  handleUnpublish,
  createSnapshot,
  saveConflict,
  resolveSaveConflict,
} = useSavePublish({
  pageBlocks: appState.pageBlocks,
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  composeNonce: appState.composeNonce,
  hasUnsavedChanges: appState.hasUnsavedChanges,
  lastSavedSnapshot: appState.lastSavedSnapshot,
  layoutSlotsSnapshot: appState.layoutSlotsSnapshot,
  loadingState: appState.loadingState,
  onDraftSynced: composerDrafts.markCurrentDraftSynced,
});

const SAVE_CONFLICT_TOAST_ID = "composer-save-conflict";

watch(saveConflict, (hasConflict) => {
  if (!hasConflict) {
    toast.dismiss(SAVE_CONFLICT_TOAST_ID);
    return;
  }

  toast.error(t("composer.drafts.savedVersionChanged"), {
    id: SAVE_CONFLICT_TOAST_ID,
    duration: Infinity,
    action: {
      label: t("composer.drafts.reloadServerVersion"),
      onClick: () => {
        void (async () => {
          const resolved = await resolveSaveConflict();
          if (resolved) {
            toast.dismiss(SAVE_CONFLICT_TOAST_ID);
            toast.success(t("composer.drafts.serverVersionRefreshed"));
            return;
          }
          toast.error(t("composer.drafts.serverVersionRefreshFailed"));
        })();
      },
    },
  });
});

const removeComposerLeaveGuard = vueRouter.beforeEach(async (to, from) => {
  const fromTarget = parseComposerRouteTarget(from.path, from.query);
  const toTarget = parseComposerRouteTarget(to.path, to.query);
  const leavingCurrentComposerItem =
    fromTarget !== null &&
    (toTarget === null ||
      toTarget.itemType !== fromTarget.itemType ||
      toTarget.itemSlug !== fromTarget.itemSlug);

  if (!leavingCurrentComposerItem || !hasUnsavedChanges.value) {
    return true;
  }

  return confirmComposerItemSwitch();
});

const composerLeaveDialogOpen = ref(false);
const composerLeaveSaving = ref(false);
let resolveComposerLeaveDecision: ((allow: boolean) => void) | null = null;

function settleComposerLeaveDecision(allow: boolean): void {
  const resolve = resolveComposerLeaveDecision;
  resolveComposerLeaveDecision = null;
  composerLeaveDialogOpen.value = false;
  composerLeaveSaving.value = false;
  resolve?.(allow);
}

function requestComposerLeaveDecision(): Promise<boolean> {
  if (resolveComposerLeaveDecision) {
    return Promise.resolve(false);
  }

  composerLeaveDialogOpen.value = true;
  return new Promise<boolean>((resolve) => {
    resolveComposerLeaveDecision = resolve;
  });
}

async function confirmComposerItemSwitch(): Promise<boolean> {
  if (!hasUnsavedChanges.value) {
    return true;
  }

  await composerDrafts.flushLocalDraft();
  return requestComposerLeaveDecision();
}

function handleComposerLeaveDialogOpenChange(open: boolean): void {
  if (!open && !composerLeaveSaving.value) {
    settleComposerLeaveDecision(false);
  }
}

async function saveComposerDraftAndLeave(): Promise<void> {
  if (composerLeaveSaving.value) return;

  composerLeaveSaving.value = true;
  try {
    await handleSave();
    if (!hasUnsavedChanges.value) {
      settleComposerLeaveDecision(true);
      return;
    }
    toast.error(t("composer.drafts.saveFailed"));
  } finally {
    if (resolveComposerLeaveDecision) {
      composerLeaveSaving.value = false;
    }
  }
}

async function discardComposerDraftAndLeave(): Promise<void> {
  if (composerLeaveSaving.value) return;

  composerLeaveSaving.value = true;
  try {
    await composerDrafts.discardCurrentDraft();
    settleComposerLeaveDecision(true);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : t("composer.drafts.discardFailed"),
    );
    composerLeaveSaving.value = false;
  }
}

onBeforeUnmount(() => {
  removeComposerLeaveGuard();
  settleComposerLeaveDecision(false);
});

const itemLoading = useItemLoading(
  appState,
  () => focusNode(null),
  createSnapshot,
);

const keyboardShortcuts = useKeyboardShortcuts();
const {
  hasEnteredEditing,
  prewarmBuilder,
  handleStudioShellReady: bootstrapStudioShellReady,
  handleCanvasStageReady: handleBootstrapCanvasStageReady,
} = useAppBootstrap({
  appMode: appRouter.appMode,
  itemType: appRouter.itemType,
  itemSlug: appRouter.itemSlug,
  studioSection: appRouter.studioSection,
  currentItemType,
  currentItemSlug,
  stageKey: stageEditorState.stageKey,
  showStudio,
  showCanvas,
});

function handleCanvasStageReady(): void {
  readyCanvasStageKey.value = stageEditorState.stageKey.value;
  handleBootstrapCanvasStageReady();
}

const { shellTransition, handleStudioReady } =
  useShellModeTransitionOrchestration({
    showCanvas,
    showStudio,
    stageKey: stageEditorState.stageKey,
    loadingState: appState.loadingState,
    appRouter,
    currentPageSlug: currentPageSlugForGates,
    currentLayoutSlug: currentLayoutSlugForGates,
    currentComponentSlug: currentComponentSlugForGates,
    onStudioShellReady: bootstrapStudioShellReady,
  });

/** Nested refs from composables do not auto-unwrap in templates. */
const isShellOverlayVisible = computed(
  () => shellTransition.isOverlayVisible.value,
);
const hideCanvasUntilShellReady = computed(
  () => shellTransition.hideCanvasUntilReady.value,
);
const isShellTransitionActive = computed(() => shellTransition.isActive.value);

const {
  appSidebarRef,
  handleClearSelection,
  stageChromeShellProps,
  stageChromeShellListeners,
  stageSidebarShellProps,
  stageSidebarShellListeners,
  stageCanvasRef,
  stageIframeRef,
  stageAppProps,
  stageAppListeners,
} = useStageWorkspaceBindings({
  appRouter,
  editorState: stageEditorState,
  pages,
  layouts,
  components,
  itemLoading,
  history,
  handleSave,
  handlePublish,
  createSnapshot,
  handleSidebarUnpublish: handleUnpublish,
  nodeEventHandlers,
  hasEnteredEditing,
  showCanvas,
  stageKey: stageEditorState.stageKey,
  handleCanvasStageReady,
  editorMutationHandlers,
  showLayoutSlotGroups,
  confirmComposerItemSwitch,
  isItemTransitioning,
});

const searchDialog = useSearchDialog();
const settingsDialog = useSettingsDialog();
const agentAvailability = useAgentAvailability();
const { showAgentShell } = useAgentShellVisibility();
const agentPanel = useAgentPanel();
const dockMode = useAgentDockMode();
const { loadSettings } = useSiteSettings();

const dockedAgentVisible = computed(
  () =>
    showAgentShell.value && dockMode.isDocked.value && agentPanel.isOpen.value,
);

useGlobalAgentShortcuts();
void loadSettings();
void agentAvailability.refresh();

useGlobalSearchShortcuts({
  openSitePalette: () => searchDialog.open(),
  openComposerQuickSwitch: () => {
    appSidebarRef.value?.openQuickSwitch();
  },
  openSettings: () => settingsDialog.open(),
  isComposerSidebarVisible: () =>
    !showStudio.value &&
    !isItemTransitioning.value &&
    stageSidebarShellProps.value.show &&
    !stageSidebarShellProps.value.isPreview,
  isShellTransitionActive: () => isShellTransitionActive.value,
});

const sessionState = useAppSessionState({
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  focusedNodeId,
  pageBlocks: appState.pageBlocks,
  appRouter,
});

useAppProvides({
  pageBlocks: appState.pageBlocks,
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  hasUnsavedChanges: appState.hasUnsavedChanges,
  stageIframeRef,
  prefetchPageData: itemLoading.prefetchPageData,
  prewarmBuilder,
  activeLayoutSlot,
  editorNodeRegistry,
  nodeEventHandlers,
  showLayoutSlotGroups,
});

// Auto-load item when edit mode is triggered.
useAutoLoadOnEdit(itemLoading);

// Route-based mode switching: ?composer query param toggles Stage mode.
watch(
  () => route.query,
  (query) => {
    const composerTarget = parseComposerRouteTarget(route.path, query);
    if (composerTarget) {
      if (!isComposerItemFeatureEnabled(composerTarget.itemType)) {
        const message = getComposerItemFeatureDisabledMessage(
          composerTarget.itemType,
        );
        if (message) {
          toast.error(message);
        }
        if (composerTarget.itemType === "layout") {
          if (route.path !== "/dashboard") {
            void vueRouter.replace("/dashboard");
          }
          return;
        }
      }

      if (
        studioCaps.isReady.value &&
        !studioCaps.canEditItemInComposer(composerTarget.itemType)
      ) {
        return;
      }
      appRouter.startEditing({
        itemType: composerTarget.itemType,
        itemSlug: composerTarget.itemSlug,
      });
      prewarmBuilder();
      const sidebar = useSidebarState();
      sidebar.isCollapsed.value = true;
      sidebar.closeAllGroups();
    } else if (appRouter.isEditing.value) {
      void handleComposerRouteExit();
    }
  },
  { immediate: true },
);

watch(
  () => ({
    itemType: appRouter.itemType.value,
    itemSlug: appRouter.itemSlug.value,
    path: route.path,
    query: route.query,
  }),
  ({ itemType, itemSlug, path, query }) => {
    if (!itemType || !itemSlug || !("composer" in query)) {
      return;
    }

    const routeTarget = parseComposerRouteTarget(path, query);
    if (
      routeTarget &&
      routeTarget.itemType === itemType &&
      routeTarget.itemSlug === itemSlug
    ) {
      return;
    }

    void vueRouter.replace(buildComposerPath(itemType, itemSlug));
  },
);

// Sync URL when external code (e.g. ComposerNavBar) calls appRouter methods directly.
watch(appRouter.isEditing, (editing) => {
  if (!editing && "composer" in route.query) {
    const section = route.path.split("/").filter(Boolean)[0] || "dashboard";
    vueRouter.push(`/${section}`);
  }
});

useAppInitialization({
  pageBlocks: appState.pageBlocks,
  currentPage: appState.currentPage,
  currentLayout: appState.currentLayout,
  currentComponent: appState.currentComponent,
  currentItemType: appState.currentItemType,
  hasUnsavedChanges: appState.hasUnsavedChanges,
  lastSavedSnapshot: appState.lastSavedSnapshot,
  layoutSlotsSnapshot: appState.layoutSlotsSnapshot,
  loadingState: appState.loadingState,
  focusedNodeId,
  keyboardShortcuts,
  sessionState,
  nodeManipulation,
  nodeEventHandlers,
  editorMutationHandlers,
  handleClearSelection,
  handleSave,
  createSnapshot,
  focusNode: (id) => focusNode(id),
  registerNodeUpdateCallback,
  fetchBuilderData,
  appRouter,
});
</script>

<template>
  <div class="admin-app-shell flex w-screen flex-col bg-sidebar">
    <div class="flex min-h-0 flex-1 w-screen">
      <StudioSidebar v-if="!isOnboardingRoute" />

      <Toaster position="bottom-center" />

      <div
        class="flex min-h-0 min-w-0 flex-1 flex-row"
        :class="isOnboardingRoute ? '' : (showStudio ? 'py-2.5 pr-2.5' : 'gap-1.5 py-2.5 pr-2.5')"
      >
        <StageSidebar
          v-if="!showStudio"
          ref="appSidebarRef"
          class="h-full min-h-0 shrink-0"
          :sidebar-props="stageSidebarShellProps"
          :sidebar-listeners="stageSidebarShellListeners"
        />

        <StageCommandRail
          v-if="!showStudio"
          :chrome-props="stageChromeShellProps"
          :chrome-listeners="stageChromeShellListeners"
        />

        <!-- Studio: content card + optional docked agent panel -->
        <div
          v-if="showStudio"
          class="relative z-10 flex min-h-0 min-w-0 flex-1 gap-1.5"
        >
          <div
            class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            <div
              class="flex min-h-0 min-w-0 flex-1 overflow-hidden"
            >
              <StudioApp @ready="handleStudioReady" />
            </div>
          </div>

          <AgentDockedPanel v-if="dockedAgentVisible && !isOnboardingRoute" class="h-full" />
        </div>

        <!-- Composer: canvas + inspector panels (gap from row; left panel is StageSidebar) -->
        <div
          v-else
          class="relative z-10 flex min-h-0 min-w-0 flex-1"
          :class="{
            'opacity-0 pointer-events-none': hideCanvasUntilShellReady,
          }"
        >
          <StageApp
            v-if="showCanvas || hasEnteredEditing"
            v-show="showCanvas"
            ref="stageCanvasRef"
            class="min-h-0 min-w-0 flex-1"
            v-bind="stageAppProps"
            v-on="stageAppListeners"
          />
        </div>
      </div>
    </div>

    <ShellModeTransitionOverlay :visible="isShellOverlayVisible" />

    <DesignWorkbenchDialog />

    <Dialog
      :open="composerLeaveDialogOpen"
      @update:open="handleComposerLeaveDialogOpenChange"
    >
      <DialogContent class="sm:max-w-md" :show-close-button="false">
        <DialogHeader>
          <DialogTitle>{{ t("composer.drafts.leave.title") }}</DialogTitle>
          <DialogDescription>
            {{ t("composer.drafts.leave.description") }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            :disabled="composerLeaveSaving"
            @click="settleComposerLeaveDecision(false)"
          >
            {{ t("composer.drafts.leave.stay") }}
          </Button>
          <div class="flex gap-2">
            <Button
              variant="destructive"
              :disabled="composerLeaveSaving"
              @click="discardComposerDraftAndLeave"
            >
              {{ t("composer.drafts.leave.discardChanges") }}
            </Button>
            <Button :disabled="composerLeaveSaving" @click="saveComposerDraftAndLeave">
              {{
                composerLeaveSaving
                  ? t("composer.drafts.leave.saving")
                  : t("composer.drafts.leave.saveAndLeave")
              }}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AgentFloatingSheet
      v-if="showAgentShell && showStudio && !dockMode.isDocked.value && !isOnboardingRoute"
    />

    <component :is="StartupTracePanel" v-if="StartupTracePanel" />
  </div>
</template>

<style scoped>
.admin-app-shell {
  height: 100vh;
}

@supports (height: 100dvh) {
  .admin-app-shell {
    height: 100dvh;
  }
}
</style>
