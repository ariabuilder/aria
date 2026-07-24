import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("useBeaconSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid composer beacon messages", async () => {
    const { parseComposerBeaconMessage } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const message = parseComposerBeaconMessage({
      source: "aria-composer",
      type: "select-node",
      payload: { nodeId: "node-1" },
    });

    expect(message).toEqual({
      source: "aria-composer",
      type: "select-node",
      payload: { nodeId: "node-1" },
    });
  });

  it("rejects invalid beacon channel payloads before they reach beacon state", async () => {
    const { parseBeaconChannelMessage } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const message = parseBeaconChannelMessage({
      type: "focus-request",
      payload: { nodeId: "", source: "layers" },
    });

    expect(message).toBeNull();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Beacon] Ignored invalid beacon channel message",
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });

  it("creates validated focus-request messages for Beacon channel dispatch", async () => {
    const { createFocusRequestMessage } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const message = createFocusRequestMessage({
      nodeId: "node-7",
      source: "layers",
    });

    expect(message).toEqual({
      type: "focus-request",
      payload: {
        nodeId: "node-7",
        source: "layers",
      },
    });
  });

  it("forwards only same-origin validated composer messages through the listener helper", async () => {
    const { addComposerBeaconMessageListener } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const handler = vi.fn();
    const cleanup = addComposerBeaconMessageListener(handler);

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

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "select-node",
          payload: { nodeId: "node-2" },
        },
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      source: "aria-composer",
      type: "select-node",
      payload: { nodeId: "node-2" },
    });

    cleanup();
  });

  it("dispatches and listens for validated node-focused custom events through helpers", async () => {
    const { addNodeFocusedListener, dispatchNodeFocusedEvent } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const handler = vi.fn();
    const cleanup = addNodeFocusedListener(handler);

    const dispatched = dispatchNodeFocusedEvent({
      nodeId: "node-7",
      path: [],
      source: "layers",
    });

    expect(dispatched).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      nodeId: "node-7",
      path: [],
      source: "layers",
    });

    cleanup();
  });

  it("forwards validated beacon channel messages through the listener helper", async () => {
    const { addBeaconChannelMessageListener } =
      await import("../../admin/features/Beacon/composables/useBeaconSignals");

    const listeners = new Set<(event: MessageEvent) => void>();
    const channel = {
      postMessage: vi.fn(),
      addEventListener: (
        _type: "message",
        listener: (event: MessageEvent) => void,
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _type: "message",
        listener: (event: MessageEvent) => void,
      ) => {
        listeners.delete(listener);
      },
      close: vi.fn(),
    };

    const handler = vi.fn();
    const cleanup = addBeaconChannelMessageListener(channel, handler);

    for (const listener of listeners) {
      listener(
        new MessageEvent("message", {
          data: {
            type: "focus-request",
            payload: {
              nodeId: "node-3",
              source: "keyboard",
            },
          },
        }),
      );
    }

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: "focus-request",
      payload: {
        nodeId: "node-3",
        source: "keyboard",
      },
    });

    cleanup();
    expect(listeners.size).toBe(0);
  });
});
