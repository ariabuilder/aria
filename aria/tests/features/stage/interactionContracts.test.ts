import { describe, expect, it, vi, afterEach } from "vitest";
import {
  ChromeOverlayDescriptorSchema,
  FrameViewportRectSchema,
  VisualOverlayDescriptorSchema,
  createFrameViewportRect,
  createParentViewportPoint,
  frameViewportRectToIframeDocument,
  frameViewportRectToParentViewport,
  iframeEventToFrameViewport,
  measureElementFrameViewportRect,
  parentViewportToFrameViewport,
  type RectLike,
} from "../../../admin/features/Stage/interaction";

const frameRect: RectLike = {
  left: 240,
  top: 20,
  width: 800,
  height: 600,
  right: 1040,
  bottom: 620,
};

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Stage interaction geometry contracts", () => {
  it("converts parent viewport points inside the iframe to frame viewport points with scale", () => {
    const point = parentViewportToFrameViewport(
      createParentViewportPoint(300, 120),
      frameRect,
      2,
    );

    expect(point).toEqual({
      x: 30,
      y: 50,
      coordinateSpace: "frame-viewport",
    });
  });

  it("rejects parent viewport points outside the iframe", () => {
    const point = parentViewportToFrameViewport(
      createParentViewportPoint(100, 120),
      frameRect,
      1,
    );

    expect(point).toBeNull();
  });

  it("keeps iframe event points frame-local", () => {
    const point = iframeEventToFrameViewport(
      { x: 60, y: 100 },
      { width: 800, height: 600 },
    );

    expect(point).toEqual({
      x: 60,
      y: 100,
      coordinateSpace: "frame-viewport",
    });
  });

  it("rejects iframe event points outside the iframe viewport", () => {
    const point = iframeEventToFrameViewport(
      { x: 820, y: 100 },
      { width: 800, height: 600 },
    );

    expect(point).toBeNull();
  });

  it("projects frame viewport rects to iframe document rects by adding scroll only", () => {
    const rect = frameViewportRectToIframeDocument(
      createFrameViewportRect({ left: 20, top: 100, width: 360, height: 3 }),
      { scrollX: 13, scrollY: 17 },
    );

    expect(rect).toEqual({
      left: 33,
      top: 117,
      width: 360,
      height: 3,
      coordinateSpace: "iframe-document",
    });
  });

  it("projects frame viewport rects to parent viewport rects by applying scale and iframe offset", () => {
    const rect = frameViewportRectToParentViewport(
      createFrameViewportRect({ left: 20, top: 100, width: 360, height: 10 }),
      frameRect,
      2,
    );

    expect(rect).toEqual({
      left: 280,
      top: 220,
      width: 720,
      height: 20,
      coordinateSpace: "parent-viewport",
    });
  });

  it("measures element rects as frame viewport rects", () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => mockRect(100, 40, 20, 360);

    expect(measureElementFrameViewportRect(element)).toEqual({
      left: 20,
      top: 100,
      width: 360,
      height: 40,
      coordinateSpace: "frame-viewport",
    });
  });

  it("uses tight text rects for text elements when available", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Wrapped text";
    paragraph.getBoundingClientRect = () => mockRect(80, 80, 0, 500);

    vi.spyOn(document, "createRange").mockReturnValue({
      selectNodeContents: vi.fn(),
      getClientRects: () => [
        mockRect(100, 20, 24, 180),
        mockRect(124, 20, 24, 140),
      ],
    } as unknown as Range);

    expect(measureElementFrameViewportRect(paragraph)).toEqual({
      left: 24,
      top: 100,
      width: 180,
      height: 44,
      coordinateSpace: "frame-viewport",
    });
  });

  it("uses child bounds for full-width containers", () => {
    const container = document.createElement("div");
    const first = document.createElement("div");
    const second = document.createElement("div");
    container.appendChild(first);
    container.appendChild(second);

    container.getBoundingClientRect = () => mockRect(80, 300, 0, 900);
    first.getBoundingClientRect = () => mockRect(100, 40, 80, 320);
    second.getBoundingClientRect = () => mockRect(180, 40, 80, 320);

    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      width: "100%",
    } as CSSStyleDeclaration);

    expect(measureElementFrameViewportRect(container)).toEqual({
      left: 80,
      top: 80,
      width: 320,
      height: 300,
      coordinateSpace: "frame-viewport",
    });
  });
});

describe("Stage interaction overlay descriptor contracts", () => {
  const frameRectValue = createFrameViewportRect({
    left: 20,
    top: 30,
    width: 100,
    height: 40,
  });

  it("accepts visual descriptors with frame viewport rects", () => {
    const parsed = VisualOverlayDescriptorSchema.safeParse({
      kind: "selection",
      id: "selection",
      nodeId: "node-1",
      rect: frameRectValue,
      variant: "primary",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects visual descriptors with parent viewport rects", () => {
    const parsed = VisualOverlayDescriptorSchema.safeParse({
      kind: "selection",
      id: "selection",
      nodeId: "node-1",
      rect: frameViewportRectToParentViewport(frameRectValue, frameRect, 1),
      variant: "primary",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects descriptors carrying DOM refs", () => {
    const parsed = VisualOverlayDescriptorSchema.safeParse({
      kind: "hover",
      id: "hover",
      nodeId: "node-1",
      rect: frameRectValue,
      variant: "default",
      element: document.createElement("div"),
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts chrome descriptors with parent viewport anchors", () => {
    const parsed = ChromeOverlayDescriptorSchema.safeParse({
      kind: "selection-toolbar",
      id: "selection-toolbar",
      nodeId: "node-1",
      anchorRect: frameViewportRectToParentViewport(frameRectValue, frameRect, 1),
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects chrome descriptors with frame viewport anchors", () => {
    const parsed = ChromeOverlayDescriptorSchema.safeParse({
      kind: "selection-toolbar",
      id: "selection-toolbar",
      nodeId: "node-1",
      anchorRect: frameRectValue,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects raw unbranded frame rects at schema boundaries", () => {
    const parsed = FrameViewportRectSchema.safeParse({
      left: 20,
      top: 30,
      width: 100,
      height: 40,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts branded frame rects at schema boundaries", () => {
    expect(FrameViewportRectSchema.safeParse(frameRectValue).success).toBe(true);
  });

  it("creates stable insertion descriptors", () => {
    const parsed = VisualOverlayDescriptorSchema.safeParse({
      kind: "insertion",
      id: "library-gap",
      rect: frameRectValue,
      orientation: "horizontal",
      variant: "library",
    });

    expect(parsed.success).toBe(true);
  });
});
