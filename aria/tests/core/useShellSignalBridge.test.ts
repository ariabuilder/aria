/**
 * useShellSignalBridge tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useShellSignalBridge } from "@/features/Core/composables/useShellSignalBridge";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("useShellSignalBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("broadcasts open-add-elements with the expected message shape", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    bridge.broadcastOpenAddElements();

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "aria:open-add-elements",
        payload: {},
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("delivers valid open-add-elements messages through the typed listener", async () => {
    const onOpenAddElements = vi.fn();
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        bridge.onOpenAddElements(onOpenAddElements);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "aria:open-add-elements",
          payload: {},
        },
      }),
    );

    await nextTick();

    expect(onOpenAddElements).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it("delivers typed Agent canvas-build lifecycle signals", async () => {
    const onAgentCanvasBuild = vi.fn();
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        bridge.onAgentCanvasBuild(onAgentCanvasBuild);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "aria:agent-canvas-build",
          payload: {
            phase: "section-inserted",
            runId: "run-1",
            nodeIds: ["section-2"],
            sequence: 2,
          },
        },
      }),
    );
    await nextTick();

    expect(onAgentCanvasBuild).toHaveBeenCalledWith({
      phase: "section-inserted",
      runId: "run-1",
      nodeIds: ["section-2"],
      sequence: 2,
    });
    wrapper.unmount();
  });

  it("rejects invalid Agent canvas-build lifecycle payloads", async () => {
    const onAgentCanvasBuild = vi.fn();
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        bridge.onAgentCanvasBuild(onAgentCanvasBuild);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "aria:agent-canvas-build",
          payload: {
            phase: "section-inserted",
            runId: "run-1",
            nodeIds: [],
            sequence: 0,
          },
        },
      }),
    );
    await nextTick();

    expect(onAgentCanvasBuild).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useShellSignalBridge] Ignored invalid aria:agent-canvas-build payload",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
    wrapper.unmount();
  });

  it("delivers validated drop-component payloads through the typed listener", async () => {
    const onDropComponent = vi.fn();
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        bridge.onDropComponent(onDropComponent);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "drop-component",
          payload: {
            source: "sidebar",
            componentType: "component",
            componentData: { type: "Component" },
            componentSlug: "hero-card",
          },
        },
      }),
    );

    await nextTick();

    expect(onDropComponent).toHaveBeenCalledTimes(1);
    expect(onDropComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "sidebar",
        componentType: "component",
        componentData: { type: "Component" },
        componentSlug: "hero-card",
      }),
    );

    wrapper.unmount();
  });

  it("rejects invalid reorder-node payloads before listeners run", async () => {
    const onReorderNode = vi.fn();
    let bridge!: ReturnType<typeof useShellSignalBridge>;

    const TestComponent = defineComponent({
      setup() {
        bridge = useShellSignalBridge();
        bridge.onReorderNode(onReorderNode);
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "reorder-node",
          payload: {
            nodeId: "node-1",
            position: -1,
          },
        },
      }),
    );

    await nextTick();

    expect(onReorderNode).not.toHaveBeenCalled();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[useShellSignalBridge] Ignored invalid reorder-node payload",
      expect.objectContaining({ issues: expect.any(Array) }),
    );

    wrapper.unmount();
  });
});
