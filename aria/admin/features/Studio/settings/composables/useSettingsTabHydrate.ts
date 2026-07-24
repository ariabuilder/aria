import { onActivated, onMounted, watch } from "vue";
import type { SettingsTab } from "../schemas/settingsDialog";
import { useSettingsDialog } from "./useSettingsDialog";

export interface UseSettingsTabHydrateOptions {
  tabId: SettingsTab;
  hydrate: () => Promise<void>;
}

/**
 * Re-fetch settings when a settings dialog tab mounts, re-activates, or becomes active.
 * Matches the Redirects pattern: always hydrate from server on tab entry.
 */
export function useSettingsTabHydrate(
  options: UseSettingsTabHydrateOptions,
): void {
  const settingsDialog = useSettingsDialog();
  let hydrateInFlight: Promise<void> | null = null;

  async function runHydrate(): Promise<void> {
    if (hydrateInFlight) {
      await hydrateInFlight;
    }

    hydrateInFlight = options.hydrate().finally(() => {
      hydrateInFlight = null;
    });
    await hydrateInFlight;
  }

  onMounted(() => {
    void runHydrate();
  });

  onActivated(() => {
    void runHydrate();
  });

  watch(
    () => settingsDialog.activeTab.value,
    (tab) => {
      if (tab === options.tabId) {
        void runHydrate();
      }
    },
  );
}
