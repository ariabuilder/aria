
import type { BuilderNode, StyleMap } from "../../../../lib/types/nodes";

// TAB & MODE

export type InspectorTab = "design" | "props" | "motion";

export type InspectorMode = "editing" | "readonly" | "locked";

export interface InspectorState {
  activeTab: InspectorTab;
  mode: InspectorMode;
  isCollapsed: boolean;
  expandedSections: Set<string>;
}

/**
 * Capabilities of the selected element
 * Used to determine which property inputs to show
 */
export interface ElementCapabilities {
  /** Can edit text content */
  hasText: boolean;
  /** Can set image source */
  hasImage: boolean;
  /** Can configure link */
  hasLink: boolean;
  /** Can configure code content */
  hasCode: boolean;
  /** Can configure svg attributes */
  hasSvg: boolean;
  /** Can configure icon classes */
  hasIcon: boolean;
  /** Is a component instance element */
  hasComponent: boolean;
  /** Can contain children */
  isContainer: boolean;
  isComponentInstance: boolean;
  isSlot: boolean;
  supportsTypography: boolean;
  supportsBackground: boolean;
  supportsHtmlTag: boolean;
}

/**
 * Full context for the currently selected element
 * Derived from useSelection() + additional computed properties
 */
export interface SelectedElementContext {
  /** The selected node (null if nothing selected) */
  node: BuilderNode | null;
  nodeId: string | null;
  nodeType: string;
  displayName: string;
  capabilities: ElementCapabilities;
  canEdit: boolean;
  /** Component reference if this is an instance */
  componentRef: string | null;
}

export interface NodePath {
  collection: "pages" | "layouts" | "components";
  id: string;
  version?: string;
}

export interface NodeTarget {
  path: NodePath;
  nodeId: string;
}

export interface PropertyUpdate<T = unknown> {
  target: NodeTarget;
  /** Property path (dot notation: "props.title" or "styles.padding") */
  propertyPath: string;
  value: T;
  /** Breakpoint for responsive values (default: "default") */
  breakpoint?: string;
  description?: string;
}

export interface StyleUpdate {
  target: NodeTarget;
  /** Style properties to update */
  styles: Partial<StyleMap>;
  breakpoint?: string;
  description?: string;
}

export interface BatchUpdate {
  target: NodeTarget;
  /** Map of property paths to values */
  updates: Record<string, unknown>;
  breakpoint?: string;
  description?: string;
}

export interface UpdateResult {
  success: boolean;
  /** New document version (for optimistic locking) */
  version?: string;
  error?: string;
  errorCode?: string;
}

export type InspectorEvent =
  | "tab-changed"
  | "section-toggled"
  | "property-updated"
  | "property-reset"
  | "batch-updated";

/**
 * Event payloads
 */
export interface InspectorEventMap {
  "tab-changed": { tab: InspectorTab; previousTab: InspectorTab };
  "section-toggled": { sectionId: string; isExpanded: boolean };
  "property-updated": PropertyUpdate;
  "property-reset": { target: NodeTarget; propertyPath: string };
  "batch-updated": BatchUpdate;
}
