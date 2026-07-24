import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useHistory } from "../../admin/features/History/composables/useHistory";
import { useHistoryControls } from "../../admin/features/History/composables/useHistoryControls";

describe("useHistoryControls", () => {
  const state = ref(0);
  const history = useHistory();

  beforeEach(() => {
    history.clear();
    state.value = 0;
  });

  afterEach(() => {
    history.clear();
    vi.restoreAllMocks();
  });

  it("delegates undo, redo, and jump-to through the shared history runtime", async () => {
    const controls = useHistoryControls();

    await history.execute({
      type: "update-node",
      timestamp: Date.now(),
      description: "Set state to 1",
      redo: () => {
        state.value = 1;
      },
      undo: () => {
        state.value = 0;
      },
    });

    await history.execute({
      type: "update-node",
      timestamp: Date.now(),
      description: "Set state to 2",
      redo: () => {
        state.value = 2;
      },
      undo: () => {
        state.value = 1;
      },
    });

    expect(state.value).toBe(2);

    await controls.handleUndo();
    expect(state.value).toBe(1);

    await controls.handleRedo();
    expect(state.value).toBe(2);

    await controls.handleJumpTo(0);
    expect(state.value).toBe(1);
  });

  it("clears the shared last-failure state", async () => {
    const controls = useHistoryControls();

    await history.execute({
      type: "update-node",
      timestamp: Date.now(),
      redo: () => {
        state.value = 1;
      },
      undo: () => {
        state.value = 0;
      },
      affectedNodeIds: [""],
    });

    expect(history.lastFailure.value?.message).toBe(
      "Invalid operation payload",
    );

    controls.clearFailure();

    expect(history.lastFailure.value).toBeNull();
  });
});
