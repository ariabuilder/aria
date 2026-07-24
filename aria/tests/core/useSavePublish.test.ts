import { ref } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { createNode, createSimplePage } from "../fixtures/testDataGenerator";
import type { SavePublishDeps } from "../../admin/features/Core/composables/useSavePublish";

const {
  composeMock,
  savePageMock,
  saveLayoutMock,
  saveComponentMock,
  publishMock,
  getItemMock,
  refreshPagesMock,
  refreshPagesNowMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  composeMock: vi.fn(),
  savePageMock: vi.fn(),
  saveLayoutMock: vi.fn(),
  saveComponentMock: vi.fn(),
  publishMock: vi.fn(),
  getItemMock: vi.fn(),
  refreshPagesMock: vi.fn(),
  refreshPagesNowMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: composeMock,
    savePage: savePageMock,
    saveLayout: saveLayoutMock,
    saveComponent: saveComponentMock,
    getItem: getItemMock,
    publishing: {
      publish: publishMock,
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    refreshPages: refreshPagesMock,
    refreshPagesNow: refreshPagesNowMock,
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: vi.fn(),
}));

function createComposeResult(title: string, nodeId: string) {
  return {
    data: {
      pageBlocks: [createNode({ id: nodeId })],
      originalNodes: [createNode({ id: `${nodeId}-original` })],
      nonce: `nonce-${nodeId}`,
      pageMetadata: {
        id: "page-home",
        title,
        slug: "home",
        status: "draft",
        updatedAt: "2026-03-31T22:00:00.000Z",
        layout: "default",
        regions: {},
        frontmatter: {},
        settings: {
          cssVariables: {},
          breakpoints: [],
        },
      },
      currentLayout: null,
    },
    error: null,
  };
}

type SavePublishRefKey = Exclude<keyof SavePublishDeps, "onDraftSynced">;

function depRef<K extends SavePublishRefKey>(
  value: SavePublishDeps[K] extends { value: infer T } ? T : never,
): SavePublishDeps[K] {
  return ref(value) as unknown as SavePublishDeps[K];
}

function createLoaderAppState() {
  return {
    pageBlocks: depRef<"pageBlocks">([]),
    composeNonce: ref<string | null>(null),
    currentPage: depRef<"currentPage">(null),
    currentLayout: depRef<"currentLayout">(null),
    currentComponent: depRef<"currentComponent">(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    selectedLayoutRegion: ref<string | null>(null),
    hasUnsavedChanges: ref(true),
    lastSavedSnapshot: ref("stale-snapshot"),
    layoutSlotsSnapshot: ref("[]"),
    loadingState: ref({
      isLoading: false,
      loadError: null,
    }),
  };
}

function createSaveDeps(): SavePublishDeps {
  const currentPage = depRef<"currentPage">(
    createSimplePage("Home", {
      id: "page-home",
      slug: "home",
      title: "Home",
      layout: "default",
      status: "draft",
      version: "v1",
    }),
  );
  const pageBlocks = depRef<"pageBlocks">([
    createNode({ id: "hero-block" }),
    createNode({
      id: "injected-block",
      metadata: { layoutDefaultInjected: true },
    }),
    createNode({
      id: "component-block",
      type: "Component",
      reference: { id: "button", type: "instance" },
    }),
  ]);

  const deps: SavePublishDeps = {
    pageBlocks,
    currentPage,
    currentLayout: depRef<"currentLayout">(null),
    currentComponent: depRef<"currentComponent">(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    composeNonce: ref<string | null>("nonce-page-home"),
    hasUnsavedChanges: ref(true),
    lastSavedSnapshot: ref("stale-snapshot"),
    layoutSlotsSnapshot: ref("[]"),
    loadingState: ref({
      isLoading: false,
      isSaving: false,
      isPublishing: false,
      loadError: null,
    }),
  };

  return deps;
}

describe("useSavePublish", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { clearComposeCache } =
      await import("../../admin/composables/composeClientCache");
    clearComposeCache();
    const { __resetItemLoadingGenerationsForTests } =
      await import("../../admin/composables/useItemLoading");
    __resetItemLoadingGenerationsForTests();
    const { useAppRouter } =
      await import("@/features/Core/composables/useAppRouter");
    useAppRouter().startEditing({ itemType: "page", itemSlug: "home" });

    savePageMock.mockResolvedValue({
      data: { version: "v2", nonce: "nonce-page-home-next" },
      error: null,
    });
    saveLayoutMock.mockResolvedValue({
      data: {
        version: "v-layout",
        nonce: "nonce-layout-next",
        success: true,
      },
      error: null,
    });
    saveComponentMock.mockResolvedValue({
      data: {
        version: "v-component",
        nonce: "nonce-component-next",
        success: true,
      },
      error: null,
    });
    publishMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          slug: "home",
          htmlSize: 2048,
          globalCSSEnabled: true,
          framework: "unocss",
          darkMode: "disabled",
          timestamp: "2026-03-31T22:00:00.000Z",
          published: true,
        },
      },
      error: null,
    });
    getItemMock.mockResolvedValue({
      data: createSimplePage("Home", {
        id: "page-home",
        slug: "home",
        title: "Home",
        layout: "default",
        status: "published",
      }),
      error: null,
    });
    refreshPagesMock.mockResolvedValue(undefined);
    refreshPagesNowMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    const { useAppRouter } =
      await import("@/features/Core/composables/useAppRouter");
    useAppRouter().stopEditing();
    vi.restoreAllMocks();
  });

  it("invalidates prefetched page compose cache after save so the next load is fresh", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const loaderState = createLoaderAppState();
    const createSnapshot = vi.fn(
      (blocks: Array<{ id: string }>) =>
        `snapshot:${blocks.map((block) => block.id).join(",")}`,
    );
    const loader = useItemLoading(loaderState, vi.fn(), createSnapshot);

    composeMock
      .mockResolvedValueOnce(createComposeResult("Old Home", "stale-node"))
      .mockResolvedValueOnce(createComposeResult("Fresh Home", "fresh-node"));

    await loader.prefetchPageData("home");

    const deps = createSaveDeps();
    const { handleSave, currentVersion } = useSavePublish(deps);
    await handleSave();

    const loadResult = await loader.loadPage("home");

    expect(savePageMock).toHaveBeenCalledWith({
      id: "page-home",
      blocks: [
        expect.objectContaining({ id: "hero-block" }),
        expect.objectContaining({
          id: "component-block",
          reference: expect.objectContaining({
            id: "button",
            type: "instance",
          }),
        }),
      ],
      layout: "default",
      nonce: "nonce-page-home",
      expectedVersion: "v1",
    });
    expect(composeMock).toHaveBeenCalledTimes(2);
    expect(loadResult?.pageData.title).toBe("Fresh Home");
    expect(loadResult?.pageBlocks.map((block) => block.id)).toEqual([
      "fresh-node",
    ]);
    expect(currentVersion.value).toBe("v2");
    expect(deps.composeNonce.value).toBe("nonce-page-home-next");
    expect(deps.hasUnsavedChanges.value).toBe(false);
    expect(refreshPagesNowMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("publishes the latest draft, reloads published metadata, and refreshes the next page load", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const loaderState = createLoaderAppState();
    const createSnapshot = vi.fn(
      (blocks: Array<{ id: string }>) =>
        `snapshot:${blocks.map((block) => block.id).join(",")}`,
    );
    const loader = useItemLoading(loaderState, vi.fn(), createSnapshot);

    composeMock
      .mockResolvedValueOnce(
        createComposeResult("Prefetched Home", "cached-node"),
      )
      .mockResolvedValueOnce(
        createComposeResult("Published Home", "published-node"),
      );

    await loader.prefetchPageData("home");

    const deps = createSaveDeps();
    const { handlePublish, currentVersion } = useSavePublish(deps);
    await handlePublish();

    const loadResult = await loader.loadPage("home");

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(savePageMock).toHaveBeenCalledWith({
      id: "page-home",
      blocks: expect.any(Array),
      layout: "default",
      nonce: "nonce-page-home",
      expectedVersion: "v1",
    });
    expect(publishMock).toHaveBeenCalledWith({
      id: "page-home",
      slug: "home",
      title: "Home",
      description: deps.currentPage.value?.description,
      layout: "default",
      nodes: expect.any(Array),
      settings: deps.currentPage.value?.settings,
      expectedVersion: "v2",
    });
    expect(getItemMock).toHaveBeenCalledWith({
      collection: "pages",
      slug: "home",
    });
    expect(deps.currentPage.value?.status).toBe("published");
    expect(currentVersion.value).toBe("v2");
    expect(deps.composeNonce.value).toBe("nonce-page-home-next");
    expect(composeMock).toHaveBeenCalledTimes(2);
    expect(loadResult?.pageData.title).toBe("Published Home");
    expect(refreshPagesNowMock).toHaveBeenCalledTimes(2);
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("shows a success toast for explicit save-and-publish actions", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    const { handleSaveAndPublish } = useSavePublish(deps);

    await handleSaveAndPublish();

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Saved");
  });

  it("saves once before publishing and uses the replacement nonce", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    savePageMock.mockResolvedValueOnce({
      data: { version: "v2", nonce: "nonce-after-manual-save" },
      error: null,
    });

    const deps = createSaveDeps();
    const { handleSaveAndPublish } = useSavePublish(deps);

    await handleSaveAndPublish({ showSuccessToast: false });

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(savePageMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ nonce: "nonce-page-home" }),
    );
    expect(deps.composeNonce.value).toBe("nonce-after-manual-save");
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: "v2" }),
    );
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("retries save once after invalid nonce by re-composing", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    composeMock.mockResolvedValue(createComposeResult("Home", "hero-block"));
    savePageMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Invalid or expired nonce",
          code: "INVALID_NONCE",
        },
      })
      .mockResolvedValueOnce({
        data: { version: "v2", nonce: "nonce-refreshed" },
        error: null,
      });

    const deps = createSaveDeps();
    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(composeMock).toHaveBeenCalledWith({
      pageSlug: "home",
      itemType: "page",
    });
    expect(savePageMock).toHaveBeenCalledTimes(2);
    expect(deps.composeNonce.value).toBe("nonce-refreshed");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("keeps the draft dirty and exposes a conflict when the server rejects a stale version", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    savePageMock.mockResolvedValue({
      data: null,
      error: {
        message: "This draft is out of date. Reload it before saving.",
        code: "VERSION_CONFLICT",
      },
    });

    const deps = createSaveDeps();
    const { handleSave, saveConflict } = useSavePublish(deps);
    await handleSave();

    expect(saveConflict.value).toBe(true);
    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(deps.lastSavedSnapshot.value).toBe("stale-snapshot");
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("refreshes the server version pin without a full reload and keeps local blocks", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [createNode({ id: "server-block" })],
        originalNodes: [createNode({ id: "server-block" })],
        nonce: "nonce-server-fresh",
        pageMetadata: {
          id: "page-home",
          title: "Home",
          slug: "home",
          status: "draft",
          version: "v-server-2",
          updatedAt: "2026-07-22T00:00:00.000Z",
          layout: "default",
          frontmatter: {},
          settings: {
            cssVariables: {},
            breakpoints: [],
          },
        },
        currentLayout: null,
      },
      error: null,
    });

    const deps = createSaveDeps();
    deps.currentPage.value = {
      ...deps.currentPage.value!,
      version: "v-stale",
    };
    const localBlocks = [
      createNode({ id: "local-hero" }),
      createNode({ id: "local-cta" }),
    ];
    deps.pageBlocks.value = localBlocks;
    deps.hasUnsavedChanges.value = true;

    const { resolveSaveConflict, saveConflict } = useSavePublish(deps);
    saveConflict.value = true;

    const resolved = await resolveSaveConflict();

    expect(resolved).toBe(true);
    expect(saveConflict.value).toBe(false);
    expect(deps.currentPage.value?.version).toBe("v-server-2");
    expect(deps.composeNonce.value).toBe("nonce-server-fresh");
    expect(deps.pageBlocks.value.map((block) => block.id)).toEqual([
      "local-hero",
      "local-cta",
    ]);
    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(deps.lastSavedSnapshot.value).not.toBe("stale-snapshot");
    expect(composeMock).toHaveBeenCalledWith({
      pageSlug: "home",
      itemType: "page",
    });
  });

  it("does not publish when the publish pointer sees a newer version", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    publishMock.mockResolvedValue({
      data: {
        success: false,
        error: {
          code: "VERSION_CONFLICT",
          message: "This draft is out of date. Reload it before publishing.",
        },
      },
      error: null,
    });

    const deps = createSaveDeps();
    const { handlePublish, saveConflict } = useSavePublish(deps);
    await handlePublish();

    expect(saveConflict.value).toBe(true);
    expect(getItemMock).not.toHaveBeenCalled();
  });

  it("serializes overlapping save calls", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const callOrder: string[] = [];
    let releaseFirstSave: (() => void) | undefined;
    const firstSaveGate = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });

    savePageMock.mockImplementation(async () => {
      callOrder.push("start");
      await firstSaveGate;
      callOrder.push("end");
      return { data: { version: "v1", nonce: "nonce-1" }, error: null };
    });

    const deps = createSaveDeps();
    const { handleSave } = useSavePublish(deps);

    const first = handleSave();
    const second = handleSave();
    await Promise.resolve();

    expect(callOrder).toEqual(["start"]);

    releaseFirstSave?.();
    await Promise.all([first, second]);

    expect(callOrder).toEqual(["start", "end"]);
    expect(savePageMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed save responses before mutating runtime state", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    savePageMock.mockResolvedValue({
      data: { version: 42 },
      error: null,
    });

    const deps = createSaveDeps();
    const originalSnapshot = deps.lastSavedSnapshot.value;
    const originalUpdatedAt = deps.currentPage.value?.updatedAt;
    const { handleSave, currentVersion } = useSavePublish(deps);
    await handleSave();

    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(deps.lastSavedSnapshot.value).toBe(originalSnapshot);
    expect(deps.currentPage.value?.updatedAt).toBe(originalUpdatedAt);
    expect(currentVersion.value).toBeNull();
    expect(refreshPagesNowMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
