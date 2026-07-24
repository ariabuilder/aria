import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("libraryActionResults", () => {
  it("rejects malformed library catalog payloads", async () => {
    const { unwrapLibraryCatalogResult } =
      await import("../../admin/features/Studio/composer/composables/libraryActionResults");

    const result = unwrapLibraryCatalogResult(
      {
        data: {
          success: true,
          data: {
            registryVersion: "1",
            updatedAt: "2026-03-27T10:00:00.000Z",
            packs: [{ id: "pack-1", name: "Starter", version: "1.0.0" }],
          },
        },
        error: null,
      },
      {
        source: "useStudioLibrary.loadLibraryCatalog",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load Aria Library",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[StudioLibrary] Invalid library catalog response",
      expect.objectContaining({
        source: "useStudioLibrary.loadLibraryCatalog",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded install component failures", async () => {
    const { unwrapLibraryInstallComponentResult } =
      await import("../../admin/features/Studio/composer/composables/libraryActionResults");

    const result = unwrapLibraryInstallComponentResult(
      {
        data: {
          success: false,
          error: {
            code: "COMPONENT_ID_CONFLICT",
            message: "Component ID conflicts with an existing custom component",
          },
        },
        error: null,
      },
      "Failed to install aria-hero",
    );

    expect(result).toEqual({
      success: false,
      error: "Component ID conflicts with an existing custom component",
    });
  });
});
