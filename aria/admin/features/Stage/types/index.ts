/**
 * Stage Feature Type Definitions TypeScript types for Stage components -
 * iframe rendering, viewport controls, toolbar actions, and visual overlays.
 */

import { z } from "zod";

import type {
  BuilderNode,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { EditableItemType } from "../../Core/types/router";
import type { LayoutInspectorMetadata } from "../../Core/types/layout";

export const StageSelectionGestureSchema = z
  .object({
    metaKey: z.boolean(),
    ctrlKey: z.boolean(),
    shiftKey: z.boolean(),
  })
  .strict();

export const StageSelectBlockPayloadSchema = z
  .object({
    nodeId: z.string().trim().min(1).nullable(),
    triggerGesture: StageSelectionGestureSchema.optional(),
  })
  .strict();

export const StageSelectBlockInputSchema = z.union([
  z.string().trim().min(1),
  z.null(),
  StageSelectBlockPayloadSchema,
]);

export type StageSelectionGesture = z.infer<typeof StageSelectionGestureSchema>;
export type StageSelectBlockPayload = z.infer<
  typeof StageSelectBlockPayloadSchema
>;
export type StageSelectBlockInput = z.infer<typeof StageSelectBlockInputSchema>;

/**
 * Payload for node selection signal from iframe
 */
export interface NodeSelectedPayload {
  nodeId: string;
}

export interface DeleteBlockPayload {
  nodeId: string;
}

export interface AddBlockPayload {
  block: BuilderNode;
  parentId: string | null;
}

export interface ScrollToNodePayload {
  nodeId: string;
}

export interface HighlightNodePayload {
  nodeId: string | null;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  slug: string;
  category?: string;
}

export interface NodeInfo {
  node: BuilderNode;
  parentId: string | null;
  index: number;
}

export interface NodeLocationInfo {
  nodeId: string;
  parentId: string | null;
  index: number;
}

export interface ElementCandidate {
  element: Element;
  nodeType: string;
}

export interface LayoutSlot {
  name: string;
  label?: string;
  description?: string;
  isDefault?: boolean;
}

export interface CurrentLayout {
  name?: string;
  slots?: LayoutSlot[];
}

export type ViewportType = string;

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface ReorderOperation {
  sourceParentId: string | null;
  sourceIndex: number;
  targetParentId: string | null;
  targetIndex: number;
}

export type SpotType = "select" | "hover" | "target";

/**
 * Composer spot for rendering selection/hover indicators
 */
export interface ComposerSpot {
  type: SpotType;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeId?: string;
}

export interface StageCanvasExpose {
  stageIframeRef: HTMLIFrameElement | null;
}

export const StageChromeStateSchema = z.object({
  leftSidebarOpen: z.boolean(),
  rightSidebarOpen: z.boolean(),
});

export type StageChromeState = z.infer<typeof StageChromeStateSchema>;

export const StageEditingTabSchema = z.enum([
  "add-elements",
  "layers",
  "agent",
  // Retained so persisted composer URLs can be migrated to the agent workspace.
  "components",
  "settings",
]);

export type StageEditingTab = z.infer<typeof StageEditingTabSchema>;

export const StagePickerTargetSlotSchema = z.string();

export const StageDialogStateSchema = z.object({
  pickerOpen: z.boolean(),
  pickerTargetSlot: StagePickerTargetSlotSchema,
});

export type StageDialogState = z.infer<typeof StageDialogStateSchema>;

export interface CanvasControlBarProps {
  currentItemType: EditableItemType;
  currentItemSlug: string;
  currentPage: PageDSL | null;
  canSave: boolean;
  canPublish: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  isLoading: boolean;
}

export interface StageAppProps {
  hasEnteredEditing: boolean;
  show: boolean;
  isPreview: boolean;
  isItemTransitioning: boolean;
  page: PageDSL | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  isLoading: boolean;
  loadError: string | null;
  showOutlines: boolean;
  wireframeMode: boolean;
  currentLayout: LayoutDSL | null;
  stageKey: string;
  currentItemType: EditableItemType;
  currentItemSlug: string;
  currentLayoutSlug: string | undefined;
  headerComponent: string | undefined;
  footerComponent: string | undefined;
  expandedBlocks: BuilderNode[];
  pageSlug: string | null;
  showEmptyComponentState: boolean;
  layoutMetadata: LayoutInspectorMetadata | undefined;
  canvasControlBar: CanvasControlBarProps;
}

export interface StageAppListeners {
  undo: () => void;
  redo: () => void;
  "background-click": () => void;
  "update:show-outlines": (value: boolean) => void;
  "update:wireframe-mode": (value: boolean) => void;
  "stage-ready": () => void;
  "select-block": (selection: StageSelectBlockInput) => void;
  "add-block": (block: BuilderNode, parentId: string | null) => void;
  "delete-block": (nodeId: string) => void;
  "duplicate-block": (nodeId: string) => void;
  "detach-component": (nodeId: string) => Promise<void> | void;
  "replace-block-with-component": (
    nodeId: string,
    componentSlug: string,
  ) => Promise<void> | void;
  "edit-component": (componentId: string) => void;
  "reorder-block": (operation: ReorderOperation) => void;
  "open-picker": (slotName: string) => void;
  "edit-layout-region": (regionId: string) => void;
  "update-layout": (layoutSlug: string) => void;
  "update-layout-metadata": (
    metadata: LayoutInspectorMetadata,
  ) => Promise<void> | void;
  "add-first-element": () => void;
  save: () => void | Promise<void>;
  publish: () => void | Promise<void>;
  unpublish: () => void | Promise<void>;
}

export interface StageAppEmits {
  undo: [];
  redo: [];
  "background-click": [];
  "update:show-outlines": [value: boolean];
  "update:wireframe-mode": [value: boolean];
  "stage-ready": [];
  "select-block": [selection: StageSelectBlockInput];
  "add-block": [block: BuilderNode, parentId: string | null];
  "delete-block": [nodeId: string];
  "duplicate-block": [nodeId: string];
  "detach-component": [nodeId: string];
  "replace-block-with-component": [nodeId: string, componentSlug: string];
  "edit-component": [componentId: string];
  "reorder-block": [operation: ReorderOperation];
  "open-picker": [slotName: string];
  "edit-layout-region": [regionId: string];
  "add-first-element": [];
  save: [];
  publish: [];
  unpublish: [];
  "update-layout": [layoutSlug: string];
  "update-layout-metadata": [metadata: LayoutInspectorMetadata];
}
