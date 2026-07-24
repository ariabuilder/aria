/**
 * State management - Shared utilities - Type definitions.
 */

export * from "./utils";

export * from "./types/router";
export * from "./types/layout";
export * from "./types/shell";
export * from "./types/injectionKeys";

export { useAppRouter } from "./composables/useAppRouter";
export type { UseAppRouterReturn } from "./composables/useAppRouter";
export {
  useAppEditorRuntime,
  type UseAppEditorRuntimeDeps,
  type UseAppEditorRuntimeReturn,
} from "./composables/useAppEditorRuntime";
export {
  useAppRouterBootstrap,
  type UseAppRouterBootstrapReturn,
} from "./composables/useAppRouterBootstrap";
export { useSavePublish } from "./composables/useSavePublish";
export type {
  SavePublishDeps,
  SavePublishReturn,
} from "./composables/useSavePublish";
export { useComposerDraftPersistence } from "./composables/useComposerDraftPersistence";
export type {
  ComposerDraftPersistenceDeps,
  UseComposerDraftPersistenceReturn,
} from "./composables/useComposerDraftPersistence";
export { useEditorMutationHandlers } from "./composables/useEditorMutationHandlers";
export type {
  EditorMutationHandlersDeps,
  EditorMutationHandlersReturn,
} from "./composables/useEditorMutationHandlers";
export { useEditorMutationHistory } from "./composables/useEditorMutationHistory";
export { usePropertySave } from "./composables/usePropertySave";
export type { UsePropertySaveReturn } from "./composables/usePropertySave";
export {
  usePropertySaveHistory,
  PropertySaveMutationUpdatesSchema,
} from "./composables/usePropertySaveHistory";
export type { PropertySaveMutationUpdates } from "./composables/usePropertySaveHistory";
export { useAppInitialization } from "./composables/useAppInitialization";
export type { AppInitializationDeps } from "./composables/useAppInitialization";
export {
  useCanvasSignalBridge,
  CanvasPropsUpdateSchema,
  CanvasStyleUpdateSchema,
  CanvasClassUpdateSchema,
  CanvasSpacingPreviewSchema,
  ComponentWrapperResponseSchema,
} from "./composables/useCanvasSignalBridge";
export type {
  CanvasPropsUpdate,
  CanvasStyleUpdate,
  CanvasClassUpdate,
  CanvasSpacingPreview,
  ComponentWrapperResponse,
} from "./composables/useCanvasSignalBridge";
export {
  useCanvasInteractionBridge,
  CanvasNodeTargetSchema,
  CanvasNodeLookupSchema,
} from "./composables/useCanvasInteractionBridge";
export type {
  CanvasNodeTarget,
  CanvasNodeLookup,
} from "./composables/useCanvasInteractionBridge";
export {
  useStageSignalBridge,
  StageNodeSelectedSignalPayloadSchema,
  StageDeleteBlockSignalPayloadSchema,
  StageAddBlockSignalPayloadSchema,
  StageConvertComponentSignalPayloadSchema,
  StageUnoConfigChangedSignalPayloadSchema,
} from "./composables/useStageSignalBridge";
export type {
  StageNodeSelectedSignalPayload,
  StageDeleteBlockSignalPayload,
  StageAddBlockSignalPayload,
  StageConvertComponentSignalPayload,
  StageUnoConfigChangedSignalPayload,
} from "./composables/useStageSignalBridge";
export {
  useShellSignalBridge,
  AgentCanvasBuildSignalPayloadSchema,
} from "./composables/useShellSignalBridge";
export type {
  DropComponentSignalPayload,
  ReorderNodeSignalPayload,
  AgentCanvasBuildSignalPayload,
} from "./composables/useShellSignalBridge";
export { useUnoConfig } from "./composables/useUnoConfig";
export type {
  UseUnoConfigReturn,
  UnoRuntimeConfig,
  UnoRuntimeTheme,
} from "./composables/useUnoConfig";
export { useViewTransitions } from "./composables/useViewTransitions";
export type { ViewTransitionOptions } from "./composables/useViewTransitions";
export { useAppAsyncViews } from "./composables/useAppAsyncViews";
export {
  useInjectedPageBlocks,
  useInjectedStageIframeRef,
  useInjectedPrefetchPageData,
  useInjectedPrewarmBuilder,
} from "./composables/useAppInjectedRuntime";
export { useAppBootstrap } from "./composables/useAppBootstrap";
export type {
  UseAppBootstrapDeps,
  UseAppBootstrapReturn,
} from "./composables/useAppBootstrap";
export { useAppSessionState } from "./composables/useAppSessionState";
export type { UseAppSessionStateDeps } from "./composables/useAppSessionState";
export { useAppProvides } from "./composables/useAppProvides";
export type { UseAppProvidesOptions } from "./composables/useAppProvides";
export {
  useActiveLayoutSlot,
  ACTIVE_LAYOUT_SLOT_KEY,
} from "./composables/useActiveLayoutSlot";
export type { UseActiveLayoutSlotReturn } from "./composables/useActiveLayoutSlot";
export {
  syncLayoutSlotOnNodeSelect,
  type SyncLayoutSlotOnNodeSelectOptions,
  type SyncLayoutSlotOnNodeSelectResult,
} from "./lib/syncLayoutSlotOnNodeSelect";
export { useEditorNodeRegistry } from "./composables/useEditorNodeRegistry";
export type {
  EditorNodeStore,
  LocatedEditorNode,
} from "./composables/useEditorNodeRegistry";
export {
  STAGE_IDLE_KEY,
  StageKeySchema,
  ShellTransitionDirectionSchema,
  ShellTransitionTargetSchema,
  MarkStageReadyInputSchema,
  BeginShellTransitionInputSchema,
  ShellTransitionGateSnapshotSchema,
  buildStageKeyFromTarget,
  parseStageKeyToTarget,
  editingModeMatchesStageKey,
} from "./schemas/shellTransition";
export type {
  StageKey,
  ShellTransitionDirection,
  ShellTransitionTarget,
  MarkStageReadyInput,
  BeginShellTransitionInput,
  ShellTransitionGateSnapshot,
} from "./schemas/shellTransition";
export {
  useShellModeTransition,
  evaluateEnterComposerComplete,
  evaluateExitStudioComplete,
  tryCompleteTransition,
  SHELL_TRANSITION_MIN_DISPLAY_MS,
  SHELL_TRANSITION_HARD_TIMEOUT_MS,
} from "./composables/useShellModeTransition";
export type {
  UseShellModeTransitionReturn,
  ShellTransitionGateDeps,
} from "./composables/useShellModeTransition";
export { useShellModeTransitionOrchestration } from "./composables/useShellModeTransitionOrchestration";
export type {
  UseShellModeTransitionOrchestrationDeps,
  UseShellModeTransitionOrchestrationReturn,
} from "./composables/useShellModeTransitionOrchestration";
export { useEditorContext } from "./composables/useEditorContext";
export type {
  UseEditorContextReturn,
  EditorAppState,
  LoadingState,
} from "./composables/useEditorContext";
export { useSelectionTreeState } from "./composables/useSelectionTreeState";
export { useSelectionTreeSync } from "./composables/useSelectionTreeSync";
export type { UseSelectionTreeSyncOptions } from "./composables/useSelectionTreeSync";
export { useSelectedNodeState } from "./composables/useSelectedNodeState";
