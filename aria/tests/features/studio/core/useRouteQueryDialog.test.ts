import { describe, expect, it } from "vitest";

import { SettingsTabSchema } from "../../../../admin/features/Studio/settings/schemas/settingsDialog";

describe("SettingsTabSchema", () => {
  it("accepts valid settings tabs", () => {
    const parsed = SettingsTabSchema.safeParse("appearance");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("appearance");
    }
    expect(SettingsTabSchema.safeParse("integrations").success).toBe(true);
  });

  it("rejects unknown settings tabs", () => {
    const parsed = SettingsTabSchema.safeParse("not-a-tab");
    expect(parsed.success).toBe(false);
  });
});

describe("RouteQueryOpenFlagSchema", () => {
  it("only accepts true literal", async () => {
    const { RouteQueryOpenFlagSchema } = await import(
      "../../../../admin/features/Studio/core/composables/useRouteQueryDialog"
    );
    expect(RouteQueryOpenFlagSchema.safeParse("true").success).toBe(true);
    expect(RouteQueryOpenFlagSchema.safeParse("false").success).toBe(false);
  });
});
