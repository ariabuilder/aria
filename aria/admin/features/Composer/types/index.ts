/**
 * Composer Feature Type Definitions TypeScript types for the Composer shell -
 * the orchestrator of the entire builder. Manages navigation, editing modes, view.
 */

// NAVIGATION & VIEW TYPES

/**
 * Main navigation views in the builder Controls which content is displayed
 * in the main area: - studio: Management hub (dashboard + 4-pillar.
 */
export type ComposerView =
  | "studio"
  | "styles"
  | "add-elements"
  | "layers"
  | "search"
  | "settings";

/**
 * Studio sections - 6 core navigation items
 *
 * Structure: pages, layouts
 * Content: collections, media
 * Design: design, components
 */
export type StudioSection =
  | "dashboard" // Home/overview
  | "pages" // Page management
  | "layouts" // Layout templates
  | "collections" // CMS collections
  | "media" // Media library
  | "design" // Design system (colors, typography, effects, shortcuts)
  | "components"; // Component library

export type SettingsSection =
  | "general"
  | "seo"
  | "domain"
  | "analytics"
  | "integrations"
  | "appearance"
  | "custom-code"
  | "deployment";

export type StylesSection =
  | "tokens"
  | "colors"
  | "typography"
  | "spacing"
  | "radius"
  | "breakpoints"
  | "components"
  | "classes";

/**
 * Item types that can be edited
 */
export type EditableItemType = "page" | "layout" | "component";

/**
 * Editing mode state
 *
 * Computed from currentItemSlug and currentItemType.
 * When true, shows editing-specific UI (Add Elements, Layers, canvas toolbar)
 */
export interface EditingModeState {
  readonly isEditing: boolean;
  readonly itemType: EditableItemType | null;
  /** Slug/ID of item being edited (if any) */
  readonly itemSlug: string | null;
}

/**
 * Complete Composer state
 *
 * The single source of truth for navigation and layout in the builder
 */
export interface ComposerState {
  readonly currentView: ComposerView;
  readonly studioSection: StudioSection;
  readonly settingsSection: SettingsSection;
  readonly stylesSection: StylesSection;
  /** Left sidebar visibility */
  readonly leftSidebarOpen: boolean;
  /** Right sidebar (inspector) visibility */
  readonly rightSidebarOpen: boolean;
  readonly currentItemSlug: string | null;
  readonly currentItemType: EditableItemType | null;
}

/**
 * Navigation state to persist in localStorage
 */
export interface PersistedNavigationState {
  readonly view: ComposerView;
  readonly studioSection: StudioSection;
  readonly settingsSection: SettingsSection;
  readonly stylesSection: StylesSection;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
  readonly timestamp: number;
}

export interface ViewMetadata {
  readonly id: ComposerView;
  readonly label: string;
  readonly icon: string;
  /** Only visible during editing mode */
  readonly editingOnly?: boolean;
  /** Show at bottom of nav (status, help, etc.) */
  readonly bottomSection?: boolean;
}
