/**
 * useStageSignalBridge tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStageSignalBridge } from "@/features/Core/composables/useStageSignalBridge";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("useStageSignalBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("signals validated convert-component payloads with the expected message shape", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useStageSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useStageSignalBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.signalConvertComponent("hero-title");

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "convert-component",
        payload: "hero-title",
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("delivers validated add-block messages through the typed listener", async () => {
    const onAddBlock = vi.fn();
    let bridge!: ReturnType<typeof useStageSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useStageSignalBridge();
        bridge.onAddBlock(onAddBlock);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "add-block",
          payload: {
            block: {
              id: "node-1",
              type: "section",
            },
            parentId: null,
          },
        },
      }),
    );

    await nextTick();

    expect(onAddBlock).toHaveBeenCalledTimes(1);
    expect(onAddBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ id: "node-1", type: "section" }),
        parentId: null,
      }),
    );

    wrapper.unmount();
  });

  it("rejects invalid uno-config payloads before signaling", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useStageSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useStageSignalBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.signalUnoConfigChanged({
      configJSON: "",
      timestamp: Date.now(),
    });

    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useStageSignalBridge] Ignored invalid uno-config-changed payload",
      expect.objectContaining({ issues: expect.any(Array) }),
    );

    wrapper.unmount();
  });
});
