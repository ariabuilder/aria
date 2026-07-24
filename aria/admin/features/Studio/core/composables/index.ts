export { useSlidingNavIndicator } from "./useSlidingNavIndicator";
export type {
  SlidingNavIndicatorState,
  UseSlidingNavIndicatorOptions,
} from "./useSlidingNavIndicator";
export { useDialogState } from "./useDialogState";
export {
  RouteQueryOpenFlagSchema,
  useRouteQueryDialog,
} from "./useRouteQueryDialog";
export type {
  RouteQueryDialogReturn,
  UseRouteQueryDialogConfig,
} from "./useRouteQueryDialog";
export { useSidebarState } from "./useSidebarState";
export { useStudioRouter } from "./useStudioRouter";
export {
  useTableSelection,
  createSelectColumn,
  getSelectedIds,
  useSelectedIds,
  clearRowSelection,
  resolveBulkTargets,
} from "./useTableSelection";
export { useInlineRename } from "./useInlineRename";
export type {
  InlineRenameOptions,
  InlineRenameReturn,
} from "./useInlineRename";
export {
  useComponentPolicies,
  type PolicyComponentItem,
  type ComponentBadge,
  type ComponentAction,
} from "./useComponentPolicies";
export { useComponentDragState } from "./useComponentDragState";
export { useBulkDelete } from "./useBulkDelete";
export type { BulkDeleteResult } from "./useBulkDelete";
export { usePersistentTableState } from "./usePersistentTableState";
export type {
  UsePersistentTableStateOptions,
  UsePersistentTableStateReturn,
} from "./usePersistentTableState";
export { createStudioGroupingEngine } from "./useStudioGroupingEngine";
export type {
  StudioGroupingGroup,
  StudioGroupingState,
  StudioGroupingHistoryExecutor,
  StudioGroupingHistoryOperation,
  StudioGroupingHistoryOptions,
  StudioGroupingCreateOptions,
  StudioGroupingRenameOptions,
  StudioGroupingDeleteOptions,
  StudioGroupingMoveOptions,
} from "./useStudioGroupingEngine";

export type { DialogState } from "./useDialogState";
export type { StudioRouterOptions } from "./useStudioRouter";
export type {
  StudioRouterReturn,
  StudioSection,
  StudioRouteMeta,
  StudioNavigationItem,
} from "@/features/Studio/types";
