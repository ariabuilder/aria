/**
 * useCanvasInteractionBridge tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasInteractionBridge } from "@/features/Core/composables/useCanvasInteractionBridge";

describe("useCanvasInteractionBridge", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("broadcasts validated select-node payloads with the expected message shape", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.broadcastSelectNode({ nodeId: "hero-title" });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "select-node",
        payload: { nodeId: "hero-title" },
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("preserves selection gesture metadata on validated select-node payloads", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.broadcastSelectNode({
      nodeId: "hero-title",
      triggerGesture: {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      },
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "select-node",
        payload: {
          nodeId: "hero-title",
          triggerGesture: {
            metaKey: true,
            ctrlKey: false,
            shiftKey: false,
          },
        },
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("delivers valid hover-node messages through the validated listener", async () => {
    const onHoverNode = vi.fn();
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        bridge.onHoverNode(onHoverNode);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "hover-node",
          payload: { nodeId: "hero-title" },
        },
      }),
    );

    await nextTick();

    expect(onHoverNode).toHaveBeenCalledTimes(1);
    expect(onHoverNode).toHaveBeenCalledWith({ nodeId: "hero-title" });

    wrapper.unmount();
  });

  it("delivers validated scroll-to-node messages through the typed listener", async () => {
    const onScrollToNode = vi.fn();
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        bridge.onScrollToNode(onScrollToNode);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "scroll-to-node",
          payload: { nodeId: "hero-title" },
        },
      }),
    );

    await nextTick();

    expect(onScrollToNode).toHaveBeenCalledTimes(1);
    expect(onScrollToNode).toHaveBeenCalledWith({ nodeId: "hero-title" });

    wrapper.unmount();
  });

  it("delivers select-node gesture metadata through the typed listener", async () => {
    const onSelectNode = vi.fn();
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        bridge.onSelectNode(onSelectNode);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "select-node",
          payload: {
            nodeId: "hero-title",
            triggerGesture: {
              metaKey: false,
              ctrlKey: true,
              shiftKey: false,
            },
          },
        },
      }),
    );

    await nextTick();

    expect(onSelectNode).toHaveBeenCalledWith({
      nodeId: "hero-title",
      triggerGesture: {
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
      },
    });

    wrapper.unmount();
  });

  it("rejects invalid node lookup payloads before signaling", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.signalScrollToNode({ nodeId: "" });

    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("delivers validated clear-insertion-context messages through the typed listener", async () => {
    const onClearInsertionContext = vi.fn();
    let bridge!: ReturnType<typeof useCanvasInteractionBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasInteractionBridge();
        bridge.onClearInsertionContext(onClearInsertionContext);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "clear-insertion-context",
          payload: {},
        },
      }),
    );

    await nextTick();

    expect(onClearInsertionContext).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });
});
