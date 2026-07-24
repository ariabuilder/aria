import { ref } from "vue";

export const ORGANIZER_DRAG_IDS_MIME = "application/x-aria-organizer-ids";
export const ORGANIZER_DROP_TARGET_SELECTOR = "[data-organizer-drop-target]";
export const ORGANIZER_RAIL_SELECTOR = "[data-studio-organizer-rail]";

const draggedItemId = ref<string | null>(null);
const draggedItemIds = ref<string[]>([]);
const dragTargetGroupId = ref<string | null>(null);
let organizerDropCommitted = false;

export interface OrganizerDropCommit {
  itemIds: string[];
  groupId: string | undefined;
}

export function isPointWithinOrganizerRail(
  clientX: number,
  clientY: number,
): boolean {
  const rail = document.querySelector(ORGANIZER_RAIL_SELECTOR);
  if (!rail) {
    return false;
  }

  const rect = rail.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function resolveOrganizerDropTargetId(
  event: Pick<DragEvent, "clientX" | "clientY">,
): string | null {
  const stack = document.elementsFromPoint(event.clientX, event.clientY);

  for (const element of stack) {
    if (element.closest(".studio-organizer-drag-ghost")) {
      continue;
    }

    const marker = element.closest(ORGANIZER_DROP_TARGET_SELECTOR);
    if (marker instanceof HTMLElement) {
      return marker.dataset.organizerDropTarget ?? null;
    }
  }

  return null;
}

export function normalizeOrganizerDropTarget(
  target: string | null | undefined,
): string | null {
  if (!target || target === "__all__") {
    return null;
  }

  return target;
}

export function syncOrganizerDropTargetFromPointer(
  clientX: number,
  clientY: number,
): void {
  if (!isPointWithinOrganizerRail(clientX, clientY)) {
    return;
  }

  const target = resolveOrganizerDropTargetId({ clientX, clientY });
  if (target) {
    dragTargetGroupId.value = target;
  }
}

export function getOrganizerDropCommit(
  clientX: number,
  clientY: number,
): OrganizerDropCommit | null {
  if (organizerDropCommitted) {
    return null;
  }

  if (!isPointWithinOrganizerRail(clientX, clientY)) {
    return null;
  }

  const itemIds = [...draggedItemIds.value];
  if (itemIds.length === 0) {
    return null;
  }

  const rawTarget =
    resolveOrganizerDropTargetId({ clientX, clientY }) ??
    dragTargetGroupId.value;
  if (!rawTarget) {
    return null;
  }

  return {
    itemIds,
    groupId: normalizeOrganizerDropTarget(rawTarget) ?? undefined,
  };
}

export function parseOrganizerDragIds(event: DragEvent): string[] {
  const raw = event.dataTransfer?.getData(ORGANIZER_DRAG_IDS_MIME);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((id) => typeof id === "string" && id.length > 0)
      ) {
        return parsed;
      }
    } catch {
      // Fall through to single-id payload.
    }
  }

  const singleId = event.dataTransfer?.getData("text/plain");
  if (singleId) {
    return [singleId];
  }

  if (draggedItemIds.value.length > 0) {
    return [...draggedItemIds.value];
  }

  return draggedItemId.value ? [draggedItemId.value] : [];
}

export function useStudioOrganizerDragState() {
  function startDrag(itemId: string, itemIds?: readonly string[]): void {
    const ids = itemIds?.length ? [...itemIds] : [itemId];
    draggedItemId.value = itemId;
    draggedItemIds.value = ids;
    dragTargetGroupId.value = null;
    organizerDropCommitted = false;
  }

  function endDrag(): void {
    draggedItemId.value = null;
    draggedItemIds.value = [];
    dragTargetGroupId.value = null;
    organizerDropCommitted = false;
  }

  function scheduleEndDrag(): void {
    const sessionId = draggedItemId.value;
    if (!sessionId) {
      return;
    }

    window.setTimeout(() => {
      if (draggedItemId.value === sessionId) {
        endDrag();
      }
    }, 0);
  }

  function markOrganizerDropCommitted(): void {
    organizerDropCommitted = true;
  }

  function wasOrganizerDropCommitted(): boolean {
    return organizerDropCommitted;
  }

  function setDropTarget(groupId: string | null): void {
    dragTargetGroupId.value = groupId;
  }

  function clearDropTarget(groupId: string): void {
    if (dragTargetGroupId.value === groupId) {
      dragTargetGroupId.value = null;
    }
  }

  return {
    draggedItemId,
    draggedItemIds,
    dragTargetGroupId,
    startDrag,
    endDrag,
    scheduleEndDrag,
    markOrganizerDropCommitted,
    wasOrganizerDropCommitted,
    setDropTarget,
    clearDropTarget,
  };
}
