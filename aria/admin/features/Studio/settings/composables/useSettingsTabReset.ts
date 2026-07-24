import { onUnmounted, watch, type MaybeRefOrGetter, toValue } from "vue";
import type { SettingsTab } from "../schemas/settingsDialog";
import {
  useSettingsDialog,
  type SettingsTabResetHandler,
} from "./useSettingsDialog";

export interface UseSettingsTabResetOptions extends SettingsTabResetHandler {
  tabId: SettingsTab;
  enabled?: MaybeRefOrGetter<boolean>;
}

/**
 * Register a per-tab reset handler for the settings dialog footer action.
 */
export function useSettingsTabReset(options: UseSettingsTabResetOptions): void {
  const dialog = useSettingsDialog();
  let unregister: (() => void) | undefined;

  function syncRegistration(): void {
    unregister?.();
    unregister = undefined;

    if (options.enabled != null && toValue(options.enabled) === false) {
      return;
    }

    const { tabId, enabled: _enabled, ...handler } = options;
    unregister = dialog.registerTabReset(tabId, handler);
  }

  watch(
    () => (options.enabled == null ? true : toValue(options.enabled)),
    () => syncRegistration(),
    { immediate: true },
  );

  onUnmounted(() => {
    unregister?.();
  });
}
