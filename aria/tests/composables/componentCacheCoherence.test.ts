import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  commitComponentDefinitionMock,
  invalidateComponentDefinitionMock,
  invalidateComponentResourceMock,
  updateCachedComponentResourceMock,
  loggerMock,
} = vi.hoisted(() => ({
  commitComponentDefinitionMock: vi.fn(),
  invalidateComponentDefinitionMock: vi.fn(),
  invalidateComponentResourceMock: vi.fn(),
  updateCachedComponentResourceMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("@/features/Blocks/composables/useComponentFetcher", () => ({
  commitComponentDefinition: commitComponentDefinitionMock,
  invalidateComponentDefinition: invalidateComponentDefinitionMock,
}));

vi.mock(
  "@/features/Studio/components/composables/useComponentResourceBank",
  () => ({
    invalidateComponentResource: invalidateComponentResourceMock,
    updateCachedComponentResource: updateCachedComponentResourceMock,
  }),
);

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("componentCacheCoherence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits the same saved component to both cache representations", async () => {
    const { commitSavedComponentToClientCaches } =
      await import("../../admin/features/Core/composables/componentCacheCoherence");
    const component = {
      id: "header",
      name: "Header",
      nodes: [
        {
          id: "navigation",
          type: "Navigation",
          props: {},
          styles: {},
          children: [],
        },
      ],
      version: "component-v2",
    };

    commitSavedComponentToClientCaches(component);

    expect(commitComponentDefinitionMock).toHaveBeenCalledWith({
      id: "header",
      name: "Header",
      nodes: component.nodes,
      slots: undefined,
    });
    expect(updateCachedComponentResourceMock).toHaveBeenCalledWith(component);
  });

  it("keeps the canvas commit successful if the Studio cache rejects", async () => {
    const { commitSavedComponentToClientCaches } =
      await import("../../admin/features/Core/composables/componentCacheCoherence");
    updateCachedComponentResourceMock.mockImplementationOnce(() => {
      throw new Error("invalid Studio cache entry");
    });

    expect(() =>
      commitSavedComponentToClientCaches({
        id: "header",
        name: "Header",
        nodes: [],
        version: "component-v2",
      }),
    ).not.toThrow();
    expect(commitComponentDefinitionMock).toHaveBeenCalledTimes(1);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[componentCacheCoherence] Studio cache update failed",
      expect.objectContaining({ componentId: "header" }),
    );
  });

  it("invalidates both cache representations for unknown revisions", async () => {
    const { invalidateComponentClientCaches } =
      await import("../../admin/features/Core/composables/componentCacheCoherence");

    invalidateComponentClientCaches("header", "realtime");

    expect(invalidateComponentDefinitionMock).toHaveBeenCalledWith("header");
    expect(invalidateComponentResourceMock).toHaveBeenCalledWith(
      "header",
      "realtime",
    );
  });
});
