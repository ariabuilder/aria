import { describe, expect, it } from "vitest";

import {
  extractScrubNumericAndUnit,
  formatPropertySaveError,
  isScrubbableCssLength,
  isValidSpacingCssValue,
} from "../../admin/lib/cssLengthValues";

describe("cssLengthValues", () => {
  it("rejects malformed numeric and unit combinations", () => {
    expect(isValidSpacingCssValue("22calc")).toBe(false);
    expect(isScrubbableCssLength("22calc")).toBe(false);
    expect(extractScrubNumericAndUnit("22calc")).toBeNull();
  });

  it("accepts common spacing tokens", () => {
    expect(isValidSpacingCssValue("16px")).toBe(true);
    expect(isValidSpacingCssValue("var(--spacing-md)")).toBe(true);
    expect(isValidSpacingCssValue("calc(10px + 2px)")).toBe(true);
    expect(isValidSpacingCssValue("auto")).toBe(true);
  });

  it("extracts scrub parts only from simple lengths", () => {
    expect(extractScrubNumericAndUnit("22px")).toEqual({
      numeric: 22,
      unit: "px",
    });
    expect(extractScrubNumericAndUnit("calc(10px + 2px)")).toBeNull();
  });

  it("formats property save errors for display", () => {
    expect(
      formatPropertySaveError(
        "mutate:pages:test3 failed: Failed to save page: test3",
      ),
    ).toBe("Failed to save page: test3");
  });
});
