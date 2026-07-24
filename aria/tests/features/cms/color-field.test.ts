import { describe, expect, it } from "vitest";

import {
  isCmsColorField,
  isLegacyCmsColorField,
} from "../../../admin/features/CMS/lib/colorField";

describe("CMS color field detection", () => {
  it("treats explicit color fields as color fields", () => {
    expect(
      isCmsColorField({
        key: "swatch",
        label: "Swatch",
        type: "color",
      }),
    ).toBe(true);
  });

  it("upgrades legacy string fields with color-like names", () => {
    expect(
      isLegacyCmsColorField({
        key: "textColor",
        label: "Text Color",
        type: "string",
      }),
    ).toBe(true);
    expect(
      isLegacyCmsColorField({
        key: "background_color",
        label: "Background",
        type: "string",
      }),
    ).toBe(true);
    expect(
      isLegacyCmsColorField({
        key: "accent",
        label: "Accent",
        type: "text",
      }),
    ).toBe(true);
  });

  it("leaves ordinary text fields alone", () => {
    expect(
      isLegacyCmsColorField({
        key: "headline",
        label: "Headline",
        type: "string",
      }),
    ).toBe(false);
    expect(
      isLegacyCmsColorField({
        key: "body",
        label: "Text",
        type: "text",
      }),
    ).toBe(false);
    expect(
      isLegacyCmsColorField({
        key: "palette",
        label: "Palette",
        type: "select",
      }),
    ).toBe(false);
  });
});
