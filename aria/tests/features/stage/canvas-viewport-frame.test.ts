import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { computeArtboardLayout } from "../../../admin/features/Stage/utils/canvasArtboardLayout";

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    setup(_, { attrs, slots }) {
      return () => h("button", attrs, slots.default?.());
    },
  }),
}));

const FIXED_ARTBOARD_STYLE = {
  width: "1440px",
  maxWidth: "1440px",
} as const;

function stubResizeObserver(): void {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      disconnect(): void {}
    },
  );
}

async function mountCanvasViewportFrame(options: {
  scale: number;
  containerWidth: string;
}) {
  const CanvasViewportFrame = (
    await import("../../../admin/features/Stage/components/CanvasViewportFrame.vue")
  ).default;

  const host = document.createElement("div");
  host.style.width = options.containerWidth;
  host.style.height = "600px";
  document.body.appendChild(host);

  const wrapper = mount(CanvasViewportFrame, {
    attachTo: host,
    props: {
      isPreview: false,
      canvasStyle: FIXED_ARTBOARD_STYLE,
      scale: options.scale,
      hasInitialLoad: true,
      background: "rgb(12, 34, 56)",
      viewport: "desktop",
    },
  });

  const container = wrapper.element as HTMLElement;
  container.style.width = options.containerWidth;
  container.style.height = "600px";
  container.style.display = "block";

  const surface = wrapper.get('[data-aria-canvas-viewport-surface="true"]');
  const slot = surface.element.children[0] as HTMLElement;

  return { wrapper, host, container, surface, slot };
}

function cleanupMount(
  wrapper: VueWrapper<unknown>,
  host: HTMLElement,
): void {
  wrapper.unmount();
  host.remove();
}

function parseContainerWidthPx(containerWidth: string): number {
  return Number.parseInt(containerWidth, 10);
}

describe("CanvasViewportFrame", () => {
  beforeEach(() => {
    stubResizeObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the configured canvas background surface", async () => {
    const CanvasViewportFrame = (
      await import("../../../admin/features/Stage/components/CanvasViewportFrame.vue")
    ).default;

    const wrapper = mount(CanvasViewportFrame, {
      props: {
        isPreview: false,
        canvasStyle: {
          width: "100%",
          maxWidth: "none",
        },
        scale: 1,
        hasInitialLoad: true,
        background: "rgb(12, 34, 56)",
        viewport: "desktop",
      },
      slots: {
        default: '<div data-test="canvas-slot">Stage</div>',
      },
    });

    const surface = wrapper.get('[data-aria-canvas-viewport-surface="true"]');

    expect(surface.attributes("style")).toContain(
      "background: rgb(12, 34, 56)",
    );

    wrapper.unmount();
  });

  it("exposes horizontal scroll overflow at actual size when artboard is wider than the container", async () => {
    const containerWidth = "800px";
    const { wrapper, host, container, surface, slot } =
      await mountCanvasViewportFrame({
        scale: 1,
        containerWidth,
      });

    const layout = computeArtboardLayout(FIXED_ARTBOARD_STYLE, 1);

    expect(surface.attributes("style")).toContain("width: max-content");
    expect(surface.attributes("style")).toContain("min-width: 100%");
    expect(surface.classes()).toContain("shrink-0");
    expect(slot.style.width).toBe(`${layout.slotWidthPx}px`);
    expect(surface.classes()).not.toContain("overflow-hidden");
    expect(surface.classes()).not.toContain("w-full");
    expect(container.className).not.toContain("justify-center");
    expect(layout.slotWidthPx).toBeGreaterThan(
      parseContainerWidthPx(containerWidth),
    );
    expect(Number.parseInt(slot.style.width, 10)).toBeGreaterThan(
      container.clientWidth || parseContainerWidthPx(containerWidth),
    );

    cleanupMount(wrapper, host);
  });

  it("exposes horizontal scroll overflow when the artboard is zoomed in", async () => {
    const containerWidth = "800px";
    const scale = 1.25;
    const { wrapper, host, surface, slot } = await mountCanvasViewportFrame({
      scale,
      containerWidth,
    });

    const layout = computeArtboardLayout(FIXED_ARTBOARD_STYLE, scale);

    expect(slot.style.width).toBe(`${layout.slotWidthPx}px`);
    expect(layout.slotWidthPx).toBeGreaterThan(
      parseContainerWidthPx(containerWidth),
    );
    expect(surface.attributes("style")).toContain("width: max-content");

    cleanupMount(wrapper, host);
  });

  it("does not require horizontal scroll when the scaled artboard fits the container", async () => {
    const containerWidth = "800px";
    const scale = 0.5;
    const { wrapper, host, slot } = await mountCanvasViewportFrame({
      scale,
      containerWidth,
    });

    const layout = computeArtboardLayout(FIXED_ARTBOARD_STYLE, scale);

    expect(slot.style.width).toBe(`${layout.slotWidthPx}px`);
    expect(layout.slotWidthPx).toBeLessThanOrEqual(
      parseContainerWidthPx(containerWidth),
    );

    cleanupMount(wrapper, host);
  });

  it("compensates artboard height when fit-to-width scaling is active", async () => {
    const containerWidth = "800px";
    const scale = 0.5;
    const { wrapper, host, slot } = await mountCanvasViewportFrame({
      scale,
      containerWidth,
    });

    const layout = computeArtboardLayout(FIXED_ARTBOARD_STYLE, scale);
    const artboard = wrapper.get('[data-aria-canvas-artboard="true"]');

    expect(slot.style.height).toBe("100%");
    expect(artboard.attributes("style")).toContain(`height: ${100 / scale}%`);
    expect(layout.artboardStyle.height).toBe(`${100 / scale}%`);

    cleanupMount(wrapper, host);
  });
});
