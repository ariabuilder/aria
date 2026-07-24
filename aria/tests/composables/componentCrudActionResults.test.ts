import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("componentCrudActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed getItem component payloads", async () => {
    const { unwrapComponentItemResult } =
      await import("../../admin/features/Blocks/composables/componentCrudActionResults");

    const result = unwrapComponentItemResult(
      {
        data: {
          id: "hero-banner",
          name: "Hero Banner",
        },
        error: null,
      },
      "Failed to load component",
      {
        source: "useComponentActions.updateComponent",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load component",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Blocks/Components] Invalid getItem component response",
      expect.objectContaining({
        source: "useComponentActions.updateComponent",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded create failures from CRUD action responses", async () => {
    const { unwrapComponentCrudActionResult } =
      await import("../../admin/features/Blocks/composables/componentCrudActionResults");

    const result = unwrapComponentCrudActionResult(
      "create",
      {
        data: {
          success: false,
          error: {
            message: "Component slug already exists",
          },
        },
        error: null,
      },
      {
        source: "useComponentActions.createComponent",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Component slug already exists",
    });
  });
});
