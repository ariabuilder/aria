import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { computeCanvasFitZoom } from "../../../admin/features/Stage/utils/canvasFitZoom";

describe("computeCanvasFitZoom", () => {
  it("returns 100 in natural mode", () => {
    expect(
      computeCanvasFitZoom({
        scaleMode: "natural",
        containerWidth: 900,
        fitTargetWidth: 2400,
      }),
    ).toBe(100);
  });

  it("fits 2400px artboard into 900px container", () => {
    expect(
      computeCanvasFitZoom({
        scaleMode: "fit",
        containerWidth: 900,
        fitTargetWidth: 2400,
      }),
    ).toBe(38);
  });

  it("fits 1440px artboard into 900px container", () => {
    expect(
      computeCanvasFitZoom({
        scaleMode: "fit",
        containerWidth: 900,
        fitTargetWidth: 1440,
      }),
    ).toBe(63);
  });

  it("returns 100 when artboard fits container", () => {
    expect(
      computeCanvasFitZoom({
        scaleMode: "fit",
        containerWidth: 900,
        fitTargetWidth: 768,
      }),
    ).toBe(100);
  });

  it("respects disableCanvasScaling", () => {
    expect(
      computeCanvasFitZoom({
        scaleMode: "fit",
        disableCanvasScaling: true,
        containerWidth: 900,
        fitTargetWidth: 2400,
      }),
    ).toBe(100);
  });
});

describe("useZoom scale mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to fit mode", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { scaleMode } = useZoom();
    expect(scaleMode.value).toBe("fit");
  });

  it("persists natural mode to localStorage", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, scaleMode, zoom } = useZoom();

    setScaleMode("natural");
    expect(scaleMode.value).toBe("natural");
    expect(zoom.value).toBe(100);
    expect(window.localStorage.getItem("aria-canvas-scale-mode")).toBe("natural");
  });

  it("bumps fitRequestId when fit mode is requested again", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, fitRequestId } = useZoom();

    const initial = fitRequestId.value;
    setScaleMode("fit");
    expect(fitRequestId.value).toBe(initial + 1);

    setScaleMode("fit");
    expect(fitRequestId.value).toBe(initial + 2);
  });

  it("zoomIn from fit mode preserves current zoom and steps up", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, setZoom, zoomIn, scaleMode, zoom } = useZoom();

    setScaleMode("fit");
    setZoom(58);

    zoomIn();

    expect(scaleMode.value).toBe("natural");
    expect(zoom.value).toBe(68);
  });

  it("toggleScaleMode from fit resets to actual size at 100%", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, setZoom, toggleScaleMode, scaleMode, zoom } = useZoom();

    setScaleMode("fit");
    setZoom(58);

    toggleScaleMode();

    expect(scaleMode.value).toBe("natural");
    expect(zoom.value).toBe(100);
  });

  it("selectZoomPreset from fit mode enters manual zoom at preset", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, setZoom, selectZoomPreset, scaleMode, zoom } = useZoom();

    setScaleMode("fit");
    setZoom(58);

    selectZoomPreset(125);

    expect(scaleMode.value).toBe("natural");
    expect(zoom.value).toBe(125);
  });

  it("zoomIn clamps at maximum zoom", async () => {
    const { useZoom } = await import("../../../admin/features/Stage/composables/useZoom");
    const { setScaleMode, setZoom, zoomIn, zoom } = useZoom();

    setScaleMode("natural");
    setZoom(195);

    zoomIn();

    expect(zoom.value).toBe(200);
  });
});
