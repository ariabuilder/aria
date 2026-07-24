import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getItemMock,
  recordCreateItemMock,
  recordDeleteItemMock,
  recordDeleteItemsBatchMock,
  recordUpdateItemMock,
  executeStudioOperationMock,
  refreshPagesMock,
  refreshPagesNowMock,
  refreshLayoutsMock,
  refreshComponentsMock,
  refreshComponentsNowMock,
  toastErrorMock,
  toastSuccessMock,
  loggerMock,
  builderDataState,
} = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  recordCreateItemMock: vi.fn(),
  recordDeleteItemMock: vi.fn(),
  recordDeleteItemsBatchMock: vi.fn(),
  recordUpdateItemMock: vi.fn(),
  executeStudioOperationMock: vi.fn(),
  refreshPagesMock: vi.fn(async () => {}),
  refreshPagesNowMock: vi.fn(async () => {}),
  refreshLayoutsMock: vi.fn(async () => {}),
  refreshComponentsMock: vi.fn(async () => {}),
  refreshComponentsNowMock: vi.fn(async () => {}),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  loggerMock: vi.fn(),
  builderDataState: {
    pages: {
      value: [
        { slug: "home" },
        { slug: "about" },
        { slug: "team", parent: "about" },
      ] as Array<{ slug: string; parent?: string }>,
    },
    layouts: { value: [{ id: "marketing-shell" }] as Array<{ id: string }> },
    components: { value: [{ id: "hero-banner" }] as Array<{ id: string }> },
  },
}));

vi.mock("astro:actions", () => ({
  actions: {
    getItem: (...args: unknown[]) => getItemMock(...args),
  },
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    ...builderDataState,
    refreshPages: refreshPagesMock,
    refreshPagesNow: refreshPagesNowMock,
    refreshLayouts: refreshLayoutsMock,
    refreshComponents: refreshComponentsMock,
    refreshComponentsNow: refreshComponentsNowMock,
  }),
}));

vi.mock("../../admin/features/Studio/composer/composables/useStudioCrudHistory", () => ({
  useStudioCrudHistory: () => ({
    executeStudioOperation: executeStudioOperationMock,
    recordCreateItem: recordCreateItemMock,
    recordDeleteItem: recordDeleteItemMock,
    recordDeleteItemsBatch: recordDeleteItemsBatchMock,
    recordUpdateItem: recordUpdateItemMock,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

describe("useStudioActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    builderDataState.pages.value = [{ slug: "home" }];
    builderDataState.layouts.value = [{ id: "marketing-shell" }];
    builderDataState.components.value = [{ id: "hero-banner" }];

    recordCreateItemMock.mockResolvedValue("created-slug");
    recordDeleteItemMock.mockResolvedValue(true);
    recordDeleteItemsBatchMock.mockResolvedValue({
      succeeded: 2,
      failed: 0,
      errors: [],
    });
    recordUpdateItemMock.mockResolvedValue(true);
    executeStudioOperationMock.mockResolvedValue(true);
  });

  it("does not duplicate a page when getItem returns a malformed page payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "home",
        title: "Home",
      },
      error: null,
    });

    const { useStudioActions } =
      await import("../../admin/features/Studio/composer/composables/useStudioActions");

    const studioActions = useStudioActions();
    const duplicatedSlug = await studioActions.duplicatePage("home");

    expect(duplicatedSlug).toBeNull();
    expect(recordCreateItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to fetch page for duplication",
    );
  });

  it("does not rename a layout when getItem returns a malformed layout payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "marketing-shell",
        name: "Marketing Shell",
        slots: "not-an-array",
      },
      error: null,
    });

    const { useStudioActions } =
      await import("../../admin/features/Studio/composer/composables/useStudioActions");

    const studioActions = useStudioActions();
    const renamed = await studioActions.renameLayout(
      "marketing-shell",
      "Marketing Shell Updated",
    );

    expect(renamed).toBe(false);
    expect(recordUpdateItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to fetch layout for rename",
    );
  });

  it("does not delete a component when getItem returns a malformed component payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "hero-banner",
        name: "Hero Banner",
      },
      error: null,
    });

    const { useStudioActions } =
      await import("../../admin/features/Studio/composer/composables/useStudioActions");

    const studioActions = useStudioActions();
    const deleted = await studioActions.deleteComponent("hero-banner");

    expect(deleted).toBe(false);
    expect(recordDeleteItemMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Failed to fetch component for deletion",
    );
  });

  it("deletePagesBatch fetches restore payloads in parallel and records one batch history entry", async () => {
    getItemMock.mockImplementation(async ({ slug }: { slug: string }) => ({
      data: {
        id: slug,
        slug,
        title: slug,
        nodes: [],
        settings: {},
        status: "draft",
        updatedAt: new Date().toISOString(),
      },
      error: null,
    }));

    const { useStudioActions } =
      await import("../../admin/features/Studio/composer/composables/useStudioActions");

    const studioActions = useStudioActions();
    const result = await studioActions.deletePagesBatch(
      ["about", "team"],
      { silent: true },
    );

    expect(result).toEqual({
      succeeded: 2,
      failed: 0,
      errors: [],
    });
    expect(getItemMock).toHaveBeenCalledTimes(2);
    expect(recordDeleteItemsBatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "delete-pages-batch",
        collection: "pages",
        items: expect.arrayContaining([
          expect.objectContaining({ slug: "team" }),
          expect.objectContaining({ slug: "about" }),
        ]),
      }),
    );
    expect(recordDeleteItemMock).not.toHaveBeenCalled();
  });
});
