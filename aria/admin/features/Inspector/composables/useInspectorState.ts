/**
 * UI state for the Inspector panel (tabs, expanded sections, etc.
 * ) Does NOT manage selection - that comes from useSelection().
 */

import { ref, computed, readonly } from "vue";
import type {
  InspectorTab,
  InspectorMode,
  InspectorState,
} from "../types/inspector";
import type { InspectorPseudoState } from "../../../../lib/schemas/classEditor";

// STATE (Module-level Singleton)

const activeTab = ref<InspectorTab>("design");

const mode = ref<InspectorMode>("editing");

const isCollapsed = ref(false);

/** Set of expanded section IDs */
const expandedSections = ref<Set<string>>(new Set(["classes", "spacing"]));

/** Last active tab per element type (for smart tab restoration) */
const tabHistory = ref<Map<string, InspectorTab>>(new Map());

/** Incremented to request scroll/focus in the dedicated motion tab. */
const motionFocusNonce = ref(0);

/** Currently selected pseudo-selector for class editing */
const selectedPseudo = ref<InspectorPseudoState>("default");

/**
 * useInspectorState - Manages Inspector UI state
 *
 * @example
 * ```typescript
 * const {
 *   activeTab,
 *   setTab,
 *   toggleSection,
 *   isSectionExpanded,
 * } = useInspectorState();
 *
 * // Switch to props tab
 * setTab('props');
 *
 * // Toggle a collapsible section
 * toggleSection('typography');
 * ```
 */
export function useInspectorState() {

  /**
   * Full inspector state object (readonly)
   */
  const state = computed<InspectorState>(() => ({
    activeTab: activeTab.value,
    mode: mode.value,
    isCollapsed: isCollapsed.value,
    expandedSections: expandedSections.value,
  }));

  /**
   * Whether the inspector is in editing mode
   */
  const isEditing = computed(() => mode.value === "editing");

  /**
   * Whether the inspector is read-only (e.g., component instance)
   */
  const isReadonly = computed(() => mode.value === "readonly");

  /**
   * Whether the inspector is locked (no editing allowed)
   */
  const isLocked = computed(() => mode.value === "locked");

  /**
   * Set the active tab
   */
  function setTab(tab: InspectorTab): void {
    if (tab === activeTab.value) return;
    activeTab.value = tab;
  }

  /**
   * Switch to the Motion tab and request its editor receive focus.
   */
  function focusMotionInDesign(): void {
    activeTab.value = "motion";
    motionFocusNonce.value += 1;
  }

  /**
   * Get the previous tab
   */
  function getPreviousTab(): InspectorTab | null {
    const tabs: InspectorTab[] = ["design", "props", "motion"];
    const currentIndex = tabs.indexOf(activeTab.value);
    return currentIndex > 0 ? tabs[currentIndex - 1] : null;
  }

  /**
   * Get the next tab
   */
  function getNextTab(): InspectorTab | null {
    const tabs: InspectorTab[] = ["design", "props", "motion"];
    const currentIndex = tabs.indexOf(activeTab.value);
    return currentIndex < tabs.length - 1 ? tabs[currentIndex + 1] : null;
  }

  /**
   * Navigate to previous tab
   */
  function previousTab(): void {
    const prev = getPreviousTab();
    if (prev) setTab(prev);
  }

  /**
   * Navigate to next tab
   */
  function nextTab(): void {
    const next = getNextTab();
    if (next) setTab(next);
  }

  /**
   * Remember current tab for an element type
   */
  function rememberTabForType(elementType: string): void {
    tabHistory.value.set(elementType, activeTab.value);
  }

  /**
   * Restore tab for an element type
   */
  function restoreTabForType(elementType: string): void {
    const remembered = tabHistory.value.get(elementType);
    if (!remembered) {
      return;
    }

    setTab(remembered);
  }

  /**
   * Check if a section is expanded
   */
  function isSectionExpanded(sectionId: string): boolean {
    return expandedSections.value.has(sectionId);
  }

  /**
   * Toggle a section's expanded state
   */
  function toggleSection(sectionId: string): void {
    if (expandedSections.value.has(sectionId)) {
      expandedSections.value.delete(sectionId);
    } else {
      expandedSections.value.add(sectionId);
    }
    expandedSections.value = new Set(expandedSections.value);
  }

  /**
   * Expand a section
   */
  function expandSection(sectionId: string): void {
    if (!expandedSections.value.has(sectionId)) {
      expandedSections.value.add(sectionId);
      expandedSections.value = new Set(expandedSections.value);
    }
  }

  /**
   * Collapse a section
   */
  function collapseSection(sectionId: string): void {
    if (expandedSections.value.has(sectionId)) {
      expandedSections.value.delete(sectionId);
      expandedSections.value = new Set(expandedSections.value);
    }
  }

  /**
   * Expand all sections
   */
  function expandAll(sectionIds: string[]): void {
    expandedSections.value = new Set(sectionIds);
  }

  /**
   * Collapse all sections
   */
  function collapseAll(): void {
    expandedSections.value = new Set();
  }

  /**
   * Set the inspector mode
   */
  function setMode(newMode: InspectorMode): void {
    mode.value = newMode;
  }

  /**
   * Set to editing mode
   */
  function enableEditing(): void {
    mode.value = "editing";
  }

  /**
   * Set to readonly mode
   */
  function setReadonly(): void {
    mode.value = "readonly";
  }

  /**
   * Set to locked mode
   */
  function setLocked(): void {
    mode.value = "locked";
  }

  /**
   * Toggle panel collapsed state
   */
  function toggleCollapsed(): void {
    isCollapsed.value = !isCollapsed.value;
  }

  /**
   * Collapse the panel
   */
  function collapse(): void {
    isCollapsed.value = true;
  }

  /**
   * Expand the panel
   */
  function expand(): void {
    isCollapsed.value = false;
  }

  /**
   * Reset to default state
   */
  function reset(): void {
    activeTab.value = "design";
    mode.value = "editing";
    isCollapsed.value = false;
    expandedSections.value = new Set(["classes", "spacing"]);
    selectedPseudo.value = "default";
  }

  /**
   * Set the selected pseudo-selector
   */
  function setSelectedPseudo(pseudo: InspectorPseudoState): void {
    selectedPseudo.value = pseudo;
  }

  /**
   * Reset pseudo-selector to default
   */
  function resetPseudo(): void {
    selectedPseudo.value = "default";
  }

  return {
    // State (readonly)
    state: readonly(state),
    activeTab: readonly(activeTab),
    mode: readonly(mode),
    isCollapsed: readonly(isCollapsed),
    expandedSections: readonly(expandedSections),
    selectedPseudo: readonly(selectedPseudo),
    motionFocusNonce: readonly(motionFocusNonce),

    isEditing,
    isReadonly,
    isLocked,

    setTab,
    focusMotionInDesign,
    getPreviousTab,
    getNextTab,
    previousTab,
    nextTab,
    rememberTabForType,
    restoreTabForType,

    isSectionExpanded,
    toggleSection,
    expandSection,
    collapseSection,
    expandAll,
    collapseAll,

    setMode,
    enableEditing,
    setReadonly,
    setLocked,

    toggleCollapsed,
    collapse,
    expand,

    setSelectedPseudo,
    resetPseudo,

    reset,
  };
}
