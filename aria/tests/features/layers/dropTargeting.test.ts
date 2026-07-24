import { describe, expect, it } from "vitest";
import {
  didDragLeaveElement,
  resolveLayerDropPosition,
} from "../../../admin/features/Layers/utils/dropTargeting";

describe("layer drop targeting", () => {
  it("gives sibling insertion generous edge zones on a standard row", () => {
    const base = { top: 100, height: 40, allowInside: true };

    expect(resolveLayerDropPosition({ ...base, clientY: 111 })).toBe("before");
    expect(resolveLayerDropPosition({ ...base, clientY: 120 })).toBe("inside");
    expect(resolveLayerDropPosition({ ...base, clientY: 129 })).toBe("after");
  });

  it("splits leaf rows evenly between before and after", () => {
    const base = { top: 100, height: 40, allowInside: false };

    expect(resolveLayerDropPosition({ ...base, clientY: 119 })).toBe("before");
    expect(resolveLayerDropPosition({ ...base, clientY: 121 })).toBe("after");
  });

  it("does not treat movement into a row descendant as leaving the row", () => {
    const row = document.createElement("div");
    const child = document.createElement("span");
    row.appendChild(child);

    expect(
      didDragLeaveElement({ relatedTarget: child } as unknown as DragEvent, row),
    ).toBe(false);
    expect(
      didDragLeaveElement(
        { relatedTarget: document.body } as unknown as DragEvent,
        row,
      ),
    ).toBe(true);
  });
});
