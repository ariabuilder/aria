import { describe, expect, it } from "vitest";

import {
  inferIconPickerPackFromValue,
  resolveIconPickerPack,
} from "../../lib/icons/pickerSettings";

describe("icon picker settings", () => {
  it("prefers the configured default when it is enabled", () => {
    expect(
      resolveIconPickerPack(["lucide", "coreui-brands"], "lucide"),
    ).toBe("lucide");
  });

  it("falls back to the first enabled pack when the default is disabled", () => {
    expect(resolveIconPickerPack(["lucide"], "lucide")).toBe("lucide");
  });

  it("infers the pack from the current icon value when enabled", () => {
    expect(
      inferIconPickerPackFromValue("i-lucide:star", ["lucide", "coreui-brands"]),
    ).toBe("lucide");
  });

  it("ignores icon values from disabled packs", () => {
    expect(
      inferIconPickerPackFromValue("i-coreui-brands:github", ["lucide"]),
    ).toBeNull();
  });
});
