import { describe, expect, it } from "vitest";

import {
  serializeFontFamilyList,
  serializeFontFamilyValue,
} from "../../lib/styles/fontFamily";

describe("fontFamily serialization", () => {
  it("quotes digit-leading custom family names", () => {
    expect(serializeFontFamilyValue("1903Sans-Bold")).toBe("'1903Sans-Bold'");
  });

  it("preserves valid fallback stacks while quoting only required names", () => {
    expect(
      serializeFontFamilyValue(
        "1903Sans-Bold, Helvetica Neue, Arial, sans-serif",
      ),
    ).toBe("'1903Sans-Bold', Helvetica Neue, Arial, sans-serif");
  });

  it("preserves CSS functions and fallbacks", () => {
    expect(serializeFontFamilyValue("var(--font-family-body, inherit)")).toBe(
      "var(--font-family-body, inherit)",
    );
  });

  it("serializes Uno font family arrays safely", () => {
    expect(
      serializeFontFamilyList(["1903Sans-Bold", "system-ui", "sans-serif"]),
    ).toEqual(["'1903Sans-Bold'", "system-ui", "sans-serif"]);
  });
});
