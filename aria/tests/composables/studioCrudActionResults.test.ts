import { beforeEach, describe, expect, it, vi } from "vitest";

import { createNode, createSimplePage } from "../fixtures/testDataGenerator";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("studioCrudActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("parses valid page getItem payloads", async () => {
    const { unwrapStudioCrudGetItemResult } =
      await import("../../admin/features/Studio/composer/composables/studioCrudActionResults");

    const page = createSimplePage("Landing", {
      id: "landing",
      slug: "landing",
      nodes: [createNode({ id: "landing-root" })],
    });

    const result = unwrapStudioCrudGetItemResult(
      "pages",
      { data: page, error: null },
      "Failed to load page",
      { slug: "landing" },
    );

    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: page.id,
        slug: page.slug,
        title: page.title,
      }),
    });
    if (!result.success) {
      throw new Error("Expected valid page payload to parse");
    }
    expect(result.data.nodes[0]?.customClasses).toEqual([]);
  });

  it("rejects malformed component getItem payloads", async () => {
    const { unwrapStudioCrudGetItemResult } =
      await import("../../admin/features/Studio/composer/composables/studioCrudActionResults");

    const result = unwrapStudioCrudGetItemResult(
      "components",
      {
        data: {
          id: "hero-banner",
          name: "Hero Banner",
        },
        error: null,
      },
      "Failed to load component",
      { id: "hero-banner" },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load component",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio] Invalid components payload from getItem",
      expect.objectContaining({
        collection: "components",
        id: "hero-banner",
        issues: expect.any(Array),
      }),
    );
  });

  it("preserves the committed version from updateItem", async () => {
    const { unwrapStudioCrudActionResult } =
      await import("../../admin/features/Studio/composer/composables/studioCrudActionResults");

    expect(
      unwrapStudioCrudActionResult("update", {
        data: {
          success: true,
          slug: "header",
          version: "component-v2",
        },
        error: null,
      }),
    ).toEqual({
      success: true,
      slug: "header",
      version: "component-v2",
    });
  });
});
