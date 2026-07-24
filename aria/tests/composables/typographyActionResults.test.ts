import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("typographyActionResults", () => {
  it("rejects malformed font configuration payloads", async () => {
    const { FontConfigActionSuccessSchema, unwrapFontActionResult } =
      await import("../../admin/features/Design/composables/typographyActionResults");

    const result = unwrapFontActionResult(
      {
        data: {
          success: true,
          data: {
            customFonts: 42,
            enabledGoogleFonts: [],
          },
        },
        error: null,
      },
      FontConfigActionSuccessSchema,
      "Failed to load custom fonts",
      {
        source: "FontManager.loadCustomFonts",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load custom fonts",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Typography] Invalid font action response",
      expect.objectContaining({
        source: "FontManager.loadCustomFonts",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed uploaded-font success payloads", async () => {
    const { CustomFontActionSuccessSchema, unwrapFontActionResult } =
      await import("../../admin/features/Design/composables/typographyActionResults");

    const result = unwrapFontActionResult(
      {
        data: {
          success: true,
          font: {
            id: "custom-1",
            family: "Brand Sans",
          },
        },
        error: null,
      },
      CustomFontActionSuccessSchema,
      "Failed to upload font",
      {
        source: "FontManager.uploadFont",
        fileName: "brand-sans.woff2",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to upload font",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Typography] Invalid font action response",
      expect.objectContaining({
        source: "FontManager.uploadFont",
        fileName: "brand-sans.woff2",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded typography action failures from design-system responses", async () => {
    const {
      TypographySaveActionSuccessSchema,
      unwrapTypographyDesignSystemActionResult,
    } =
      await import("../../admin/features/Design/composables/typographyActionResults");

    const result = unwrapTypographyDesignSystemActionResult(
      {
        data: {
          success: false,
          error: {
            message: "Typography write failed",
          },
        },
        error: null,
      },
      TypographySaveActionSuccessSchema,
      "Failed to save typography",
      {
        source: "useTypography.saveTypography",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Typography write failed",
    });
  });
});
