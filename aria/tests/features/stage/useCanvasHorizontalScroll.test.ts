import { describe, expect, it } from "vitest";
import {
  applyHorizontalWheelScroll,
  hasHorizontalScrollOverflow,
  isHorizontalDominantWheel,
  shouldCaptureHorizontalWheel,
  wheelEventToHorizontalInput,
} from "../../../admin/features/Stage/composables/useCanvasHorizontalScroll";
import { shouldCaptureWheelZoom } from "../../../admin/features/Stage/composables/useCanvasWheelZoom";

function createScrollElement(options: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft?: number;
}): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    get: () => options.scrollWidth,
  });
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    get: () => options.clientWidth,
  });
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    writable: true,
    value: options.scrollLeft ?? 0,
  });
  return element;
}

describe("useCanvasHorizontalScroll helpers", () => {
  it("detects horizontal overflow", () => {
    const withOverflow = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
    });
    const withoutOverflow = createScrollElement({
      scrollWidth: 800,
      clientWidth: 800,
    });

    expect(hasHorizontalScrollOverflow(withOverflow)).toBe(true);
    expect(hasHorizontalScrollOverflow(withoutOverflow)).toBe(false);
  });

  it("treats horizontal-dominant wheel input as horizontal", () => {
    expect(isHorizontalDominantWheel({ deltaX: 10, deltaY: 2 })).toBe(true);
    expect(isHorizontalDominantWheel({ deltaX: 2, deltaY: 10 })).toBe(false);
  });

  it("treats shift plus vertical wheel as horizontal", () => {
    expect(
      isHorizontalDominantWheel({ deltaX: 0, deltaY: 12, shiftKey: true }),
    ).toBe(true);

    expect(
      shouldCaptureHorizontalWheel(
        createScrollElement({ scrollWidth: 1200, clientWidth: 800 }),
        { deltaX: 0, deltaY: 12, shiftKey: true },
      ),
    ).toBe(true);

    const element = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
      scrollLeft: 100,
    });

    expect(
      applyHorizontalWheelScroll(element, {
        deltaX: 0,
        deltaY: 20,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(element.scrollLeft).toBe(120);
  });

  it("captures horizontal wheel when overflow exists", () => {
    const element = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
    });

    expect(
      shouldCaptureHorizontalWheel(element, { deltaX: 12, deltaY: 1 }),
    ).toBe(true);
  });

  it("does not capture vertical-dominant wheel", () => {
    const element = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
    });

    expect(
      shouldCaptureHorizontalWheel(element, { deltaX: 1, deltaY: 12 }),
    ).toBe(false);
  });

  it("does not capture when there is no horizontal overflow", () => {
    const element = createScrollElement({
      scrollWidth: 800,
      clientWidth: 800,
    });

    expect(
      shouldCaptureHorizontalWheel(element, { deltaX: 12, deltaY: 1 }),
    ).toBe(false);
  });

  it("does not capture pinch-zoom wheel events", () => {
    const element = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
    });

    expect(
      shouldCaptureHorizontalWheel(element, {
        deltaX: 12,
        deltaY: 1,
        ctrlKey: true,
      }),
    ).toBe(false);

    expect(
      shouldCaptureHorizontalWheel(element, {
        deltaX: 12,
        deltaY: 1,
        metaKey: true,
      }),
    ).toBe(false);
  });

  it("forwards iframe wheel input through the shared wheel capture helper", () => {
    const container = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
      scrollLeft: 40,
    });

    const captured = applyHorizontalWheelScroll(
      container,
      wheelEventToHorizontalInput({
        deltaX: 16,
        deltaY: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      } as WheelEvent),
    );

    expect(captured).toBe(true);
    expect(container.scrollLeft).toBe(56);
  });

  it("does not capture modifier zoom gestures for horizontal pan", () => {
    expect(
      shouldCaptureWheelZoom({
        deltaX: 0,
        deltaY: -12,
        ctrlKey: true,
        metaKey: false,
      } as WheelEvent),
    ).toBe(true);

    expect(
      shouldCaptureWheelZoom({
        deltaX: 24,
        deltaY: 0,
        ctrlKey: true,
        metaKey: false,
      } as WheelEvent),
    ).toBe(false);
  });

  it("scrolls horizontally and reports capture at scroll edges", () => {
    const element = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
      scrollLeft: 400,
    });

    expect(
      applyHorizontalWheelScroll(element, { deltaX: 20, deltaY: 0 }),
    ).toBe(true);
    expect(element.scrollLeft).toBe(420);

    const atLeftEdge = createScrollElement({
      scrollWidth: 1200,
      clientWidth: 800,
      scrollLeft: 0,
    });

    expect(
      applyHorizontalWheelScroll(atLeftEdge, { deltaX: -20, deltaY: 0 }),
    ).toBe(true);
    expect(atLeftEdge.scrollLeft).toBe(-20);
  });
});
