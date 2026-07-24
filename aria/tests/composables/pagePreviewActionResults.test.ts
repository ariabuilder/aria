import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("pagePreviewActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed compose payloads", async () => {
    const { unwrapPagePreviewComposeResult } =
      await import("../../admin/features/Studio/pages/composables/pagePreviewActionResults");

    const result = unwrapPagePreviewComposeResult(
      {
        data: {
          pageMetadata: {
            settings: {
              cssVariables: {
                accent: "red",
              },
            },
          },
        },
        error: null,
      },
      "Failed to load page",
      {
        source: "PagePreviewFrame.loadPreview.compose",
      },
    );

    expect(result).toEqual({
      success: false,
      data: {
        pageBlocks: [],
        pageCssVariables: {},
      },
      error: "Failed to load page",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/PagePreview] Invalid compose response",
      expect.objectContaining({
        source: "PagePreviewFrame.loadPreview.compose",
        issues: expect.any(Array),
      }),
    );
  });

  it("falls back when settings payload is malformed", async () => {
    const { unwrapPagePreviewSettingsResult } =
      await import("../../admin/features/Studio/pages/composables/pagePreviewActionResults");

    const result = unwrapPagePreviewSettingsResult(
      {
        data: {
          success: true,
          data: {
            utilityEngine: 42,
          },
        },
        error: null,
      },
      "Failed to load preview settings",
      {
        source: "PagePreviewFrame.loadPreview.settings",
      },
    );

    expect(result).toEqual({
      success: false,
      data: null,
      error: "Failed to load preview settings",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/PagePreview] Invalid settings response",
      expect.objectContaining({
        source: "PagePreviewFrame.loadPreview.settings",
        error: expect.any(String),
      }),
    );
  });

  it("falls back when global css payload is malformed", async () => {
    const { unwrapPagePreviewRenderStylesResult } =
      await import("../../admin/features/Studio/pages/composables/pagePreviewActionResults");

    const result = unwrapPagePreviewRenderStylesResult(
      {
        data: {
          success: true,
          data: {
            cssSize: 128,
          },
        },
        error: null,
      },
      "Failed to load preview CSS",
      {
        source: "PagePreviewFrame.loadPreview.globalCss",
      },
    );

    expect(result).toEqual({
      success: false,
      data: {
        baseCSS: "",
        baseCSSHash: "",
        customClassesCSS: "",
        customFontsCSS: "",
        globalCSS: "",
        globalCSSHash: "",
        lastCompiled: "",
        styleRevision: "",
        utilityCSS: "",
        utilityCSSHash: "",
        utilityEngine: "custom",
      },
      error: "Failed to load preview CSS",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/PagePreview] Invalid render styles response",
      expect.objectContaining({
        source: "PagePreviewFrame.loadPreview.globalCss",
        issues: expect.any(Array),
      }),
    );
  });
});
