/**
 * Tests the Composer ↔ Stage communication composable including: - Signal sending (Composer →
 * Stage) - Signal receiving (Stage → Composer) - Origin validation - Message handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { useSignals } from "../../admin/composables/useSignals";

describe("useSignals", () => {
  let signals: ReturnType<typeof useSignals>;
  let mockIframe: HTMLIFrameElement;
  let wrapper: VueWrapper;

  beforeEach(() => {
    // Create a mock iframe
    mockIframe = document.createElement("iframe");
    document.body.appendChild(mockIframe);

    // Create a test component that uses the composable
    const TestComponent = defineComponent({
      setup() {
        signals = useSignals();
        return () => h("div");
      },
    });

    // Mount the component to trigger lifecycle hooks
    wrapper = mount(TestComponent);
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    document.body.removeChild(mockIframe);
    vi.restoreAllMocks();
  });

  describe("Signal sending", () => {
    it("should send a signal with type and payload", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      signals.signal("test-event", { data: "test" });

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "aria-composer",
          type: "test-event",
          payload: { data: "test" },
        },
        window.location.origin,
      );
    });

    it("should send a signal without payload", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      signals.signal("test-event");

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "aria-composer",
          type: "test-event",
          payload: undefined,
        },
        window.location.origin,
      );
    });

    it("should handle empty payload", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      signals.signal("test-event", {});

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "aria-composer",
          type: "test-event",
          payload: {},
        },
        window.location.origin,
      );
    });

    it("should handle complex payload objects", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      const complexPayload = {
        nested: {
          data: "value",
          array: [1, 2, 3],
        },
        number: 42,
        boolean: true,
      };

      signals.signal("test-event", complexPayload);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "aria-composer",
          type: "test-event",
          payload: complexPayload,
        },
        window.location.origin,
      );
    });

    it("should ignore blank signal types before posting", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      signals.signal("   ", { data: "test" });

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("Signal receiving", () => {
    it("should register a listener for a specific event", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      // Simulate receiving a message
      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "test-event",
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalledWith({ data: "test" });
    });

    it("should not call handler for different event types", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "other-event",
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should support multiple listeners for same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      signals.on("test-event", handler1);
      signals.on("test-event", handler2);

      // Send message to first handler
      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "test-event",
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler1).toHaveBeenCalledWith({ data: "test" });
      expect(handler2).toHaveBeenCalledWith({ data: "test" });
    });

    it("should support multiple different event listeners", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      signals.on("event-1", handler1);
      signals.on("event-2", handler2);

      // Send message to event1
      const messageEvent1 = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "event-1",
          payload: { data: "1" },
        },
        origin: window.location.origin,
      });

      // Send message to event2
      const messageEvent2 = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "event-2",
          payload: { data: "2" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent1);
      expect(handler1).toHaveBeenCalledWith({ data: "1" });
      expect(handler2).not.toHaveBeenCalled();

      window.dispatchEvent(messageEvent2);
      expect(handler2).toHaveBeenCalledWith({ data: "2" });
    });

    it("should handle events without payload", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "test-event",
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalledWith(undefined);
    });
  });

  describe("Message validation", () => {
    it("should ignore messages without type", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore non-object messages", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: "just a string",
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore null messages", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: null,
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should ignore messages whose type is blank after trimming", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "   ",
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should handle rapid signal sending", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      for (let i = 0; i < 100; i++) {
        signals.signal("test-event", { index: i });
      }

      expect(postMessageSpy).toHaveBeenCalledTimes(100);
    });

    it("should handle rapid event receiving", () => {
      const handler = vi.fn();

      signals.on("test-event", handler);

      for (let i = 0; i < 100; i++) {
        const messageEvent = new MessageEvent("message", {
          data: {
            source: "aria-composer",
            type: "test-event",
            payload: { count: i },
          },
          origin: window.location.origin,
        });
        window.dispatchEvent(messageEvent);
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it("should handle handler errors gracefully", () => {
      const errorHandler = vi.fn(() => {
        throw new Error("Handler error");
      });
      const goodHandler = vi.fn();

      signals.on("test-event", errorHandler);
      signals.on("test-event", goodHandler);

      // First handler should still be called
      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "test-event",
          payload: { data: "test" },
        },
        origin: window.location.origin,
      });

      expect(() => {
        window.dispatchEvent(messageEvent);
      }).not.toThrow();

      // Good handler should still be called even if error handler throws
      expect(goodHandler).toHaveBeenCalled();
    });

    it("should handle very large payloads", () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      const largePayload = {
        items: Array(1000).fill({ nested: "data", value: 123 }),
      };

      signals.signal("test-event", largePayload);

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          source: "aria-composer",
          type: "test-event",
          payload: largePayload,
        },
        window.location.origin,
      );
    });
  });

  describe("Common use cases", () => {
    it("should handle update-blocks signal", () => {
      const handler = vi.fn();

      signals.on("update-blocks", handler);

      const blocks = [
        { id: "1", type: "div", props: {}, children: [] },
        { id: "2", type: "span", props: {}, children: [] },
      ];

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "update-blocks",
          payload: { blocks },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalledWith({ blocks });
    });

    it("should handle node-selected signal", () => {
      const handler = vi.fn();

      signals.on("node-selected", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "node-selected",
          payload: { nodeId: "node-123" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalledWith({ nodeId: "node-123" });
    });

    it("should handle delete-block signal", () => {
      const handler = vi.fn();

      signals.on("delete-block", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "delete-block",
          payload: { nodeId: "node-456" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalledWith({ nodeId: "node-456" });
    });

    it("should handle canvas-ready signal", () => {
      const handler = vi.fn();

      signals.on("canvas-ready", handler);

      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "canvas-ready",
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(handler).toHaveBeenCalled();
    });
  });

  describe("Bidirectional communication", () => {
    it("should support Composer → Stage → Composer flow", () => {
      const responseHandler = vi.fn();

      signals.on("response", responseHandler);

      // Composer sends to Stage
      signals.signal("request", { data: "test" });

      // Simulate response from Stage
      const messageEvent = new MessageEvent("message", {
        data: {
          source: "aria-composer",
          type: "response",
          payload: { result: "success" },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(messageEvent);

      expect(responseHandler).toHaveBeenCalledWith({ result: "success" });
    });
  });
});
