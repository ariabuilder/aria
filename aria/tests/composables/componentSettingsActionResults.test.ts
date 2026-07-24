import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("componentSettingsActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed init usage payloads", async () => {
    const { unwrapComponentSettingsUsageResult } =
      await import("../../admin/features/Composer/composables/componentSettingsActionResults");

    const result = unwrapComponentSettingsUsageResult(
      {
        data: {
          pages: {},
          layouts: [],
        },
        error: null,
      },
      "Invalid usage data from init action",
      {
        source: "ComponentSettingsPanel.loadUsage",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Invalid usage data from init action",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Composer/ComponentSettings] Invalid init usage response",
      expect.objectContaining({
        source: "ComponentSettingsPanel.loadUsage",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded export failures", async () => {
    const { unwrapComponentSettingsExportResult } =
      await import("../../admin/features/Composer/composables/componentSettingsActionResults");

    const result = unwrapComponentSettingsExportResult(
      {
        data: {
          success: false,
          error: "Component not found: hero",
        },
        error: null,
      },
      "Failed to generate component code",
    );

    expect(result).toEqual({
      success: false,
      error: "Component not found: hero",
    });
  });
});
