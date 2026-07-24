import { beforeEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("componentFetcherActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed compose fallback payloads", async () => {
    const { unwrapComponentFetcherComposeResult } =
      await import("../../admin/features/Blocks/composables/componentFetcherActionResults");

    const result = unwrapComponentFetcherComposeResult(
      {
        data: {
          pageBlocks: {},
        },
        error: null,
      },
      "Failed to compose component",
      {
        source: "useComponentFetcher.fetchComponentDefinition",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to compose component",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Blocks/ComponentFetcher] Invalid compose response",
      expect.objectContaining({
        source: "useComponentFetcher.fetchComponentDefinition",
        issues: expect.any(Array),
      }),
    );
  });

  it("accepts originalNodes fallback when pageBlocks are absent", async () => {
    const { unwrapComponentFetcherComposeResult } =
      await import("../../admin/features/Blocks/composables/componentFetcherActionResults");

    const result = unwrapComponentFetcherComposeResult(
      {
        data: {
          originalNodes: [
            {
              id: "component-root",
              type: "Container",
              props: {},
              styles: {},
              children: [],
            },
          ],
        },
        error: null,
      },
      "Failed to compose component",
      {
        source: "useComponentFetcher.fetchComponentDefinition",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("component-root");
      expect(result.data[0]?.customClasses).toEqual([]);
    }
  });
});
