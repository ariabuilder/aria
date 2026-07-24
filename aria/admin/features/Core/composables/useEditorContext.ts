import { ref, computed, type Ref, type ComputedRef } from "vue";
import type {
  BuilderNode,
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../../../lib/types/nodes";
import type { LayoutInspectorMetadata } from "../types/layout";
import { useAppRouter } from "./useAppRouter";

export interface LoadingState {
  isLoading: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  loadError: string | null;
}

export interface EditorAppState {
  pageBlocks: Ref<BuilderNode[]>;
  composeNonce: Ref<string | null>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  selectedLayoutRegion: Ref<string | null>;
  hasUnsavedChanges: Ref<boolean>;
  lastSavedSnapshot: Ref<string>;
  layoutSlotsSnapshot: Ref<string>;
  loadingState: Ref<LoadingState>;
}

export interface UseEditorContextReturn {
  loadingState: Ref<LoadingState>;
  pageBlocks: Ref<BuilderNode[]>;
  appState: EditorAppState;
  stageEditorState: {
    loadingState: Ref<LoadingState>;
    pageBlocks: Ref<BuilderNode[]>;
    currentPage: Ref<PageDSL | null>;
    currentLayout: Ref<LayoutDSL | null>;
    currentComponent: Ref<ComponentDSL | null>;
    currentItemType: Ref<"page" | "layout" | "component">;
    selectedLayoutRegion: Ref<string | null>;
    hasUnsavedChanges: Ref<boolean>;
    lastSavedSnapshot: Ref<string>;
    layoutSlotsSnapshot: Ref<string>;
    currentPageSlug: ComputedRef<string | null>;
    currentItemSlug: ComputedRef<string>;
    currentPageLayoutSlug: ComputedRef<string | undefined>;
    currentLayoutMetadata: ComputedRef<LayoutInspectorMetadata | undefined>;
    currentHeaderComponent: ComputedRef<string | undefined>;
    currentFooterComponent: ComputedRef<string | undefined>;
    stageKey: ComputedRef<string>;
  };
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  selectedLayoutRegion: Ref<string | null>;
  hasUnsavedChanges: Ref<boolean>;
  lastSavedSnapshot: Ref<string>;
  layoutSlotsSnapshot: Ref<string>;
  currentPageSlug: ComputedRef<string | null>;
  currentItemSlug: ComputedRef<string>;
  currentPageLayoutSlug: ComputedRef<string | undefined>;
  currentLayoutMetadata: ComputedRef<LayoutInspectorMetadata | undefined>;
  currentHeaderComponent: ComputedRef<string | undefined>;
  currentFooterComponent: ComputedRef<string | undefined>;
  stageKey: ComputedRef<string>;
}

export function useEditorContext() {
  const loadingState = ref<LoadingState>({
    isLoading: false,
    isSaving: false,
    isPublishing: false,
    loadError: null,
  });

  const pageBlocks = ref<BuilderNode[]>([]);

  const appState = {
    pageBlocks,
    composeNonce: ref<string | null>(""),
    currentPage: ref<PageDSL | null>(null),
    currentLayout: ref<LayoutDSL | null>(null),
    currentComponent: ref<ComponentDSL | null>(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    selectedLayoutRegion: ref<string | null>(null),
    hasUnsavedChanges: ref<boolean>(false),
    lastSavedSnapshot: ref<string>(""),
    layoutSlotsSnapshot: ref<string>("[]"),
    loadingState,
  };

  const {
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    selectedLayoutRegion,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
  } = appState;

  const appRouter = useAppRouter();

  const currentPageSlug = computed(() => {
    if (!appRouter.isEditing.value) return null;
    return currentPage.value?.slug ?? null;
  });
  const currentItemSlug = computed(() => {
    if (!appRouter.isEditing.value) {
      return "idle";
    }

    if (currentItemType.value === "component") {
      const mode = appRouter.editingMode.value;
      if (mode.isEditing && mode.itemType === "component" && mode.itemSlug) {
        return mode.itemSlug;
      }
      return currentComponent.value?.id ?? "component";
    }

    if (currentItemType.value === "layout") {
      const mode = appRouter.editingMode.value;
      if (mode.isEditing && mode.itemType === "layout" && mode.itemSlug) {
        return mode.itemSlug;
      }
      return currentLayout.value?.slug ?? currentLayout.value?.id ?? "layout";
    }

    const mode = appRouter.editingMode.value;
    if (mode.isEditing && mode.itemType === "page" && mode.itemSlug) {
      return mode.itemSlug;
    }

    return currentPage.value?.slug ?? "index";
  });

  const currentPageLayoutSlug = computed<string | undefined>(
    () => currentPage.value?.layout ?? undefined,
  );

  const currentLayoutMetadata = computed<
    | {
        layoutType?: string;
        slots?: Array<{ name: string; required: boolean }>;
        description?: string;
      }
    | undefined
  >(() => {
    if (!currentLayout.value) return undefined;

    const metadata = currentLayout.value.layoutMetadata;

    return {
      layoutType: metadata?.layoutType,
      description: metadata?.description,
      slots: (currentLayout.value.slots ?? []).map(
        (slot: { name: string; required?: boolean }) => ({
          name: slot.name,
          required: Boolean(slot.required),
        }),
      ),
    };
  });

  const currentHeaderComponent = computed(() =>
    appRouter.isEditing.value
      ? (currentLayout.value?.regions?.headerComponent ??
        currentLayout.value?.metadata?.regions?.headerComponent)
      : undefined,
  );
  const currentFooterComponent = computed(() =>
    appRouter.isEditing.value
      ? (currentLayout.value?.regions?.footerComponent ??
        currentLayout.value?.metadata?.regions?.footerComponent)
      : undefined,
  );

  // Use the router's editingMode.itemSlug which is set synchronously in
  // startEditing(), rather than currentPage/Layout/Component which are set
  // asynchronously after loadPage finishes. This prevents a stageKey change
  // mid-render that would destroy and recreate the entire ComposerStage tree.
  const stageKey = computed(() => {
    const mode = appRouter.editingMode.value;
    if (mode.isEditing && mode.itemSlug) {
      return `stage-${mode.itemType}-${mode.itemSlug}`;
    }

    return "stage-idle";
  });

  const stageEditorState = {
    loadingState,
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    currentItemType,
    selectedLayoutRegion,
    hasUnsavedChanges,
    lastSavedSnapshot,
    layoutSlotsSnapshot,
    currentPageSlug,
    currentItemSlug,
    currentPageLayoutSlug,
    currentLayoutMetadata,
    currentHeaderComponent,
    currentFooterComponent,
    stageKey,
  };

  return {
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
    currentPageSlug,
    currentItemSlug,
    currentPageLayoutSlug,
    currentLayoutMetadata,
    currentHeaderComponent,
    currentFooterComponent,
    stageKey,
  };
}
