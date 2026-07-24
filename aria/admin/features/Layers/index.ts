/**
 * Exports components and composables for external use.
 */

export { default as LayerPanel } from "./components/LayerPanel.vue";

export { default as LayerItem } from "./components/LayerItem.vue";

export { LayerNodeRecursive } from "./components/LayerNodeRecursive";

export { useSchemaRules } from "./composables/useSchemaRules";
export { useSlotRules } from "./composables/useSlotRules";
export { useDropRules } from "./composables/useDropRules";

// Drag & Drop
export { useDragState } from "./composables/useDragState";
export { useDropZones } from "./composables/useDropZones";
export { useTreeSorting } from "./composables/useTreeSorting";
export { useTreeDrag } from "./composables/useTreeDrag";

// Search & Filter
export { useTreeFilter } from "./composables/useTreeFilter";
export { useNodeIndexer } from "./composables/useNodeIndexer";

export type {
  LayerTreeNode,
  VirtualSlotName,

  // Drag & Drop
  DropPosition,
  DropIndicatorClass,
  DragSource,
  DragState,
  DropTarget,
  DragOperation,
  DragDropStats,

  ValidationSeverity,
  ValidationErrorCode,
  DropValidation,
  ValidationError,
  PropValidationResult,
  NodeTypeRequirements,
  ValidationStats,

  // Search & Filter
  MatchInfo,
  SearchResult,
  SearchFilters,
  SearchStats,
  TypeCount,

  CollapseState,
  TreeExpansionState,
  TreeSelectionState,
  TreeHoverState,
  TreeEditingState,

  DragDropOptions,
  NodeValidationOptions,
  SearchOptions,

  Result,
  SuccessResult,
  ErrorResult,
  ValidationResult,
  SearchResultWrapper,
  DropValidationResult,
} from "./types";

export {
  VIRTUAL_SLOT_NAMES,
  VALIDATION_ERROR_CODES,
  LEAF_NODE_TYPES,
  CONTAINER_NODE_TYPES,
} from "./types";

export {
  traverseNodes,
  findNodeById,
  findParentNode,
  getNodePath,
  getNodeDepth,
  isAncestor,
  isDescendant,
  getDescendantIds,
  collectAllNodeIds,

  isLeafNodeType,
  isContainerNodeType,
  canHaveChildren,
  hasChildren,
  isComponentInstance,
  getNodeLabel,

  countNodes,
  countNodesByType,
  getMaxDepth,

  cloneNodeTree,
  removeNodeById,
  updateNodeById,

  findDuplicateIds,
  validateNodeIds,
} from "./utils/nodeHelpers";
