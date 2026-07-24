/**
 * Central export point for the Composer feature. Only
 * exports the public interface needed by App.
 */

export { default as ComposerNavBar } from "./components/ComposerNavBar.vue";
export { default as ComposerSidebar } from "./components/ComposerSidebar.vue";
export { default as ComposerPanel } from "./components/ComposerPanel.vue";
export { default as ComposerCanvasControlBar } from "./components/ComposerCanvasControlBar.vue";
export { COMPOSER_PANEL_CLASS } from "@/lib/composerPanel";
export { default as ComposerStage } from "./components/ComposerStage.vue";
export { default as ComposerQuickSwitch } from "./components/ComposerQuickSwitch.vue";
export { default as Preloader } from "./components/Preloader.vue";

export { useKeyboardShortcuts } from "./composables/useKeyboardShortcuts";
// useHistory moved to features/History
// useSelection moved to features/Beacon - re-export for convenience
export { useBeacon, useBeacon as useSelection } from "../Beacon";
export { useAppLoading } from "./composables/useAppLoading";

export type {
  ComposerView,
  StudioSection,
  SettingsSection,
  StylesSection,
  EditableItemType,
  EditingModeState,
  ComposerState,
  PersistedNavigationState,
  ViewMetadata,
} from "./types";

export * from "./utils";
