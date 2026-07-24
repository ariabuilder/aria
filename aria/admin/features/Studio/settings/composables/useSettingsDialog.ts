import { ref, type Ref } from "vue";
import {
  useRouteQueryDialog,
  type RouteQueryDialogReturn,
} from "@/features/Studio/core/composables/useRouteQueryDialog";
import {
  SettingsTabSchema,
  settingsTabGroups,
  settingsTabs,
  type SettingsTab,
} from "../schemas/settingsDialog";

export type { SettingsTab };
export { settingsTabGroups, settingsTabs };

const QUERY_KEY = "settings" as const;
const DEFAULT_TAB: SettingsTab = "general";

let controller: RouteQueryDialogReturn<SettingsTab> | null = null;

const selectedUserId = ref<string | null>(null);
const isHeaderOverridden = ref(false);
const sessionProfileDirty = ref(false);
const flushCallbacks = new Set<() => Promise<void>>();
const resetHandlers = new Map<SettingsTab, SettingsTabResetHandler>();

export interface SettingsTabResetHandler {
  title: string;
  description: string;
  warning: string;
  items?: readonly string[];
  confirmLabel?: string;
  reset: () => Promise<void>;
}

export interface SettingsDialogReturn {
  isOpen: Ref<boolean>;
  activeTab: Ref<SettingsTab>;
  selectedUserId: Ref<string | null>;
  isHeaderOverridden: Ref<boolean>;
  sessionProfileDirty: Ref<boolean>;
  open: (tab?: SettingsTab, userId?: string) => void;
  close: () => Promise<void>;
  toggle: () => void;
  markSessionProfileDirty: () => void;
  clearSessionProfileDirty: () => void;
  setHeaderOverride: (overridden: boolean) => void;
  registerFlushCallback: (callback: () => Promise<void>) => () => void;
  flushPendingSaves: () => Promise<void>;
  registerTabReset: (
    tabId: SettingsTab,
    handler: SettingsTabResetHandler,
  ) => () => void;
  getTabResetHandler: (tabId: SettingsTab) => SettingsTabResetHandler | null;
}

export function useSettingsDialog(): SettingsDialogReturn {
  if (!controller) {
    controller = useRouteQueryDialog({
      queryKey: QUERY_KEY,
      valueSchema: SettingsTabSchema,
      defaultOpenValue: DEFAULT_TAB,
    });
  }

  function open(tab?: SettingsTab, userId?: string) {
    const targetTab = tab ?? controller?.value.value ?? DEFAULT_TAB;
    selectedUserId.value = userId ?? null;
    controller?.open(targetTab);
  }

  function markSessionProfileDirty() {
    sessionProfileDirty.value = true;
  }

  function clearSessionProfileDirty() {
    sessionProfileDirty.value = false;
  }

  function setHeaderOverride(overridden: boolean) {
    isHeaderOverridden.value = overridden;
  }

  function registerFlushCallback(callback: () => Promise<void>) {
    flushCallbacks.add(callback);
    return () => {
      flushCallbacks.delete(callback);
    };
  }

  async function flushPendingSaves() {
    await Promise.all([...flushCallbacks].map((callback) => callback()));
  }

  function registerTabReset(
    tabId: SettingsTab,
    handler: SettingsTabResetHandler,
  ) {
    resetHandlers.set(tabId, handler);
    return () => {
      if (resetHandlers.get(tabId) === handler) {
        resetHandlers.delete(tabId);
      }
    };
  }

  function getTabResetHandler(
    tabId: SettingsTab,
  ): SettingsTabResetHandler | null {
    return resetHandlers.get(tabId) ?? null;
  }

  async function close() {
    await flushPendingSaves();
    selectedUserId.value = null;
    isHeaderOverridden.value = false;
    controller?.close();
  }

  function toggle() {
    controller?.toggle();
  }

  return {
    isOpen: controller.isOpen,
    activeTab: controller.value,
    selectedUserId,
    isHeaderOverridden,
    sessionProfileDirty,
    open,
    close,
    toggle,
    markSessionProfileDirty,
    clearSessionProfileDirty,
    setHeaderOverride,
    registerFlushCallback,
    flushPendingSaves,
    registerTabReset,
    getTabResetHandler,
  };
}
