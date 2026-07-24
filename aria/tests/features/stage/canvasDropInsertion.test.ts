import { describe, expect, it } from "vitest";
import {
  calculateInsertionIndexMidline,
  computeAddElementsDropLayout,
  computePlaceholderViewportRect,
  computeTargetViewportRect,
  findInsertionParentElement,
  resolveInsertionTarget,
} from "../../../admin/features/Stage/dragdrop/canvasDropInsertion";
import { frameViewportRectToIframeDocument } from "../../../admin/features/Stage/utils/overlayMeasure";

function mockRect(top: number, height: number, left = 0, width = 400): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mockFlexParent(display = "flex", flexDirection = "column"): HTMLElement {
  const parent = document.createElement("div");
  parent.style.display = display;
  parent.style.flexDirection = flexDirection;
  Object.defineProperty(parent.ownerDocument, "defaultView", {
    value: {
      getComputedStyle: () => ({
        display,
        flexDirection,
        gridAutoFlow: "",
      }),
    },
    configurable: true,
  });
  return parent;
}

describe("canvasDropInsertion", () => {
  it("inserts before the first sibling whose midpoint is below the cursor", () => {
    const parent = mockFlexParent();
    const first = document.createElement("div");
    const second = document.createElement("div");

    first.getBoundingClientRect = () => mockRect(100, 40);
    second.getBoundingClientRect = () => mockRect(200, 40);
    parent.getBoundingClientRect = () => mockRect(80, 200);

    expect(calculateInsertionIndexMidline([first, second], 120, 110, parent)).toBe(
      0,
    );
    expect(calculateInsertionIndexMidline([first, second], 120, 150, parent)).toBe(
      1,
    );
    expect(calculateInsertionIndexMidline([first, second], 120, 250, parent)).toBe(
      2,
    );
  });

  it("uses horizontal midline for row flex containers", () => {
    const parent = mockFlexParent("flex", "row");
    const first = document.createElement("div");
    const second = document.createElement("div");

    first.getBoundingClientRect = () => mockRect(100, 40, 0, 100);
    second.getBoundingClientRect = () => mockRect(100, 40, 120, 100);
    parent.getBoundingClientRect = () => mockRect(80, 200);

    expect(calculateInsertionIndexMidline([first, second], 40, 120, parent)).toBe(
      0,
    );
    expect(calculateInsertionIndexMidline([first, second], 150, 120, parent)).toBe(
      1,
    );
    expect(calculateInsertionIndexMidline([first, second], 250, 120, parent)).toBe(
      2,
    );
  });

  it("uses row and column midlines for grid containers", () => {
    const parent = mockFlexParent("grid", "column");
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    const fourth = document.createElement("div");

    first.getBoundingClientRect = () => mockRect(100, 80, 20, 180);
    second.getBoundingClientRect = () => mockRect(100, 80, 240, 180);
    third.getBoundingClientRect = () => mockRect(220, 80, 20, 180);
    fourth.getBoundingClientRect = () => mockRect(220, 80, 240, 180);

    const children = [first, second, third, fourth];

    expect(calculateInsertionIndexMidline(children, 30, 120, parent)).toBe(0);
    expect(calculateInsertionIndexMidline(children, 260, 120, parent)).toBe(1);
    expect(calculateInsertionIndexMidline(children, 30, 240, parent)).toBe(2);
    expect(calculateInsertionIndexMidline(children, 480, 360, parent)).toBe(4);
  });

  it("targets a structural section when the pointer is on its padding", () => {
    const body = document.createElement("body");
    const contentRoot = document.createElement("main");
    contentRoot.setAttribute("data-stage-content-root", "");

    const section = document.createElement("section");
    section.setAttribute("data-aria-id", "section-1");
    section.setAttribute("data-aria-type", "section");
    section.setAttribute("data-drop-zone", "");
    section.setAttribute("data-zone-id", "zone-section");

    const heading = document.createElement("h1");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "heading");

    section.appendChild(heading);
    contentRoot.appendChild(section);
    body.appendChild(contentRoot);

    section.getBoundingClientRect = () => mockRect(50, 300, 0, 600);
    heading.getBoundingClientRect = () => mockRect(120, 40, 20, 200);

    const result = resolveInsertionTarget(
      section,
      100,
      80,
      contentRoot,
      body,
    );

    expect(result.dropParent).toBe(section);
    expect(result.dropParentId).toBe("zone-section");
    expect(result.isRoot).toBe(false);
  });

  it("uses structural parent when pointer is on a leaf block", () => {
    const body = document.createElement("body");
    const contentRoot = document.createElement("main");
    const section = document.createElement("section");
    section.setAttribute("data-drop-zone", "");
    section.setAttribute("data-aria-type", "section");

    const heading = document.createElement("h1");
    heading.setAttribute("data-aria-id", "h1");
    heading.setAttribute("data-aria-type", "heading");

    section.appendChild(heading);
    contentRoot.appendChild(section);
    body.appendChild(contentRoot);

    heading.getBoundingClientRect = () => mockRect(120, 40, 20, 200);
    section.getBoundingClientRect = () => mockRect(50, 300);

    const result = resolveInsertionTarget(
      heading,
      100,
      130,
      contentRoot,
      body,
    );

    expect(result.dropParent).toBe(section);
  });

  it("prefers the deepest structural container under the pointer", () => {
    const body = document.createElement("body");
    const contentRoot = document.createElement("main");

    const section = document.createElement("section");
    section.setAttribute("data-aria-id", "section-1");
    section.setAttribute("data-aria-type", "section");
    section.setAttribute("data-drop-zone", "");
    section.setAttribute("data-zone-id", "section-zone");

    const card = document.createElement("div");
    card.setAttribute("data-aria-id", "card-1");
    card.setAttribute("data-aria-type", "container");
    card.setAttribute("data-drop-zone", "");
    card.setAttribute("data-zone-id", "card-zone");

    const heading = document.createElement("h3");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "heading");

    card.appendChild(heading);
    section.appendChild(card);
    contentRoot.appendChild(section);
    body.appendChild(contentRoot);

    section.getBoundingClientRect = () => mockRect(50, 500, 0, 900);
    card.getBoundingClientRect = () => mockRect(250, 220, 80, 320);
    heading.getBoundingClientRect = () => mockRect(280, 40, 100, 220);

    const originalElementsFromPoint = document.elementsFromPoint;
    document.elementsFromPoint = () => [section, card, heading, contentRoot, body];

    try {
      const result = resolveInsertionTarget(
        section,
        140,
        300,
        contentRoot,
        body,
        document,
      );

      expect(result.dropParent).toBe(card);
      expect(result.dropParentId).toBe("card-zone");
    } finally {
      document.elementsFromPoint = originalElementsFromPoint;
    }
  });

  it("computes placeholder and target viewport rects", () => {
    const parent = mockFlexParent();
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.setAttribute("data-aria-id", "first");
    second.setAttribute("data-aria-id", "second");
    parent.appendChild(first);
    parent.appendChild(second);

    first.getBoundingClientRect = () => mockRect(100, 40, 20, 360);
    second.getBoundingClientRect = () => mockRect(200, 40, 20, 360);
    parent.getBoundingClientRect = () => mockRect(80, 200, 0, 400);

    const placeholder = computePlaceholderViewportRect(parent, [first, second], 1);
    expect(placeholder.top).toBe(168.5);
    expect(placeholder.left).toBe(20);
    expect(placeholder.width).toBe(360);
    expect(placeholder.height).toBe(3);

    const target = computeTargetViewportRect(parent);
    expect(target.left).toBe(20);
    expect(target.top).toBe(100);
    expect(target.width).toBe(360);
  });

  it("does not show a target outline while inserting between existing siblings", () => {
    const parent = mockFlexParent();
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.setAttribute("data-aria-id", "first");
    second.setAttribute("data-aria-id", "second");
    parent.appendChild(first);
    parent.appendChild(second);

    first.getBoundingClientRect = () => mockRect(100, 40, 20, 360);
    second.getBoundingClientRect = () => mockRect(200, 40, 20, 360);
    parent.getBoundingClientRect = () => mockRect(80, 200, 0, 400);

    const layout = computeAddElementsDropLayout(parent, 120, 150);

    expect(layout.insertionIndex).toBe(1);
    expect(layout.placeholder.top).toBe(168.5);
    expect(layout.target).toBeUndefined();
  });

  it("shows a target outline for empty containers", () => {
    const parent = mockFlexParent();
    parent.getBoundingClientRect = () => mockRect(80, 200, 20, 360);

    const layout = computeAddElementsDropLayout(parent, 120, 150);

    expect(layout.insertionIndex).toBe(0);
    expect(layout.target).toEqual({
      left: 20,
      top: 80,
      width: 360,
      height: 200,
    });
  });

  it("converts iframe-local viewport rects to iframe document rects without subtracting iframe offset", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);

    iframe.getBoundingClientRect = () => mockRect(20, 500, 240, 800);
    Object.defineProperty(iframe.contentWindow, "scrollX", {
      value: 13,
      configurable: true,
    });
    Object.defineProperty(iframe.contentWindow, "scrollY", {
      value: 17,
      configurable: true,
    });

    const documentRect = frameViewportRectToIframeDocument(
      { left: 20, top: 100, width: 360, height: 3 },
      iframe,
    );

    expect(documentRect.left).toBe(33);
    expect(documentRect.top).toBe(117);
    expect(documentRect.width).toBe(360);
    expect(documentRect.height).toBe(3);

    iframe.remove();
  });

  it("findInsertionParentElement returns nearest structural drop zone", () => {
    const body = document.createElement("body");
    const contentRoot = document.createElement("main");
    const section = document.createElement("section");
    section.setAttribute("data-drop-zone", "");
    section.setAttribute("data-aria-type", "section");
    const heading = document.createElement("h1");
    heading.setAttribute("data-aria-id", "h1");

    section.appendChild(heading);
    contentRoot.appendChild(section);
    body.appendChild(contentRoot);

    expect(findInsertionParentElement(heading, contentRoot, body)).toBe(
      section,
    );
  });
});
