/**
 * Cross-iframe node reorder via manual mouse events (not HTML5 DnD).
 */
import {
  ref,
  computed,
  readonly,
  onUnmounted,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  createFrameViewportPoint,
  resolveNodeMoveDropIntent,
} from "../interaction";

/**
 * Insert position relative to target
 */
type InsertPosition = "before" | "after";

/**
 * Drag state tracking
 */
interface DragState {
  /** Source node ID being dragged */
  readonly sourceNodeId: string | null;
  /** Parent ID of source node */
  readonly sourceParentId: string | null;
  /** Index of source in parent's children */
  readonly sourceIndex: number;
  /** Target node ID for drop */
  readonly targetNodeId: string | null;
  /** Insert position relative to target */
  readonly insertPosition: InsertPosition | null;
}

/**
 * Insertion indicator state
 */
interface InsertionIndicator {
  /** Whether indicator is visible */
  readonly visible: boolean;
  /** Target node ID */
  readonly nodeId: string | null;
  /** Insert position */
  readonly position: InsertPosition | null;
  /** Target element bounds */
  readonly rect: DOMRect | null;
}

/**
 * Node location in tree
 */
interface NodeLocation {
  /** The found node */
  readonly node: BuilderNode;
  /** Parent node (null if root) */
  readonly parent: BuilderNode | null;
  /** Index in parent's children array */
  readonly index: number;
}

/**
 * Reorder operation details
 */
interface ReorderOperation {
  /** Source parent ID */
  readonly sourceParentId: string | null;
  /** Source index */
  readonly sourceIndex: number;
  /** Target parent ID */
  readonly targetParentId: string | null;
  /** Target insertion index */
  readonly targetIndex: number;
}

/**
 * Event listener cleanup function
 */
type CleanupFunction = () => void;

/**
 * Insertion indicator event detail
 */
interface InsertionIndicatorDetail {
  readonly visible: boolean;
  readonly nodeId?: string;
  readonly position?: InsertPosition;
  readonly rect?: DOMRect;
}

/**
 * Reorder drop event detail
 */
interface ReorderDropDetail {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly position: InsertPosition;
}

/**
 * Composable return type
 */
interface UseCanvasReorderReturn {
  /** Whether currently dragging */
  readonly isDragging: ComputedRef<boolean>;
  /** Current drag state */
  readonly dragState: DeepReadonly<Ref<DragState>>;
  /** Insertion indicator state */
  readonly insertionIndicator: DeepReadonly<Ref<InsertionIndicator>>;
  /** Whether has active drag operation */
  readonly hasActiveDrag: ComputedRef<boolean>;
  /** Current source node ID */
  readonly sourceNodeId: ComputedRef<string | null>;
  /** Current target node ID */
  readonly targetNodeId: ComputedRef<string | null>;
  /** Start manual drag operation */
  readonly startDrag: (
    nodeId: string,
    parentId: string | null,
    index: number,
  ) => void;
  /** Execute drop and return operation details */
  readonly executeDrop: (
    pageBlocks: Ref<BuilderNode[]>,
  ) => ReorderOperation | null;
  /** Cancel current drag operation */
  readonly cancelDrag: () => void;
  /** Initialize drag button in toolbar */
  readonly initializeDragButton: (
    toolbar: HTMLElement,
    nodeId: string,
    parentId: string | null,
    index: number,
  ) => void;
}

/** Custom event names */
const EVENTS = {
  INSERTION_INDICATOR: "canvas:insertion-indicator",
  REORDER_DROP: "canvas:reorder-drop",
} as const;

/** Drag visual styles */
const DRAG_STYLES = {
  CURSOR_GRAB: "grab",
  CURSOR_GRABBING: "grabbing",
  OPACITY_DRAGGING: "0.6",
  OPACITY_NORMAL: "1",
} as const;

/** Node selector */

/** Drag action selector */
const DRAG_ACTION_SELECTOR = '[data-action="drag"]' as const;

/**
 * Find element in iframe by node ID
 */
function findElementInIframe(
  iframe: HTMLIFrameElement | null | undefined,
  nodeId: string,
): HTMLElement | null {
  if (!iframe?.contentDocument) return null;

  return iframe.contentDocument.querySelector(
    `[data-aria-id="${nodeId}"]`,
  ) as HTMLElement | null;
}

/**
 * Find closest block element from target
 */

/**
 * Extract node ID from element
 */
function extractNodeId(element: HTMLElement | null): string | null {
  if (!element) return null;
  return element.getAttribute("data-aria-id");
}

/**
 * Find drag button in toolbar
 */
function findDragButton(toolbar: HTMLElement): HTMLElement | null {
  return toolbar.querySelector(DRAG_ACTION_SELECTOR) as HTMLElement | null;
}

/**
 * Calculate insert position based on mouse Y coordinate
 */

/**
 * Calculate final insertion index with adjustments
 */
function calculateFinalIndex(
  targetIndex: number,
  insertPosition: InsertPosition,
  sourceParentId: string | null,
  targetParentId: string | null,
  sourceIndex: number,
): number {
  let finalIndex = targetIndex;

  // Insert after means next position
  if (insertPosition === "after") {
    finalIndex = targetIndex + 1;
  }

  // If moving within same parent and source is before target, adjust index
  if (sourceParentId === targetParentId && sourceIndex < finalIndex) {
    finalIndex -= 1;
  }

  return finalIndex;
}

/**
 * Find node in tree with parent and index information
 */
function findNodeWithParent(
  nodes: BuilderNode[],
  nodeId: string,
  parent: BuilderNode | null = null,
): NodeLocation | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.id === nodeId) {
      return { node, parent, index: i };
    }

    if (node.children && node.children.length > 0) {
      const found = findNodeWithParent(node.children, nodeId, node);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Validate tree structure
 */
function isValidNodeTree(nodes: unknown): nodes is BuilderNode[] {
  return Array.isArray(nodes);
}

/**
 * Dispatch insertion indicator event
 */
function dispatchInsertionIndicatorEvent(
  detail: InsertionIndicatorDetail,
): void {
  const event = new CustomEvent(EVENTS.INSERTION_INDICATOR, {
    detail,
    bubbles: true,
    cancelable: false,
  });

  window.dispatchEvent(event);
}

/**
 * Dispatch reorder drop event
 */
function dispatchReorderDropEvent(detail: ReorderDropDetail): void {
  const event = new CustomEvent(EVENTS.REORDER_DROP, {
    detail,
    bubbles: true,
    cancelable: false,
  });

  window.dispatchEvent(event);

  if (import.meta.env.DEV) {
    console.debug("[useCanvasReorder] Drop event dispatched:", detail);
  }
}

/**
 * Apply dragging styles to element
 */
function applyDraggingStyles(element: HTMLElement): void {
  element.style.cursor = DRAG_STYLES.CURSOR_GRABBING;
  element.style.opacity = DRAG_STYLES.OPACITY_DRAGGING;
}

/**
 * Remove drag styles from element
 */
function removeDragStyles(element: HTMLElement): void {
  element.style.cursor = "";
  element.style.outline = "";
  element.style.outlineOffset = "";
  element.style.backgroundColor = "";
  element.style.opacity = DRAG_STYLES.OPACITY_NORMAL;
}

/**
 * Create initial drag state
 */
function createInitialDragState(): DragState {
  return {
    sourceNodeId: null,
    sourceParentId: null,
    sourceIndex: -1,
    targetNodeId: null,
    insertPosition: null,
  };
}

/**
 * Create drag state from parameters
 */
function createDragState(
  nodeId: string,
  parentId: string | null,
  index: number,
): DragState {
  return {
    sourceNodeId: nodeId,
    sourceParentId: parentId,
    sourceIndex: index,
    targetNodeId: null,
    insertPosition: null,
  };
}

/**
 * Create initial insertion indicator state
 */
function createInitialIndicatorState(): InsertionIndicator {
  return {
    visible: false,
    nodeId: null,
    position: null,
    rect: null,
  };
}

/**
 * Create insertion indicator state
 */
function createIndicatorState(
  nodeId: string,
  position: InsertPosition,
  rect: DOMRect,
): InsertionIndicator {
  return {
    visible: true,
    nodeId,
    position,
    rect,
  };
}

/**
 * Canvas block reorder via manual drag-and-drop
 *
 * @param iframeRef - Reference to canvas iframe element
 *
 * @example
 * ```vue
 * <script setup>
 * const iframeRef = ref<HTMLIFrameElement | null>(null);
 * const pageBlocks = ref<BuilderNode[]>([]);
 *
 * const {
 *   isDragging,
 *   dragState,
 *   insertionIndicator,
 *   startDrag,
 *   executeDrop,
 *   cancelDrag
 * } = useCanvasReorder(iframeRef);
 *
 * // Start drag from toolbar
 * function handleDragStart(node: BuilderNode, parent: string | null, index: number) {
 *   startDrag(node.id, parent, index);
 * }
 *
 * // Listen for drop events
 * window.addEventListener('canvas:reorder-drop', (e) => {
 *   const operation = executeDrop(pageBlocks);
 *   if (operation) {
 *     applyReorderOperation(operation);
 *   }
 * });
 *
 * // Cancel on escape
 * function handleKeyDown(e: KeyboardEvent) {
 *   if (e.key === 'Escape' && isDragging.value) {
 *     cancelDrag();
 *   }
 * }
 * </script>
 * ```
 */
export function useCanvasReorder(
  iframeRef: Ref<HTMLIFrameElement | null>,
): UseCanvasReorderReturn {

  const dragState = ref<DragState>(createInitialDragState());
  const insertionIndicator = ref<InsertionIndicator>(
    createInitialIndicatorState(),
  );

  /**
   * Active event listener cleanup functions
   */
  const activeCleanups = ref<CleanupFunction[]>([]);

  /**
   * Whether currently dragging
   */
  const isDragging = computed<boolean>(
    () => dragState.value.sourceNodeId !== null,
  );

  /**
   * Whether has active drag operation
   */
  const hasActiveDrag = computed<boolean>(
    () => dragState.value.sourceNodeId !== null,
  );

  /**
   * Current source node ID
   */
  const sourceNodeId = computed<string | null>(
    () => dragState.value.sourceNodeId,
  );

  /**
   * Current target node ID
   */
  const targetNodeId = computed<string | null>(
    () => dragState.value.targetNodeId,
  );

  /**
   * Handle mouse down - start dragging
   */
  function handleMouseDown(element: HTMLElement, event: MouseEvent): void {
    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Mouse down - starting manual drag");
    }

    applyDraggingStyles(element);
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Handle mouse move - update target and indicator
   */
  function handleMouseMove(
    sourceElement: HTMLElement,
    event: MouseEvent,
  ): void {
    const doc = iframeRef.value?.contentDocument;
    const sourceNodeId = dragState.value.sourceNodeId;

    if (!doc || !sourceNodeId) {
      hideInsertionIndicator();
      return;
    }

    const intent = resolveNodeMoveDropIntent({
      doc,
      point: createFrameViewportPoint(event.clientX, event.clientY),
      sourceNodeId,
    });

    if (
      !intent?.targetNodeId ||
      intent.targetNodeId === extractNodeId(sourceElement) ||
      !intent.position ||
      intent.position === "inside"
    ) {
      hideInsertionIndicator();
      dragState.value = {
        ...dragState.value,
        targetNodeId: null,
        insertPosition: null,
      };
      return;
    }

    const targetElement = findElementInIframe(iframeRef.value, intent.targetNodeId);
    if (!targetElement) {
      hideInsertionIndicator();
      return;
    }

    dragState.value = {
      ...dragState.value,
      targetNodeId: intent.targetNodeId,
      insertPosition: intent.position,
    };

    showInsertionIndicator(
      intent.targetNodeId,
      intent.position,
      targetElement.getBoundingClientRect(),
    );

    if (import.meta.env.DEV) {
      console.debug(
        `[useCanvasReorder] Drag over: ${intent.targetNodeId} (${intent.position})`,
      );
    }
  }

  /**
   * Handle mouse up - complete drag
   */
  function handleMouseUp(element: HTMLElement, event: MouseEvent): void {
    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Mouse up - completing drag");
    }

    // Restore styles
    removeDragStyles(element);

    // Dispatch drop event if we have a valid target
    if (
      dragState.value.sourceNodeId &&
      dragState.value.targetNodeId &&
      dragState.value.insertPosition
    ) {
      dispatchReorderDropEvent({
        sourceNodeId: dragState.value.sourceNodeId,
        targetNodeId: dragState.value.targetNodeId,
        position: dragState.value.insertPosition,
      });
    }

    // Cleanup
    hideInsertionIndicator();
    cleanupEventListeners();

    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Show insertion indicator
   */
  function showInsertionIndicator(
    nodeId: string,
    position: InsertPosition,
    rect: DOMRect,
  ): void {
    insertionIndicator.value = createIndicatorState(nodeId, position, rect);

    dispatchInsertionIndicatorEvent({
      visible: true,
      nodeId,
      position,
      rect,
    });
  }

  /**
   * Hide insertion indicator
   */
  function hideInsertionIndicator(): void {
    insertionIndicator.value = createInitialIndicatorState();

    dispatchInsertionIndicatorEvent({
      visible: false,
    });
  }

  /**
   * Attach event listeners for manual drag
   */
  function attachDragListeners(element: HTMLElement): void {
    const doc = iframeRef.value?.contentDocument;
    if (!doc) return;

    let isDraggingManually = false;

    // Mouse down handler
    const onMouseDown = (e: MouseEvent) => {
      isDraggingManually = true;
      handleMouseDown(element, e);
    };

    // Mouse move handler
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingManually) {
        handleMouseMove(element, e);
      }
    };

    // Mouse up handler
    const onMouseUp = (e: MouseEvent) => {
      if (isDraggingManually) {
        isDraggingManually = false;
        handleMouseUp(element, e);
      }
    };

    // Attach listeners
    element.addEventListener("mousedown", onMouseDown, true);
    doc.addEventListener("mousemove", onMouseMove, true);
    doc.addEventListener("mouseup", onMouseUp, true);

    // Store cleanup function
    const cleanup: CleanupFunction = () => {
      element.removeEventListener("mousedown", onMouseDown, true);
      doc.removeEventListener("mousemove", onMouseMove, true);
      doc.removeEventListener("mouseup", onMouseUp, true);
    };

    activeCleanups.value.push(cleanup);

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Drag listeners attached");
    }
  }

  /**
   * Cleanup all active event listeners
   */
  function cleanupEventListeners(): void {
    activeCleanups.value.forEach((cleanup) => cleanup());
    activeCleanups.value = [];

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Event listeners cleaned up");
    }
  }

  /**
   * Start manual drag operation
   *
   * Sets up visual feedback and event listeners for drag operation.
   */
  function startDrag(
    nodeId: string,
    parentId: string | null,
    index: number,
  ): void {
    // Update drag state
    dragState.value = createDragState(nodeId, parentId, index);

    // Find element in iframe
    const element = findElementInIframe(iframeRef.value, nodeId);
    if (!element) {
      console.warn("[useCanvasReorder] Element not found:", nodeId);
      return;
    }

    // Attach drag event listeners
    attachDragListeners(element);

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Drag started:", nodeId);
    }
  }

  /**
   * Execute drop operation
   *
   * Calculates reorder operation details and resets drag state.
   * Returns operation for parent to apply to tree.
   */
  function executeDrop(
    pageBlocks: Ref<BuilderNode[]>,
  ): ReorderOperation | null {
    if (
      !dragState.value.sourceNodeId ||
      !dragState.value.insertPosition ||
      !dragState.value.targetNodeId
    ) {
      return null;
    }

    if (!isValidNodeTree(pageBlocks.value)) {
      console.error("[useCanvasReorder] Invalid node tree");
      return null;
    }

    // Find target node location
    const targetInfo = findNodeWithParent(
      pageBlocks.value,
      dragState.value.targetNodeId,
    );

    if (!targetInfo) {
      console.warn("[useCanvasReorder] Target node not found");
      return null;
    }

    const targetParentId = targetInfo.parent?.id || null;

    // Calculate final insertion index
    const finalIndex = calculateFinalIndex(
      targetInfo.index,
      dragState.value.insertPosition,
      dragState.value.sourceParentId,
      targetParentId,
      dragState.value.sourceIndex,
    );

    // Create operation details
    const operation: ReorderOperation = {
      sourceParentId: dragState.value.sourceParentId,
      sourceIndex: dragState.value.sourceIndex,
      targetParentId,
      targetIndex: finalIndex,
    };

    // Reset drag state
    dragState.value = createInitialDragState();

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Drop executed:", operation);
    }

    return operation;
  }

  /**
   * Cancel current drag operation
   *
   * Cleans up visual feedback and resets state.
   */
  function cancelDrag(): void {
    if (dragState.value.sourceNodeId) {
      const element = findElementInIframe(
        iframeRef.value,
        dragState.value.sourceNodeId,
      );

      if (element) {
        removeDragStyles(element);
      }
    }

    // Cleanup listeners
    cleanupEventListeners();

    // Reset state
    dragState.value = createInitialDragState();
    hideInsertionIndicator();

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Drag cancelled");
    }
  }

  /**
   * Initialize drag button in toolbar
   *
   * Called when selection toolbar appears.
   * Sets up drag state and listeners for button-based drag from the toolbar.
   */
  function initializeDragButton(
    toolbar: HTMLElement,
    nodeId: string,
    parentId: string | null,
    index: number,
  ): void {
    const dragButton = findDragButton(toolbar);

    if (!dragButton) {
      console.warn("[useCanvasReorder] Drag button not found in toolbar");
      return;
    }

    // Update drag state
    dragState.value = createDragState(nodeId, parentId, index);

    if (import.meta.env.DEV) {
      console.debug("[useCanvasReorder] Drag button initialized:", nodeId);
    }
  }

  /**
   * Auto-cleanup on component unmount
   */
  onUnmounted(() => {
    cancelDrag();
  });

  return {
    // State (readonly to prevent external mutation)
    isDragging,
    dragState: readonly(dragState) as DeepReadonly<Ref<DragState>>,
    insertionIndicator: readonly(insertionIndicator) as DeepReadonly<
      Ref<InsertionIndicator>
    >,
    hasActiveDrag,
    sourceNodeId,
    targetNodeId,

    // Operations
    startDrag,
    executeDrop,
    cancelDrag,
    initializeDragButton,
  };
}
