/**
 * Tests the useDropZones composable for visual drop target feedback.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useDropZones } from "../../../admin/features/Layers/composables/useDropZones";

describe("useDropZones", () => {
  describe("initial state", () => {
    const { dropTargetId, dropPosition, hasDropTarget, dropIndicatorClass } =
      useDropZones();

    it("should have null drop target initially", () => {
      expect(dropTargetId.value).toBeNull();
    });

    it("should have 'inside' as default position", () => {
      expect(dropPosition.value).toBe("inside");
    });

    it("should not have drop target initially", () => {
      expect(hasDropTarget.value).toBe(false);
    });

    it("should have empty indicator class initially", () => {
      expect(dropIndicatorClass.value).toBe("");
    });
  });

  describe("setDropTarget", () => {
    const {
      setDropTarget,
      dropTargetId,
      dropPosition,
      hasDropTarget,
      dropIndicatorClass,
    } = useDropZones();

    it("should set drop target", () => {
      setDropTarget("node-123", "before");

      expect(dropTargetId.value).toBe("node-123");
    });

    it("should set drop position", () => {
      setDropTarget("node-123", "after");

      expect(dropPosition.value).toBe("after");
    });

    it("should update hasDropTarget", () => {
      setDropTarget("node-123", "inside");

      expect(hasDropTarget.value).toBe(true);
    });

    it("should update indicator class for 'before'", () => {
      setDropTarget("node-123", "before");

      expect(dropIndicatorClass.value).toBe("drop-before");
    });

    it("should update indicator class for 'after'", () => {
      setDropTarget("node-123", "after");

      expect(dropIndicatorClass.value).toBe("drop-after");
    });

    it("should update indicator class for 'inside'", () => {
      setDropTarget("node-123", "inside");

      expect(dropIndicatorClass.value).toBe("drop-inside");
    });
  });

  describe("clearDropTarget", () => {
    const {
      setDropTarget,
      clearDropTarget,
      dropTargetId,
      dropPosition,
      hasDropTarget,
      dropIndicatorClass,
    } = useDropZones();

    beforeEach(() => {
      setDropTarget("node-123", "after");
    });

    it("should clear drop target", () => {
      clearDropTarget();

      expect(dropTargetId.value).toBeNull();
    });

    it("should reset position to 'inside'", () => {
      clearDropTarget();

      expect(dropPosition.value).toBe("inside");
    });

    it("should update hasDropTarget", () => {
      clearDropTarget();

      expect(hasDropTarget.value).toBe(false);
    });

    it("should clear indicator class", () => {
      clearDropTarget();

      expect(dropIndicatorClass.value).toBe("");
    });
  });

  describe("isDropTarget", () => {
    const { isDropTarget } = useDropZones();

    it("should return false when no drop target set", () => {
      expect(isDropTarget("node-123")).toBe(false);
    });
  });

  describe("getIndicatorClass", () => {
    const { getIndicatorClass } = useDropZones();

    it("should return empty string when no target", () => {
      expect(getIndicatorClass("node-123")).toBe("");
    });
  });

  describe("chained operations", () => {
    it("should support rapid target changes", () => {
      const { setDropTarget, dropTargetId, hasDropTarget } = useDropZones();

      setDropTarget("node-1", "before");
      expect(dropTargetId.value).toBe("node-1");
      expect(hasDropTarget.value).toBe(true);

      setDropTarget("node-2", "inside");
      expect(dropTargetId.value).toBe("node-2");

      setDropTarget("node-3", "after");
      expect(dropTargetId.value).toBe("node-3");
    });

    it("does not let a stale dragleave clear a newer target", async () => {
      const {
        setDropTarget,
        scheduleClearDropTarget,
        dropTargetId,
      } = useDropZones();

      setDropTarget("node-1", "before");
      scheduleClearDropTarget();
      setDropTarget("node-2", "inside");
      await Promise.resolve();

      expect(dropTargetId.value).toBe("node-2");
    });

    it("clears a target after a genuine deferred leave", async () => {
      const {
        setDropTarget,
        scheduleClearDropTarget,
        dropTargetId,
      } = useDropZones();

      setDropTarget("node-1", "before");
      scheduleClearDropTarget();
      await Promise.resolve();

      expect(dropTargetId.value).toBeNull();
    });
  });
});
