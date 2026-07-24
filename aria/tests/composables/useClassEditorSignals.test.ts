/**
 * useClassEditorSignals tests
 *
 * @vitest-environment jsdom
 */

import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClassEditorSignals } from "@/features/Inspector/composables/useClassEditorSignals";

describe("useClassEditorSignals", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("broadcasts validated class-editor payloads with the expected message shape", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let signals!: ReturnType<typeof useClassEditorSignals>;

    const TestComponent = defineComponent({
      setup() {
        signals = useClassEditorSignals();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    signals.broadcastCssUpdated({
      css: ".btn-primary { color: red; }",
      authoringMode: "semantic",
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      {
        source: "aria-composer",
        type: "class-editor:css-updated",
        payload: {
          css: ".btn-primary { color: red; }",
          authoringMode: "semantic",
        },
      },
      window.location.origin,
    );

    wrapper.unmount();
  });

  it("rejects invalid class-editor payloads before they are broadcast", () => {
    const postMessageSpy = vi.spyOn(window, "postMessage");
    let signals!: ReturnType<typeof useClassEditorSignals>;

    const TestComponent = defineComponent({
      setup() {
        signals = useClassEditorSignals();
        return () => h("div");
      },
    });

    const wrapper = mount(TestComponent);

    signals.broadcastNodeCustomClassAdded({
      collection: "pages",
      id: "home",
      nodeId: "hero-title",
      className: "bad class",
    });

    expect(postMessageSpy).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();

    wrapper.unmount();
  });
});
