/**
 * Iframe canvas DOM listeners (click/hover/delete) in capture phase.
 */
import {
  ref,
  computed,
  readonly,
  onUnmounted,
  type Ref,
  type ComputedRef,
} from "vue";

/**
 * Component selection event detail
 */
interface ComponentSelectedDetail {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly timestamp: number;
}

/**
 * Component highlight event detail
 */
interface ComponentHighlightedDetail {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly timestamp: number;
}

/**
 * Component delete event detail
 */
interface ComponentDeleteDetail {
  readonly nodeId: string;
  readonly element: HTMLElement;
  readonly timestamp: number;
}

/**
 * Component paste event detail
 */
interface ComponentPasteDetail {
  readonly nodeId: string;
  readonly timestamp: number;
}

/**
 * Composable return type
 */
interface UseCanvasEventsReturn {
  /** Currently selected node ID */
  readonly selected: Ref<string | null>;
  /** Currently highlighted node ID */
  readonly highlighted: Ref<string | null>;
  /** Whether any node is selected */
  readonly hasSelection: ComputedRef<boolean>;
  /** Whether any node is highlighted */
  readonly hasHighlight: ComputedRef<boolean>;
  /** Setup event listeners on iframe content */
  readonly setupEventListeners: () => void;
  /** Remove all event listeners */
  readonly removeEventListeners: () => void;
  /** Clear selection */
  readonly clearSelection: () => void;
  /** Clear highlight */
  readonly clearHighlight: () => void;
  /** Select node programmatically */
  readonly selectNode: (nodeId: string) => void;
  /** Highlight node programmatically */
  readonly highlightNode: (nodeId: string) => void;
}

/** Selector for builder nodes */
const NODE_SELECTOR = "[data-aria-id]" as const;

/** Selector for delete action buttons */
const DELETE_BUTTON_SELECTOR = '[data-action="delete"]' as const;

/** Custom event names */
const EVENTS = {
  SELECTED: "component:selected",
  HIGHLIGHTED: "component:highlighted",
  DELETE: "component:delete",
  PASTE: "component:paste",
} as const;

/**
 * Dispatch component selected event
 */
function dispatchSelectedEvent(detail: ComponentSelectedDetail): void {
  const event = new CustomEvent(EVENTS.SELECTED, {
    detail,
    bubbles: true,
    cancelable: false,
  });

  window.dispatchEvent(event);

  if (import.meta.env.DEV) {
    console.debug("[useCanvasEvents] Node selected:", detail.nodeId);
  }
}

/**
 * Dispatch component highlighted event
 */
function dispatchHighlightedEvent(detail: ComponentHighlightedDetail): void {
  const event = new CustomEvent(EVENTS.HIGHLIGHTED, {
    detail,
    bubbles: true,
    cancelable: false,
  });

  window.dispatchEvent(event);
}

/**
 * Dispatch component delete event
 */
function dispatchDeleteEvent(detail: ComponentDeleteDetail): void {
  const event = new CustomEvent(EVENTS.DELETE, {
    detail,
    bubbles: true,
    cancelable: true, // Allow prevention
  });

  window.dispatchEvent(event);

  if (import.meta.env.DEV) {
    console.debug("[useCanvasEvents] Delete requested:", detail.nodeId);
  }
}

/**
 * Dispatch component paste event
 */
function dispatchPasteEvent(detail: ComponentPasteDetail): void {
  const event = new CustomEvent(EVENTS.PASTE, {
    detail,
    bubbles: true,
    cancelable: true,
  });

  window.dispatchEvent(event);

  if (import.meta.env.DEV) {
    console.debug("[useCanvasEvents] Paste requested:", detail.nodeId);
  }
}

/**
 * Find closest builder node from event target
 */
function findBuilderNode(target: EventTarget | null): HTMLElement | null {
  if (!target || !(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest(NODE_SELECTOR) as HTMLElement | null;
}

/**
 * Find delete button from event target
 */
function findDeleteButton(target: EventTarget | null): HTMLElement | null {
  if (!target || !(target instanceof HTMLElement)) {
    return null;
  }

  return target.closest(DELETE_BUTTON_SELECTOR) as HTMLElement | null;
}

/**
 * Extract node ID from element
 */
function getNodeId(element: HTMLElement | null): string | null {
  if (!element) return null;
  return element.getAttribute("data-aria-id");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

/**
 * Canvas DOM handlers with setup/cleanup lifecycle
 *
 * @example
 * ```vue
 * <script setup>
 * const iframeRef = ref<HTMLIFrameElement | null>(null);
 * const {
 *   selected,
 *   highlighted,
 *   setupEventListeners,
 *   removeEventListeners
 * } = useCanvasEvents(iframeRef);
 *
 * // Setup after iframe loads
 * function handleIframeLoad() {
 *   setupEventListeners();
 * }
 *
 * // Listen to custom events
 * window.addEventListener('component:selected', (e) => {
 *   console.log('Selected:', e.detail.nodeId);
 * });
 * </script>
 * ```
 */
export function useCanvasEvents(
  iframeElement: Ref<HTMLIFrameElement | null>,
): UseCanvasEventsReturn {

  const selected = ref<string | null>(null);
  const highlighted = ref<string | null>(null);

  /**
   * Stored event handlers for cleanup
   */
  const eventHandlers = new Map<string, EventListener>();

  const hasSelection = computed<boolean>(() => selected.value !== null);
  const hasHighlight = computed<boolean>(() => highlighted.value !== null);

  /**
   * Handle click events - select nodes
   */
  function handleClick(event: MouseEvent): void {
    const element = findBuilderNode(event.target);
    if (!element) return;

    const nodeId = getNodeId(element);
    if (!nodeId) return;

    // Update state
    selected.value = nodeId;

    // Dispatch event
    dispatchSelectedEvent({
      nodeId,
      element,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle mouseover events - highlight nodes
   */
  function handleMouseOver(event: MouseEvent): void {
    const element = findBuilderNode(event.target);
    if (!element) return;

    const nodeId = getNodeId(element);
    if (!nodeId) return;

    // Avoid redundant updates
    if (highlighted.value === nodeId) return;

    // Update state
    highlighted.value = nodeId;

    // Dispatch event
    dispatchHighlightedEvent({
      nodeId,
      element,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle mouseout events - clear highlight
   */
  function handleMouseOut(event: MouseEvent): void {
    const element = findBuilderNode(event.target);
    if (!element) return;

    const nodeId = getNodeId(element);
    if (!nodeId || highlighted.value !== nodeId) return;

    // Clear highlight
    highlighted.value = null;
  }

  /**
   * Handle delete button clicks
   */
  function handleDeleteClick(event: MouseEvent): void {
    const button = findDeleteButton(event.target);
    if (!button) return;

    const nodeId = button.getAttribute("data-node-id");
    if (!nodeId) return;

    // Prevent event propagation
    event.stopPropagation();

    // Dispatch delete event
    dispatchDeleteEvent({
      nodeId,
      element: button,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle keyboard shortcuts within iframe
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (
      selected.value &&
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "v" &&
      !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      dispatchPasteEvent({
        nodeId: selected.value,
        timestamp: Date.now(),
      });
      return;
    }

    // Delete selected node with Delete/Backspace
    if (
      selected.value &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      // Prevent default browser behavior
      event.preventDefault();

      const element = iframeElement.value?.contentDocument?.querySelector(
        `[data-aria-id="${selected.value}"]`,
      ) as HTMLElement | null;

      if (element) {
        dispatchDeleteEvent({
          nodeId: selected.value,
          element,
          timestamp: Date.now(),
        });
      }
    }

    // Escape to clear selection
    if (event.key === "Escape" && selected.value) {
      clearSelection();
    }
  }

  /**
   * Setup event listeners on iframe content document
   */
  function setupEventListeners(): void {
    const doc = iframeElement.value?.contentDocument;

    if (!doc) {
      console.warn(
        "[useCanvasEvents] Cannot setup listeners: iframe document not ready",
      );
      return;
    }

    // Remove existing listeners first
    removeEventListeners();

    // Click handler for selection
    const clickHandler: EventListener = (event) =>
      handleClick(event as MouseEvent);
    doc.addEventListener("click", clickHandler, true);
    eventHandlers.set("click", clickHandler);

    // Mouseover handler for highlight
    const mouseOverHandler: EventListener = (event) =>
      handleMouseOver(event as MouseEvent);
    doc.addEventListener("mouseover", mouseOverHandler, true);
    eventHandlers.set("mouseover", mouseOverHandler);

    // Mouseout handler to clear highlight
    const mouseOutHandler: EventListener = (event) =>
      handleMouseOut(event as MouseEvent);
    doc.addEventListener("mouseout", mouseOutHandler, true);
    eventHandlers.set("mouseout", mouseOutHandler);

    // Delete button handler (separate click listener)
    const deleteClickHandler: EventListener = (event) =>
      handleDeleteClick(event as MouseEvent);
    doc.addEventListener("click", deleteClickHandler, true);
    eventHandlers.set("delete-click", deleteClickHandler);

    // Keyboard handler for shortcuts
    const keyDownHandler: EventListener = (event) =>
      handleKeyDown(event as KeyboardEvent);
    doc.addEventListener("keydown", keyDownHandler, true);
    eventHandlers.set("keydown", keyDownHandler);

    if (import.meta.env.DEV) {
      console.debug(
        `[useCanvasEvents] Event listeners attached (${eventHandlers.size} handlers)`,
      );
    }
  }

  /**
   * Remove all event listeners
   */
  function removeEventListeners(): void {
    const doc = iframeElement.value?.contentDocument;
    if (!doc) return;

    // Remove all stored handlers
    eventHandlers.forEach((handler, eventType) => {
      doc.removeEventListener(eventType, handler as EventListener, true);
    });

    eventHandlers.clear();

    if (import.meta.env.DEV) {
      console.debug("[useCanvasEvents] Event listeners removed");
    }
  }

  /**
   * Clear current selection
   */
  function clearSelection(): void {
    selected.value = null;
  }

  /**
   * Clear current highlight
   */
  function clearHighlight(): void {
    highlighted.value = null;
  }

  /**
   * Select node programmatically
   */
  function selectNode(nodeId: string): void {
    selected.value = nodeId;

    const element = iframeElement.value?.contentDocument?.querySelector(
      `[data-aria-id="${nodeId}"]`,
    ) as HTMLElement | null;

    if (element) {
      dispatchSelectedEvent({
        nodeId,
        element,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Highlight node programmatically
   */
  function highlightNode(nodeId: string): void {
    highlighted.value = nodeId;

    const element = iframeElement.value?.contentDocument?.querySelector(
      `[data-aria-id="${nodeId}"]`,
    ) as HTMLElement | null;

    if (element) {
      dispatchHighlightedEvent({
        nodeId,
        element,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Auto-cleanup on component unmount
   */
  onUnmounted(() => {
    removeEventListeners();
  });

  return {
    // State (readonly to prevent external mutation)
    selected: readonly(selected) as Ref<string | null>,
    highlighted: readonly(highlighted) as Ref<string | null>,
    hasSelection,
    hasHighlight,

    // Lifecycle
    setupEventListeners,
    removeEventListeners,

    // Actions
    clearSelection,
    clearHighlight,
    selectNode,
    highlightNode,
  };
}
