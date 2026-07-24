import { describe, expect, it } from "vitest";

import { coerceStageEditingTabForItemType } from "../../../admin/features/Stage/composables/useStageEditingTabState";

describe("coerceStageEditingTabForItemType", () => {
  it("migrates legacy component and settings tabs to the agent workspace", () => {
    expect(coerceStageEditingTabForItemType("settings", "page")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("layers", "page")).toBe("layers");
    expect(coerceStageEditingTabForItemType("components", "page")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("settings", "component")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("components", "component")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("layers", "component")).toBe(
      "layers",
    );
    expect(coerceStageEditingTabForItemType("components", "layout")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("settings", "layout")).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("layers", "layout")).toBe("layers");
  });

  it("leaves tabs unchanged when item type is unknown", () => {
    expect(coerceStageEditingTabForItemType("components", undefined)).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("settings", undefined)).toBe(
      "agent",
    );
    expect(coerceStageEditingTabForItemType("agent", undefined)).toBe("agent");
  });
});
