import { onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { parseOpenCommandBarMessage } from "@/features/Core/composables/adminWindowMessages";

export interface UseGlobalSearchShortcutsOptions {
  openSitePalette: () => void;
  openComposerQuickSwitch: () => void;
  openSettings: () => void;
  isComposerSidebarVisible: () => boolean;
  isShellTransitionActive?: () => boolean;
}

export function useGlobalSearchShortcuts(
  options: UseGlobalSearchShortcutsOptions,
): void {
  const route = useRoute();

  function routeToSearchTarget(): void {
    if (options.isShellTransitionActive?.()) {
      return;
    }

    const inComposer = "composer" in route.query;
    if (inComposer && options.isComposerSidebarVisible()) {
      options.openComposerQuickSwitch();
      return;
    }
    options.openSitePalette();
  }

  function handleOpenSearchEvent(): void {
    routeToSearchTarget();
  }

  function handleOpenSettingsEvent(): void {
    if (options.isShellTransitionActive?.()) {
      return;
    }

    options.openSettings();
  }

  function handlePostMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (parseOpenCommandBarMessage(event.data)) {
      routeToSearchTarget();
    }
  }

  onMounted(() => {
    window.addEventListener("aria:open-search", handleOpenSearchEvent);
    window.addEventListener("aria:open-settings", handleOpenSettingsEvent);
    window.addEventListener("message", handlePostMessage);
  });

  onUnmounted(() => {
    window.removeEventListener("aria:open-search", handleOpenSearchEvent);
    window.removeEventListener("aria:open-settings", handleOpenSettingsEvent);
    window.removeEventListener("message", handlePostMessage);
  });
}
