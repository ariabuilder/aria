/**
 * Single source of truth for navigation and routing state.
 */

import {
  ref,
  computed,
  readonly,
  watch,
  type Ref,
  type ComputedRef,
} from "vue";
import { toast } from "vue-sonner";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import {
  getComposerItemFeatureDisabledMessage,
  isComposerItemFeatureEnabled,
} from "../../../../lib/features";
import {
  CONTRIBUTOR_COMPOSER_DENIED_MESSAGE,
} from "@/composables/useComposerAccess";
import {
  AppNavigationStateSchema,
  StudioSectionSchema,
  EditingTabSchema,
  RouterCompatibilityStateSchema,
  StartEditingPayloadSchema,
  DEFAULT_ROUTER_STATE,
  RouterStateSchema,
  PersistedRouterStateSchema,
  LegacyPersistedRouterStateSchema,
  type RouterState,
  type AppNavigationState,
  type RouterCompatibilityState,
  type StudioSection,
  type EditingTab,
  type EditableItemType,
  type AppMode,
  type EditingMode,
  type StartEditingPayload,
} from "../types/router";

// Used for cleanup of old persisted state
const STORAGE_KEY = "aria-router-state";
const SERVER_START_KEY = "aria-server-start";
const STORAGE_VERSION = 2;
const URL_PARAM_ITEM = "page";
const URL_PARAM_TYPE = "type";
const URL_PARAM_TAB = "tab";
const URL_PARAM_EDIT = "edit";
const ALLOW_EDIT_URL_PARAM = false;

const itemType = ref<EditableItemType | null>(DEFAULT_ROUTER_STATE.itemType);
const itemSlug = ref<string | null>(DEFAULT_ROUTER_STATE.itemSlug);
const studioSection = ref<StudioSection>(DEFAULT_ROUTER_STATE.studioSection);
const editingTab = ref<EditingTab>(DEFAULT_ROUTER_STATE.editingTab);

const leftSidebarOpen = ref<boolean>(DEFAULT_ROUTER_STATE.leftSidebarOpen);
const rightSidebarOpen = ref<boolean>(DEFAULT_ROUTER_STATE.rightSidebarOpen);

let isInitialized = false;
let isPersistenceSetup = false;

function buildPersistedState(state: RouterState) {
  const navigation = AppNavigationStateSchema.parse({
    itemType: state.itemType,
    itemSlug: state.itemSlug,
    studioSection: state.studioSection,
  });

  const compatibility = RouterCompatibilityStateSchema.parse({
    editingTab: state.editingTab,
    leftSidebarOpen: state.leftSidebarOpen,
    rightSidebarOpen: state.rightSidebarOpen,
  });

  return PersistedRouterStateSchema.parse({
    navigation,
    compatibility,
    timestamp: Date.now(),
    version: STORAGE_VERSION,
  });
}

function readPersistedState(): RouterState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsedJson: unknown = JSON.parse(raw);
    const persistedState = PersistedRouterStateSchema.safeParse(parsedJson);
    if (persistedState.success) {
      return RouterStateSchema.parse({
        ...persistedState.data.navigation,
        ...persistedState.data.compatibility,
      });
    }

    const legacyPersistedState = LegacyPersistedRouterStateSchema.safeParse(
      parsedJson,
    );
    if (!legacyPersistedState.success) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const {
      timestamp: _timestamp,
      version: _version,
      ...legacyState
    } = legacyPersistedState.data;
    return RouterStateSchema.parse(legacyState);
  } catch (error) {
    console.warn("[AppRouter] Failed to read persisted state", error);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writePersistedState(state: RouterState): void {
  if (typeof window === "undefined") return;

  try {
    const payload = buildPersistedState(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[AppRouter] Failed to persist state", error);
  }
}

function readUrlState(): RouterState | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const editParam = params.get(URL_PARAM_EDIT);
  const isEditMode = editParam === "1" || editParam === "true";
  if (!ALLOW_EDIT_URL_PARAM || !isEditMode) return null;
  const slug = params.get(URL_PARAM_ITEM);
  const typeParam = params.get(URL_PARAM_TYPE);
  const tabParam = params.get(URL_PARAM_TAB);

  if (!slug || !typeParam) return null;

  const typeParse = StartEditingPayloadSchema.safeParse({
    itemType: typeParam,
    itemSlug: slug,
  });

  if (!typeParse.success) return null;

  const tabParse = tabParam ? EditingTabSchema.safeParse(tabParam) : null;

  return RouterStateSchema.parse({
    ...DEFAULT_ROUTER_STATE,
    itemType: typeParse.data.itemType,
    itemSlug: typeParse.data.itemSlug,
    editingTab: tabParse?.success
      ? tabParse.data
      : DEFAULT_ROUTER_STATE.editingTab,
    rightSidebarOpen: true,
  });
}

function applyRouterState(state: RouterState): void {
  const validated = RouterStateSchema.parse(state);

  itemType.value = validated.itemType;
  itemSlug.value = validated.itemSlug;
  studioSection.value = validated.studioSection;
  editingTab.value = validated.editingTab;
  leftSidebarOpen.value = validated.leftSidebarOpen;
  rightSidebarOpen.value = validated.rightSidebarOpen;
}

/**
 * Reset all state to defaults (for testing)
 * @internal
 */
export function __resetRouterState(): void {
  itemType.value = DEFAULT_ROUTER_STATE.itemType;
  itemSlug.value = DEFAULT_ROUTER_STATE.itemSlug;
  studioSection.value = DEFAULT_ROUTER_STATE.studioSection;
  editingTab.value = DEFAULT_ROUTER_STATE.editingTab;
  leftSidebarOpen.value = DEFAULT_ROUTER_STATE.leftSidebarOpen;
  rightSidebarOpen.value = DEFAULT_ROUTER_STATE.rightSidebarOpen;
  isInitialized = false;
  isPersistenceSetup = false;
}

export interface UseAppRouterReturn {
  readonly itemType: Readonly<Ref<EditableItemType | null>>;
  readonly itemSlug: Readonly<Ref<string | null>>;
  readonly studioSection: Readonly<Ref<StudioSection>>;
  readonly editingTab: Readonly<Ref<EditingTab>>;
  readonly leftSidebarOpen: Readonly<Ref<boolean>>;
  readonly rightSidebarOpen: Readonly<Ref<boolean>>;

  readonly appMode: ComputedRef<AppMode>;
  readonly navigationState: ComputedRef<AppNavigationState>;
  readonly compatibilityState: ComputedRef<RouterCompatibilityState>;
  readonly editingMode: ComputedRef<EditingMode>;
  readonly isEditing: ComputedRef<boolean>;
  readonly state: ComputedRef<RouterState>;

  startEditing: (payload: StartEditingPayload) => void;
  stopEditing: () => void;
  navigateToStudio: (section?: StudioSection) => void;
  setEditingTab: (tab: EditingTab) => void;

  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;

  initialize: () => boolean;
}

export function useAppRouter(): UseAppRouterReturn {
  const studioCaps = useStudioCapabilities();

  /**
   * Explicit workspace mode derived from the active editing target.
   */
  const appMode = computed<AppMode>(() => {
    return itemSlug.value && itemType.value ? "stage" : "studio";
  });

  /**
   * App-level navigation state target.
   */
  const navigationState = computed<AppNavigationState>(() => ({
    itemType: itemType.value,
    itemSlug: itemSlug.value,
    studioSection: studioSection.value,
  }));

  /**
   * Compatibility-only UI/session state maintained during migration.
   */
  const compatibilityState = computed<RouterCompatibilityState>(() => ({
    editingTab: editingTab.value,
    leftSidebarOpen: leftSidebarOpen.value,
    rightSidebarOpen: rightSidebarOpen.value,
  }));

  /**
   * Editing mode derived state
   */
  const editingMode = computed<EditingMode>(() => ({
    isEditing: appMode.value === "stage",
    itemType: itemType.value,
    itemSlug: itemSlug.value,
  }));

  /**
   * Convenience shorthand for isEditing
   */
  const isEditing = computed(() => editingMode.value.isEditing);

  /**
   * Full state snapshot (for debugging/testing)
   */
  const state = computed<RouterState>(() => ({
    ...navigationState.value,
    ...compatibilityState.value,
  }));

  /**
   * Start editing an item (page, layout, or component)
   */
  function startEditing(payload: StartEditingPayload): void {
    // Validate payload with Zod
    const validated = StartEditingPayloadSchema.parse(payload);

    if (!isComposerItemFeatureEnabled(validated.itemType)) {
      const message = getComposerItemFeatureDisabledMessage(
        validated.itemType,
      );
      if (message) {
        toast.error(message);
      }
      return;
    }

    if (studioCaps.isReady.value) {
      if (!studioCaps.canEditItemInComposer(validated.itemType)) {
        toast.error(
          studioCaps.isContributor.value
            ? CONTRIBUTOR_COMPOSER_DENIED_MESSAGE
            : studioCaps.getForbiddenMessage(
                studioCaps.composerOperationForItem(validated.itemType),
              ),
        );
        return;
      }
    }

    if (import.meta.env.DEV) {
      console.log(
        `[AppRouter] startEditing: ${validated.itemType} - ${validated.itemSlug}`,
      );
    }

    itemType.value = validated.itemType;
    itemSlug.value = validated.itemSlug;

    // Auto-open right sidebar when editing starts
    rightSidebarOpen.value = true;

    // Default to layers tab when starting to edit
    editingTab.value = "layers";
  }

  /**
   * Stop editing and return to studio mode
   */
  function stopEditing(): void {
    if (import.meta.env.DEV) {
      console.log("[AppRouter] stopEditing");
    }

    itemType.value = null;
    itemSlug.value = null;
  }

  /**
   * Navigate to studio with optional section
   */
  function navigateToStudio(section?: StudioSection): void {
    // Exit editing BEFORE changing section — ensures appMode transitions
    // to "studio" before watchers react to the section change
    if (isEditing.value) {
      stopEditing();
    }

    if (section) {
      studioSection.value = StudioSectionSchema.parse(section);
    }
  }

  /**
   * Set the active editing tab
   */
  function setEditingTab(tab: EditingTab): void {
    EditingTabSchema.parse(tab);
    editingTab.value = tab;
  }

  function toggleLeftSidebar(): void {
    leftSidebarOpen.value = !leftSidebarOpen.value;
  }

  function toggleRightSidebar(): void {
    rightSidebarOpen.value = !rightSidebarOpen.value;
  }

  function setLeftSidebarOpen(open: boolean): void {
    leftSidebarOpen.value = open;
  }

  function setRightSidebarOpen(open: boolean): void {
    rightSidebarOpen.value = open;
  }

  /**
   * Initialize router (restore from localStorage)
   * Call once on app mount
   */
  function initialize(): boolean {
    if (isInitialized) {
      if (import.meta.env.DEV) {
        console.log("[AppRouter] Already initialized");
      }
      return true;
    }

    if (typeof window !== "undefined") {
      const serverStart = (window as Window & { __ARIA_SERVER_START?: number })
        .__ARIA_SERVER_START;
      if (serverStart) {
        const storedStart = localStorage.getItem(SERVER_START_KEY);
        if (!storedStart || storedStart !== String(serverStart)) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.setItem(SERVER_START_KEY, String(serverStart));
        }
      }
    }

    const urlState = readUrlState();
    const persistedState = urlState ? null : readPersistedState();
    let restoredFromStorage = false;

    if (urlState) {
      applyRouterState(urlState);
      restoredFromStorage = true;
    } else if (persistedState) {
      const sanitizedState: RouterState = {
        ...persistedState,
        itemType: null,
        itemSlug: null,
      };
      applyRouterState(sanitizedState);
      restoredFromStorage = true;
    }

    isInitialized = true;
    return restoredFromStorage;
  }

  if (!isPersistenceSetup) {
    isPersistenceSetup = true;
    watch(
      state,
      (nextState) => {
        if (!isInitialized) return;
        writePersistedState(nextState);
      },
      { deep: true, flush: "post" },
    );
  }

  return {
    itemType: readonly(itemType),
    itemSlug: readonly(itemSlug),
    studioSection: readonly(studioSection),
    editingTab: readonly(editingTab),
    leftSidebarOpen: readonly(leftSidebarOpen),
    rightSidebarOpen: readonly(rightSidebarOpen),

    appMode,
    navigationState,
    compatibilityState,
    editingMode,
    isEditing,
    state,

    startEditing,
    stopEditing,
    navigateToStudio,
    setEditingTab,

    toggleLeftSidebar,
    toggleRightSidebar,
    setLeftSidebarOpen,
    setRightSidebarOpen,

    initialize,
  };
}

export type {
  RouterState,
  AppNavigationState,
  RouterCompatibilityState,
  StudioSection,
  EditingTab,
  EditableItemType,
  AppMode,
  EditingMode,
  StartEditingPayload,
};
