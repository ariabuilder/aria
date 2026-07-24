import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const { getMediaGroupingMock, updateMediaGroupingMock, executeMock } =
  vi.hoisted(() => ({
    getMediaGroupingMock: vi.fn(),
    updateMediaGroupingMock: vi.fn(),
    executeMock: vi.fn(),
  }));

vi.mock("@/features/History", () => ({
  useHistory: () => ({
    execute: executeMock,
  }),
}));

vi.mock("@/composables/useCapabilities", () => ({
  useCapabilities: () => ({
    canOperation: (operation: string) =>
      operation === "settings.getMediaGrouping" ||
      operation === "settings.updateMediaGrouping",
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    settings: {
      getMediaGrouping: getMediaGroupingMock,
      updateMediaGrouping: updateMediaGroupingMock,
    },
  },
}));

function createGroupingResponse(
  groups: Array<{ id: string; name: string }>,
  assignments: Record<string, string> = {},
) {
  return {
    data: {
      success: true as const,
      data: {
        groups,
        assignments,
      },
    },
    error: null,
  };
}

async function loadGroupingModule() {
  return import(
    "../../admin/features/Studio/media/composables/useMediaGrouping"
  );
}

describe("useMediaGrouping persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      await operation.redo();
      return { success: true, error: undefined };
    });

    updateMediaGroupingMock.mockResolvedValue({
      data: { success: true },
      error: null,
    });
  });

  it("hydrates saved groups from site settings", async () => {
    getMediaGroupingMock.mockResolvedValue(
      createGroupingResponse([{ id: "grp-1", name: "Brand Assets" }]),
    );

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const grouping = useMediaGrouping(computed(() => []));

    expect(grouping.customGroups.value.map((group) => group.name)).toEqual([
      "Brand Assets",
    ]);
  });

  it("persists trimmed groups when deleting an empty folder", async () => {
    getMediaGroupingMock.mockResolvedValue(
      createGroupingResponse([
        { id: "grp-1", name: "Brand Assets" },
        { id: "grp-2", name: "Social" },
      ]),
    );

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const grouping = useMediaGrouping(computed(() => []));
    await grouping.deleteCustomGroup("grp-2");

    expect(updateMediaGroupingMock).toHaveBeenCalledWith({
      mediaGrouping: {
        groups: [{ id: "grp-1", name: "Brand Assets" }],
        assignments: {},
      },
    });
  });

  it("assigns assets to folders without changing storage paths", async () => {
    getMediaGroupingMock.mockResolvedValue(
      createGroupingResponse([{ id: "grp-1", name: "Brand Assets" }]),
    );

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const assets = computed(() => [{ id: "hero.jpg", name: "hero.jpg" }]);
    const grouping = useMediaGrouping(assets);

    await grouping.moveAssetToGroup("hero.jpg", "grp-1");

    expect(updateMediaGroupingMock).toHaveBeenCalledWith({
      mediaGrouping: {
        groups: [{ id: "grp-1", name: "Brand Assets" }],
        assignments: { "hero.jpg": "grp-1" },
      },
    });
    expect(grouping.getAssetGroupId("hero.jpg")).toBe("grp-1");
  });

  it("moves multiple assets in one history entry", async () => {
    getMediaGroupingMock.mockResolvedValue(
      createGroupingResponse([
        { id: "grp-1", name: "Brand Assets" },
        { id: "grp-2", name: "Social" },
      ]),
    );

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const assets = computed(() => [
      { id: "hero.jpg", name: "hero.jpg" },
      { id: "logo.png", name: "logo.png" },
      { id: "footer.jpg", name: "footer.jpg" },
    ]);
    const grouping = useMediaGrouping(assets);

    const moved = await grouping.moveAssetsToGroup(
      ["hero.jpg", "logo.png", "footer.jpg"],
      "grp-2",
    );

    expect(moved).toBe(3);
    expect(updateMediaGroupingMock).toHaveBeenCalledTimes(1);
    expect(updateMediaGroupingMock).toHaveBeenCalledWith({
      mediaGrouping: {
        groups: [
          { id: "grp-1", name: "Brand Assets" },
          { id: "grp-2", name: "Social" },
        ],
        assignments: {
          "hero.jpg": "grp-2",
          "logo.png": "grp-2",
          "footer.jpg": "grp-2",
        },
      },
    });
  });

  it("skips assets already assigned to the target folder", async () => {
    getMediaGroupingMock.mockResolvedValue(
      createGroupingResponse(
        [{ id: "grp-1", name: "Brand Assets" }],
        { "hero.jpg": "grp-1" },
      ),
    );

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const assets = computed(() => [
      { id: "hero.jpg", name: "hero.jpg" },
      { id: "logo.png", name: "logo.png" },
    ]);
    const grouping = useMediaGrouping(assets);

    const moved = await grouping.moveAssetsToGroup(
      ["hero.jpg", "logo.png"],
      "grp-1",
    );

    expect(moved).toBe(1);
    expect(updateMediaGroupingMock).toHaveBeenCalledWith({
      mediaGrouping: {
        groups: [{ id: "grp-1", name: "Brand Assets" }],
        assignments: {
          "hero.jpg": "grp-1",
          "logo.png": "grp-1",
        },
      },
    });
  });

  it("starts empty when hydration fails", async () => {
    getMediaGroupingMock.mockResolvedValue({
      data: null,
      error: new Error("offline"),
    });

    const {
      ensureMediaGroupingHydrated,
      useMediaGrouping,
      resetMediaGroupingStateForTests,
    } = await loadGroupingModule();

    resetMediaGroupingStateForTests();
    await ensureMediaGroupingHydrated();

    const grouping = useMediaGrouping(computed(() => []));

    expect(grouping.customGroups.value).toEqual([]);
    expect(grouping.mediaGroupAssignments.value).toEqual({});
  });
});
