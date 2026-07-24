import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropIntentSchema,
  createFrameViewportPoint,
  resolveLibraryDropIntent,
  resolveNodeMoveDropIntent,
} from "../../../admin/features/Stage/interaction";

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

function createStructuralElement(
  tagName: string,
  id: string,
  type = "Container",
): HTMLElement {
  const element = document.createElement(tagName);
  element.setAttribute("data-aria-id", id);
  element.setAttribute("data-aria-type", type);
  element.setAttribute("data-drop-zone", "true");
  element.setAttribute("data-zone-id", id);
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("drop resolver", () => {
  it("resolves library drops to a typed intent and visual descriptors", () => {
    const contentRoot = document.createElement("main");
    contentRoot.setAttribute("data-aria-stage-content-root", "");

    const section = createStructuralElement("section", "section-1", "Section");
    const card = createStructuralElement("div", "card-1", "Container");
    const heading = document.createElement("h2");
    heading.setAttribute("data-aria-id", "heading-1");
    heading.setAttribute("data-aria-type", "Heading");

    card.appendChild(heading);
    section.appendChild(card);
    contentRoot.appendChild(section);
    document.body.appendChild(contentRoot);

    section.getBoundingClientRect = () => mockRect(50, 500, 0, 900);
    card.getBoundingClientRect = () => mockRect(250, 220, 80, 320);
    heading.getBoundingClientRect = () => mockRect(280, 40, 100, 220);

    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [heading, card, section, contentRoot, document.body]),
      configurable: true,
    });
    Object.defineProperty(document, "elementFromPoint", {
      value: vi.fn(() => heading),
      configurable: true,
    });

    const result = resolveLibraryDropIntent({
      doc: document,
      point: createFrameViewportPoint(140, 300),
      contentRoot,
      body: document.body,
    });

    expect(result.dropParentId).toBe("card-1");
    expect(result.intent.parentId).toBe("card-1");
    expect(result.intent.index).toBe(1);
    expect(result.intent.visualRects?.insertion?.coordinateSpace).toBe(
      "frame-viewport",
    );
    expect(result.overlays[0]).toMatchObject({
      kind: "insertion",
      variant: "library",
    });
    expect(DropIntentSchema.safeParse(result.intent).success).toBe(true);
  });

  it("resolves node move drops to before/after intents", () => {
    const parent = createStructuralElement("section", "section-1", "Section");
    const source = document.createElement("div");
    source.setAttribute("data-aria-id", "source-1");
    const target = document.createElement("div");
    target.setAttribute("data-aria-id", "target-1");
    target.setAttribute("data-aria-type", "Container");

    parent.appendChild(source);
    parent.appendChild(target);
    document.body.appendChild(parent);

    target.getBoundingClientRect = () => mockRect(100, 40, 20, 360);

    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [target, parent, document.body]),
      configurable: true,
    });
    Object.defineProperty(document, "elementFromPoint", {
      value: vi.fn(() => target),
      configurable: true,
    });

    const intent = resolveNodeMoveDropIntent({
      doc: document,
      point: createFrameViewportPoint(80, 130),
      sourceNodeId: "source-1",
    });

    expect(intent).toMatchObject({
      kind: "move",
      source: "canvas",
      nodeId: "source-1",
      parentId: "section-1",
      targetNodeId: "target-1",
      index: 2,
      position: "after",
    });
    expect(intent?.visualRects?.insertion?.coordinateSpace).toBe(
      "frame-viewport",
    );
    expect(DropIntentSchema.safeParse(intent).success).toBe(true);
  });

  it("does not resolve node move drops onto the source node", () => {
    const source = document.createElement("div");
    source.setAttribute("data-aria-id", "source-1");
    document.body.appendChild(source);

    Object.defineProperty(document, "elementsFromPoint", {
      value: vi.fn(() => [source, document.body]),
      configurable: true,
    });
    Object.defineProperty(document, "elementFromPoint", {
      value: vi.fn(() => source),
      configurable: true,
    });

    const intent = resolveNodeMoveDropIntent({
      doc: document,
      point: createFrameViewportPoint(80, 130),
      sourceNodeId: "source-1",
    });

    expect(intent).toBeNull();
  });
});
