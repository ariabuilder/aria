/**
 * Exports for the Blocks feature. Only exposes what other features need.
 */

export type {
  BlockCategoryType,
  BlockCategory,
  BlockElement,
  BlockLibraryItem,

  ComponentUsage,
  ComponentInstanceMap,
  ComponentInstance,
  ComponentGridItem,

  NodeToComponentOptions,
  ConversionSuccess,
  ConversionFailure,
  ConversionResult,
  InferredProp,

  ComponentDefinition,
  ComponentSlot,
  ComponentCacheEntry,

  // Drag & Drop Types
  ElementMeta,
  ElementData,
  DragState,

  DropValidationResult,
  BlockValidationRules,

  SyncStatus,
  SyncComponent,
  SyncAction,

  ComponentPickerItem,
  ComponentSelection,

  CreateBlockInput,
  UpdateBlockInput,
  BlockDeletionResult,

  BuilderNode,
  ComponentDSL,
} from "./types";

export { useBlockRegistry } from "./composables/useBlockRegistry";
export { useComponentActions } from "./composables/useComponentActions";
export {
  useComponentFetcher,
  commitComponentDefinition,
  invalidateComponentDefinition,
  componentDefinitionRevision,
} from "./composables/useComponentFetcher";
export { useBlockData } from "./composables/useBlockData";

export { default as BlockLibrary } from "./components/BlockLibrary.vue";

export { default as CreateComponentDialog } from "./dialogs/CreateComponentDialog.vue";
export { default as ComponentPickerDialog } from "./dialogs/ComponentPickerDialog.vue";
export { default as MigrationAlert } from "./dialogs/MigrationAlert.vue";
