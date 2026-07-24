import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComponentDSL } from "../../lib/types/nodes";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

const validComponent: ComponentDSL = {
  id: "hero-banner",
  name: "Hero Banner",
  description: "Reusable hero block",
  category: "marketing",
  nodes: [
    {
      id: "component-root",
      type: "Container",
      props: {},
      styles: {},
      children: [],
    },
  ],
};

describe("blockRegistryActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("accepts valid init component inventory payloads", async () => {
    const { unwrapBlockRegistryComponentsResult } =
      await import("../../admin/features/Blocks/composables/blockRegistryActionResults");

    const result = unwrapBlockRegistryComponentsResult(
      {
        data: {
          components: [validComponent],
          pages: [],
        },
        error: null,
      },
      "Failed to load components",
      {
        source: "useBlockRegistry.refreshComponents",
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe("hero-banner");
      expect(result.data[0]?.nodes).toHaveLength(1);
      expect(result.data[0]?.nodes[0]?.customClasses).toEqual([]);
    }
  });

  it("rejects malformed init component inventory payloads", async () => {
    const { unwrapBlockRegistryComponentsResult } =
      await import("../../admin/features/Blocks/composables/blockRegistryActionResults");

    const result = unwrapBlockRegistryComponentsResult(
      {
        data: {
          components: [{ id: "hero-banner", name: "Hero Banner" }],
        },
        error: null,
      },
      "Failed to load components",
      {
        source: "useBlockRegistry.refreshComponents",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load components",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Blocks] Invalid block registry components response",
      expect.objectContaining({
        source: "useBlockRegistry.refreshComponents",
        issues: expect.any(Array),
      }),
    );
  });
});
