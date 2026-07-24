/**
 * Keyboard focus movement for hierarchical layer/node lists.
 */
import {
  ref,
  computed,
  watch,
  onUnmounted,
  readonly,
  type Ref,
  type ComputedRef,
  type DeepReadonly,
} from "vue";

/**
 * Navigation direction
 */
type NavigationDirection = "next" | "prev" | "parent" | "child";

/**
 * Focus trap configuration
 */
interface FocusTrapConfig {
  /** Whether trap is enabled */
  readonly enabled: boolean;
  /** Container element for trap */
  readonly container: HTMLElement | null;
  /** Element to return focus to */
  readonly returnFocus: HTMLElement | null;
}

/**
 * Navigation context for tree structures
 */
interface NavigationContext {
  /** Current item ID */
  readonly currentId: string;
  /** Parent item ID */
  readonly parentId: string | null;
  /** Sibling item IDs */
  readonly siblings: readonly string[];
  /** Child item IDs */
  readonly children: readonly string[];
}

/**
 * Focus options
 */
interface FocusOptions {
  /** Whether to scroll into view */
  readonly scrollIntoView?: boolean;
  /** Scroll behavior */
  readonly scrollBehavior?: ScrollBehavior;
  /** Whether to prevent default */
  readonly preventScroll?: boolean;
}

/**
 * Composable return type
 */
interface UseFocusManagementReturn {
  /** Currently focused element ID */
  readonly focusedElementId: DeepReadonly<Ref<string | null>>;
  /** Whether focus trap is active */
  readonly isFocusTrapped: ComputedRef<boolean>;
  /** Whether any element is focused */
  readonly hasFocus: ComputedRef<boolean>;
  /** Current focus trap container */
  readonly trapContainer: ComputedRef<HTMLElement | null>;
  /** Set focused element */
  readonly setFocus: (elementId: string | null, options?: FocusOptions) => void;
  /** Clear focus */
  readonly clearFocus: () => void;
  /** Check if element is focused */
  readonly isFocused: (elementId: string) => boolean;
  /** Enable focus trap */
  readonly enableFocusTrap: (
    container: HTMLElement,
    returnFocus?: HTMLElement | null,
  ) => void;
  /** Disable focus trap */
  readonly disableFocusTrap: () => void;
  /** Navigate to sibling */
  readonly navigateToSibling: (
    direction: "next" | "prev",
    items: readonly string[],
  ) => void;
  /** Navigate to parent */
  readonly navigateToParent: (parentId: string | null) => void;
  /** Navigate to first child */
  readonly navigateToFirstChild: (children: readonly string[]) => void;
  /** Navigate with context */
  readonly navigate: (
    direction: NavigationDirection,
    context: NavigationContext,
  ) => void;
  /** Focus first focusable element in container */
  readonly focusFirst: (container: HTMLElement) => boolean;
  /** Focus last focusable element in container */
  readonly focusLast: (container: HTMLElement) => boolean;
}

/** Focusable element selector */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])' as const;

/** Data attribute for node ID */
const NODE_ID_ATTR = "data-node-id" as const;

/** Default scroll behavior */
const DEFAULT_SCROLL_BEHAVIOR: ScrollBehavior = "smooth" as const;

/**
 * Find element by node ID
 */
function findElementByNodeId(nodeId: string): HTMLElement | null {
  return document.querySelector(
    `[${NODE_ID_ATTR}="${nodeId}"]`,
  ) as HTMLElement | null;
}

/**
 * Get all focusable elements within container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll(FOCUSABLE_SELECTOR),
  ) as HTMLElement[];
}

/**
 * Get first focusable element in container
 */
function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const focusable = getFocusableElements(container);
  return focusable.length > 0 ? focusable[0] : null;
}

/**
 * Get last focusable element in container
 */
function getLastFocusable(container: HTMLElement): HTMLElement | null {
  const focusable = getFocusableElements(container);
  return focusable.length > 0 ? focusable[focusable.length - 1] : null;
}

/**
 * Get currently focused element index in array
 */
function getCurrentFocusIndex(elements: HTMLElement[]): number {
  const activeElement = document.activeElement as HTMLElement;
  return elements.indexOf(activeElement);
}

/**
 * Focus element with options
 */
function focusElement(element: HTMLElement, options: FocusOptions = {}): void {
  if (!element) return;

  const {
    scrollIntoView = false,
    scrollBehavior = DEFAULT_SCROLL_BEHAVIOR,
    preventScroll = false,
  } = options;

  // Focus the element
  element.focus({ preventScroll });

  // Scroll into view if requested
  if (scrollIntoView && !preventScroll) {
    element.scrollIntoView({
      behavior: scrollBehavior,
      block: "nearest",
      inline: "nearest",
    });
  }
}

/**
 * Validate element ID
 */
function isValidElementId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Validate HTML element
 */
function isValidElement(element: unknown): element is HTMLElement {
  return element instanceof HTMLElement;
}

/**
 * Get next index with wrapping
 */
function getNextIndex(currentIndex: number, length: number): number {
  return (currentIndex + 1) % length;
}

/**
 * Get previous index with wrapping
 */
function getPrevIndex(currentIndex: number, length: number): number {
  return currentIndex <= 0 ? length - 1 : currentIndex - 1;
}

/**
 * Find index in array
 */
function findItemIndex(items: readonly string[], itemId: string): number {
  return items.indexOf(itemId);
}

/**
 * Check if can navigate to next sibling
 */
function canNavigateNext(currentIndex: number, length: number): boolean {
  return currentIndex >= 0 && currentIndex < length - 1;
}

/**
 * Check if can navigate to previous sibling
 */
function canNavigatePrev(currentIndex: number): boolean {
  return currentIndex > 0;
}

/**
 * Create initial focus trap config
 */
function createInitialTrapConfig(): FocusTrapConfig {
  return {
    enabled: false,
    container: null,
    returnFocus: null,
  };
}

/**
 * Create focus trap config
 */
function createTrapConfig(
  container: HTMLElement,
  returnFocus: HTMLElement | null,
): FocusTrapConfig {
  return {
    enabled: true,
    container,
    returnFocus,
  };
}

/**
 * Get return focus element
 */
function getReturnFocusElement(
  providedElement?: HTMLElement | null,
): HTMLElement | null {
  if (providedElement) return providedElement;

  const activeElement = document.activeElement as HTMLElement;
  return isValidElement(activeElement) ? activeElement : null;
}

/**
 * Focus state and keyboard navigation
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   focusedElementId,
 *   isFocusTrapped,
 *   hasFocus,
 *   setFocus,
 *   clearFocus,
 *   isFocused,
 *   enableFocusTrap,
 *   disableFocusTrap,
 *   navigateToSibling,
 *   navigateToParent,
 *   navigateToFirstChild
 * } = useFocusManagement();
 *
 * // Focus element with scroll
 * function handleSelect(nodeId: string) {
 *   setFocus(nodeId, { scrollIntoView: true });
 * }
 *
 * // Enable focus trap for modal
 * function openModal(modalEl: HTMLElement) {
 *   enableFocusTrap(modalEl);
 * }
 *
 * // Navigate tree with arrow keys
 * function handleArrowDown(siblings: string[]) {
 *   navigateToSibling('next', siblings);
 * }
 *
 * function handleArrowUp(siblings: string[]) {
 *   navigateToSibling('prev', siblings);
 * }
 *
 * function handleArrowLeft(parentId: string | null) {
 *   navigateToParent(parentId);
 * }
 *
 * function handleArrowRight(children: string[]) {
 *   navigateToFirstChild(children);
 * }
 *
 * // Check focus state
 * const isNodeFocused = computed(() => isFocused(nodeId));
 * </script>
 * ```
 */
export function useFocusManagement(): UseFocusManagementReturn {

  const focusedElementId = ref<string | null>(null);
  const focusTrap = ref<FocusTrapConfig>(createInitialTrapConfig());

  /**
   * Stored event listener for cleanup
   */
  let trapKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;

  /**
   * Whether focus trap is active
   */
  const isFocusTrapped = computed<boolean>(() => focusTrap.value.enabled);

  /**
   * Whether any element is focused
   */
  const hasFocus = computed<boolean>(() => focusedElementId.value !== null);

  /**
   * Current focus trap container
   */
  const trapContainer = computed<HTMLElement | null>(
    () => focusTrap.value.container,
  );

  /**
   * Set focused element with options
   */
  function setFocus(
    elementId: string | null,
    options: FocusOptions = {},
  ): void {
    // Clear focus if null
    if (elementId === null) {
      clearFocus();
      return;
    }

    if (!isValidElementId(elementId)) {
      console.warn("[useFocusManagement] Invalid element ID:", elementId);
      return;
    }

    // Update state
    focusedElementId.value = elementId;

    // Focus DOM element
    const element = findElementByNodeId(elementId);
    if (element) {
      focusElement(element, options);

      if (import.meta.env.DEV) {
        console.debug(`[useFocusManagement] Focus set: ${elementId}`);
      }
    } else {
      console.warn(`[useFocusManagement] Element not found: ${elementId}`);
    }
  }

  /**
   * Clear focus state
   */
  function clearFocus(): void {
    const previousId = focusedElementId.value;
    focusedElementId.value = null;

    if (import.meta.env.DEV && previousId) {
      console.debug(`[useFocusManagement] Focus cleared: ${previousId}`);
    }
  }

  /**
   * Check if element is focused
   */
  function isFocused(elementId: string): boolean {
    return focusedElementId.value === elementId;
  }

  /**
   * Handle tab key within focus trap
   */
  function handleTabKey(event: KeyboardEvent, forward: boolean): void {
    const container = focusTrap.value.container;
    if (!container) return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const currentIndex = getCurrentFocusIndex(focusable);

    const nextIndex = forward
      ? getNextIndex(currentIndex, focusable.length)
      : getPrevIndex(currentIndex, focusable.length);

    focusable[nextIndex].focus();
    event.preventDefault();
  }

  /**
   * Handle keydown for focus trap
   */
  function handleFocusTrapKeyDown(event: KeyboardEvent): void {
    if (event.key === "Tab") {
      handleTabKey(event, !event.shiftKey);
    }
  }

  /**
   * Enable focus trap within container
   */
  function enableFocusTrap(
    container: HTMLElement,
    returnFocus?: HTMLElement | null,
  ): void {
    if (!isValidElement(container)) {
      console.warn("[useFocusManagement] Invalid container element");
      return;
    }

    const returnElement = getReturnFocusElement(returnFocus);

    focusTrap.value = createTrapConfig(container, returnElement);

    // Focus first focusable element
    const firstFocusable = getFirstFocusable(container);
    if (firstFocusable) {
      firstFocusable.focus();
    }

    if (import.meta.env.DEV) {
      console.debug("[useFocusManagement] Focus trap enabled");
    }
  }

  /**
   * Disable focus trap and restore focus
   */
  function disableFocusTrap(): void {
    const returnElement = focusTrap.value.returnFocus;

    if (returnElement && isValidElement(returnElement)) {
      returnElement.focus();
    }

    focusTrap.value = createInitialTrapConfig();

    if (import.meta.env.DEV) {
      console.debug("[useFocusManagement] Focus trap disabled");
    }
  }

  /**
   * Navigate to sibling element
   */
  function navigateToSibling(
    direction: "next" | "prev",
    items: readonly string[],
  ): void {
    if (!focusedElementId.value) {
      if (import.meta.env.DEV) {
        console.debug("[useFocusManagement] No focused element for navigation");
      }
      return;
    }

    const currentIndex = findItemIndex(items, focusedElementId.value);

    if (currentIndex === -1) {
      console.warn(
        "[useFocusManagement] Current element not found in siblings",
      );
      return;
    }

    let targetId: string | null = null;

    if (direction === "next" && canNavigateNext(currentIndex, items.length)) {
      targetId = items[currentIndex + 1];
    } else if (direction === "prev" && canNavigatePrev(currentIndex)) {
      targetId = items[currentIndex - 1];
    }

    if (targetId) {
      setFocus(targetId, { scrollIntoView: true });
    }
  }

  /**
   * Navigate to parent element
   */
  function navigateToParent(parentId: string | null): void {
    if (!parentId) {
      if (import.meta.env.DEV) {
        console.debug("[useFocusManagement] No parent to navigate to");
      }
      return;
    }

    setFocus(parentId, { scrollIntoView: true });
  }

  /**
   * Navigate to first child element
   */
  function navigateToFirstChild(children: readonly string[]): void {
    if (children.length === 0) {
      if (import.meta.env.DEV) {
        console.debug("[useFocusManagement] No children to navigate to");
      }
      return;
    }

    setFocus(children[0], { scrollIntoView: true });
  }

  /**
   * Navigate with full context
   */
  function navigate(
    direction: NavigationDirection,
    context: NavigationContext,
  ): void {
    switch (direction) {
      case "next":
      case "prev":
        navigateToSibling(direction, context.siblings);
        break;
      case "parent":
        navigateToParent(context.parentId);
        break;
      case "child":
        navigateToFirstChild(context.children);
        break;
    }
  }

  /**
   * Focus first focusable element in container
   */
  function focusFirst(container: HTMLElement): boolean {
    const element = getFirstFocusable(container);
    if (element) {
      element.focus();
      return true;
    }
    return false;
  }

  /**
   * Focus last focusable element in container
   */
  function focusLast(container: HTMLElement): boolean {
    const element = getLastFocusable(container);
    if (element) {
      element.focus();
      return true;
    }
    return false;
  }

  /**
   * Setup focus trap event listener
   */
  function setupTrapListener(): void {
    trapKeyDownHandler = handleFocusTrapKeyDown;
    document.addEventListener("keydown", trapKeyDownHandler);
  }

  /**
   * Remove focus trap event listener
   */
  function removeTrapListener(): void {
    if (trapKeyDownHandler) {
      document.removeEventListener("keydown", trapKeyDownHandler);
      trapKeyDownHandler = null;
    }
  }

  /**
   * Watch focus trap state and manage event listeners
   */
  watch(
    () => focusTrap.value.enabled,
    (enabled) => {
      if (enabled) {
        setupTrapListener();
      } else {
        removeTrapListener();
      }
    },
  );

  /**
   * Cleanup on component unmount
   */
  onUnmounted(() => {
    removeTrapListener();

    if (import.meta.env.DEV) {
      console.debug("[useFocusManagement] Cleanup complete");
    }
  });

  return {
    // State (readonly to prevent external mutation)
    focusedElementId: readonly(focusedElementId) as DeepReadonly<
      Ref<string | null>
    >,
    isFocusTrapped,
    hasFocus,
    trapContainer,

    // Focus operations
    setFocus,
    clearFocus,
    isFocused,

    // Focus trap
    enableFocusTrap,
    disableFocusTrap,

    // Navigation
    navigateToSibling,
    navigateToParent,
    navigateToFirstChild,
    navigate,
    focusFirst,
    focusLast,
  };
}

export type {
  NavigationDirection,
  FocusTrapConfig,
  NavigationContext,
  FocusOptions,
};
