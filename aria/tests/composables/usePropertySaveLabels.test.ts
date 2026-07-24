import { describe, expect, it } from "vitest";

import {
  buildPropertyHistoryDescription,
  getHistoryPropertyGroupLabel,
} from "../../admin/features/Core/composables/usePropertySave";

describe("usePropertySave history labels", () => {
  it("maps raw style properties into section labels", () => {
    expect(getHistoryPropertyGroupLabel("display")).toBe("Visibility");
    expect(getHistoryPropertyGroupLabel("opacity")).toBe("Opacity");
    expect(getHistoryPropertyGroupLabel("ordered")).toBe("List");
    expect(getHistoryPropertyGroupLabel("fontSize")).toBe("Typography");
    expect(getHistoryPropertyGroupLabel("paddingTop")).toBe("Spacing");
    expect(getHistoryPropertyGroupLabel("width")).toBe("Size");
    expect(getHistoryPropertyGroupLabel("content")).toBe("Content");
  });

  it("builds grouped descriptions with friendly breakpoint labels", () => {
    expect(
      buildPropertyHistoryDescription({
        propertyNames: ["display"],
        breakpoint: "base",
        breakpointLabelMap: { base: "Desktop" },
      }),
    ).toBe("Visibility updated");

    expect(
      buildPropertyHistoryDescription({
        propertyNames: ["content", "level"],
      }),
    ).toBe("Content updated");

    expect(
      buildPropertyHistoryDescription({
        propertyNames: ["opacity"],
      }),
    ).toBe("Opacity updated");

    expect(
      buildPropertyHistoryDescription({
        propertyNames: ["ordered", "listStyleType"],
      }),
    ).toBe("List updated");
  });

  it("summarizes multi-section batch updates", () => {
    expect(
      buildPropertyHistoryDescription({
        propertyNames: ["fontSize", "padding", "borderRadius"],
        breakpoint: "tablet",
        breakpointLabelMap: { tablet: "Tablet" },
      }),
    ).toBe("Properties updated");
  });
});
