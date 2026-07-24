import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("componentPropertiesActionResults", () => {
  it("rejects malformed component getItem payloads", async () => {
    const { parseStudioGetItemPayload } =
      await import("../../admin/features/Studio/composer/composables/componentPropertiesActionResults");

    const result = parseStudioGetItemPayload(
      "components",
      {
        data: {
          id: "hero",
          name: "Hero",
          nodes: 42,
        },
        error: null,
      },
      {
        source: "ComponentPropertiesPanel.loadComponent",
        slug: "hero",
      },
    );

    expect(result).toBeNull();
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/ComponentProperties] Invalid components payload from getItem",
      expect.objectContaining({
        source: "ComponentPropertiesPanel.loadComponent",
        slug: "hero",
        issues: expect.any(Array),
      }),
    );
  });

  it("rejects malformed component export payloads", async () => {
    const { unwrapComponentExportActionResult } =
      await import("../../admin/features/Studio/composer/composables/componentPropertiesActionResults");

    const result = unwrapComponentExportActionResult(
      {
        data: {
          success: true,
          type: "component",
          id: "hero",
          content: 42,
          filePath: "src/components/hero.astro",
        },
        error: null,
      },
      "Failed to generate component code",
      {
        source: "ComponentPropertiesPanel.loadCode",
        componentId: "hero",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to generate component code",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/ComponentProperties] Invalid exportItem action response",
      expect.objectContaining({
        source: "ComponentPropertiesPanel.loadCode",
        componentId: "hero",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded component export failures", async () => {
    const { unwrapComponentExportActionResult } =
      await import("../../admin/features/Studio/composer/composables/componentPropertiesActionResults");

    const result = unwrapComponentExportActionResult(
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
