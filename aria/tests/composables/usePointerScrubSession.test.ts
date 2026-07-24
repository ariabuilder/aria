/**
 * @vitest-environment jsdom
 */

import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePointerScrubSession } from "../../admin/features/Inspector/composables/usePointerScrubSession";

describe("usePointerScrubSession", () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("does not call preventDefault on mousedown so inputs can receive focus", () => {
    const preventDefault = vi.fn();
    let start!: ReturnType<typeof usePointerScrubSession>["start"];

    const TestComponent = defineComponent({
      setup() {
        const scrubSession = usePointerScrubSession();
        start = scrubSession.start;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    const mousedownEvent = new MouseEvent("mousedown", {
      clientX: 10,
      clientY: 20,
    });
    mousedownEvent.preventDefault = preventDefault;

    start({
      event: mousedownEvent,
      onMove: vi.fn(),
    });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("calls preventDefault and blurs a focused input when scrubbing starts", () => {
    const preventDefault = vi.fn();
    let start!: ReturnType<typeof usePointerScrubSession>["start"];

    const TestComponent = defineComponent({
      setup() {
        const scrubSession = usePointerScrubSession();
        start = scrubSession.start;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    start({
      event: new MouseEvent("mousedown", { clientX: 10, clientY: 20 }),
      onMove: vi.fn(),
    });

    const mousemoveEvent = new MouseEvent("mousemove", {
      clientX: 14,
      clientY: 20,
    });
    mousemoveEvent.preventDefault = preventDefault;
    document.dispatchEvent(mousemoveEvent);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);

    document.body.removeChild(input);
  });

  it("waits for the threshold before starting and commits on mouseup", () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onCommit = vi.fn();
    const onCleanup = vi.fn();
    let start!: ReturnType<typeof usePointerScrubSession>["start"];

    const TestComponent = defineComponent({
      setup() {
        const scrubSession = usePointerScrubSession();
        start = scrubSession.start;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    start({
      event: new MouseEvent("mousedown", { clientX: 10, clientY: 20 }),
      onStart,
      onMove,
      onCommit,
      onCleanup,
    });

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 12, clientY: 20 }),
    );
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 14, clientY: 23 }),
    );

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({
        deltaX: 4,
        deltaY: 3,
      }),
    );
    expect(document.body.style.cursor).toBe("ew-resize");
    expect(document.body.style.userSelect).toBe("none");

    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 14, clientY: 23 }),
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("cancels an active scrub on Escape after movement", () => {
    const onMove = vi.fn();
    const onCancel = vi.fn();
    const onCommit = vi.fn();
    const onCleanup = vi.fn();
    let start!: ReturnType<typeof usePointerScrubSession>["start"];

    const TestComponent = defineComponent({
      setup() {
        const scrubSession = usePointerScrubSession();
        start = scrubSession.start;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    start({
      event: new MouseEvent("mousedown", { clientX: 30, clientY: 10 }),
      onMove,
      onCancel,
      onCommit,
      onCleanup,
    });

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 36, clientY: 10 }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("cancels any active scrub on unmount", () => {
    const onCleanup = vi.fn();
    let start!: ReturnType<typeof usePointerScrubSession>["start"];

    const TestComponent = defineComponent({
      setup() {
        const scrubSession = usePointerScrubSession();
        start = scrubSession.start;
        return () => h("div");
      },
    });

    wrapper = mount(TestComponent);

    start({
      event: new MouseEvent("mousedown", { clientX: 8, clientY: 8 }),
      onMove: vi.fn(),
      onCleanup,
    });

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 16, clientY: 8 }),
    );
    wrapper.unmount();
    wrapper = null;

    expect(onCleanup).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});
