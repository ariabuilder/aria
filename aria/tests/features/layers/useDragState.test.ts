/**
 * Tests the useDragState composable for managing drag operation state.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";
import type { DragSource } from "../../../admin/features/Layers/types";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: vi.fn(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

import { useDragState } from "../../../admin/features/Layers/composables/useDragState";

describe("useDragState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    const {
      isDragging,
      draggedNodeType,
      draggedNodeId,
      sourceParentId,
      sourceIndex,
      dragSource,
      dragDuration,
      stats,
    } = useDragState();

    it("should not be dragging initially", () => {
      expect(isDragging.value).toBe(false);
    });

    it("should have null dragged node type initially", () => {
      expect(draggedNodeType.value).toBeNull();
    });

    it("should have null dragged node id initially", () => {
      expect(draggedNodeId.value).toBeNull();
    });

    it("should have null source parent id initially", () => {
      expect(sourceParentId.value).toBeNull();
    });

    it("should have null source index initially", () => {
      expect(sourceIndex.value).toBeNull();
    });

    it("should have null drag source initially", () => {
      expect(dragSource.value).toBeNull();
    });

    it("should have null drag duration initially", () => {
      expect(dragDuration.value).toBeNull();
    });

    it("should have zero statistics initially", () => {
      expect(stats.value.totalDrags).toBe(0);
      expect(stats.value.successfulDrops).toBe(0);
      expect(stats.value.cancelledDrags).toBe(0);
    });
  });

  describe("startDrag", () => {
    const {
      startDrag,
      isDragging,
      draggedNodeType,
      draggedNodeId,
      sourceParentId,
      sourceIndex,
      dragSource,
    } = useDragState();

    it("should start drag operation", () => {
      startDrag({
        nodeId: "test-node",
        nodeType: "Container",
        sourceParentId: "parent-1",
        sourceIndex: 2,
        source: "layers",
      });

      expect(isDragging.value).toBe(true);
      expect(draggedNodeType.value).toBe("Container");
      expect(draggedNodeId.value).toBe("test-node");
      expect(sourceParentId.value).toBe("parent-1");
      expect(sourceIndex.value).toBe(2);
      expect(dragSource.value).toBe("layers");
    });

    it("should track statistics when enabled", () => {
      const { startDrag: startWithStats, stats: statsWithTrack } = useDragState(
        { trackStats: true },
      );

      startWithStats({
        nodeId: "node-1",
        nodeType: "Text",
        sourceParentId: null,
        sourceIndex: 0,
        source: "add-elements",
      });

      expect(statsWithTrack.value.totalDrags).toBe(1);
    });

    it("should set drag start time", () => {
      const { startDrag, dragDuration } = useDragState();
      const before = Date.now();

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "components",
      });

      const after = Date.now();

      expect(dragDuration.value).not.toBeNull();
      expect(dragDuration.value!).toBeGreaterThanOrEqual(0);
      expect(dragDuration.value!).toBeLessThanOrEqual(after - before + 10);
    });
  });

  describe("endDrag", () => {
    it("should end drag with success=true", () => {
      const { startDrag, endDrag, isDragging, stats } = useDragState({
        trackStats: true,
      });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      endDrag(true);

      expect(isDragging.value).toBe(false);
      expect(stats.value.successfulDrops).toBe(1);
      expect(stats.value.cancelledDrags).toBe(0);
    });

    it("should end drag with success=false", () => {
      const { startDrag, endDrag, isDragging, stats } = useDragState({
        trackStats: true,
      });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      endDrag(false);

      expect(isDragging.value).toBe(false);
      expect(stats.value.successfulDrops).toBe(0);
      expect(stats.value.cancelledDrags).toBe(1);
    });

    it("should do nothing when not dragging", () => {
      const { endDrag, isDragging, stats } = useDragState({ trackStats: true });

      endDrag(true);

      expect(isDragging.value).toBe(false);
      expect(stats.value.totalDrags).toBe(0);
    });

    it("should update average drag duration", () => {
      const { startDrag, endDrag, stats } = useDragState({ trackStats: true });

      startDrag({
        nodeId: "test-1",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });
      // endDrag(true) immediately calculates duration

      endDrag(true);
      expect(stats.value.averageDragDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("cancelDrag", () => {
    it("should cancel drag operation", () => {
      const { startDrag, cancelDrag, isDragging, stats } = useDragState({
        trackStats: true,
      });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      cancelDrag();

      expect(isDragging.value).toBe(false);
      expect(stats.value.cancelledDrags).toBe(1);
    });
  });

  describe("clearDragState", () => {
    it("should clear all drag state", () => {
      const { startDrag, clearDragState, isDragging, draggedNodeId, stats } =
        useDragState({ trackStats: true });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      clearDragState();

      expect(isDragging.value).toBe(false);
      expect(draggedNodeId.value).toBeNull();
      expect(stats.value.totalDrags).toBe(1);
    });
  });

  describe("getDragState", () => {
    it("should return null when not dragging", () => {
      const { getDragState } = useDragState();
      expect(getDragState()).toBeNull();
    });

    it("should return drag state when dragging", () => {
      const { startDrag, getDragState } = useDragState();

      startDrag({
        nodeId: "test-id",
        nodeType: "Container",
        sourceParentId: "parent",
        sourceIndex: 3,
        source: "canvas",
      });

      const state = getDragState();
      expect(state).not.toBeNull();
      expect(state?.nodeId).toBe("test-id");
      expect(state?.source).toBe("canvas");
    });
  });

  describe("isNodeBeingDragged", () => {
    it("should return true for dragged node", () => {
      const { startDrag, isNodeBeingDragged } = useDragState();

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      expect(isNodeBeingDragged("test")).toBe(true);
    });

    it("should return false for non-dragged node", () => {
      const { startDrag, isNodeBeingDragged } = useDragState();

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      expect(isNodeBeingDragged("other")).toBe(false);
    });

    it("should return false when not dragging", () => {
      const { isNodeBeingDragged } = useDragState();
      expect(isNodeBeingDragged("test")).toBe(false);
    });
  });

  describe("resetStats", () => {
    it("should reset all statistics", () => {
      const { startDrag, endDrag, resetStats, stats } = useDragState({
        trackStats: true,
      });

      startDrag({
        nodeId: "test-1",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });
      endDrag(true);

      startDrag({
        nodeId: "test-2",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });
      endDrag(false);

      expect(stats.value.totalDrags).toBe(2);

      resetStats();

      expect(stats.value.totalDrags).toBe(0);
      expect(stats.value.successfulDrops).toBe(0);
      expect(stats.value.cancelledDrags).toBe(0);
    });
  });

  describe("drag source types", () => {
    it("should support all drag source types", () => {
      const { startDrag, dragSource } = useDragState();

      const sources: Exclude<DragSource, null>[] = [
        "add-elements",
        "components",
        "canvas",
        "layers",
      ];

      sources.forEach((source, index) => {
        startDrag({
          nodeId: `test-${index}`,
          nodeType: "Container",
          sourceParentId: null,
          sourceIndex: 0,
          source,
        });
        expect(dragSource.value).toBe(source);
      });
    });
  });

  describe("with debug mode", () => {
    it("should log when debug is enabled", () => {
      const { startDrag, endDrag, clearDragState, resetStats } = useDragState({
        debug: true,
      });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useDragState] Started drag"),
        expect.objectContaining({
          nodeId: "test",
          nodeType: "Container",
          source: "layers",
        }),
      );

      endDrag(true);
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useDragState] Ended drag"),
        expect.objectContaining({
          nodeId: "test",
          success: true,
        }),
      );

      startDrag({
        nodeId: "test2",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });
      clearDragState();
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useDragState] Cleared drag state"),
      );

      resetStats();
      expect(loggerMock).toHaveBeenCalledWith(
        "debug",
        expect.stringContaining("[useDragState] Reset statistics"),
      );
    });
  });

  describe("lastDragTime", () => {
    it("should update lastDragTime on drag end", () => {
      const { startDrag, endDrag, stats } = useDragState({ trackStats: true });

      startDrag({
        nodeId: "test",
        nodeType: "Container",
        sourceParentId: null,
        sourceIndex: 0,
        source: "layers",
      });

      const beforeEnd = Date.now();
      endDrag(true);
      const afterEnd = Date.now();

      expect(stats.value.lastDragTime).not.toBeNull();
      expect(stats.value.lastDragTime!).toBeGreaterThanOrEqual(beforeEnd);
      expect(stats.value.lastDragTime!).toBeLessThanOrEqual(afterEnd);
    });
  });
});
