import { beforeEach, describe, expect, it, vi } from "vitest";

function createTextNode(id: string, content: string) {
  return {
    id,
    type: "text",
    props: { content },
    styles: {},
    children: [],
  };
}

describe("useBeacon", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("updates beacon focus from validated select-node messages", async () => {
    const { useBeacon } =
      await import("../../admin/features/Beacon/composables/useBeacon");

    const beacon = useBeacon();
    const node = createTextNode("node-1", "Hello");

    beacon.dim();
    beacon.setRootNodes([node]);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "select-node",
          payload: { nodeId: "node-1" },
        },
      }),
    );

    expect(beacon.focusedNodeId.value).toBe("node-1");
    expect(beacon.focusedNode.value?.id).toBe("node-1");
    expect(beacon.focusedPath.value).toEqual([]);
  });

  it("toggles Beacon selection for additive select-node messages", async () => {
    const { useBeacon } =
      await import("../../admin/features/Beacon/composables/useBeacon");

    const beacon = useBeacon();
    const firstNode = createTextNode("node-1", "Hello");
    const secondNode = createTextNode("node-2", "World");

    beacon.dim();
    beacon.setRootNodes([firstNode, secondNode]);
    beacon.illuminateById("node-1", [firstNode, secondNode]);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "select-node",
          payload: {
            nodeId: "node-2",
            triggerGesture: {
              metaKey: true,
              ctrlKey: false,
              shiftKey: false,
            },
          },
        },
      }),
    );

    expect(beacon.selectedNodeIds.value).toEqual(["node-1", "node-2"]);
    expect(beacon.focusedNodeId.value).toBe("node-2");
  });

  it("ignores cross-origin composer messages before they reach beacon state", async () => {
    const { useBeacon } =
      await import("../../admin/features/Beacon/composables/useBeacon");

    const beacon = useBeacon();
    const node = createTextNode("node-1", "Hello");

    beacon.dim();
    beacon.setRootNodes([node]);

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://invalid.example",
        data: {
          source: "aria-composer",
          type: "select-node",
          payload: { nodeId: "node-1" },
        },
      }),
    );

    expect(beacon.focusedNodeId.value).toBeNull();
    expect(beacon.focusedNode.value).toBeNull();
  });

  it("ignores invalid aria:node-focused custom event payloads", async () => {
    const { onNodeFocused } =
      await import("../../admin/features/Beacon/composables/useBeacon");

    const handler = vi.fn();
    const cleanup = onNodeFocused(handler);

    window.dispatchEvent(
      new CustomEvent("aria:node-focused", {
        detail: { nodeId: "", source: "layers" },
      }),
    );

    expect(handler).not.toHaveBeenCalled();
    cleanup();
  });

  it("posts validated focus requests to the Beacon channel", async () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    class MockBroadcastChannel {
      static names: string[] = [];

      constructor(_name: string) {}

      postMessage = postMessage;
      close = close;
    }

    MockBroadcastChannel.names = [];
    const BroadcastChannelCtor = class extends MockBroadcastChannel {
      constructor(name: string) {
        super(name);
        MockBroadcastChannel.names.push(name);
      }
    };

    vi.stubGlobal(
      "BroadcastChannel",
      BroadcastChannelCtor as unknown as typeof BroadcastChannel,
    );

    const { requestFocus } =
      await import("../../admin/features/Beacon/composables/useBeacon");

    requestFocus("node-9", "inspector");

    expect(MockBroadcastChannel.names).toContain("aria-beacon");
    expect(postMessage).toHaveBeenCalledWith({
      type: "focus-request",
      payload: {
        nodeId: "node-9",
        source: "inspector",
      },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
