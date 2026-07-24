import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("blockConversionActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed existing component payloads during slug checks", async () => {
    const { resolveBlockConversionSlugCheckResult } =
      await import("../../admin/composables/blockConversionActionResults");

    const result = resolveBlockConversionSlugCheckResult(
      {
        data: {
          id: "hero-banner",
          name: "Hero Banner",
        },
        error: null,
      },
      "Failed to verify existing component slug",
      {
        source: "useBlockData.generateUniqueSlug",
      },
    );

    expect(result).toEqual({
      status: "invalid",
      error: "Failed to verify existing component slug",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Admin/BlockConversion] Invalid component payload from getItem",
      expect.objectContaining({
        source: "useBlockData.generateUniqueSlug",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces malformed createItem success payloads as failures", async () => {
    const { unwrapBlockConversionCreateResult } =
      await import("../../admin/composables/blockConversionActionResults");

    const result = unwrapBlockConversionCreateResult(
      {
        data: {
          success: true,
        },
        error: null,
      },
      "Failed to save component",
      {
        source: "useBlockData.convertNodesToComponent",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to save component",
    });
  });
});
