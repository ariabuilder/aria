import { describe, expect, it } from "vitest";
import {
  resolveExportSelection,
  SITE_EXPORT_PRESETS,
} from "../../lib/export/selection";
import { SITE_EXPORT_SECTIONS } from "../../lib/export/cmsTypes";

describe("site export selection", () => {
  it("defaults to a full export when no selection is provided", () => {
    const resolved = resolveExportSelection(undefined);
    expect(resolved.preset).toBe("full");
    expect(resolved.mediaMode).toBe("bundle");
    for (const section of SITE_EXPORT_SECTIONS) {
      expect(resolved.sections[section]).toBe(true);
    }
  });

  it("applies dataOnly preset sections", () => {
    const resolved = resolveExportSelection({ preset: "dataOnly" });
    expect(resolved.sections.pages).toBe(false);
    expect(resolved.sections.cms).toBe(true);
    expect(resolved.sections.media).toBe(false);
    expect(resolved.mediaMode).toBe("omit");
  });

  it("allows custom section overrides on top of a preset", () => {
    const resolved = resolveExportSelection({
      preset: "codeOnly",
      sections: { discovery: false },
    });
    expect(resolved.sections.pages).toBe(true);
    expect(resolved.sections.cms).toBe(false);
    expect(resolved.sections.discovery).toBe(false);
  });

  it("exposes stable preset metadata", () => {
    expect(SITE_EXPORT_PRESETS.map((preset) => preset.id)).toEqual([
      "full",
      "dataOnly",
      "codeOnly",
      "mediaOnly",
    ]);
  });

  it("rejects exports with every section disabled", () => {
    const sections = Object.fromEntries(
      SITE_EXPORT_SECTIONS.map((section) => [section, false]),
    ) as Record<(typeof SITE_EXPORT_SECTIONS)[number], boolean>;

    expect(() =>
      resolveExportSelection({
        preset: "custom",
        sections,
      }),
    ).toThrow(/At least one export section must be enabled/);
  });
});
