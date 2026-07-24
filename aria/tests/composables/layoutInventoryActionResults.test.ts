import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("layoutInventoryActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed init layout payloads", async () => {
    const { unwrapLayoutInventoryActionResult } =
      await import("../../admin/composables/layoutInventoryActionResults");

    const result = unwrapLayoutInventoryActionResult(
      {
        data: {
          layouts: {},
        },
        error: null,
      },
      "Failed to load layouts",
      {
        source: "PageSettingsPanel.fetchLayouts",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load layouts",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Admin] Invalid init layout inventory response",
      expect.objectContaining({
        source: "PageSettingsPanel.fetchLayouts",
        issues: expect.any(Array),
      }),
    );
  });
});
