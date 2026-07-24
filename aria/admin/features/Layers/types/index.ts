/**
 * Type system for the hierarchical layer tree navigator.
 * Zero 'any' types - 100% type safety.
 */

import type { BuilderNode } from "../../../../lib/types/nodes";

/**
 * Extended tree node with UI state for the layers panel
 */
export interface LayerTreeNode extends BuilderNode {
  expanded?: boolean;
  selected?: boolean;
  hovered?: boolean;
  /** Depth level in the tree (0 = root) */
  depth?: number;
  /** Parent node ID (null for root nodes) */
  parentId?: string | null;
}

export const VIRTUAL_SLOT_NAMES = {
  PAGE_CONTENT: "page-content",
  COMPONENT_CONTENT: "component-content",
  UNASSIGNED: "unassigned",
} as const;

export type VirtualSlotName =
  (typeof VIRTUAL_SLOT_NAMES)[keyof typeof VIRTUAL_SLOT_NAMES];

export interface LayerDragEvent {
  item?: HTMLElement & {
    __vueParentComponent?: { props?: { element?: BuilderNode } };
    __draggable_context?: { element?: BuilderNode };
  };
}

export interface LayerListMovedChange {
  element: BuilderNode;
  oldIndex: number;
  newIndex: number;
}

export interface LayerListAddedChange {
  element: BuilderNode;
  newIndex: number;
}

export interface LayerListRemovedChange {
  element: BuilderNode;
}

export interface LayerListChangeEvent {
  moved?: LayerListMovedChange;
  added?: LayerListAddedChange;
  removed?: LayerListRemovedChange;
}

export interface LayerSelectGesture {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface LayerSelectRequest {
  node: BuilderNode;
  triggerGesture?: LayerSelectGesture;
}

// DRAG & DROP TYPES

export type DropPosition = "before" | "after" | "inside";

export type DropIndicatorClass =
  | "drop-before"
  | "drop-after"
  | "drop-inside"
  | "";

export type DragSource =
  | "add-elements"
  | "components"
  | "canvas"
  | "layers"
  | null;

export interface DragState {
  nodeId: string;
  nodeType: string;
  /** Parent ID of the source location (null for root) */
  sourceParentId: string | null;
  sourceIndex: number;
  startTime: number;
  /** Where the drag originated from */
  source: DragSource;
}

export interface DropTarget {
  nodeId: string;
  node: BuilderNode;
  position: DropPosition;
  parentId: string | null;
  insertionIndex: number;
}

export interface DragOperation {
  draggedNodeId: string;
  /** Source parent ID (null for root) */
  sourceParentId: string | null;
  sourceIndex: number;
  /** Target parent ID (null for root) */
  targetParentId: string | null;
  targetSiblingId: string | null;
  /** Calculated insertion index */
  targetIndex: number;
  position: DropPosition;
}

/**
 * Drag-drop statistics
 */
export interface DragDropStats {
  totalDrags: number;
  successfulDrops: number;
  cancelledDrags: number;
  averageDragDuration: number;
  lastDragTime: number | null;
}

export type ValidationSeverity = "error" | "warning" | "info";

export const VALIDATION_ERROR_CODES = {
  NO_DRAG: "NO_DRAG_IN_PROGRESS",
  DROP_ON_SELF: "DROP_ON_SELF",
  DROP_ON_DESCENDANT: "DROP_ON_DESCENDANT",
  TARGET_NO_CHILDREN: "TARGET_NO_CHILDREN",
  TARGET_CANNOT_HAVE_CHILDREN: "TARGET_CANNOT_HAVE_CHILDREN",
  INVALID_SLOT: "INVALID_SLOT",
  INVALID_SLOT_ASSIGNMENT: "INVALID_SLOT_ASSIGNMENT",
  SCHEMA_VIOLATION: "SCHEMA_VIOLATION",
  CUSTOM_VALIDATION_FAILED: "CUSTOM_VALIDATION_FAILED",
} as const;

export type ValidationErrorCode =
  (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

export interface DropValidation {
  valid: boolean;
  reason?: string;
  code?: ValidationErrorCode;
}

export interface ValidationError {
  nodeId: string;
  path: string[];
  message: string;
  severity: ValidationSeverity;
  field?: string;
  code?: ValidationErrorCode;
}

export interface PropValidationResult {
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Suggested fix for the error */
  suggestion?: string;
}

export interface NodeTypeRequirements {
  required: string[];
  optional?: string[];
  /** Property type constraints */
  types?: Record<string, string>;
  allowChildren?: boolean;
  allowedChildTypes?: string[];
}

/**
 * Validation statistics summary
 */
export interface ValidationStats {
  totalNodes: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** Validation duration in milliseconds */
  duration: number;
}

// SEARCH & FILTER TYPES

export interface MatchInfo {
  type: boolean;
  /** Property names that match the query */
  props: string[];
  /** Metadata keys that match the query */
  metadata: string[];
  id: boolean;
  className: boolean;
}

export interface SearchResult {
  node: BuilderNode;
  path: string[];
  /** Match information */
  matches: MatchInfo;
  /** Search relevance score (0-100) */
  score: number;
  depth: number;
}

/**
 * Search filter criteria
 */
export interface SearchFilters {
  types?: string[];
  minDepth?: number;
  maxDepth?: number;
  /** Filter by property existence */
  hasProps?: string[];
  /** Filter by metadata existence */
  hasMetadata?: string[];
  slot?: string;
}

/**
 * Search statistics
 */
export interface SearchStats {
  nodesSearched: number;
  matchesFound: number;
  /** Search duration in milliseconds */
  duration: number;
  lastQuery: string;
  timestamp: number | null;
}

export interface TypeCount {
  type: string;
  count: number;
}

export type CollapseState = "expanded" | "soft-collapsed" | "full-collapsed";

export interface TreeExpansionState {
  /** Set of expanded node IDs */
  expandedNodes: Set<string>;
  /** Collapse state map for three-way toggle */
  collapseStates: Map<string, CollapseState>;
}

export interface TreeSelectionState {
  selectedNodeId: string | null;
  selectedNode: BuilderNode | null;
  /** Multiple selection (future) */
  selectedNodeIds?: Set<string>;
}

export interface TreeHoverState {
  hoveredNodeId: string | null;
}

export interface TreeEditingState {
  editingNodeId: string | null;
  editValue: string;
}

export interface DragDropOptions {
  debug?: boolean;
  allowLeafNodeChildren?: boolean;
  customValidator?: (
    dragNode: BuilderNode,
    targetNode: BuilderNode,
  ) => DropValidation;
  trackStats?: boolean;
}

export interface NodeValidationOptions {
  debug?: boolean;
  autoValidate?: boolean;
  /** Maximum validation depth for nested nodes */
  maxDepth?: number;
  strictMode?: boolean;
}

export interface SearchOptions {
  debug?: boolean;
  caseSensitive?: boolean;
  searchIds?: boolean;
  searchClassNames?: boolean;
  /** Search in properties */
  searchProps?: boolean;
  searchMetadata?: boolean;
  /** Maximum number of results (0 = unlimited) */
  maxResults?: number;
  sortByScore?: boolean;
}

export const LEAF_NODE_TYPES = new Set([
  "Image",
  "Icon",
  "Text",
  "Input",
  "Video",
  "Hr",
  "Br",
  "Link",
]);

/**
 * Container node types that can have children
 */
export const CONTAINER_NODE_TYPES = new Set([
  "Container",
  "Section",
  "Layout",
  "Component",
  "Box",
  "Flex",
  "Grid",
  "Stack",
]);

// RESULT TYPES (Discriminated Unions)

export interface SuccessResult<T> {
  readonly success: true;
  readonly data: T;
}

export interface ErrorResult {
  readonly success: false;
  readonly error: string;
  readonly code?: string;
}

export type Result<T> = SuccessResult<T> | ErrorResult;

export type ValidationResult<T = BuilderNode> = Result<T>;

export type SearchResultWrapper = Result<SearchResult[]>;

export type DropValidationResult = Result<DropTarget>;
