import { describe, expect, it } from "vitest";
import {
  createSlotDragConfig,
  resolveDragListId,
} from "../../../admin/features/Layers/utils/dragConfig";
import type { LayerDragEvent } from "../../../admin/features/Layers/types";

describe("dragConfig", () => {
  describe("resolveDragListId", () => {
    it("returns a slot list id when dragging from a slot list", () => {
      const slotGroup = document.createElement("div");
      slotGroup.setAttribute("data-layer-slot-group", "");
      slotGroup.setAttribute("data-layer-slot-name", "header");

      const slotList = document.createElement("div");
      slotList.setAttribute("data-layer-slot-list", "");
      slotGroup.appendChild(slotList);

      const item = document.createElement("div");
      slotList.appendChild(item);
      document.body.appendChild(slotGroup);

      const event: LayerDragEvent = { item: item as HTMLElement & LayerDragEvent["item"] };
      expect(resolveDragListId(event)).toBe("slot:header");

      document.body.removeChild(slotGroup);
    });

    it("returns a children list id when dragging from a nested list", () => {
      const childrenList = document.createElement("div");
      childrenList.setAttribute("data-layer-children-list", "node-1");

      const item = document.createElement("div");
      childrenList.appendChild(item);
      document.body.appendChild(childrenList);

      const event: LayerDragEvent = { item: item as HTMLElement & LayerDragEvent["item"] };
      expect(resolveDragListId(event)).toBe("children:node-1");

      document.body.removeChild(childrenList);
    });

    it("prefers the nearest child list over its outer slot list", () => {
      const slotGroup = document.createElement("div");
      slotGroup.setAttribute("data-layer-slot-group", "");
      slotGroup.setAttribute("data-layer-slot-name", "main");
      const slotList = document.createElement("div");
      slotList.setAttribute("data-layer-slot-list", "");
      const childrenList = document.createElement("div");
      childrenList.setAttribute("data-layer-children-list", "parent-1");
      const item = document.createElement("div");
      childrenList.appendChild(item);
      slotList.appendChild(childrenList);
      slotGroup.appendChild(slotList);

      expect(resolveDragListId({ item } as LayerDragEvent)).toBe(
        "children:parent-1",
      );
    });
  });

  describe("createSlotDragConfig", () => {
    it("accepts empty slots without depending on reactive hover timing", () => {
      const config = createSlotDragConfig();

      expect(config.emptyInsertThreshold).toBe(18);
      expect(config.group.put).toBe(true);
    });

    it("allows puts into empty slots when the slot is the active drop target", () => {
      const config = createSlotDragConfig();

      expect(config.group.put).toBe(true);
    });

    it("allows puts into populated slots without checking drop targets", () => {
      const config = createSlotDragConfig();

      expect(config.group.put).toBe(true);
      expect(config.swapThreshold).toBe(0.65);
      expect(config.invertSwap).toBe(true);
    });
  });
});
