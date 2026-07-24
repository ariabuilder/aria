import { describe, expect, it } from "vitest";

import {
  getEntryFieldWidthClass,
  getEntryFieldWidthFraction,
  normalizeEntryFieldWidth,
} from "../../../admin/features/CMS/lib/entryFieldWidth";

describe("CMS entry field width", () => {
  it("defaults existing fields to full width", () => {
    expect(normalizeEntryFieldWidth(undefined)).toBe("full");
  });

  it("maps presets to their visible fractions and grid classes", () => {
    expect(getEntryFieldWidthFraction("half")).toBe("1/2");
    expect(getEntryFieldWidthFraction("third")).toBe("1/3");
    expect(getEntryFieldWidthFraction("quarter")).toBe("1/4");

    expect(getEntryFieldWidthClass("full")).toBe("entry-field-width-full");
    expect(getEntryFieldWidthClass("half")).toBe("entry-field-width-half");
    expect(getEntryFieldWidthClass("third")).toBe("entry-field-width-third");
    expect(getEntryFieldWidthClass("quarter")).toBe(
      "entry-field-width-quarter",
    );
  });
});
