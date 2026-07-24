/**
 * useCanvasSignalBridge tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasSignalBridge } from "@/features/Core/composables/useCanvasSignalBridge";

describe("useCanvasSignalBridge", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("broadcasts validated prop updates with the expected signal payload", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useCanvasSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasSignalBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.broadcastPropsUpdate({
      nodeId: "hero-title",
      props: { text: "Updated title" },
      source: "inspector-live",
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "update-props",
        payload: {
          nodeId: "hero-title",
          props: { text: "Updated title" },
          source: "inspector-live",
        },
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("accepts valid class update messages through the validated listener", async () => {
    const onClassUpdate = vi.fn();
    let bridge!: ReturnType<typeof useCanvasSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasSignalBridge();
        bridge.onClassUpdate(onClassUpdate);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "update-classes",
          payload: {
            nodeId: "hero-title",
            classNames: { base: ["text-4xl", "font-bold"] },
            customClasses: ["hero-shell"],
          },
        },
      }),
    );

    await nextTick();

    expect(onClassUpdate).toHaveBeenCalledTimes(1);
    expect(onClassUpdate).toHaveBeenCalledWith({
      nodeId: "hero-title",
      classNames: { base: ["text-4xl", "font-bold"] },
      customClasses: ["hero-shell"],
    });

    wrapper.unmount();
  });

  it("ignores invalid raw payloads before they reach bridge listeners", async () => {
    const onWrapperResponse = vi.fn();
    let bridge!: ReturnType<typeof useCanvasSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useCanvasSignalBridge();
        bridge.onComponentWrapperResponse(onWrapperResponse);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "component-wrapper-response",
          payload: {
            wrapperId: 42,
          },
        },
      }),
    );

    await nextTick();

    expect(onWrapperResponse).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    wrapper.unmount();
  });
});
