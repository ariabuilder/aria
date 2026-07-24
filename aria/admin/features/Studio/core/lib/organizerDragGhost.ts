import { Z_INDEX } from "@/lib/zIndex";
import {
  isPointWithinOrganizerRail,
  syncOrganizerDropTargetFromPointer,
} from "@/features/Studio/core/composables/useStudioOrganizerDragState";

export { isPointWithinOrganizerRail } from "@/features/Studio/core/composables/useStudioOrganizerDragState";

const GHOST_ROOT_CLASS = "studio-organizer-drag-ghost";
const GHOST_COMPACT_CLASS = "studio-organizer-drag-ghost--compact";
const GHOST_ROW_CLASS = "studio-organizer-drag-ghost-row";
const GHOST_GRID_CLASS = "studio-organizer-drag-ghost-grid";
const GHOST_COMPACT_CARD_CLASS = "studio-organizer-drag-ghost-compact-card";
const GHOST_HAS_COMPACT_CARD_CLASS =
  "studio-organizer-drag-ghost--has-compact-card";
const COMPACT_WIDTH = 72;
const LABELED_COMPACT_WIDTH = 184;
const COMPACT_OFFSET_Y = 28;

type DragGhostMode = "list-row" | "grid-card";

interface ActiveDragGhost {
  root: HTMLDivElement;
  mode: DragGhostMode;
  offsetX: number;
  offsetY: number;
  fullOffsetX: number;
  fullOffsetY: number;
  compactWidth: number;
  isCompact: boolean;
}

let activeGhost: ActiveDragGhost | null = null;
let dragSessionId = 0;

function suppressNativeDragImage(event: DragEvent): void {
  if (!event.dataTransfer) {
    return;
  }

  const blank = document.createElement("div");
  blank.style.cssText =
    "position:fixed;top:-1000px;left:-1000px;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(blank);
  event.dataTransfer.setDragImage(blank, 0, 0);
  window.setTimeout(() => blank.remove(), 0);
}

function syncCellWidths(sourceRow: HTMLElement, clonedRow: HTMLElement): void {
  const sourceCells = sourceRow.querySelectorAll("td");
  const clonedCells = clonedRow.querySelectorAll("td");

  sourceCells.forEach((cell, index) => {
    const clonedCell = clonedCells[index];
    if (!(clonedCell instanceof HTMLElement)) {
      return;
    }

    const width = cell.getBoundingClientRect().width;
    clonedCell.style.width = `${width}px`;
    clonedCell.style.maxWidth = `${width}px`;
  });
}

function extractRowThumbnailMarkup(row: HTMLElement): string | null {
  const coverCell = row.querySelector('td[data-column-id="cover"]');
  if (coverCell) {
    return coverCell.innerHTML;
  }

  const image = row.querySelector("img");
  if (image) {
    return image.outerHTML;
  }

  const icon = row.querySelector('[class*="i-hugeicons"]');
  if (icon) {
    return `<div class="flex h-12 w-16 items-center justify-center rounded-md bg-card/30">${icon.outerHTML}</div>`;
  }

  return null;
}

function appendCountBadge(root: HTMLElement, itemCount?: number): void {
  if (!itemCount || itemCount <= 1) {
    return;
  }

  const badge = document.createElement("span");
  badge.className = "studio-organizer-drag-ghost-count";
  badge.textContent = String(itemCount);
  root.appendChild(badge);
}

function createGhostRoot(width: number): HTMLDivElement {
  const root = document.createElement("div");
  root.className = GHOST_ROOT_CLASS;
  root.style.width = `${width}px`;
  root.style.zIndex = String(Z_INDEX.dragGhost);
  document.body.appendChild(root);
  return root;
}

function positionGhost(clientX: number, clientY: number): void {
  if (!activeGhost) {
    return;
  }

  activeGhost.root.style.transform = `translate3d(${clientX - activeGhost.offsetX}px, ${clientY - activeGhost.offsetY}px, 0)`;
}

function setGhostCompact(compact: boolean): void {
  if (!activeGhost || activeGhost.isCompact === compact) {
    return;
  }

  activeGhost.isCompact = compact;
  activeGhost.root.classList.toggle(GHOST_COMPACT_CLASS, compact);

  if (compact) {
    activeGhost.offsetX = activeGhost.compactWidth / 2;
    activeGhost.offsetY = COMPACT_OFFSET_Y;
    activeGhost.root.style.width = `${activeGhost.compactWidth}px`;
    return;
  }

  activeGhost.offsetX = activeGhost.fullOffsetX;
  activeGhost.offsetY = activeGhost.fullOffsetY;
  activeGhost.root.style.width = `${activeGhost.root.dataset.fullWidth ?? COMPACT_WIDTH}px`;
}

function handleDocumentDragOver(event: DragEvent): void {
  const overRail = isPointWithinOrganizerRail(event.clientX, event.clientY);

  if (overRail) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    syncOrganizerDropTargetFromPointer(event.clientX, event.clientY);
  }

  if (!activeGhost) {
    return;
  }

  positionGhost(event.clientX, event.clientY);
  setGhostCompact(overRail);
}

function handleDocumentDragEnd(event: DragEvent): void {
  try {
    activeDragEndHandler?.(event);
  } catch {
    // Keep ghost teardown resilient to handler failures during dragend.
  } finally {
    teardownDragGhost();
  }
}

function teardownDragGhost(): void {
  dragSessionId += 1;
  document.removeEventListener("dragover", handleDocumentDragOver, true);
  document.removeEventListener("dragend", handleDocumentDragEnd, true);
  activeDragEndHandler = null;
  activeGhost?.root.remove();
  activeGhost = null;
}

interface BeginDragGhostOptions {
  itemCount?: number;
  source?: HTMLElement | null;
  compactLabel?: string;
  onDragEnd?: (event: DragEvent) => void;
}

let activeDragEndHandler: ((event: DragEvent) => void) | null = null;

function appendCompactLabelCard(root: HTMLElement, label?: string): boolean {
  const normalized = label?.trim();
  if (!normalized) {
    return false;
  }

  const card = document.createElement("div");
  card.className = GHOST_COMPACT_CARD_CLASS;

  const title = document.createElement("span");
  title.className = "studio-organizer-drag-ghost-compact-title";
  title.textContent = normalized;

  card.appendChild(title);
  root.appendChild(card);
  root.classList.add(GHOST_HAS_COMPACT_CARD_CLASS);
  return true;
}

function mountDragGhost(
  mode: DragGhostMode,
  source: HTMLElement,
  pointer: { clientX: number; clientY: number },
  buildContent: (
    root: HTMLDivElement,
    source: HTMLElement,
  ) => { width: number },
  options: BeginDragGhostOptions = {},
): void {
  const sourceRect = source.getBoundingClientRect();
  const root = createGhostRoot(sourceRect.width);
  const { width } = buildContent(root, source);
  root.dataset.fullWidth = String(width);
  const hasCompactLabel = appendCompactLabelCard(root, options.compactLabel);

  appendCountBadge(root, options.itemCount);

  activeGhost = {
    root,
    mode,
    offsetX: pointer.clientX - sourceRect.left,
    offsetY: pointer.clientY - sourceRect.top,
    fullOffsetX: pointer.clientX - sourceRect.left,
    fullOffsetY: pointer.clientY - sourceRect.top,
    compactWidth: hasCompactLabel ? LABELED_COMPACT_WIDTH : COMPACT_WIDTH,
    isCompact: false,
  };

  root.style.width = `${width}px`;
  positionGhost(pointer.clientX, pointer.clientY);
}

function beginDragGhost(
  event: DragEvent,
  mode: DragGhostMode,
  buildContent: (
    root: HTMLDivElement,
    source: HTMLElement,
  ) => { width: number },
  options: BeginDragGhostOptions = {},
): void {
  if (!event.dataTransfer) {
    return;
  }

  const source = options.source ?? event.currentTarget;
  if (!(source instanceof HTMLElement)) {
    return;
  }

  teardownDragGhost();
  suppressNativeDragImage(event);

  activeDragEndHandler = options.onDragEnd ?? null;

  const pointer = { clientX: event.clientX, clientY: event.clientY };
  const sessionId = dragSessionId;

  document.addEventListener("dragover", handleDocumentDragOver, true);
  document.addEventListener("dragend", handleDocumentDragEnd, true);

  window.requestAnimationFrame(() => {
    if (sessionId !== dragSessionId) {
      return;
    }

    try {
      mountDragGhost(mode, source, pointer, buildContent, options);
    } catch {
      teardownDragGhost();
    }
  });
}

function buildListRowGhostContent(
  root: HTMLDivElement,
  sourceRow: HTMLElement,
): { width: number } {
  const table = document.createElement("table");
  table.className = "studio-organizer-drag-ghost-table";

  const tbody = document.createElement("tbody");
  const clonedRow = sourceRow.cloneNode(true) as HTMLElement;
  clonedRow.classList.add(GHOST_ROW_CLASS);
  syncCellWidths(sourceRow, clonedRow);
  tbody.appendChild(clonedRow);
  table.appendChild(tbody);
  root.appendChild(table);

  const thumbnailMarkup = extractRowThumbnailMarkup(sourceRow);
  if (thumbnailMarkup) {
    const compactThumb = document.createElement("div");
    compactThumb.className = "studio-organizer-drag-ghost-compact-thumb";
    compactThumb.innerHTML = thumbnailMarkup;
    root.appendChild(compactThumb);
  }

  return { width: sourceRow.getBoundingClientRect().width };
}

function buildGridCardGhostContent(
  root: HTMLDivElement,
  sourceCard: HTMLElement,
): { width: number } {
  const preview =
    sourceCard.querySelector("[data-organizer-drag-preview]") ??
    sourceCard.querySelector(".rounded-xl");

  if (preview instanceof HTMLElement) {
    const clonedPreview = preview.cloneNode(true) as HTMLElement;
    clonedPreview.classList.add(GHOST_GRID_CLASS);
    root.appendChild(clonedPreview);

    const thumbnailMarkup =
      preview.querySelector("img, video")?.outerHTML ??
      preview.querySelector('[class*="i-hugeicons"]')?.outerHTML ??
      null;

    if (thumbnailMarkup) {
      const compactThumb = document.createElement("div");
      compactThumb.className = "studio-organizer-drag-ghost-compact-thumb";
      compactThumb.innerHTML = thumbnailMarkup;
      root.appendChild(compactThumb);
    }
  }

  return {
    width:
      preview?.getBoundingClientRect().width ??
      sourceCard.getBoundingClientRect().width,
  };
}

export function beginOrganizerListRowDrag(
  event: DragEvent,
  options: BeginDragGhostOptions = {},
): void {
  beginDragGhost(event, "list-row", buildListRowGhostContent, options);
}

export function beginOrganizerGridCardDrag(
  event: DragEvent,
  options: BeginDragGhostOptions = {},
): void {
  beginDragGhost(event, "grid-card", buildGridCardGhostContent, options);
}

export function endOrganizerDragGhost(): void {
  teardownDragGhost();
}
