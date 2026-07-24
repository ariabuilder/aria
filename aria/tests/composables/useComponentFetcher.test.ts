import { beforeEach, describe, expect, it, vi } from "vitest";

const { composeMock, getItemMock, loggerMock } = vi.hoisted(() => ({
  composeMock: vi.fn(),
  getItemMock: vi.fn(),
  loggerMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: (...args: unknown[]) => composeMock(...args),
    getItem: (...args: unknown[]) => getItemMock(...args),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

const validNode = {
  id: "component-root",
  type: "Container",
  props: {},
  styles: {},
  children: [],
};

describe("useComponentFetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns an empty result when getItem returns a malformed component payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
      },
      error: null,
    });

    const { useComponentFetcher } =
      await import("../../admin/features/Blocks/composables/useComponentFetcher");

    const fetcher = useComponentFetcher();
    const result = await fetcher.fetchComponentDefinition("hero-banner");

    expect(result).toEqual([]);
    expect(composeMock).not.toHaveBeenCalled();
    expect(fetcher.cachedComponents.value.size).toBe(0);
  });

  it("does not cache components when compose fallback returns a malformed payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
        nodes: [],
      },
      error: null,
    });
    composeMock.mockResolvedValue({
      data: {
        pageBlocks: {},
      },
      error: null,
    });

    const { useComponentFetcher } =
      await import("../../admin/features/Blocks/composables/useComponentFetcher");

    const fetcher = useComponentFetcher();
    const result = await fetcher.fetchComponentDefinition("hero-banner");

    expect(result).toEqual([]);
    expect(fetcher.cachedComponents.value.size).toBe(0);
  });

  it("caches composed component nodes after a valid fallback compose response", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
        nodes: [],
      },
      error: null,
    });
    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [validNode],
      },
      error: null,
    });

    const { useComponentFetcher } =
      await import("../../admin/features/Blocks/composables/useComponentFetcher");

    const fetcher = useComponentFetcher();

    const firstResult = await fetcher.fetchComponentDefinition("hero-banner");
    const secondResult = await fetcher.fetchComponentDefinition("hero-banner");

    expect(firstResult).toHaveLength(1);
    expect(firstResult[0]?.id).toBe("component-root");
    expect(secondResult).toHaveLength(1);
    expect(getItemMock).toHaveBeenCalledTimes(1);
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(fetcher.cachedComponents.value.size).toBe(1);
  });

  it("scopes expanded descendant ids per component instance", async () => {
    getItemMock.mockImplementation(async ({ slug }: { slug: string }) => {
      if (slug === "button") {
        return {
          data: {
            id: "button",
            name: "Button",
            nodes: [
              {
                id: "button-root",
                type: "Button",
                props: { label: "Button" },
                styles: {},
                children: [],
              },
            ],
          },
          error: null,
        };
      }

      return {
        data: {
          id: slug,
          name: slug,
          nodes: [
            {
              id: "section-root",
              type: "Section",
              props: {},
              styles: {},
              children: [
                {
                  id: "button-instance",
                  type: "Component",
                  props: { componentId: "button" },
                  styles: {},
                  children: [],
                  reference: {
                    type: "instance",
                    masterId: "button",
                  },
                },
              ],
            },
          ],
        },
        error: null,
      };
    });

    const { useComponentFetcher } =
      await import("../../admin/features/Blocks/composables/useComponentFetcher");

    const fetcher = useComponentFetcher();
    const expanded = await fetcher.expandComponentReferencesClient([
      {
        id: "hero-instance-a",
        type: "Component",
        props: { componentId: "hero" },
        styles: {},
        children: [],
        reference: {
          type: "instance",
          masterId: "hero",
        },
      },
      {
        id: "hero-instance-b",
        type: "Component",
        props: { componentId: "hero" },
        styles: {},
        children: [],
        reference: {
          type: "instance",
          masterId: "hero",
        },
      },
    ]);

    expect(expanded).toHaveLength(2);

    const [firstInstance, secondInstance] = expanded;
    expect(firstInstance?.id).toBe("hero-instance-a");
    expect(secondInstance?.id).toBe("hero-instance-b");

    const firstSection = firstInstance?.children?.[0];
    const secondSection = secondInstance?.children?.[0];
    expect(firstSection?.id).toBe("hero-instance-a__section-root");
    expect(secondSection?.id).toBe("hero-instance-b__section-root");

    const firstNestedInstance = firstSection?.children?.[0];
    const secondNestedInstance = secondSection?.children?.[0];
    expect(firstNestedInstance?.id).toBe("button-instance");
    expect(secondNestedInstance?.id).toBe("button-instance");

    const firstNestedRenderId = firstNestedInstance?.children?.[0]?.id;
    const secondNestedRenderId = secondNestedInstance?.children?.[0]?.id;

    expect(firstNestedRenderId).toContain("hero-instance-a__section-root");
    expect(secondNestedRenderId).toContain("hero-instance-b__section-root");
    expect(firstNestedRenderId).toContain("button-root");
    expect(secondNestedRenderId).toContain("button-root");
    expect(firstNestedRenderId).not.toBe(secondNestedRenderId);
  });
});
