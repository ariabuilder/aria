/**
 * Admin app state and UI types for the builder shell.
 */

import type {
  BuilderNode,
  PageDSL,
  LayoutDSL,
  ComponentDSL,
} from "../../lib/types/nodes";

/**
 * Item types available in the builder
 *
 * Used for discriminating which resource is currently being edited
 */
export type ItemType = "page" | "layout" | "component";

export type PublicationStatus = "draft" | "published" | "archived";

/**
 * Canvas interaction modes for different editing operations
 */
export type CanvasInteractionMode = "select" | "drag" | "resize" | "edit";

/**
 * Center view panels in the builder
 */
export type CenterViewType = "builder" | "options";

/**
 * Reorder position relative to target element
 */
export type ReorderPosition = "before" | "after" | "inside";

/**
 * Session state persisted across HMR reloads
 *
 * Stores current editing context and UI preferences to survive
 * hot module replacement during development.
 */
export interface SessionState {
  /** Currently loaded page (if editing a page) */
  readonly currentPage?: PageDSL;
  /** Currently loaded layout (if page uses a layout or editing layout) */
  readonly currentLayout?: LayoutDSL | null;
  /** Currently loaded component (if editing a component) */
  readonly currentComponent?: ComponentDSL | null;
  readonly currentItemType: ItemType;
  readonly selectedBlockId: string | null;
  readonly centerView: CenterViewType;
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
  /** Active left sidebar view (pages, components, layers, etc.) */
  readonly currentView: string;
  /** Active settings section (if in settings view) */
  readonly currentSettingsSection: string;
  readonly timestamp: number;
  /** Expanded blocks from server-side component expansion (session-storage field name) */
  readonly expandedBlocks?: readonly BuilderNode[];
}

/**
 * Application loading and save states
 *
 * Tracks async operations to show appropriate UI feedback
 */
export interface AppLoadingState {
  /** Initial page/layout/component load in progress */
  readonly isLoading: boolean;
  /** Auto-save or manual save in progress */
  readonly isSaving: boolean;
  /** Publishing a page revision is in progress */
  readonly isPublishing: boolean;
  /** Error message if initial load failed */
  readonly loadError: string | null;
}

/**
 * UI visibility and view state
 *
 * Controls display of various builder UI elements
 */
export interface UIVisibilityState {
  /** Left sidebar expanded state */
  readonly leftSidebarOpen: boolean;
  /** Right inspector sidebar expanded state */
  readonly rightSidebarOpen: boolean;
  readonly showOutlines: boolean;
  /** Dimension badge visibility for the selected canvas element */
  readonly showSelectionSizing: boolean;
  /** Floating toolbar visibility for the selected canvas element */
  readonly showSelectionToolbar: boolean;
  /** Show slot placeholders in canvas */
  readonly showSlots: boolean;
  /** Wireframe mode - simplified element rendering */
  readonly wireframeMode: boolean;
  /** Currently selected layout region (for slot assignment) */
  readonly selectedLayoutRegion: string | null;
}

/**
 * Canvas drag-and-drop state
 *
 * Tracks active drag operations and related UI state
 */
export interface CanvasState {
  readonly isDragging: boolean;
  /** Slot visibility state before drag started (for restoration) */
  readonly showSlotsBeforeDrag: boolean;
}

/**
 * Complete editor state aggregation
 *
 * Combines all relevant state for the current editing session.
 * Used for save/restore operations and state serialization.
 */
export interface EditorState {
  readonly currentItemType: ItemType;
  readonly currentPage: PageDSL;
  /** Currently loaded layout (null if page has no layout) */
  readonly currentLayout: LayoutDSL | null;
  /** Currently loaded component (null unless editing component) */
  readonly currentComponent: ComponentDSL | null;
  /** Active blocks array (server-expanded) */
  readonly pageBlocks: readonly BuilderNode[];
  readonly selectedBlockId: string | null;
  readonly centerView: CenterViewType;
  /** Active left sidebar view */
  readonly currentView: string;
  /** Active settings section */
  readonly currentSettingsSection: string;
}

/**
 * Result of searching for a node in the tree
 *
 * Node reference, parent, and position for tree operations
 */
export interface NodeFindResult {
  readonly node: BuilderNode;
  /** Parent node (null if root-level) */
  readonly parent: BuilderNode | null;
  /** Position index within parent's children array */
  readonly index: number;
}

/**
 * Parameters for node reorder operation
 *
 * Describes moving a node from one position to another within the tree
 */
export interface ReorderOperation {
  /** Parent ID of source position (null for root) */
  readonly sourceParentId: string | null;
  readonly sourceIndex: number;
  /** Parent ID of target position (null for root) */
  readonly targetParentId: string | null;
  readonly targetIndex: number;
}

/**
 * Payload for reordering nodes via canvas drag-drop or layers panel
 */
export interface ReorderNodePayload {
  readonly nodeId: string;
  readonly targetNodeId?: string;
  /** Source slot name (for layout regions) */
  readonly fromSlot?: string;
  /** Destination slot name (for layout regions) */
  readonly toSlot?: string;
  /** Target position (0-based index or relative position) */
  readonly position?: number;
  readonly show?: boolean;
}

/**
 * Layers panel reorder operation data
 *
 * Simpler than ReorderNodePayload - used for tree-based drag/drop
 */
export interface LayersReorderData {
  /** Node being moved */
  readonly nodeId: string;
  /** Target node for position reference */
  readonly targetNodeId: string;
  readonly position: ReorderPosition;
}

/**
 * Parameters for adding a new block to the tree
 */
export interface AddBlockParams {
  /** Fully constructed block to insert */
  readonly newBlock: BuilderNode;
  /** Parent ID where block should be inserted (null for root) */
  readonly parentId: string;
  /** Optional position index (defaults to end) */
  readonly position?: number;
}

/**
 * Node property update payload from inspector
 *
 * Used for granular updates to node properties without replacing entire node
 */
export interface NodePropUpdatePayload {
  readonly nodeId: string;
  /** Property name (nested paths supported with dot notation) */
  readonly propName: string;
  readonly value: unknown;
  readonly description?: string;
}

/**
 * Payload for dropping a component from sidebar onto canvas
 */
export interface DropComponentPayload {
  /** Source of the drop (sidebar, canvas, etc.) */
  readonly source: string;
  readonly componentType: string;
  readonly componentData: Readonly<Partial<BuilderNode>>;
  /** Target slot name (for layout regions) */
  readonly slot?: string;
  readonly position?: number;
  /** Component master ID for component references */
  readonly componentSlug?: string;
}

/**
 * Payload for adding element from components sidebar
 */
export interface AddElementPayload {
  /** Element type (Section, Heading, Button, etc.) */
  readonly type: string;
  readonly data: Readonly<Partial<BuilderNode>>;
  /** Component master ID if adding a component instance */
  readonly componentSlug?: string;
  /** Explicit parent node for canvas drop insertion */
  readonly parentId?: string;
  /** Whether insertion is contextual, explicitly at root, or under parentId. */
  readonly insertionMode?: "contextual" | "root" | "parent";
  /** Explicit insertion position within the parent node */
  readonly position?: number;
}

export interface LayoutMetadata {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly slots?: readonly Readonly<{
    name: string;
    label: string;
    required: boolean;
  }>[];
  readonly regions?: Readonly<Record<string, unknown>>;
}

export interface PageMetadata {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly version?: string;
  readonly status: PublicationStatus;
  readonly updatedAt: string;
  readonly settings: Readonly<{
    breakpoints?: readonly unknown[];
    utilityEngine?: string;
    framework?: string;
    [key: string]: unknown;
  }>;
  readonly frontmatter?: Readonly<Record<string, unknown>>;
  readonly layout?: string;
  readonly regions?: Readonly<Record<string, unknown>>;
}

/**
 * Result from server compose action
 *
 * Contains expanded page blocks and metadata after server-side
 * component reference expansion
 */
export interface ComposeActionResult {
  /** Fully expanded blocks ready to render (components expanded) */
  readonly pageBlocks: readonly BuilderNode[];
  /** Original unexpanded blocks (for layers tree) */
  readonly originalNodes: readonly BuilderNode[];
  /** Security nonce for save validation */
  readonly nonce: string;
  readonly pageMetadata: PageMetadata;
  /** Layout metadata if page uses a layout */
  readonly currentLayout?: LayoutMetadata | null;
}

/**
 * Save action result (discriminated union for success/failure)
 */
export type SaveResult =
  | {
      readonly success: true;
      readonly version: string;
    }
  | {
      readonly success: false;
      readonly error: {
        readonly message: string;
        readonly code?: string;
      };
    };

/**
 * Command pattern interface for undo/redo operations
 *
 * Each operation implements this to support history navigation
 */
export interface HistoryCommand {
  /** Command type identifier (for logging/debugging) */
  readonly type: string;
  /** Function to reverse the operation */
  readonly undo: () => void;
  /** Function to re-apply the operation */
  readonly redo: () => void;
  /** When command was executed */
  readonly timestamp: number;
  readonly description?: string;
  /** Node IDs affected by this operation (for smart invalidation) */
  readonly affectedNodeIds?: readonly string[];
}

export interface VersionHistoryEntry {
  /** Version identifier (timestamp-based or semantic) */
  readonly version: string;
  /** When version was created */
  readonly timestamp: number;
  readonly message?: string;
}

/**
 * Modifier keys for keyboard shortcuts
 */
export interface KeyboardModifiers {
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly meta?: boolean;
}

export type KeyboardShortcutHandler = (
  event: KeyboardEvent,
) => void | Promise<void>;

/**
 * Keyboard shortcut configuration
 *
 * Defines a keyboard shortcut with modifiers and handler
 */
export interface KeyboardShortcutConfig extends KeyboardModifiers {
  /** Primary key (e.g., 's', 'z') */
  readonly key: string;
  /** Key code for better browser compatibility */
  readonly code: string;
  /** Handler function when shortcut is triggered */
  readonly handler: KeyboardShortcutHandler;
  readonly description: string;
}

/**
 * Cached node lookup result
 *
 * Used by findNodeById to avoid repeated tree traversals
 */
export interface CachedNode {
  /** Node ID (null if not found) */
  readonly nodeId: string | null;
  /** Node reference (null if not found) */
  readonly node: BuilderNode | null;
}

/**
 * Type guard for SaveResult success
 */
export function isSaveSuccess(
  result: SaveResult,
): result is Extract<SaveResult, { success: true }> {
  return result.success === true;
}

/**
 * Type guard for SaveResult failure
 */
export function isSaveFailure(
  result: SaveResult,
): result is Extract<SaveResult, { success: false }> {
  return result.success === false;
}

/**
 * Type guard for ItemType
 */
export function isValidItemType(value: string): value is ItemType {
  return value === "page" || value === "layout" || value === "component";
}

/**
 * Type guard for PublicationStatus
 */
export function isValidPublicationStatus(
  value: string,
): value is PublicationStatus {
  return value === "draft" || value === "published" || value === "archived";
}
