import { describe, expect, it } from "vitest";

import {
  buildCmsDateFormatOptions,
  formatCmsDateValue,
  isDateBindingFieldType,
  parseCmsDateValue,
  resolveCmsBindingFieldType,
} from "../../../lib/cms/dateBindingFormats";

const SAMPLE_ISO = "2026-07-07T17:13:01.028Z";

describe("dateBindingFormats", () => {
  it("detects date binding field types", () => {
    expect(isDateBindingFieldType("date")).toBe(true);
    expect(isDateBindingFieldType("datetime")).toBe(true);
    expect(isDateBindingFieldType("string")).toBe(false);
  });

  it("parses ISO and date-only strings", () => {
    expect(parseCmsDateValue(SAMPLE_ISO)?.toISOString()).toBe(SAMPLE_ISO);
    expect(parseCmsDateValue("2026-07-07")?.toISOString()).toBe(
      "2026-07-07T00:00:00.000Z",
    );
    expect(parseCmsDateValue("not-a-date")).toBeNull();
  });

  it("formats common presets from ISO values", () => {
    expect(formatCmsDateValue(SAMPLE_ISO, "medium")).toBe("July 7, 2026");
    expect(formatCmsDateValue(SAMPLE_ISO, "isoDate")).toBe("2026-07-07");
    expect(formatCmsDateValue(SAMPLE_ISO, "isoDateTime")).toBe(
      "2026-07-07 17:13",
    );
    expect(formatCmsDateValue(SAMPLE_ISO, "raw")).toBe(SAMPLE_ISO);
  });

  it("falls back safely for invalid values", () => {
    expect(formatCmsDateValue("not-a-date", "medium")).toBe("not-a-date");
    expect(formatCmsDateValue(null, "medium")).toBe("");
  });

  it("resolves bound field types from CMS field options", () => {
    const fieldOptions = [
      { path: "blog.publishedAt", type: "datetime" },
      { path: "blog.title", type: "system" },
    ];

    expect(resolveCmsBindingFieldType("blog.publishedAt", fieldOptions)).toBe(
      "datetime",
    );
    expect(resolveCmsBindingFieldType("blog.title", fieldOptions)).toBe(
      "system",
    );
  });

  it("infers date field types from binding paths when options are unavailable", () => {
    expect(resolveCmsBindingFieldType("blog.publishedAt", [])).toBe("datetime");
    expect(resolveCmsBindingFieldType("blog.publishedDate", [])).toBe("date");
  });

  it("builds labeled format options with examples", () => {
    const options = buildCmsDateFormatOptions();
    expect(options.length).toBeGreaterThan(10);
    expect(options.find((option) => option.id === "medium")?.example).toBe(
      "July 7, 2026",
    );
  });
});
