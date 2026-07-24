/**
 * Exports for all Vue composables used in the Aria admin interface. Categories:
 * - Core: History, Selection - UI: Messaging, Theme, Viewport - Advanced: Keyboard.
 */

export { useHistory } from "../features/History"; // Re-export from domain feature
export { useSelection } from "../features/Composer";

export { useComposer } from "./useComposer";
export { useSignals } from "./useSignals";
export { useViewport } from "./useViewport";

export { useKeyboardShortcuts } from "../features/Composer/composables/useKeyboardShortcuts";
export { useNodeDragDrop } from "../features/Stage/dragdrop/useNodeDragDrop";
export { useFocusManagement } from "./useFocusManagement";
export { useNodeValidation } from "./useNodeValidation";

export {
  Z_INDEX,
  CANVAS_OVERLAY_Z_INDEX,
  IFRAME_Z_INDEX,
  OVERLAY_Z_INDEX,
} from "@/lib/zIndex";

export {
  useCanvasOverlays,
  onSelectionChange,
  onHoverChange,
  getSelectionSnapshot,
  getHoverSnapshot,
  ICON_MAP,
  TOOLBAR_ICONS,
  createSvgIcon,
} from "./useCanvasOverlays";

export { useItemActions } from "./useItemActions";
export { useInsertionContext } from "./useInsertionContext";

export type { Operation } from "../features/History";
export type { ComposerSpot } from "./useComposer";
export type {
  OverlayPosition,
  HoverState,
  SelectionState,
  InsertionState,
  DropZoneState,
  ToolbarActionName,
  UseCanvasOverlaysOptions,
  UseCanvasOverlaysReturn,
} from "./useCanvasOverlays";
