/**
 * useCanvasOverlays tests
 *
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  broadcastHoverNode: vi.fn(),
  broadcastSelectNode: vi.fn(),
}));

vi.mock("../../admin/features/Core", () => ({
  useCanvasInteractionBridge: () => bridgeMocks,
}));

import { useCanvasOverlays } from "../../admin/composables/useCanvasOverlays";
import type { BuilderNode } from "../../lib/types/nodes";

describe("useCanvasOverlays", () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
  });

  it("measures component instance selections from rendered child bounds instead of the wrapper box", () => {
    const componentWrapper = document.createElement("div");
    componentWrapper.setAttribute("data-aria-id", "component-1");
    componentWrapper.setAttribute("data-aria-type", "Container");
    componentWrapper.setAttribute("data-component-ref", "hero-component");

    const renderedChild = document.createElement("button");
    renderedChild.textContent = "Primary";
    componentWrapper.appendChild(renderedChild);
    document.body.appendChild(componentWrapper);

    componentWrapper.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 200,
      width: 1200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    renderedChild.getBoundingClientRect = vi.fn(() => ({
      left: 160,
      top: 48,
      right: 520,
      bottom: 136,
      width: 360,
      height: 88,
      x: 160,
      y: 48,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        overlays = useCanvasOverlays();
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    overlays.showSelection(componentWrapper, "component-1", "Component", {
      emitSignal: false,
    });

    expect(overlays.selection.position).toEqual({
      left: 160,
      top: 48,
      width: 360,
      height: 88,
    });
    expect(overlays.selection.element).toBe(componentWrapper);
    expect(bridgeMocks.broadcastSelectNode).not.toHaveBeenCalled();
  });

  it("forwards selection gesture metadata when broadcasting semantic selection", () => {
    const block = document.createElement("div");
    block.setAttribute("data-aria-id", "node-1");
    block.setAttribute("data-aria-type", "Text");
    document.body.appendChild(block);

    block.getBoundingClientRect = vi.fn(() => ({
      left: 12,
      top: 24,
      right: 212,
      bottom: 72,
      width: 200,
      height: 48,
      x: 12,
      y: 24,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        overlays = useCanvasOverlays();
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    overlays.showSelection(block, "node-1", "Text", {
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    expect(bridgeMocks.broadcastSelectNode).toHaveBeenCalledWith({
      nodeId: "node-1",
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });
  });

  it("walks through transparent component wrapper chains to the visible content bounds", () => {
    const componentWrapper = document.createElement("div");
    componentWrapper.setAttribute("data-aria-id", "component-2");
    componentWrapper.setAttribute("data-aria-type", "Container");
    componentWrapper.setAttribute("data-component-ref", "button-variant");

    const sectionRoot = document.createElement("section");
    const innerContainer = document.createElement("div");
    const renderedButton = document.createElement("button");
    renderedButton.textContent = "Start free";

    innerContainer.appendChild(renderedButton);
    sectionRoot.appendChild(innerContainer);
    componentWrapper.appendChild(sectionRoot);
    document.body.appendChild(componentWrapper);

    componentWrapper.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 260,
      width: 1200,
      height: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    sectionRoot.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      right: 1200,
      bottom: 260,
      width: 1200,
      height: 260,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    innerContainer.getBoundingClientRect = vi.fn(() => ({
      left: 300,
      top: 52,
      right: 900,
      bottom: 208,
      width: 600,
      height: 156,
      x: 300,
      y: 52,
      toJSON: () => ({}),
    }));

    renderedButton.getBoundingClientRect = vi.fn(() => ({
      left: 420,
      top: 88,
      right: 780,
      bottom: 176,
      width: 360,
      height: 88,
      x: 420,
      y: 88,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        overlays = useCanvasOverlays();
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    overlays.showSelection(componentWrapper, "component-2", "Component", {
      emitSignal: false,
    });

    expect(overlays.selection.position).toEqual({
      left: 420,
      top: 88,
      width: 360,
      height: 88,
    });
  });

  it("keeps iframe selection overlays border-only without a fill tint", async () => {
    const iframe = document.createElement("iframe");
    const iframeDoc = document.implementation.createHTMLDocument("stage");

    Object.defineProperty(iframe, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });
    Object.defineProperty(iframe, "contentWindow", {
      value: iframeDoc.defaultView,
      configurable: true,
    });

    const TestComponent = defineComponent({
      setup() {
        const iframeRef = ref(iframe as HTMLIFrameElement | null);
        useCanvasOverlays({ iframeRef });
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await nextTick();

    const selectionOverlay = iframeDoc.querySelector(
      '[data-aria-selection-overlay="true"]',
    ) as HTMLElement | null;

    expect(selectionOverlay).not.toBeNull();
    expect(selectionOverlay?.style.border).toContain("2px");
    expect(selectionOverlay?.style.background).toMatch(
      /transparent|rgba\(0,\s*0,\s*0,\s*0\)/,
    );
  });

  it("maps document coordinates into a shifted iframe overlay root", async () => {
    const iframe = document.createElement("iframe");
    const iframeDoc = document.implementation.createHTMLDocument("stage");

    Object.defineProperty(iframe, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });
    Object.defineProperty(iframe, "contentWindow", {
      value: iframeDoc.defaultView,
      configurable: true,
    });

    const selected = iframeDoc.createElement("div");
    selected.setAttribute("data-aria-id", "shifted-node");
    selected.setAttribute("data-aria-type", "Container");
    iframeDoc.body.appendChild(selected);
    selected.getBoundingClientRect = vi.fn(() => ({
      left: 14,
      top: 79,
      right: 214,
      bottom: 179,
      width: 200,
      height: 100,
      x: 14,
      y: 79,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        const iframeRef = ref(iframe as HTMLIFrameElement | null);
        overlays = useCanvasOverlays({ iframeRef });
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await nextTick();

    const overlayRoot = iframeDoc.querySelector(
      "[data-aria-stage-overlay-root]",
    ) as HTMLElement;
    overlayRoot.getBoundingClientRect = vi.fn(() => ({
      left: 6,
      top: 21,
      right: 806,
      bottom: 621,
      width: 800,
      height: 600,
      x: 6,
      y: 21,
      toJSON: () => ({}),
    }));

    overlays.showSelection(selected, "shifted-node", "Container", {
      emitSignal: false,
    });

    expect(overlays.selection.position).toEqual({
      left: 14,
      top: 79,
      width: 200,
      height: 100,
    });

    const selectionOverlay = iframeDoc.querySelector(
      '[data-aria-selection-overlay="true"]',
    ) as HTMLElement;
    expect(selectionOverlay.style.transform).toBe("translate3d(8px, 58px, 0)");
  });

  it("renders secondary selection overlays for multi-select boxes", async () => {
    const iframe = document.createElement("iframe");
    const iframeDoc = document.implementation.createHTMLDocument("stage");

    Object.defineProperty(iframe, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });
    Object.defineProperty(iframe, "contentWindow", {
      value: iframeDoc.defaultView,
      configurable: true,
    });

    const first = iframeDoc.createElement("div");
    first.setAttribute("data-aria-id", "node-1");
    first.setAttribute("data-aria-type", "Text");
    iframeDoc.body.appendChild(first);

    const second = iframeDoc.createElement("div");
    second.setAttribute("data-aria-id", "node-2");
    second.setAttribute("data-aria-type", "Text");
    iframeDoc.body.appendChild(second);

    first.getBoundingClientRect = vi.fn(() => ({
      left: 12,
      top: 24,
      right: 112,
      bottom: 64,
      width: 100,
      height: 40,
      x: 12,
      y: 24,
      toJSON: () => ({}),
    }));

    second.getBoundingClientRect = vi.fn(() => ({
      left: 140,
      top: 60,
      right: 260,
      bottom: 120,
      width: 120,
      height: 60,
      x: 140,
      y: 60,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        const iframeRef = ref(iframe as HTMLIFrameElement | null);
        overlays = useCanvasOverlays({ iframeRef });
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await nextTick();

    overlays.showSecondarySelections([
      { element: first, nodeId: "node-1", nodeType: "Text" },
      { element: second, nodeId: "node-2", nodeType: "Text" },
    ]);

    expect(
      overlays.secondarySelections.map((selection) => selection.nodeId),
    ).toEqual(["node-1", "node-2"]);

    const secondaryOverlays = iframeDoc.querySelectorAll(
      '[data-aria-secondary-selection-overlay="true"]',
    );

    expect(secondaryOverlays).toHaveLength(2);
    expect((secondaryOverlays[0] as HTMLElement).style.display).toBe("block");
    expect((secondaryOverlays[1] as HTMLElement).style.display).toBe("block");
  });

  it("remeasures a selected CMS clone through data-aria-template-id after render rebuilds", async () => {
    const iframe = document.createElement("iframe");
    const iframeDoc = document.implementation.createHTMLDocument("stage");
    const blocks: BuilderNode[] = [
      {
        id: "card-node",
        type: "Container",
        props: {},
        styles: {},
        children: [],
      },
    ];

    Object.defineProperty(iframe, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });
    Object.defineProperty(iframe, "contentWindow", {
      value: iframeDoc.defaultView,
      configurable: true,
    });

    const firstClone = iframeDoc.createElement("section");
    firstClone.setAttribute("data-aria-id", "card-node__cms_0_entry-1");
    firstClone.setAttribute("data-aria-template-id", "card-node");
    firstClone.setAttribute("data-aria-type", "Container");
    iframeDoc.body.appendChild(firstClone);

    firstClone.getBoundingClientRect = vi.fn(() => ({
      left: 12,
      top: 24,
      right: 212,
      bottom: 124,
      width: 200,
      height: 100,
      x: 12,
      y: 24,
      toJSON: () => ({}),
    }));

    let overlays!: ReturnType<typeof useCanvasOverlays>;

    const TestComponent = defineComponent({
      setup() {
        const iframeRef = ref(iframe as HTMLIFrameElement | null);
        overlays = useCanvasOverlays({
          iframeRef,
          getBlocks: () => blocks,
        });
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);
    await nextTick();

    overlays.showSelection(firstClone, "card-node", "Container", {
      emitSignal: false,
    });

    expect(overlays.selection.visible).toBe(true);
    expect(overlays.selection.position).toEqual({
      left: 12,
      top: 24,
      width: 200,
      height: 100,
    });

    firstClone.remove();

    const replacementClone = iframeDoc.createElement("section");
    replacementClone.setAttribute("data-aria-id", "card-node__cms_1_entry-2");
    replacementClone.setAttribute("data-aria-template-id", "card-node");
    replacementClone.setAttribute("data-aria-type", "Container");
    iframeDoc.body.appendChild(replacementClone);

    replacementClone.getBoundingClientRect = vi.fn(() => ({
      left: 40,
      top: 64,
      right: 300,
      bottom: 204,
      width: 260,
      height: 140,
      x: 40,
      y: 64,
      toJSON: () => ({}),
    }));

    overlays.updateSelectionPosition();

    expect(overlays.selection.visible).toBe(true);
    expect(overlays.selection.element).toBe(replacementClone);
    expect(overlays.selection.position).toEqual({
      left: 40,
      top: 64,
      width: 260,
      height: 140,
    });
  });
});
