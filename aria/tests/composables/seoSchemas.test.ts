import { describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("seoSchemas", () => {
  it("rejects malformed page metadata payloads", async () => {
    const { unwrapPageMetaActionResult } =
      await import("../../admin/features/Studio/pages/composables/seoSchemas");

    const result = unwrapPageMetaActionResult(
      {
        data: {
          success: true,
          data: {
            slug: "home",
            title: "Home",
            path: "/",
            status: "draft",
            layout: {
              slug: null,
              name: null,
              hasHeader: false,
              hasFooter: false,
            },
            seo: {
              title: "Home",
            },
            frontmatter: "invalid",
          },
        },
        error: null,
      },
      "Failed to load page metadata",
      {
        source: "PageMetaPanel.fetchData",
        slug: "home",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load page metadata",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Studio/PageMeta] Invalid page meta action response",
      expect.objectContaining({
        source: "PageMetaPanel.fetchData",
        slug: "home",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded page metadata failures", async () => {
    const { unwrapPageMetaActionResult } =
      await import("../../admin/features/Studio/pages/composables/seoSchemas");

    const result = unwrapPageMetaActionResult(
      {
        data: {
          success: false,
          error: {
            message: "Page not found: home",
          },
        },
        error: null,
      },
      "Failed to load page metadata",
    );

    expect(result).toEqual({
      success: false,
      error: "Page not found: home",
    });
  });
});
