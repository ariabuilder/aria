import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginOrganizerGridCardDrag,
  endOrganizerDragGhost,
  isPointWithinOrganizerRail,
} from "../../../../admin/features/Studio/core/lib/organizerDragGhost";

const GHOST_SELECTOR = ".studio-organizer-drag-ghost";

function createStubDataTransfer(): DataTransfer {
  return {
    setDragImage: vi.fn(),
    setData: vi.fn(),
    getData: vi.fn(() => ""),
    clearData: vi.fn(),
    dropEffect: "none",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
  } as unknown as DataTransfer;
}

function createGridSourceCard(): HTMLElement {
  const card = document.createElement("div");
  const preview = document.createElement("div");
  preview.setAttribute("data-organizer-drag-preview", "");
  preview.className = "rounded-xl";
  preview.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 100,
      right: 300,
      bottom: 220,
      width: 200,
      height: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  card.appendChild(preview);
  card.getBoundingClientRect = preview.getBoundingClientRect;
  document.body.appendChild(card);
  return card;
}

function createDragStartEvent(source: HTMLElement): DragEvent {
  return {
    dataTransfer: createStubDataTransfer(),
    clientX: 150,
    clientY: 140,
    currentTarget: source,
  } as unknown as DragEvent;
}

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

describe("isPointWithinOrganizerRail", () => {
  afterEach(() => {
    endOrganizerDragGhost();
    document.body.innerHTML = "";
  });

  it("returns true when the point is inside the organizer rail", () => {
    const rail = document.createElement("aside");
    rail.setAttribute("data-studio-organizer-rail", "");
    rail.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 400,
        width: 200,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(rail);

    expect(isPointWithinOrganizerRail(100, 200)).toBe(true);
  });

  it("returns false when the point is outside the organizer rail", () => {
    const rail = document.createElement("aside");
    rail.setAttribute("data-studio-organizer-rail", "");
    rail.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 400,
        width: 200,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(rail);

    expect(isPointWithinOrganizerRail(250, 200)).toBe(false);
  });

  it("returns false when no organizer rail exists", () => {
    expect(isPointWithinOrganizerRail(10, 10)).toBe(false);
  });
});

describe("organizer drag ghost lifecycle", () => {
  afterEach(() => {
    endOrganizerDragGhost();
    document.body.innerHTML = "";
  });

  it("mounts a body-level ghost and removes it via endOrganizerDragGhost", async () => {
    const source = createGridSourceCard();

    beginOrganizerGridCardDrag(createDragStartEvent(source), {
      compactLabel: "Grid",
    });

    await flushAnimationFrame();

    expect(document.querySelector(GHOST_SELECTOR)).toBeTruthy();

    endOrganizerDragGhost();

    expect(document.querySelector(GHOST_SELECTOR)).toBeNull();
  });

  it("tears down the ghost on dragend even when onDragEnd throws", async () => {
    const source = createGridSourceCard();
    const onDragEnd = vi.fn(() => {
      throw new Error("drag-end handler failed");
    });

    beginOrganizerGridCardDrag(createDragStartEvent(source), {
      compactLabel: "Grid",
      onDragEnd,
    });

    await flushAnimationFrame();
    expect(document.querySelector(GHOST_SELECTOR)).toBeTruthy();

    document.dispatchEvent(new Event("dragend", { bubbles: true }));

    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(document.querySelector(GHOST_SELECTOR)).toBeNull();
  });
});
