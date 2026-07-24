import { ref } from "vue";

// Shared state for settings navigation
const currentSection = ref<string>("general");

/**
 * Composable for managing settings navigation
 * Eliminates prop drilling by providing shared state
 */
export function useSettingsNavigation() {
  const navigateTo = (section: string) => {
    currentSection.value = section;
  };

  // Reset to general section when composable is first used
  const resetToGeneral = () => {
    currentSection.value = "general";
  };

  return {
    currentSection,
    navigateTo,
    resetToGeneral,
  };
}
