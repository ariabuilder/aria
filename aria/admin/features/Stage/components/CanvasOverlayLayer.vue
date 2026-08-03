<script setup lang="ts">
/**
 * CanvasOverlayLayer. vue Parent-level overlay component that renders
 * all visual overlays for the canvas.
 */

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  toRef,
  watch,
  type CSSProperties,
} from "vue";
import { Button } from "@/components/ui/button";
import { ColorField } from "@/components/ui/color-picker";
import { useToolbarTextColorContext } from "../composables/useToolbarTextColorContext";
import {
  useCanvasOverlays,
  TOOLBAR_ICONS,
  type CanvasAffordanceDescriptor,
  type ToolbarActionName,
} from "../../../composables/useCanvasOverlays";
import { OVERLAY_Z_INDEX } from "@/lib/zIndex";
import { getContentHeadingLevel } from "../../Inspector/composables/useContentContract";
import { useSelectedNodeState } from "../../Core/composables/useSelectedNodeState";
import { usePropertySave } from "../../Core";
import { useCanvasSignalBridge } from "../../Core/composables/useCanvasSignalBridge";
import { useDragDrop } from "../../../composables/useDragDrop";
import { useInspectorStyleTargetWithGlobalDefaults } from "../../Inspector/composables/useInspectorStyleTargetWithGlobalDefaults";
import { useInspectorState } from "../../Inspector/composables/useInspectorState";
import ToolbarHeadingLevelPicker from "./ToolbarHeadingLevelPicker.vue";
import SelectionToolbarCmsControls from "./SelectionToolbarCmsControls.vue";
import SelectionToolbarMotionControl from "./SelectionToolbarMotionControl.vue";
import { useStudioI18n } from "@/i18n";
import { resolveCanvasAffordanceVisualLayout } from "../utils/canvasAffordanceLayout";
import { shouldHideSelectionToolbar } from "../utils/selectionToolbarVisibility";
import {
  CANVAS_SELECTION_RESIZE_HANDLES,
  canvasSelectionResizeAxes,
  canvasSelectionResizeCursor,
  formatCanvasSelectionSize,
  getCanvasSelectionScale,
  measureCanvasSelectionElement,
  resizeCanvasSelection,
  type CanvasSelectionResizeHandle,
  type CanvasSelectionSize,
} from "../utils/canvasSelectionResize";

// PROPS & EMITS

const props = withDefaults(
  defineProps<{
    iframeRef?: HTMLIFrameElement | null;
    currentItemType?: "page" | "layout" | "component";
    currentItemSlug?: string;
    showSelectionSizing?: boolean;
    showSelectionToolbar?: boolean;
  }>(),
  {
    showSelectionSizing: true,
    showSelectionToolbar: true,
  },
);

const emit = defineEmits<{
  (e: "toolbar-action", action: ToolbarActionName, nodeId: string): void;
  (
    e: "toolbar-style-change",
    property: string,
    value: string,
    nodeId: string,
  ): void;
  (
    e: "toolbar-props-change",
    updates: Record<string, unknown>,
    nodeId: string,
  ): void;
  (e: "select-affordance", descriptor: CanvasAffordanceDescriptor): void;
  (e: "ready"): void;
}>();
const { t } = useStudioI18n();

const { selectedNode, isMultiSelect } = useSelectedNodeState();
const propertySave = usePropertySave();
const { styleTarget: resizeStyleTarget } =
  useInspectorStyleTargetWithGlobalDefaults({ propertySave });
const inspectorState = useInspectorState();
const { signalStyleUpdate } = useCanvasSignalBridge();
const { isDragging, dragSource } = useDragDrop();

const hideToolbarDuringLibraryDrag = computed(() =>
  shouldHideSelectionToolbar(isDragging.value, dragSource.value),
);

const TEXT_NODE_TYPES = new Set([
  "heading",
  "text",
  "paragraph",
  "span",
  "richtext",
  "rich-text",
]);

const iframeRefProp = toRef(props, "iframeRef");
const overlays = useCanvasOverlays({
  iframeRef: computed(() => iframeRefProp.value ?? null),
  debug: import.meta.env.DEV,
});

const RESIZE_STYLE_PROPERTIES = [
  "width",
  "height",
  "widthSizing",
  "heightSizing",
] as const;
const RESIZE_KEYBOARD_COMMIT_DELAY_MS = 320;
const SELECTION_SIZE_BADGE_HEIGHT = 20;
const SELECTION_SIZE_BADGE_GAP = 7;

type ResizePreviewSnapshot = ReturnType<
  typeof resizeStyleTarget.captureAuthoredStylePreviewSnapshot
>;

interface ResizeSession {
  kind: "keyboard" | "pointer";
  handle: CanvasSelectionResizeHandle;
  hasChanged: boolean;
  nodeId: string;
  startSize: CanvasSelectionSize;
  currentSize: CanvasSelectionSize;
  snapshot: ResizePreviewSnapshot;
  pointerId?: number;
  startClientX?: number;
  startClientY?: number;
  scaleX?: number;
  scaleY?: number;
  captureTarget?: HTMLButtonElement;
}

const resizePreviewSize = ref<CanvasSelectionSize | null>(null);
const isResizingSelection = ref(false);
const resizeAnnouncement = ref("");
let resizeSession: ResizeSession | null = null;
let resizePreviewFrame: number | null = null;
let pendingResizePreview: {
  size: CanvasSelectionSize;
  handle: CanvasSelectionResizeHandle;
} | null = null;
let keyboardCommitTimeout: number | null = null;

const measuredSelectionSize = computed(() => {
  // Position changes whenever the selected element is remeasured. Reading it
  // here keeps the badge synchronized with ResizeObserver-driven updates.
  void overlays.selection.position;
  return measureCanvasSelectionElement(overlays.selection.element);
});

const displayedSelectionSize = computed(
  () => resizePreviewSize.value ?? measuredSelectionSize.value,
);

const selectionFrameStyle = computed((): CSSProperties => {
  const position = overlays.selection.position;
  if (!overlays.selection.visible || !position) {
    return { display: "none" };
  }

  return {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${position.left}px ${position.top}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    zIndex: OVERLAY_Z_INDEX.selection,
  };
});

const selectionSizeLabel = computed(() =>
  displayedSelectionSize.value
    ? formatCanvasSelectionSize(displayedSelectionSize.value)
    : "",
);

const showSelectionSizeBadge = computed(
  () => props.showSelectionSizing && Boolean(selectionSizeLabel.value),
);

const selectionSizeBadgeStyle = computed((): CSSProperties => {
  const position = overlays.selection.position;
  if (!position || !displayedSelectionSize.value) {
    return { display: "none" };
  }

  const placeInside =
    position.top +
      position.height +
      SELECTION_SIZE_BADGE_GAP +
      SELECTION_SIZE_BADGE_HEIGHT >
    window.innerHeight;

  return placeInside
    ? {
        left: "50%",
        top: `${position.height - SELECTION_SIZE_BADGE_GAP}px`,
        transform: "translate(-50%, -100%)",
      }
    : {
        left: "50%",
        top: `${position.height + SELECTION_SIZE_BADGE_GAP}px`,
        transform: "translateX(-50%)",
      };
});

const canResizeSelection = computed(() => {
  const node = selectedNode.value;
  return Boolean(
    overlays.selection.visible &&
    overlays.selection.nodeId &&
    overlays.selection.position &&
    overlays.selection.element &&
    node &&
    node.id === overlays.selection.nodeId &&
    !isMultiSelect.value &&
    !inspectorState.isLocked.value &&
    !inspectorState.isReadonly.value &&
    inspectorState.selectedPseudo.value === "default" &&
    !node.metadata?.locked &&
    props.currentItemType &&
    props.currentItemSlug &&
    !isDragging.value &&
    !resizeStyleTarget.isLoading.value,
  );
});

function getResizeHandleClass(handle: CanvasSelectionResizeHandle): string {
  switch (handle) {
    case "north-west":
      return "left-0 top-0 -translate-x-1/2 -translate-y-1/2";
    case "north":
      return "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2";
    case "north-east":
      return "right-0 top-0 translate-x-1/2 -translate-y-1/2";
    case "east":
      return "right-0 top-1/2 translate-x-1/2 -translate-y-1/2";
    case "south-east":
      return "bottom-0 right-0 translate-x-1/2 translate-y-1/2";
    case "south":
      return "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2";
    case "south-west":
      return "bottom-0 left-0 -translate-x-1/2 translate-y-1/2";
    case "west":
      return "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2";
  }
}

const RESIZE_HANDLE_DIRECTION_KEYS = {
  "north-west": "composer.canvas.resize.northWest",
  north: "composer.canvas.resize.north",
  "north-east": "composer.canvas.resize.northEast",
  east: "composer.canvas.resize.east",
  "south-east": "composer.canvas.resize.southEast",
  south: "composer.canvas.resize.south",
  "south-west": "composer.canvas.resize.southWest",
  west: "composer.canvas.resize.west",
} as const satisfies Record<
  CanvasSelectionResizeHandle,
  Parameters<typeof t>[0]
>;

function getResizeHandleLabel(handle: CanvasSelectionResizeHandle): string {
  return t("composer.canvas.resizeHandle", {
    direction: t(RESIZE_HANDLE_DIRECTION_KEYS[handle]),
  });
}

function isCornerResizeHandle(handle: CanvasSelectionResizeHandle): boolean {
  return handle.includes("-");
}

function getResizeHandleIndicatorClass(
  handle: CanvasSelectionResizeHandle,
): string {
  if (isCornerResizeHandle(handle)) {
    return "size-2 border border-solid border-primary bg-white";
  }

  return handle === "north" || handle === "south"
    ? "h-0.5 w-3 bg-primary"
    : "h-3 w-0.5 bg-primary";
}

function buildResizeStyleUpdates(
  size: CanvasSelectionSize,
  handle: CanvasSelectionResizeHandle,
): Record<string, string> {
  const axes = canvasSelectionResizeAxes(handle);
  const updates: Record<string, string> = {};

  if (axes.width) {
    updates.width = `${Math.max(1, Math.round(size.width))}px`;
    updates.widthSizing = "exact";
  }
  if (axes.height) {
    updates.height = `${Math.max(1, Math.round(size.height))}px`;
    updates.heightSizing = "exact";
  }

  return updates;
}

function flushResizePreview(): void {
  if (resizePreviewFrame !== null) {
    window.cancelAnimationFrame(resizePreviewFrame);
    resizePreviewFrame = null;
  }
  if (!pendingResizePreview) return;

  const { size, handle } = pendingResizePreview;
  pendingResizePreview = null;
  propertySave.previewStyleProperties(
    buildResizeStyleUpdates(size, handle),
    resizeSession?.nodeId,
  );
  overlays.schedulePositionUpdate("measure");
}

function queueResizePreview(
  size: CanvasSelectionSize,
  handle: CanvasSelectionResizeHandle,
): void {
  resizePreviewSize.value = size;
  pendingResizePreview = { size, handle };
  if (resizePreviewFrame !== null) return;

  resizePreviewFrame = window.requestAnimationFrame(() => {
    resizePreviewFrame = null;
    flushResizePreview();
  });
}

function clearKeyboardCommitTimeout(): void {
  if (keyboardCommitTimeout === null) return;
  window.clearTimeout(keyboardCommitTimeout);
  keyboardCommitTimeout = null;
}

function clearResizeInteractionState(): void {
  const activeSession = resizeSession;
  resizeSession = null;
  clearKeyboardCommitTimeout();
  if (resizePreviewFrame !== null) {
    window.cancelAnimationFrame(resizePreviewFrame);
    resizePreviewFrame = null;
  }
  pendingResizePreview = null;
  resizePreviewSize.value = null;
  isResizingSelection.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", handleResizePointerMove);
  window.removeEventListener("pointerup", handleResizePointerUp);
  window.removeEventListener("pointercancel", handleResizePointerCancel);
  window.removeEventListener("keydown", handleResizeWindowKeydown);

  const captureTarget = activeSession?.captureTarget;
  const pointerId = activeSession?.pointerId;
  if (captureTarget && pointerId !== undefined) {
    captureTarget.removeEventListener(
      "lostpointercapture",
      handleResizeLostPointerCapture,
    );
    if (captureTarget.hasPointerCapture?.(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
  }
}

function restoreResizeSnapshot(session: ResizeSession): void {
  resizeStyleTarget.restoreAuthoredStylePreviewSnapshot(
    RESIZE_STYLE_PROPERTIES,
    session.snapshot,
  );
  overlays.schedulePositionUpdate("measure");
}

function cancelResizeSession(): void {
  const session = resizeSession;
  if (!session) return;
  flushResizePreview();
  restoreResizeSnapshot(session);
  clearResizeInteractionState();
}

async function commitResizeSession(): Promise<void> {
  const session = resizeSession;
  if (!session) return;
  if (!session.hasChanged) {
    clearResizeInteractionState();
    return;
  }

  flushResizePreview();
  const finalSize = session.currentSize;
  const updates = buildResizeStyleUpdates(finalSize, session.handle);
  clearResizeInteractionState();

  const saved = await resizeStyleTarget.saveStyleProperties(
    updates,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (!saved) {
    restoreResizeSnapshot(session);
    return;
  }

  resizeAnnouncement.value = "";
  await nextTick();
  resizeAnnouncement.value = t("composer.canvas.resizeComplete", {
    size: formatCanvasSelectionSize(finalSize),
  });
  overlays.schedulePositionUpdate("measure");
}

function startResizeSession(
  kind: ResizeSession["kind"],
  handle: CanvasSelectionResizeHandle,
): ResizeSession | null {
  if (!canResizeSelection.value) return null;
  const nodeId = overlays.selection.nodeId;
  const startSize = measureCanvasSelectionElement(overlays.selection.element);
  if (!nodeId || !startSize) return null;

  if (resizeSession) {
    cancelResizeSession();
  }

  const session: ResizeSession = {
    kind,
    handle,
    hasChanged: false,
    nodeId,
    startSize,
    currentSize: startSize,
    snapshot: resizeStyleTarget.captureAuthoredStylePreviewSnapshot(
      RESIZE_STYLE_PROPERTIES,
    ),
  };
  resizeSession = session;
  resizePreviewSize.value = startSize;
  isResizingSelection.value = true;
  return session;
}

function handleResizePointerDown(
  handle: CanvasSelectionResizeHandle,
  event: PointerEvent,
): void {
  if (event.button !== 0) return;
  const session = startResizeSession("pointer", handle);
  if (!session) return;

  event.preventDefault();
  event.stopPropagation();
  const scale = getCanvasSelectionScale(props.iframeRef);
  session.pointerId = event.pointerId;
  session.startClientX = event.clientX;
  session.startClientY = event.clientY;
  session.scaleX = scale.x;
  session.scaleY = scale.y;

  const captureTarget = event.currentTarget;
  if (captureTarget instanceof HTMLButtonElement) {
    session.captureTarget = captureTarget;
    captureTarget.addEventListener(
      "lostpointercapture",
      handleResizeLostPointerCapture,
    );
    captureTarget.setPointerCapture(event.pointerId);
  }

  document.body.style.cursor = canvasSelectionResizeCursor(handle);
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", handleResizePointerMove);
  window.addEventListener("pointerup", handleResizePointerUp);
  window.addEventListener("pointercancel", handleResizePointerCancel);
  window.addEventListener("keydown", handleResizeWindowKeydown);
}

function handleResizeLostPointerCapture(event: PointerEvent): void {
  const session = resizeSession;
  if (
    !session ||
    session.kind !== "pointer" ||
    session.pointerId !== event.pointerId
  ) {
    return;
  }

  cancelResizeSession();
}

function handleResizePointerMove(event: PointerEvent): void {
  const session = resizeSession;
  if (
    !session ||
    session.kind !== "pointer" ||
    session.pointerId !== event.pointerId
  ) {
    return;
  }

  event.preventDefault();
  const nextSize = resizeCanvasSelection({
    handle: session.handle,
    startSize: session.startSize,
    deltaX:
      (event.clientX - (session.startClientX ?? event.clientX)) /
      (session.scaleX ?? 1),
    deltaY:
      (event.clientY - (session.startClientY ?? event.clientY)) /
      (session.scaleY ?? 1),
  });
  const movementX = Math.abs(
    event.clientX - (session.startClientX ?? event.clientX),
  );
  const movementY = Math.abs(
    event.clientY - (session.startClientY ?? event.clientY),
  );
  if (!session.hasChanged && movementX < 2 && movementY < 2) {
    return;
  }
  session.hasChanged = true;
  session.currentSize = nextSize;
  queueResizePreview(nextSize, session.handle);
}

function handleResizePointerUp(event: PointerEvent): void {
  if (
    !resizeSession ||
    resizeSession.kind !== "pointer" ||
    resizeSession.pointerId !== event.pointerId
  ) {
    return;
  }
  event.preventDefault();
  if (!resizeSession.hasChanged) {
    clearResizeInteractionState();
    return;
  }
  void commitResizeSession();
}

function handleResizePointerCancel(event: PointerEvent): void {
  if (
    !resizeSession ||
    resizeSession.kind !== "pointer" ||
    resizeSession.pointerId !== event.pointerId
  ) {
    return;
  }
  cancelResizeSession();
}

function handleResizeWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || resizeSession?.kind !== "pointer") return;
  event.preventDefault();
  cancelResizeSession();
}

function handleResizeHandleKeydown(
  handle: CanvasSelectionResizeHandle,
  event: KeyboardEvent,
): void {
  if (event.key === "Escape" && resizeSession?.kind === "keyboard") {
    event.preventDefault();
    cancelResizeSession();
    return;
  }

  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  ) {
    return;
  }

  const axes = canvasSelectionResizeAxes(handle);
  const isHorizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  if ((isHorizontal && !axes.width) || (!isHorizontal && !axes.height)) {
    return;
  }

  event.preventDefault();
  let session = resizeSession;
  if (!session || session.kind !== "keyboard" || session.handle !== handle) {
    session = startResizeSession("keyboard", handle);
  }
  if (!session) return;

  const step = event.shiftKey ? 10 : 1;
  const nextSize = {
    width: Math.max(
      1,
      session.currentSize.width +
        (event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0),
    ),
    height: Math.max(
      1,
      session.currentSize.height +
        (event.key === "ArrowDown"
          ? step
          : event.key === "ArrowUp"
            ? -step
            : 0),
    ),
  };
  session.hasChanged = true;
  session.currentSize = nextSize;
  queueResizePreview(nextSize, handle);

  clearKeyboardCommitTimeout();
  keyboardCommitTimeout = window.setTimeout(() => {
    keyboardCommitTimeout = null;
    void commitResizeSession();
  }, RESIZE_KEYBOARD_COMMIT_DELAY_MS);
}

function handleResizeHandleBlur(): void {
  if (resizeSession?.kind !== "keyboard") return;
  void commitResizeSession();
}

watch(
  () => overlays.selection.nodeId,
  (nodeId, previousNodeId) => {
    if (previousNodeId && nodeId !== previousNodeId && resizeSession) {
      cancelResizeSession();
    }
  },
);

onBeforeUnmount(() => {
  if (resizeSession) {
    cancelResizeSession();
  } else {
    clearResizeInteractionState();
  }
});

const isTextNode = computed(() => {
  const t = overlays.selection.nodeType?.toLowerCase();
  return Boolean(t && TEXT_NODE_TYPES.has(t));
});

const isHeadingNode = computed(() => {
  return overlays.selection.nodeType?.toLowerCase() === "heading";
});

const headingLevel = computed(() => getContentHeadingLevel(selectedNode.value));

const toolbarTextColor = computed(() => {
  if (!isTextNode.value) return "";

  const colorStyle = selectedNode.value?.styles?.color;
  if (colorStyle) {
    const explicit = (colorStyle as Record<string, string>).base ?? "";
    if (explicit) return explicit;
  }

  const el = overlays.selection.element as HTMLElement | null;
  if (el) {
    const view = (el.ownerDocument as Document).defaultView;
    if (view) {
      return view.getComputedStyle(el).color || "";
    }
  }

  return "";
});

const { toolbarContrastBackground, resolvedToolbarContrastBackground } =
  useToolbarTextColorContext({
    selectedNode,
    iframeElement: computed(
      () => overlays.selection.element as HTMLElement | null,
    ),
  });

function handleColorChange(value: string): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId) return;
  signalStyleUpdate({
    nodeId,
    styles: { base: { color: value } },
  });
  emit("toolbar-style-change", "color", value, nodeId);
}

function handleHeadingLevelChange(level: number): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId || !Number.isInteger(level) || level < 1 || level > 6) return;
  if (headingLevel.value === level) return;

  emit("toolbar-props-change", { level }, nodeId);
}

const TOOLBAR_PADDING = 2;
const TOOLBAR_OFFSET = 12;
const MIN_TOP_SPACE = 60;

const placeToolbarAbove = computed(() => {
  const position = overlays.selection.position;
  if (!position) return false;
  return position.top - TOOLBAR_PADDING - MIN_TOP_SPACE >= 32;
});

const toolbarStyle = computed((): CSSProperties => {
  if (
    !overlays.selection.visible ||
    !overlays.selection.position ||
    hideToolbarDuringLibraryDrag.value ||
    isResizingSelection.value
  ) {
    return { display: "none" };
  }

  const { left, top, width, height } = overlays.selection.position;
  const centerX = left + width / 2;
  const clampedCenterX = Math.max(
    TOOLBAR_PADDING,
    Math.min(centerX, window.innerWidth - TOOLBAR_PADDING),
  );

  if (placeToolbarAbove.value) {
    return {
      display: "flex",
      left: `${clampedCenterX}px`,
      top: `${top - TOOLBAR_OFFSET}px`,
      transform: "translate(-50%, -100%)",
      zIndex: OVERLAY_Z_INDEX.toolbar,
    };
  }

  return {
    display: "flex",
    left: `${clampedCenterX}px`,
    top: `${
      top +
      height +
      TOOLBAR_OFFSET +
      (showSelectionSizeBadge.value
        ? SELECTION_SIZE_BADGE_GAP + SELECTION_SIZE_BADGE_HEIGHT
        : 0)
    }px`,
    transform: "translate(-50%, 0)",
    zIndex: OVERLAY_Z_INDEX.toolbar,
  };
});

onMounted(() => {
  emit("ready");
});

defineExpose({
  showHover: overlays.showHover,
  hideHover: overlays.hideHover,
  showSelection: overlays.showSelection,
  hideSelection: overlays.hideSelection,
  updateSelectionPosition: overlays.updateSelectionPosition,
  showInsertion: overlays.showInsertion,
  showFrameInsertion: overlays.showFrameInsertion,
  hideInsertion: overlays.hideInsertion,
  showAddElementsDropFeedback: overlays.showAddElementsDropFeedback,
  hideAddElementsDropFeedback: overlays.hideAddElementsDropFeedback,
  showFrameAffordances: overlays.showFrameAffordances,
  hideAffordances: overlays.hideAffordances,
  showDropZones: overlays.showDropZones,
  activateDropZone: overlays.activateDropZone,
  hideDropZones: overlays.hideDropZones,
  schedulePositionUpdate: overlays.schedulePositionUpdate,
  hover: overlays.hover,
  selection: overlays.selection,
});

function handleToolbarAction(action: ToolbarActionName): void {
  const nodeId = overlays.selection.nodeId;
  if (!nodeId) return;

  emit("toolbar-action", action, nodeId);
}

const insertionStyle = computed(() => {
  if (!overlays.insertion.visible || !overlays.insertion.position) {
    return { display: "none" };
  }
  const { left, top, width, height } = overlays.insertion.position;

  const style: CSSProperties = {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${left}px ${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    zIndex: OVERLAY_Z_INDEX.insertion,
  };
  return style;
});

const addElementsInsertionStyle = computed((): CSSProperties => {
  const position = overlays.addElementsDrop.placeholder;
  if (!overlays.addElementsDrop.visible || !position) {
    return { display: "none" };
  }

  return {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${position.left}px ${position.top}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    zIndex: OVERLAY_Z_INDEX.insertion,
  };
});

const addElementsTargetStyle = computed((): CSSProperties => {
  const position = overlays.addElementsDrop.target;
  if (!overlays.addElementsDrop.visible || !position) {
    return { display: "none" };
  }

  return {
    display: "block",
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${position.left}px ${position.top}px`,
    width: `${position.width}px`,
    height: `${position.height}px`,
    zIndex: OVERLAY_Z_INDEX.dropZone,
  };
});

function getAffordanceStyle(
  descriptor: CanvasAffordanceDescriptor,
): CSSProperties {
  const layout = resolveCanvasAffordanceVisualLayout(descriptor);
  return {
    position: "fixed",
    left: "0",
    top: "0",
    translate: `${layout.left}px ${layout.top}px`,
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    zIndex: OVERLAY_Z_INDEX.dropZone + Math.min(descriptor.depth, 20),
  };
}

function isCollapsedAffordance(
  descriptor: CanvasAffordanceDescriptor,
): boolean {
  return descriptor.presentation === "collapsed-rail";
}

function getAffordanceLabel(descriptor: CanvasAffordanceDescriptor): string {
  switch (descriptor.kind) {
    case "empty-node":
      return `Empty ${descriptor.nodeType}`;
    case "empty-component":
      return `Empty ${descriptor.nodeType} component`;
    case "missing-media":
      return `Missing ${descriptor.nodeType}`;
    default: {
      const exhaustive: never = descriptor;
      return exhaustive;
    }
  }
}

interface ToolbarButton {
  action: ToolbarActionName;
  title: string;
  iconPath: string;
  isDanger?: boolean;
  show: boolean;
}

const toolbarButtons = computed((): ToolbarButton[] => {
  const { isComponent } = overlays.selection;

  const buttons: ToolbarButton[] = [];

  if (isComponent) {
    buttons.push(
      {
        action: "edit-component",
        title: t("composer.toolbar.editComponent"),
        iconPath: TOOLBAR_ICONS["edit-component"],
        show: true,
      },
      {
        action: "detach-component",
        title: t("composer.toolbar.detachInstance"),
        iconPath: TOOLBAR_ICONS["detach-component"],
        show: true,
      },
    );
  } else {
    buttons.push({
      action: "create-component",
      title: t("composer.toolbar.createComponent"),
      iconPath: TOOLBAR_ICONS["create-component"],
      show: true,
    });
  }

  buttons.push(
    {
      action: "duplicate",
      title: t("common.duplicate"),
      iconPath: TOOLBAR_ICONS.duplicate,
      show: true,
    },
    {
      action: "delete",
      title: t("common.delete"),
      iconPath: TOOLBAR_ICONS.delete,
      isDanger: true,
      show: true,
    },
  );

  return buttons.filter((b) => b.show);
});

const showSelectParent = computed(() => overlays.selection.hasParent);

const isImageNode = computed(() => {
  const t = overlays.selection.nodeType?.toLowerCase();
  return t === "image";
});

const showNodeTypeControls = computed(
  () => isTextNode.value || isHeadingNode.value || isImageNode.value,
);

function formatNodeTypeLabel(type: string | null | undefined): string {
  const value = String(type ?? "").trim();
  if (!value) {
    return t("composer.toolbar.element");
  }
  if (value.toLowerCase() === "svg") {
    return "SVG";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const nodeTypeLabel = computed(() => {
  return formatNodeTypeLabel(overlays.selection.nodeType);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-0 overflow-visible"
      :style="{ zIndex: OVERLAY_Z_INDEX.hover }"
      data-aria-canvas-overlay-root="true"
    >
      <div
        v-if="overlays.selection.visible"
        class="pointer-events-none fixed box-border border border-solid border-primary/85"
        :style="selectionFrameStyle"
        data-overlay="selection-frame"
        :data-node-id="overlays.selection.nodeId"
      >
        <template v-if="canResizeSelection">
          <button
            v-for="handle in CANVAS_SELECTION_RESIZE_HANDLES"
            :key="handle"
            type="button"
            class="pointer-events-auto absolute flex size-6 touch-none select-none items-center justify-center border-0 bg-transparent p-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            :class="getResizeHandleClass(handle)"
            :style="{ cursor: canvasSelectionResizeCursor(handle) }"
            :aria-label="getResizeHandleLabel(handle)"
            :tabindex="handle === 'south-east' ? 0 : -1"
            :data-resize-handle="handle"
            @pointerdown="handleResizePointerDown(handle, $event)"
            @dragstart.prevent
            @keydown="handleResizeHandleKeydown(handle, $event)"
            @blur="handleResizeHandleBlur"
          >
            <span
              class="block"
              :class="getResizeHandleIndicatorClass(handle)"
              aria-hidden="true"
            />
          </button>
        </template>

        <span
          v-if="showSelectionSizeBadge"
          class="pointer-events-none absolute z-1 whitespace-nowrap rounded-sm bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground shadow-sm"
          :style="selectionSizeBadgeStyle"
          aria-hidden="true"
          data-overlay="selection-size"
        >
          {{ selectionSizeLabel }}
        </span>
      </div>

      <span class="sr-only" role="status" aria-live="polite">
        {{ resizeAnnouncement }}
      </span>

      <div
        v-if="overlays.selection.visible && props.showSelectionToolbar"
        class="selection-toolbar fixed pointer-events-auto flex h-8.5 max-w-[calc(100vw-16px)] select-none items-center whitespace-nowrap rounded-sm border-solid border-border bg-sidebar px-0 pb-0.3 text-xs text-foreground"
        :style="toolbarStyle"
        data-overlay="toolbar"
        :data-node-id="overlays.selection.nodeId"
      >
        <div class="flex min-w-0 items-center gap-1 px-1">
          <Button
            v-if="showSelectParent"
            variant="ghost"
            size="icon-sm"
            class="shrink-0 h-6!"
            data-action="select-parent"
            :title="t('composer.toolbar.selectParent')"
            @click.stop.prevent="handleToolbarAction('select-parent')"
          >
            <span
              :class="[TOOLBAR_ICONS['select-parent'], 'size-3.5 shrink-0']"
            />
          </Button>
          <span
            class="max-w-28 truncate px-1 text-xs font-medium text-muted-foreground capitalize"
          >
            {{ nodeTypeLabel }}
          </span>
        </div>

        <template v-if="showNodeTypeControls">
          <div
            class="mx-1.5 h-2.5 shrink-0 border-l border-solid border-muted-foreground/30"
            aria-hidden="true"
          />

          <div class="flex items-center gap-0 px-0" @click.stop>
            <ColorField
              v-if="isTextNode"
              :model-value="toolbarTextColor"
              variant="toolbar"
              layout="unified"
              show-design-colors
              show-alpha
              content-side="bottom"
              content-align="start"
              :contrast-against="toolbarContrastBackground"
              :resolved-contrast-against="resolvedToolbarContrastBackground"
              @update:model-value="handleColorChange"
            />

            <ToolbarHeadingLevelPicker
              v-if="isHeadingNode"
              :model-value="headingLevel"
              @select="handleHeadingLevelChange"
            />

            <Button
              v-if="isImageNode"
              type="button"
              variant="ghost"
              size="icon-sm"
              class="shrink-0 h-6! w-6!"
              :title="t('inspector.media.chooseImage')"
              @click.stop.prevent="handleToolbarAction('open-media-picker')"
            >
              <span
                :class="[
                  TOOLBAR_ICONS['open-media-picker'],
                  'size-3.5 shrink-0',
                ]"
              />
            </Button>
          </div>
        </template>

        <SelectionToolbarCmsControls />
        <SelectionToolbarMotionControl />

        <div
          class="mx-1.5 h-2.5 shrink-0 border-l border-solid border-muted-foreground/30"
          aria-hidden="true"
        />

        <div class="flex items-center gap-0 pr-1">
          <Button
            v-for="btn in toolbarButtons"
            :key="btn.action"
            variant="ghost"
            size="icon-sm"
            class="shrink-0 h-6! w-6!"
            :class="[
              btn.isDanger
                ? 'hover:border-destructive/50 hover:text-destructive'
                : '',
            ]"
            :data-action="btn.action"
            :title="btn.title"
            @click.stop.prevent="handleToolbarAction(btn.action)"
          >
            <span :class="[btn.iconPath, 'size-3.5 shrink-0']" />
          </Button>
        </div>
      </div>

      <div
        class="pointer-events-none fixed bg-primary will-change-transform"
        :style="insertionStyle"
        data-overlay="insertion"
      />

      <div
        class="pointer-events-none fixed rounded-sm border-2 border-dashed border-primary/70 bg-transparent will-change-transform"
        :style="addElementsTargetStyle"
        data-overlay="add-elements-target"
      />

      <div
        class="pointer-events-none fixed rounded-sm bg-primary shadow-[0_0_4px_color-mix(in_srgb,var(--primary)_35%,transparent)] will-change-transform"
        :style="addElementsInsertionStyle"
        data-overlay="add-elements-insertion"
      />

      <button
        v-for="affordance in overlays.affordances"
        :key="`${affordance.kind}:${affordance.nodeId}`"
        type="button"
        class="pointer-events-auto fixed flex min-h-6 min-w-6 items-center justify-center overflow-visible p-0 text-[10px] font-medium text-primary"
        :class="
          isCollapsedAffordance(affordance)
            ? 'bg-transparent'
            : 'overflow-hidden rounded-sm border border-dashed border-primary/70 bg-primary/10 p-1'
        "
        :style="getAffordanceStyle(affordance)"
        :aria-label="getAffordanceLabel(affordance)"
        :data-overlay="affordance.kind"
        :data-node-id="affordance.nodeId"
        :data-presentation="affordance.presentation"
        @pointerdown.stop.prevent="emit('select-affordance', affordance)"
      >
        <span
          v-if="isCollapsedAffordance(affordance)"
          class="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-primary/70"
          aria-hidden="true"
        />
        <span
          class="rounded-sm bg-background px-2 py-0.5"
          :class="
            isCollapsedAffordance(affordance)
              ? 'pointer-events-auto absolute right-1 top-1/2 -translate-y-1/2'
              : 'pointer-events-none relative'
          "
          aria-hidden="true"
        >
          {{ getAffordanceLabel(affordance) }}
        </span>
      </button>

      <template v-if="overlays.dropZones.visible">
        <div
          v-for="zone in overlays.dropZones.zones"
          :key="zone.id"
          class="pointer-events-none fixed border-2 border-dashed border-primary bg-background transition-all duration-150"
          :class="{
            'shadow-[inset_0_0_8px_color-mix(in_srgb,var(--primary)_15%,transparent)]':
              zone.isActive,
          }"
          :style="{
            position: 'fixed',
            zIndex: OVERLAY_Z_INDEX.dropZone,
            left: `${zone.position.left}px`,
            top: `${zone.position.top}px`,
            width: `${zone.position.width}px`,
            height: `${zone.position.height}px`,
          }"
          data-overlay="drop-zone"
          :data-zone-id="zone.id"
        />
      </template>
    </div>
  </Teleport>
</template>
