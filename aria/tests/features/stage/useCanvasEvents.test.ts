/**
 * useCanvasEvents tests
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import { ref, defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import { useCanvasEvents } from "@/features/Stage/events/useCanvasEvents";

describe("useCanvasEvents", () => {
  it("dispatches a paste event for the selected node on modifier+v", () => {
    const doc = document.implementation.createHTMLDocument("canvas");
    const target = doc.createElement("div");
    target.setAttribute("data-aria-id", "node-1");
    doc.body.appendChild(target);

    const iframeRef = ref({ contentDocument: doc } as HTMLIFrameElement | null);

    const pasteListener = vi.fn();
    window.addEventListener("component:paste", pasteListener);

    const TestComponent = defineComponent({
      setup() {
        const { setupEventListeners, selectNode } =
          useCanvasEvents(iframeRef);

        setupEventListeners();
        selectNode("node-1");

        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "v",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(pasteListener).toHaveBeenCalledTimes(1);
    const [event] = pasteListener.mock.calls[0] as [
      CustomEvent<{ nodeId: string }>,
    ];
    expect(event.detail.nodeId).toBe("node-1");

    wrapper.unmount();
    window.removeEventListener("component:paste", pasteListener);
  });
});
