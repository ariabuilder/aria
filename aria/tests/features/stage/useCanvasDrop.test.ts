import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanvasDrop } from "../../../admin/features/Stage/dragdrop/useCanvasDrop";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function dragEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    dataTransfer: {
      value: { dropEffect: "none" },
    },
  });
  return event;
}

function setupCanvas() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  iframe.getBoundingClientRect = () => rect(0, 0, 600, 500);
  Object.defineProperty(iframe, "clientWidth", { value: 600 });
  Object.defineProperty(iframe, "clientHeight", { value: 500 });

  const frameDocument = iframe.contentDocument!;
  const contentRoot = frameDocument.createElement("main");
  contentRoot.setAttribute("data-aria-stage-content-root", "");
  const parent = frameDocument.createElement("section");
  parent.setAttribute("data-drop-zone", "");
  parent.setAttribute("data-aria-id", "section-1");
  parent.setAttribute("data-zone-id", "section-1");
  parent.setAttribute("data-aria-type", "section");
  parent.getBoundingClientRect = () => rect(0, 0, 600, 400);
  const first = frameDocument.createElement("div");
  first.setAttribute("data-aria-id", "first");
  first.getBoundingClientRect = () => rect(0, 20, 600, 80);
  const second = frameDocument.createElement("div");
  second.setAttribute("data-aria-id", "second");
  second.getBoundingClientRect = () => rect(0, 140, 600, 80);
  parent.append(first, second);
  contentRoot.appendChild(parent);
  frameDocument.body.appendChild(contentRoot);
  frameDocument.elementsFromPoint = () => [
    parent,
    contentRoot,
    frameDocument.body,
  ];
  frameDocument.elementFromPoint = () => parent;

  return { iframe, frameDocument };
}

describe("useCanvasDrop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("coalesces feedback to the latest pointer and resolves drop synchronously once", () => {
    const { iframe } = setupCanvas();
    const animationFrames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = nextFrame++;
      animationFrames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      animationFrames.delete(id);
    });
    const insertions: Array<{ visible: boolean; insertionIndex: number }> = [];
    const drops: Array<{ insertionIndex: number }> = [];
    window.addEventListener("canvas:add-elements-insertion", (event) => {
      insertions.push(
        (event as CustomEvent<{ visible: boolean; insertionIndex: number }>)
          .detail,
      );
    });
    window.addEventListener("canvas:drop", (event) => {
      drops.push((event as CustomEvent<{ insertionIndex: number }>).detail);
    });

    const canvasDrop = useCanvasDrop(ref(iframe));
    canvasDrop.startDrag({ type: "Container" });
    window.dispatchEvent(dragEvent("dragover", 100, 30));
    window.dispatchEvent(dragEvent("dragover", 100, 190));

    expect(insertions).toEqual([]);
    const feedback = [...animationFrames.values()][0];
    expect(feedback).toBeDefined();
    feedback!(performance.now());
    expect(insertions.at(-1)).toMatchObject({
      visible: true,
      insertionIndex: 2,
    });

    window.dispatchEvent(dragEvent("drop", 100, 70));
    window.dispatchEvent(dragEvent("drop", 100, 70));
    expect(drops).toHaveLength(1);
    expect(drops[0]).toEqual(expect.objectContaining({ insertionIndex: 1 }));
    expect(canvasDrop.isDragging.value).toBe(false);
  });

  it("treats dragend, Escape, malformed payloads, and canvas exit as cleanup", () => {
    const { iframe } = setupCanvas();
    const drops: unknown[] = [];
    window.addEventListener("canvas:drop", (event) => {
      drops.push((event as CustomEvent).detail);
    });
    const canvasDrop = useCanvasDrop(ref(iframe));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    canvasDrop.startDrag({ type: "Container" });
    window.dispatchEvent(dragEvent("dragend", 100, 100));
    expect(drops).toEqual([]);

    canvasDrop.startDrag({ type: "Container" });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(drops).toEqual([]);

    canvasDrop.startDrag({ type: "" });
    expect(canvasDrop.isDragging.value).toBe(false);

    canvasDrop.startDrag({ type: "Container" });
    window.dispatchEvent(dragEvent("dragleave", 0, 100));
    expect(canvasDrop.isDragging.value).toBe(false);
    expect(drops).toEqual([]);
  });
});
