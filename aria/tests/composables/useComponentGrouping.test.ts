import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed } from "vue";

type CapturedOperation = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

const { getComponentGroupingMock, updateComponentGroupingMock, executeMock } =
  vi.hoisted(() => ({
    getComponentGroupingMock: vi.fn(),
    updateComponentGroupingMock: vi.fn(),
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
      operation === "settings.getComponentGrouping" ||
      operation === "settings.updateComponentGrouping",
  }),
}));

vi.mock("astro:actions", () => ({
  actions: {
    settings: {
      getComponentGrouping: getComponentGroupingMock,
      updateComponentGrouping: updateComponentGroupingMock,
    },
  },
}));

const PRESET_GROUP_NAMES = [
  "Call To Action",
  "Content",
  "Forms",
  "Hero",
  "Navigation",
  "Pricing",
  "Social Proof",
  "User",
] as const;

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
    "../../admin/features/Studio/components/composables/useComponentGrouping"
  );
}

describe("useComponentGrouping persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    executeMock.mockImplementation(async (operation: CapturedOperation) => {
      await operation.redo();
      return { success: true, error: undefined };
    });

    updateComponentGroupingMock.mockResolvedValue({
      data: { success: true },
      error: null,
    });
  });

  it("hydrates saved groups without reinserting deleted preset groups", async () => {
    getComponentGroupingMock.mockResolvedValue(
      createGroupingResponse([{ id: "preset-user", name: "User" }]),
    );

    const {
      ensureComponentGroupingHydrated,
      useComponentGrouping,
      resetComponentGroupingStateForTests,
    } = await loadGroupingModule();

    resetComponentGroupingStateForTests();
    await ensureComponentGroupingHydrated();

    const grouping = useComponentGrouping(computed(() => []));

    expect(grouping.customGroups.value.map((group) => group.name)).toEqual([
      "User",
    ]);
    expect(
      grouping.customGroups.value.map((group) => group.name),
    ).not.toContain("Hero");
    expect(
      grouping.customGroups.value.map((group) => group.name),
    ).not.toContain("Forms");
  });

  it("persists trimmed groups when deleting an empty group", async () => {
    getComponentGroupingMock.mockResolvedValue(
      createGroupingResponse([
        { id: "preset-user", name: "User" },
        { id: "preset-hero", name: "Hero" },
        { id: "preset-forms", name: "Forms" },
      ]),
    );

    const {
      ensureComponentGroupingHydrated,
      useComponentGrouping,
      resetComponentGroupingStateForTests,
    } = await loadGroupingModule();

    resetComponentGroupingStateForTests();
    await ensureComponentGroupingHydrated();

    const grouping = useComponentGrouping(computed(() => []));
    await grouping.deleteCustomGroup("preset-hero");

    expect(updateComponentGroupingMock).toHaveBeenCalledWith({
      componentGrouping: {
        groups: [
          { id: "preset-forms", name: "Forms" },
          { id: "preset-user", name: "User" },
        ],
        assignments: {},
      },
    });
  });

  it("does not resurrect deleted groups after reload hydration", async () => {
    const savedGroups = [
      { id: "preset-user", name: "User" },
      { id: "preset-hero", name: "Hero" },
      { id: "preset-forms", name: "Forms" },
    ];

    getComponentGroupingMock.mockResolvedValue(
      createGroupingResponse(savedGroups),
    );

    const module = await loadGroupingModule();
    module.resetComponentGroupingStateForTests();
    await module.ensureComponentGroupingHydrated();

    const grouping = module.useComponentGrouping(computed(() => []));
    await grouping.deleteCustomGroup("preset-hero");

    const persistedPayload =
      updateComponentGroupingMock.mock.calls.at(-1)?.[0].componentGrouping;

    module.resetComponentGroupingStateForTests();
    getComponentGroupingMock.mockResolvedValue(
      createGroupingResponse(persistedPayload.groups, persistedPayload.assignments),
    );

    await module.ensureComponentGroupingHydrated();

    const reloadedGrouping = module.useComponentGrouping(computed(() => []));

    expect(
      reloadedGrouping.customGroups.value.map((group) => group.name),
    ).toEqual(["Forms", "User"]);
    expect(
      reloadedGrouping.customGroups.value.map((group) => group.name),
    ).not.toContain("Hero");
  });

  it("seeds preset defaults only when hydration fails", async () => {
    getComponentGroupingMock.mockResolvedValue({
      data: null,
      error: new Error("offline"),
    });

    const {
      ensureComponentGroupingHydrated,
      useComponentGrouping,
      resetComponentGroupingStateForTests,
    } = await loadGroupingModule();

    resetComponentGroupingStateForTests();
    await ensureComponentGroupingHydrated();

    const grouping = useComponentGrouping(computed(() => []));

    expect(grouping.customGroups.value.map((group) => group.name)).toEqual(
      [...PRESET_GROUP_NAMES].sort((a, b) => a.localeCompare(b)),
    );
  });
});
