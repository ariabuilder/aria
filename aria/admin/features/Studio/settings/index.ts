export { default as SettingsDialog } from "./SettingsDialog.vue"
export { useSettingsDialog, settingsTabs } from "./composables/useSettingsDialog"
export type {
  SettingsTab,
  SettingsDialogReturn,
  SettingsTabResetHandler,
} from "./composables/useSettingsDialog"
export { useSettingsTabReset } from "./composables/useSettingsTabReset"
