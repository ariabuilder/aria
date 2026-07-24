import { afterEach, describe, expect, it } from "vitest";
import {
  ORGANIZER_DRAG_IDS_MIME,
  getOrganizerDropCommit,
  normalizeOrganizerDropTarget,
  parseOrganizerDragIds,
  resolveOrganizerDropTargetId,
  useStudioOrganizerDragState,
} from "../../../../admin/features/Studio/core/composables/useStudioOrganizerDragState";

describe("normalizeOrganizerDropTarget", () => {
  it("maps all-media targets to null", () => {
    expect(normalizeOrganizerDropTarget("__all__")).toBeNull();
    expect(normalizeOrganizerDropTarget(null)).toBeNull();
  });

  it("keeps concrete group ids", () => {
    expect(normalizeOrganizerDropTarget("grp-1")).toBe("grp-1");
  });
});

describe("resolveOrganizerDropTargetId", () => {
  it("resolves the nearest organizer drop target under the pointer", () => {
    const rail = document.createElement("aside");
    const target = document.createElement("button");
    target.dataset.organizerDropTarget = "grp-1";
    rail.appendChild(target);
    document.body.appendChild(rail);

    target.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 120,
        bottom: 40,
        width: 120,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    document.elementsFromPoint = () => [target];

    expect(resolveOrganizerDropTargetId({ clientX: 10, clientY: 10 })).toBe(
      "grp-1",
    );

    document.body.innerHTML = "";
  });
});

describe("getOrganizerDropCommit", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useStudioOrganizerDragState().endDrag();
  });

  it("returns dragged ids and target group when released over a folder", () => {
    const { startDrag } = useStudioOrganizerDragState();

    const rail = document.createElement("aside");
    rail.setAttribute("data-studio-organizer-rail", "");
    rail.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 400,
        width: 200,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const folder = document.createElement("button");
    folder.dataset.organizerDropTarget = "backgrounds";
    rail.appendChild(folder);
    document.body.appendChild(rail);

    document.elementsFromPoint = () => [folder];

    startDrag("hero.jpg", ["hero.jpg"]);

    expect(getOrganizerDropCommit(20, 40)).toEqual({
      itemIds: ["hero.jpg"],
      groupId: "backgrounds",
    });
  });
});

describe("parseOrganizerDragIds", () => {
  it("reads multi-select payload from organizer mime type", () => {
    const event = {
      dataTransfer: {
        getData: (type: string) =>
          type === ORGANIZER_DRAG_IDS_MIME
            ? JSON.stringify(["a.png", "b.png"])
            : "",
      },
    } as unknown as DragEvent;

    expect(parseOrganizerDragIds(event)).toEqual(["a.png", "b.png"]);
  });

  it("falls back to text/plain when multi-select payload is missing", () => {
    const event = {
      dataTransfer: {
        getData: (type: string) => (type === "text/plain" ? "hero.jpg" : ""),
      },
    } as unknown as DragEvent;

    expect(parseOrganizerDragIds(event)).toEqual(["hero.jpg"]);
  });

  it("returns an empty array when no drag payload exists", () => {
    const event = {
      dataTransfer: {
        getData: () => "",
      },
    } as unknown as DragEvent;

    expect(parseOrganizerDragIds(event)).toEqual([]);
  });

  it("falls back to in-memory drag ids when dataTransfer is empty on drop", () => {
    const { startDrag, endDrag } = useStudioOrganizerDragState();
    startDrag("hero.jpg", ["hero.jpg", "logo.png"]);

    const event = {
      dataTransfer: {
        getData: () => "",
      },
    } as unknown as DragEvent;

    expect(parseOrganizerDragIds(event)).toEqual(["hero.jpg", "logo.png"]);

    endDrag();
  });
});
