import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mediaUsagesMock,
  getItemMock,
  fetchBuilderDataMock,
  loggerMock,
  useBuilderDataMock,
} = vi.hoisted(() => ({
  mediaUsagesMock: vi.fn(),
  getItemMock: vi.fn(),
  fetchBuilderDataMock: vi.fn(),
  loggerMock: vi.fn(),
  useBuilderDataMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    getItem: (...args: unknown[]) => getItemMock(...args),
    media: {
      usages: (...args: unknown[]) => mediaUsagesMock(...args),
    },
  },
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: (...args: unknown[]) => useBuilderDataMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("useMediaUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    fetchBuilderDataMock.mockResolvedValue(undefined);
    useBuilderDataMock.mockReturnValue({
      fetchBuilderData: fetchBuilderDataMock,
      pages: ref([]),
      layouts: ref([]),
      components: ref([]),
    });
  });

  it("caches empty indexed usage results without rescanning builder items", async () => {
    mediaUsagesMock.mockResolvedValue({
      data: {
        available: true,
        source: "indexed",
        usages: [],
      },
      error: null,
    });

    const { useMediaUsage } =
      await import("../../admin/features/Studio/media/composables/useMediaUsage");

    const asset = {
      id: "/uploads/images/logo.svg",
      name: "logo.svg",
      type: "image" as const,
      url: "/uploads/images/logo.svg",
      size: 4,
    };
    const selectedAsset = ref(asset);
    const mediaUsage = useMediaUsage(selectedAsset);

    await mediaUsage.ensureUsageComputed(asset);
    await mediaUsage.ensureUsageComputed(asset);

    expect(mediaUsagesMock).toHaveBeenCalledTimes(1);
    expect(fetchBuilderDataMock).not.toHaveBeenCalled();
    expect(getItemMock).not.toHaveBeenCalled();
    expect(mediaUsage.selectedAssetUsages.value).toEqual([]);
  });

  it("resolves indexed usages against builder inventory with one builder fetch", async () => {
    useBuilderDataMock.mockReturnValue({
      fetchBuilderData: fetchBuilderDataMock,
      pages: ref([
        {
          id: "home",
          title: "Home",
          slug: "index",
        },
      ]),
      layouts: ref([]),
      components: ref([]),
    });
    mediaUsagesMock.mockResolvedValue({
      data: {
        available: true,
        source: "indexed",
        usages: [
          {
            kind: "page",
            refId: "home",
            refPath: "nodes[0].props.image.src",
          },
        ],
      },
      error: null,
    });

    const { useMediaUsage } =
      await import("../../admin/features/Studio/media/composables/useMediaUsage");

    const asset = {
      id: "/uploads/images/logo.svg",
      name: "logo.svg",
      type: "image" as const,
      url: "/uploads/images/logo.svg",
      size: 4,
    };
    const selectedAsset = ref(asset);
    const mediaUsage = useMediaUsage(selectedAsset);

    await mediaUsage.ensureUsageComputed(asset);

    expect(fetchBuilderDataMock).toHaveBeenCalledTimes(1);
    expect(mediaUsage.selectedAssetUsages.value).toEqual([
      {
        kind: "page",
        id: "home",
        title: "Home",
        path: "/index",
      },
    ]);
    expect(getItemMock).not.toHaveBeenCalled();
  });
});
