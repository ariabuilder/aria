/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStylePreviewQueue } from "../../admin/features/Inspector/composables/useStylePreviewQueue";

describe("useStylePreviewQueue", () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it("merges queued updates into a single preview frame", () => {
    const applyPreview = vi.fn();
    let queue!: ReturnType<
      typeof useStylePreviewQueue<
        Record<"fontSize" | "lineHeight", string | undefined>
      >
    >["queue"];
    let frameCallback: FrameRequestCallback | null = null;

    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });

    const TestComponent = defineComponent({
      setup() {
        const previewQueue = useStylePreviewQueue<
          Record<"fontSize" | "lineHeight", string | undefined>
        >({
          applyPreview,
        });

        queue = previewQueue.queue;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    queue({ fontSize: "24px" });
    queue({ lineHeight: "32px" });

    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(applyPreview).not.toHaveBeenCalled();

    (frameCallback as FrameRequestCallback | null)?.(0);

    expect(applyPreview).toHaveBeenCalledTimes(1);
    expect(applyPreview).toHaveBeenCalledWith({
      fontSize: "24px",
      lineHeight: "32px",
    });
  });

  it("restores immediately and cancels any queued frame", () => {
    const applyPreview = vi.fn();
    const onRestore = vi.fn();
    let queue!: ReturnType<
      typeof useStylePreviewQueue<Record<"fontSize", string | undefined>>
    >["queue"];
    let restore!: ReturnType<
      typeof useStylePreviewQueue<Record<"fontSize", string | undefined>>
    >["restore"];

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 7);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );

    const TestComponent = defineComponent({
      setup() {
        const previewQueue = useStylePreviewQueue<
          Record<"fontSize", string | undefined>
        >({
          applyPreview,
          onRestore,
        });

        queue = previewQueue.queue;
        restore = previewQueue.restore;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    queue({ fontSize: "24px" });
    restore({ fontSize: undefined });

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(applyPreview).toHaveBeenCalledTimes(1);
    expect(applyPreview).toHaveBeenCalledWith({ fontSize: undefined });
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("cancels pending preview work on unmount", () => {
    const applyPreview = vi.fn();
    let queue!: ReturnType<
      typeof useStylePreviewQueue<Record<"fontSize", string | undefined>>
    >["queue"];

    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 11);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );

    const TestComponent = defineComponent({
      setup() {
        const previewQueue = useStylePreviewQueue<
          Record<"fontSize", string | undefined>
        >({
          applyPreview,
        });

        queue = previewQueue.queue;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    queue({ fontSize: "24px" });
    wrapper.unmount();
    wrapper = null;

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(11);
    expect(applyPreview).not.toHaveBeenCalled();
  });
});
