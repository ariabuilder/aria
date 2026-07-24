/**
 * Tests fundamental undo/redo mechanics: - Execute operations and add to stack - Undo/redo state
 * changes - Stack truncation on new operations - Max size enforcement - Async.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useHistory } from "../../admin/features/History/composables/useHistory";
import type { Operation } from "../../admin/features/History/composables/useHistory";

const OperationSchema = z.object({
  type: z.string(),
  undo: z.function(),
  redo: z.function(),
  timestamp: z.number(),
  description: z.string().optional(),
  affectedNodeIds: z.array(z.string()).readonly().optional(),
});

const HistoryStateSchema = z.object({
  stackSize: z.int().nonnegative(),
  currentIndex: z.int(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  isOperationInProgress: z.boolean(),
  remainingCapacity: z.int().nonnegative(),
});

const ExecuteResultSchema = z.object({
  success: z.boolean(),
  error: z.instanceof(Error).optional(),
});

interface TestState {
  value: number;
}

function createTypedState(): TestState {
  return { value: 0 };
}

function createTypedOperation(
  state: TestState,
  oldValue: number,
  newValue: number,
  description?: string,
): Operation {
  const operation: Operation = {
    type: "update-node",
    undo: () => {
      state.value = oldValue;
    },
    redo: () => {
      state.value = newValue;
    },
    timestamp: Date.now(),
    description,
  };

  OperationSchema.parse(operation);

  return operation;
}

describe("History - Core Operations", () => {
  let history: ReturnType<typeof useHistory>;
  let state: TestState;

  beforeEach(() => {
    history = useHistory();
    history.clear();
    state = createTypedState();
  });

  afterEach(() => {
    history.clear();
  });

  describe("Execute Operations", () => {
    it("should execute operation and add to stack", async () => {
      const operation = createTypedOperation(state, 0, 5, "Set value to 5");

      state.value = 5;
      const result = await history.execute(operation);

      const validatedResult = ExecuteResultSchema.parse(result);
      expect(validatedResult.success).toBe(true);
      expect(validatedResult.error).toBeUndefined();

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBe(1);
      expect(historyState.currentIndex).toBe(0);
      expect(historyState.canUndo).toBe(true);
      expect(historyState.canRedo).toBe(false);
    });

    it("should handle multiple sequential operations", async () => {
      // Operation 1: 0 → 5
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));

      // Operation 2: 5 → 10
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));

      // Operation 3: 10 → 15
      state.value = 15;
      await history.execute(createTypedOperation(state, 10, 15));

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBe(3);
      expect(historyState.currentIndex).toBe(2);
      expect(state.value).toBe(15);
    });

    it("should execute async operations correctly", async () => {
      const asyncOperation: Operation = {
        type: "update-node",
        undo: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          state.value = 0;
        },
        redo: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          state.value = 100;
        },
        timestamp: Date.now(),
        description: "Async operation",
      };

      state.value = 100;
      const result = await history.execute(asyncOperation);

      expect(ExecuteResultSchema.parse(result).success).toBe(true);
      expect(state.value).toBe(100);
    });

    it("should reject malformed operation metadata before redo mutates state", async () => {
      const result = await history.execute({
        type: "update-node",
        undo: () => {
          state.value = 0;
        },
        redo: () => {
          state.value = 5;
        },
        timestamp: Date.now(),
        affectedNodeIds: ["", "node-1"],
      });

      expect(ExecuteResultSchema.parse(result).success).toBe(false);
      expect(state.value).toBe(0);
      expect(history.getState().stackSize).toBe(0);
      expect(history.lastFailure.value?.message).toBe(
        "Invalid operation payload",
      );
    });

    it("should ignore malformed history state requests", async () => {
      const postMessageSpy = vi.spyOn(window, "postMessage");

      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            source: "aria-composer",
            type: "history:request-state",
            payload: {
              unexpected: true,
            },
          },
        }),
      );

      expect(postMessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("Undo Operations", () => {
    it("should undo single operation correctly", async () => {
      // Setup: 0 → 5
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));

      expect(state.value).toBe(5);

      await history.undo();

      expect(state.value).toBe(0);

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canUndo).toBe(false);
      expect(historyState.canRedo).toBe(true);
      expect(historyState.currentIndex).toBe(-1);
    });

    it("should undo multiple operations in sequence", async () => {
      // Setup: 0 → 5 → 10 → 15
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));
      state.value = 15;
      await history.execute(createTypedOperation(state, 10, 15));

      expect(state.value).toBe(15);

      await history.undo(); // 15 → 10
      expect(state.value).toBe(10);

      await history.undo(); // 10 → 5
      expect(state.value).toBe(5);

      await history.undo(); // 5 → 0
      expect(state.value).toBe(0);

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canUndo).toBe(false);
      expect(historyState.canRedo).toBe(true);
    });

    it("should handle undo when history is empty", async () => {
      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canUndo).toBe(false);

      await history.undo();

      expect(state.value).toBe(0);
      expect(history.getState().stackSize).toBe(0);
    });

    it("should handle async undo operations", async () => {
      const asyncOp: Operation = {
        type: "update-node",
        undo: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          state.value = 0;
        },
        redo: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          state.value = 50;
        },
        timestamp: Date.now(),
      };

      state.value = 50;
      await history.execute(asyncOp);
      expect(state.value).toBe(50);

      await history.undo();
      expect(state.value).toBe(0);
    });
  });

  describe("Redo Operations", () => {
    it("should redo single operation correctly", async () => {
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      await history.undo();

      expect(state.value).toBe(0);

      await history.redo();

      expect(state.value).toBe(5);

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canUndo).toBe(true);
      expect(historyState.canRedo).toBe(false);
      expect(historyState.currentIndex).toBe(0);
    });

    it("should redo multiple operations in sequence", async () => {
      // Setup: 0 → 5 → 10 → 15
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));
      state.value = 15;
      await history.execute(createTypedOperation(state, 10, 15));

      await history.undo();
      await history.undo();
      await history.undo();
      expect(state.value).toBe(0);

      await history.redo(); // 0 → 5
      expect(state.value).toBe(5);

      await history.redo(); // 5 → 10
      expect(state.value).toBe(10);

      await history.redo(); // 10 → 15
      expect(state.value).toBe(15);

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canUndo).toBe(true);
      expect(historyState.canRedo).toBe(false);
    });

    it("should handle redo when no forward history", async () => {
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.canRedo).toBe(false);

      await history.redo();

      expect(state.value).toBe(5);
    });
  });

  describe("Stack Truncation", () => {
    it("should truncate forward history on new operation", async () => {
      // Create history: 0 → 5 → 10 → 15
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));
      state.value = 15;
      await history.execute(createTypedOperation(state, 10, 15));

      // Undo twice: back to 5
      await history.undo();
      await history.undo();
      expect(state.value).toBe(5);
      expect(history.getState().stackSize).toBe(3);
      expect(history.getState().canRedo).toBe(true);

      // New operation: should truncate forward history
      state.value = 20;
      await history.execute(createTypedOperation(state, 5, 20));

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBe(2); // Only 0→5 and 5→20
      expect(historyState.canRedo).toBe(false);
      expect(historyState.currentIndex).toBe(1);
    });
  });

  describe("Operation Grouping", () => {
    it("should preserve original undo state when grouped operations are merged", async () => {
      const groupingKey = "layers-reorder:test-page";
      const baseTimestamp = Date.now();

      state.value = 1;
      await history.execute({
        type: "reorder-nodes",
        undo: () => {
          state.value = 0;
        },
        redo: () => {
          state.value = 1;
        },
        timestamp: baseTimestamp,
        description: "Reordered layer",
        group: {
          key: groupingKey,
          windowMs: 900,
        },
      });

      state.value = 2;
      await history.execute({
        type: "reorder-nodes",
        undo: () => {
          state.value = 1;
        },
        redo: () => {
          state.value = 2;
        },
        timestamp: baseTimestamp + 100,
        description: "Reordered layer",
        group: {
          key: groupingKey,
          windowMs: 900,
        },
      });

      expect(history.getState().stackSize).toBe(1);
      expect(state.value).toBe(2);

      await history.undo();
      expect(state.value).toBe(0);

      await history.redo();
      expect(state.value).toBe(2);
    });
  });

  describe("Max Stack Size", () => {
    it("should enforce maximum stack size of 50", async () => {
      for (let i = 0; i < 60; i++) {
        state.value = i + 1;
        await history.execute(createTypedOperation(state, i, i + 1, `Op ${i}`));
      }

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBeLessThanOrEqual(50);
      expect(historyState.remainingCapacity).toBeGreaterThanOrEqual(0);

      // Should still be able to undo
      expect(historyState.canUndo).toBe(true);

      await history.undo();
      expect(state.value).toBe(59);
    });

    it("should drop oldest operations when exceeding limit", async () => {
      for (let i = 0; i < 51; i++) {
        state.value = i + 1;
        await history.execute(
          createTypedOperation(state, i, i + 1, `Operation ${i}`),
        );
      }

      const stats = history.getStats();
      expect(stats.totalOperations).toBeLessThanOrEqual(50);

      // The oldest operation should be gone, but we can still undo many times
      let undoCount = 0;
      while (history.canUndo.value && undoCount < 60) {
        await history.undo();
        undoCount++;
      }

      expect(undoCount).toBeLessThanOrEqual(50);
    });
  });

  describe("Clear History", () => {
    it("should clear all history", async () => {
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));

      expect(history.getState().stackSize).toBe(2);

      history.clear();

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBe(0);
      expect(historyState.currentIndex).toBe(-1);
      expect(historyState.canUndo).toBe(false);
      expect(historyState.canRedo).toBe(false);
    });
  });

  describe("History State Queries", () => {
    it("should provide accurate history statistics", async () => {
      for (let i = 0; i < 5; i++) {
        state.value = i + 1;
        await history.execute(createTypedOperation(state, i, i + 1));
      }

      const stats = history.getStats();

      expect(stats.totalOperations).toBe(5);
      expect(stats.currentPosition).toBe(4);
      expect(stats.forwardHistorySize).toBe(0);
      expect(stats.backwardHistorySize).toBe(5);
      expect(stats.oldestTimestamp).toBeTypeOf("number");
      expect(stats.newestTimestamp).toBeTypeOf("number");
      expect(stats.newestTimestamp!).toBeGreaterThanOrEqual(
        stats.oldestTimestamp!,
      );
    });

    it("should get operation at specific index", async () => {
      const op1 = createTypedOperation(state, 0, 5, "First");
      const op2 = createTypedOperation(state, 5, 10, "Second");
      const op3 = createTypedOperation(state, 10, 15, "Third");

      state.value = 5;
      await history.execute(op1);
      state.value = 10;
      await history.execute(op2);
      state.value = 15;
      await history.execute(op3);

      const retrieved = history.getOperationAt(1);
      expect(retrieved).toBeDefined();
      expect(retrieved?.description).toBe("Second");

      const outOfBounds = history.getOperationAt(10);
      expect(outOfBounds).toBeNull();
    });
  });

  describe("Undo/Redo Cycles", () => {
    it("should handle multiple undo/redo cycles correctly", async () => {
      // Setup: 0 → 5 → 10
      state.value = 5;
      await history.execute(createTypedOperation(state, 0, 5));
      state.value = 10;
      await history.execute(createTypedOperation(state, 5, 10));

      // Cycle 1: Undo → Redo
      await history.undo();
      expect(state.value).toBe(5);
      await history.redo();
      expect(state.value).toBe(10);

      // Cycle 2: Undo → Undo → Redo → Redo
      await history.undo();
      await history.undo();
      expect(state.value).toBe(0);
      await history.redo();
      await history.redo();
      expect(state.value).toBe(10);

      const historyState = HistoryStateSchema.parse(history.getState());
      expect(historyState.stackSize).toBe(2);
      expect(historyState.currentIndex).toBe(1);
    });
  });
});
