import { computed } from "vue";

import {
  DESIGN_SECTION_CONFIG,
  DESIGN_SECTION_GROUPS,
  isDesignSection,
  type DesignSection,
  type DesignSectionConfig,
} from "../types";
import { useDesignSection } from "./useDesignSection";
import { useDesignSystem } from "./useDesignSystem";

const FALLBACK_DESIGN_SECTION: DesignSection = "colors";

export function useDesignViewState() {
  const { currentDesignSection, setDesignSection } = useDesignSection();
  const {
    canUndo,
    canRedo,
    isSaving,
    hasUnsavedChanges,
    undo,
    redo,
    save,
    resetToDefaults,
  } = useDesignSystem();

  const currentView = computed<DesignSection>(() => {
    return isDesignSection(currentDesignSection.value)
      ? currentDesignSection.value
      : FALLBACK_DESIGN_SECTION;
  });

  const currentConfig = computed<DesignSectionConfig>(() => {
    return (
      DESIGN_SECTION_CONFIG[currentView.value] ??
      DESIGN_SECTION_CONFIG[FALLBACK_DESIGN_SECTION]
    );
  });

  const sectionGroups = computed(() => {
    return DESIGN_SECTION_GROUPS.map((group) => ({
      ...group,
      sections: group.sectionIds
        .map((sectionId) => DESIGN_SECTION_CONFIG[sectionId])
        .filter((section): section is DesignSectionConfig => Boolean(section)),
    })).filter((group) => group.sections.length > 0);
  });

  function setSection(section: DesignSection): void {
    setDesignSection(section);
  }

  function resetColorSystem(): void {
    resetToDefaults();
  }

  return {
    canUndo,
    canRedo,
    isSaving,
    colorHasUnsavedChanges: hasUnsavedChanges,
    undo,
    redo,
    save,
    currentView,
    currentConfig,
    sectionGroups,
    setSection,
    resetColorSystem,
  };
}
