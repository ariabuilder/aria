import { describe, expect, it } from "vitest";
import {
  AddElementsInsertionDetailSchema,
  CanvasDropDetailSchema,
} from "../../../admin/features/Nodes/events/shared/nodeEventSchemas";

describe("CanvasDropDetailSchema", () => {
  it("accepts canvas:drop detail with optional pointer coordinates", () => {
    const parsed = CanvasDropDetailSchema.safeParse({
      zone: { id: "node-parent" },
      data: { type: "text" },
      insertionIndex: 2,
      x: 120,
      y: 340,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.zone.id).toBe("node-parent");
      expect(parsed.data.insertionIndex).toBe(2);
      expect(parsed.data.x).toBe(120);
    }
  });

  it("rejects unknown keys on the detail object", () => {
    const parsed = CanvasDropDetailSchema.safeParse({
      zone: { id: "node-parent" },
      data: { type: "text" },
      insertionIndex: 0,
      unexpected: true,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("AddElementsInsertionDetailSchema", () => {
  it("accepts visible insertion feedback with viewport rects", () => {
    const parsed = AddElementsInsertionDetailSchema.safeParse({
      visible: true,
      dropParentId: "zone-section",
      insertionIndex: 1,
      gapViewport: { left: 10, top: 20, width: 300, height: 6 },
      targetViewport: { left: 0, top: 0, width: 400, height: 200 },
      orientation: "vertical",
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts hidden feedback with zero rects", () => {
    const parsed = AddElementsInsertionDetailSchema.safeParse({
      visible: false,
      dropParentId: "__aria-root__",
      insertionIndex: 0,
      gapViewport: { left: 0, top: 0, width: 0, height: 0 },
    });

    expect(parsed.success).toBe(true);
  });
});
