import { nextTick } from "vue";

/** Listbox root context subset used for command filter keyboard delegation. */
export interface CommandListboxNavigationContext {
  highlightedElement: { value: HTMLElement | null };
  onKeydownEnter: (event: KeyboardEvent) => void;
  changeHighlight: (
    el: HTMLElement,
    scrollIntoView?: boolean,
    focus?: boolean,
  ) => void;
}

const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);
type CommandListRoot = Pick<ParentNode, "querySelector">;

/** Per-command list: first arrow/home/end from filter snaps to an edge, not off auto-highlight. */
const keyboardNavStarted = new WeakMap<CommandListRoot, boolean>();

export function resetCommandKeyboardNavigation(
  listRoot: CommandListRoot = document,
): void {
  keyboardNavStarted.delete(listRoot);
}

function hasKeyboardNavStarted(listRoot: CommandListRoot): boolean {
  return keyboardNavStarted.get(listRoot) === true;
}

function markKeyboardNavStarted(listRoot: CommandListRoot): void {
  keyboardNavStarted.set(listRoot, true);
}

function resolveFirstKeyboardNavIndex(
  event: KeyboardEvent,
  items: readonly HTMLElement[],
): number {
  if (event.key === "ArrowUp" || event.key === "End") {
    return items.length - 1;
  }
  return 0;
}

export function isCommandFilterKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.dataset.slot === "command-input" ||
    target.closest('[data-slot="command-input"]') !== null
  );
}

function isVisibleCommandItem(element: HTMLElement): boolean {
  if (element.dataset.disabled === "") {
    return false;
  }

  const group = element.closest('[data-slot="command-group"]');
  if (group instanceof HTMLElement && group.hidden) {
    return false;
  }

  return !element.closest("[hidden]");
}

export function getVisibleCommandItems(
  listRoot: CommandListRoot = document,
): HTMLElement[] {
  const list = listRoot.querySelector('[data-slot="command-list"]');
  if (!list) {
    return [];
  }

  const items = list.querySelectorAll<HTMLElement>('[data-slot="command-item"]');
  return Array.from(items).filter(isVisibleCommandItem);
}

function resolveHighlightedIndex(
  items: readonly HTMLElement[],
  highlighted: HTMLElement | null,
): number {
  if (!highlighted || items.length === 0) {
    return -1;
  }

  const byRef = items.findIndex((item) => item === highlighted);
  if (byRef >= 0) {
    return byRef;
  }

  // Fall back when the active node is nested inside the option root (hover path).
  return items.findIndex(
    (item) => item === highlighted || item.contains(highlighted),
  );
}

function resolveNextIndex(
  event: KeyboardEvent,
  items: readonly HTMLElement[],
  currentIndex: number,
): number {
  const lastIndex = items.length - 1;

  if (currentIndex < 0) {
    if (event.key === "ArrowUp" || event.key === "End") {
      return lastIndex;
    }
    return 0;
  }

  switch (event.key) {
    case "ArrowDown":
      return currentIndex >= lastIndex ? 0 : currentIndex + 1;
    case "ArrowUp":
      return currentIndex <= 0 ? lastIndex : currentIndex - 1;
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return currentIndex;
  }
}

/**
 * Move highlight across visible command rows (same mechanism as hover).
 * Reka onKeydownNavigation is unreliable with our client-side Command filter.
 */
export function navigateVisibleCommandItems(
  event: KeyboardEvent,
  rootContext: CommandListboxNavigationContext,
  listRoot: CommandListRoot = document,
): boolean {
  const items = getVisibleCommandItems(listRoot);
  if (items.length === 0) {
    return false;
  }

  const fromFilter = isCommandFilterKeyTarget(event.target);
  if (fromFilter && !hasKeyboardNavStarted(listRoot)) {
    markKeyboardNavStarted(listRoot);
    const index = resolveFirstKeyboardNavIndex(event, items);
    const target = items[index];
    if (target) {
      rootContext.changeHighlight(target, true, false);
      return true;
    }
  }

  const currentIndex = resolveHighlightedIndex(
    items,
    rootContext.highlightedElement.value,
  );
  const nextIndex = resolveNextIndex(event, items, currentIndex);
  const next = items[nextIndex];
  if (!next) {
    return false;
  }

  rootContext.changeHighlight(next, true, false);
  return true;
}

/**
 * Delegates arrow / home / end / enter from the filter input to the listbox root
 * while focus stays in the input (cmdk-style combobox behavior).
 */
export async function handleCommandInputKeydown(
  event: KeyboardEvent,
  rootContext: CommandListboxNavigationContext,
  listRoot: CommandListRoot = document,
): Promise<boolean> {
  if (!isCommandFilterKeyTarget(event.target)) {
    return false;
  }

  if (NAVIGATION_KEYS.has(event.key)) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const moved = navigateVisibleCommandItems(event, rootContext, listRoot);
    if (!moved) {
      await nextTick();
      navigateVisibleCommandItems(event, rootContext, listRoot);
    }
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    event.stopImmediatePropagation();
    rootContext.onKeydownEnter(event);
    return true;
  }

  return false;
}
