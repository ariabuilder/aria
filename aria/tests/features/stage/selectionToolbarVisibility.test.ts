import { describe, expect, it } from "vitest";

import { shouldHideSelectionToolbar } from "@/features/Stage/utils/selectionToolbarVisibility";

describe("selection toolbar visibility", () => {
  it.each(["add-elements", "components"] as const)(
    "hides during an active %s drag",
    (dragSource) => {
      expect(shouldHideSelectionToolbar(true, dragSource)).toBe(true);
    },
  );

  it.each(["add-elements", "components"] as const)(
    "does not stay hidden when stale %s metadata remains after the drag",
    (dragSource) => {
      expect(shouldHideSelectionToolbar(false, dragSource)).toBe(false);
    },
  );

  it("does not hide for canvas reordering", () => {
    expect(shouldHideSelectionToolbar(true, "canvas")).toBe(false);
  });

  it("does not hide without a drag source", () => {
    expect(shouldHideSelectionToolbar(false, null)).toBe(false);
  });
});
