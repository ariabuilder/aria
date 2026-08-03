import { beforeEach, describe, expect, it } from "vitest";

import { useStageDisplayState } from "../../../admin/features/Stage/composables/useStageDisplayState";

const SELECTION_TOOLBAR_STORAGE_KEY = "aria-show-selection-toolbar";
const SELECTION_SIZING_STORAGE_KEY = "aria-show-selection-sizing";

describe("useStageDisplayState", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the selection toolbar by default", () => {
    const state = useStageDisplayState();

    expect(state.showSelectionToolbar.value).toBe(true);
  });

  it("shows selection sizing by default", () => {
    const state = useStageDisplayState();

    expect(state.showSelectionSizing.value).toBe(true);
  });

  it("persists a hidden selection sizing preference independently", () => {
    const state = useStageDisplayState();

    state.setShowSelectionSizing(false);

    expect(state.showSelectionSizing.value).toBe(false);
    expect(window.localStorage.getItem(SELECTION_SIZING_STORAGE_KEY)).toBe(
      "false",
    );
    expect(state.showSelectionToolbar.value).toBe(true);
    expect(useStageDisplayState().showSelectionSizing.value).toBe(false);
  });

  it("persists a hidden selection toolbar preference", () => {
    const state = useStageDisplayState();

    state.setShowSelectionToolbar(false);

    expect(state.showSelectionToolbar.value).toBe(false);
    expect(window.localStorage.getItem(SELECTION_TOOLBAR_STORAGE_KEY)).toBe(
      "false",
    );
    expect(useStageDisplayState().showSelectionToolbar.value).toBe(false);
  });

  it("restores the toolbar without changing other display options", () => {
    window.localStorage.setItem(SELECTION_TOOLBAR_STORAGE_KEY, "false");
    const state = useStageDisplayState();

    state.setShowOutlines(true);
    state.setShowSelectionSizing(false);
    state.setShowSelectionToolbar(true);

    expect(state.showSelectionToolbar.value).toBe(true);
    expect(state.showSelectionSizing.value).toBe(false);
    expect(state.showOutlines.value).toBe(true);
    expect(state.wireframeMode.value).toBe(false);
  });
});
