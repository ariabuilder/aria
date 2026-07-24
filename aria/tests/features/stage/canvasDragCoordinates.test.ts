import { describe, expect, it } from "vitest";
import {
  normalizeIframeDragPoint,
  normalizeParentDragPoint,
  type FrameBounds,
} from "../../../admin/features/Stage/dragdrop/canvasDragCoordinates";

const frameRect: FrameBounds = {
  left: 240,
  top: 20,
  right: 1040,
  bottom: 620,
  width: 800,
  height: 600,
};

describe("canvasDragCoordinates", () => {
  it("returns null for parent-window drag points outside the iframe", () => {
    const point = normalizeParentDragPoint({
      clientX: 120,
      clientY: 100,
      frameRect,
    });

    expect(point).toBeNull();
  });

  it("converts parent-window drag points inside the iframe to frame coordinates", () => {
    const point = normalizeParentDragPoint({
      clientX: 300,
      clientY: 120,
      frameRect,
    });

    expect(point).toEqual({
      frameX: 60,
      frameY: 100,
      worldX: 300,
      worldY: 120,
    });
  });

  it("accounts for iframe scale for parent-window drag points", () => {
    const point = normalizeParentDragPoint({
      clientX: 300,
      clientY: 120,
      frameRect,
      scale: 2,
    });

    expect(point).toEqual({
      frameX: 30,
      frameY: 50,
      worldX: 300,
      worldY: 120,
    });
  });

  it("keeps iframe drag points iframe-local and derives world coordinates", () => {
    const point = normalizeIframeDragPoint({
      clientX: 60,
      clientY: 100,
      frameRect,
      frameWidth: 800,
      frameHeight: 600,
    });

    expect(point).toEqual({
      frameX: 60,
      frameY: 100,
      worldX: 300,
      worldY: 120,
    });
  });

  it("returns null for iframe drag points outside the iframe viewport", () => {
    const point = normalizeIframeDragPoint({
      clientX: 810,
      clientY: 100,
      frameRect,
      frameWidth: 800,
      frameHeight: 600,
    });

    expect(point).toBeNull();
  });
});
