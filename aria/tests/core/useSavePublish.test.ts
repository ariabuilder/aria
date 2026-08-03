import { ref } from "vue";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { createNode, createSimplePage } from "../fixtures/testDataGenerator";
import type { SavePublishDeps } from "../../admin/features/Core/composables/useSavePublish";

const {
  composeMock,
  savePageMock,
  saveLayoutMock,
  saveComponentMock,
  updateItemMock,
  publishMock,
  regenerateGlobalCSSMock,
  deliveryStatusMock,
  getItemMock,
  refreshPagesMock,
  refreshPagesNowMock,
  toastSuccessMock,
  toastErrorMock,
  commitSavedComponentToClientCachesMock,
} = vi.hoisted(() => ({
  composeMock: vi.fn(),
  savePageMock: vi.fn(),
  saveLayoutMock: vi.fn(),
  saveComponentMock: vi.fn(),
  updateItemMock: vi.fn(),
  publishMock: vi.fn(),
  regenerateGlobalCSSMock: vi.fn(),
  deliveryStatusMock: vi.fn(),
  getItemMock: vi.fn(),
  refreshPagesMock: vi.fn(),
  refreshPagesNowMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  commitSavedComponentToClientCachesMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: composeMock,
    savePage: savePageMock,
    saveLayout: saveLayoutMock,
    saveComponent: saveComponentMock,
    updateItem: updateItemMock,
    getItem: getItemMock,
    publishing: {
      publish: publishMock,
      deliveryStatus: deliveryStatusMock,
    },
    styles: {
      regenerateGlobalCSS: regenerateGlobalCSSMock,
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

vi.mock("@/features/Core/composables/componentCacheCoherence", () => ({
  commitSavedComponentToClientCaches: commitSavedComponentToClientCachesMock,
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
    const { resetEditorCommitCoordinatorForTests } =
      await import("../../admin/features/Core/composables/editorCommitCoordinator");
    resetEditorCommitCoordinatorForTests();
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
    updateItemMock.mockResolvedValue({
      data: { version: "v-layout-next" },
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
          version: "v2",
          draftVersion: "v2",
          publishedVersion: "v2",
        },
      },
      error: null,
    });
    regenerateGlobalCSSMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          globalCSSHash: "css-v2",
          cssSize: 4096,
          classCount: 24,
        },
      },
      error: null,
    });
    deliveryStatusMock.mockResolvedValue({
      data: {
        success: true,
        data: { jobId: "delivery-job", delivery: "pending" },
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

    expect(savePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
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
      }),
    );
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

  it("publishes the exact saved draft without reloading mutable metadata", async () => {
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
    expect(savePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "page-home",
        blocks: expect.any(Array),
        layout: "default",
        nonce: "nonce-page-home",
        expectedVersion: "v1",
      }),
    );
    expect(publishMock).toHaveBeenCalledWith({
      id: "page-home",
      expectedVersion: "v2",
      skipCSSRegeneration: true,
    });
    expect(regenerateGlobalCSSMock).toHaveBeenCalledTimes(1);
    expect(
      regenerateGlobalCSSMock.mock.invocationCallOrder[0],
    ).toBeLessThan(publishMock.mock.invocationCallOrder[0]!);
    expect(getItemMock).not.toHaveBeenCalled();
    expect(deps.currentPage.value?.status).toBe("published");
    expect(currentVersion.value).toBe("v2");
    expect(deps.composeNonce.value).toBe("nonce-page-home-next");
    expect(composeMock).toHaveBeenCalledTimes(2);
    expect(loadResult?.pageData.title).toBe("Published Home");
    expect(refreshPagesNowMock).toHaveBeenCalledTimes(2);
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Page Published");
  });

  it("shows a success toast for explicit save-and-publish actions", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    const { handleSaveAndPublish } = useSavePublish(deps);

    await handleSaveAndPublish();

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith("Page Published");
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it("keeps durable live delivery automatic and out of the success copy", async () => {
    publishMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          slug: "home",
          htmlSize: 0,
          globalCSSEnabled: true,
          version: "v2",
          draftVersion: "v2",
          publishedVersion: "v2",
          delivery: "pending",
          deliveryJobId: "public-route:publish:page-home:v2",
        },
      },
      error: null,
    });
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");
    const deps = createSaveDeps();
    const { handleSaveAndPublish } = useSavePublish(deps);

    await handleSaveAndPublish();

    expect(toastSuccessMock).toHaveBeenCalledWith("Page Published");
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("reports a malformed publish response instead of failing silently", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    publishMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const deps = createSaveDeps();
    const { handlePublish } = useSavePublish(deps);

    await expect(handlePublish()).resolves.toBe(false);

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith("Invalid publish response");
  });

  it("fails closed before revision promotion when utility CSS regeneration fails", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    regenerateGlobalCSSMock.mockResolvedValueOnce({
      data: {
        success: false,
        error: {
          code: "CSS_REGENERATION_FAILED",
          message: "Utility CSS compilation failed",
        },
      },
      error: null,
    });

    const deps = createSaveDeps();
    const { handlePublish } = useSavePublish(deps);

    await expect(handlePublish()).resolves.toBe(false);

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(regenerateGlobalCSSMock).toHaveBeenCalledTimes(1);
    expect(publishMock).not.toHaveBeenCalled();
    expect(deps.currentPage.value?.status).toBe("draft");
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Utility CSS compilation failed",
    );
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

  it("does not add a second publish error after the prerequisite save fails", async () => {
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
    const { handlePublish } = useSavePublish(deps);
    await handlePublish();

    expect(publishMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "This draft is out of date. Reload it before saving.",
    );
  });

  it("loads the authoritative server draft while preserving local recovery", async () => {
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
      "server-block",
    ]);
    expect(deps.hasUnsavedChanges.value).toBe(false);
    expect(deps.lastSavedSnapshot.value).not.toBe("stale-snapshot");
    expect(composeMock).toHaveBeenCalledWith({
      pageSlug: "home",
      itemType: "page",
    });
  });

  it("refreshes the authoritative shared layout with the page conflict", async () => {
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
          version: "page-v2",
          updatedAt: "2026-07-22T00:00:00.000Z",
          layout: "default",
          frontmatter: {},
          settings: {},
        },
        currentLayout: {
          id: "layout-default",
          slug: "default",
          title: "Default",
          version: "layout-v2",
          slots: [
            {
              name: "header",
              defaultContent: [createNode({ id: "server-header" })],
            },
          ],
          regions: { headerComponent: "global-header" },
        },
      },
      error: null,
    });

    const deps = createSaveDeps();
    deps.currentLayout.value = {
      id: "layout-default",
      slug: "default",
      name: "Default",
      version: "layout-v1",
      nodes: [],
      slots: [
        {
          name: "header",
          defaultContent: [createNode({ id: "local-header" })],
        },
      ],
      metadata: { regions: {} },
    };
    deps.layoutSlotsSnapshot.value = "stale-layout";

    const { resolveSaveConflict } = useSavePublish(deps);
    await expect(resolveSaveConflict()).resolves.toBe(true);

    expect(deps.currentLayout.value?.version).toBe("layout-v2");
    expect(deps.currentLayout.value?.slots[0]?.defaultContent?.[0]?.id).toBe(
      "server-header",
    );
    expect(deps.currentLayout.value?.metadata?.regions).toEqual({
      headerComponent: "global-header",
    });
    expect(deps.layoutSlotsSnapshot.value).not.toBe("stale-layout");
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
    await vi.waitFor(() => expect(callOrder).toEqual(["start"]));

    releaseFirstSave?.();
    await Promise.all([first, second]);

    expect(callOrder).toEqual(["start", "end"]);
    expect(savePageMock).toHaveBeenCalledTimes(1);
  });

  it("commits pending Inspector work before deciding whether a save is needed", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");
    const { trackEditorCommit } =
      await import("../../admin/features/Core/composables/editorCommitCoordinator");

    const deps = createSaveDeps();
    const savePublish = useSavePublish(deps);
    deps.lastSavedSnapshot.value = savePublish.createSnapshot(
      deps.pageBlocks.value,
    );
    deps.hasUnsavedChanges.value = false;

    trackEditorCommit(
      Promise.resolve().then(() => {
        deps.pageBlocks.value.push(createNode({ id: "committed-on-publish" }));
        return true;
      }),
      "Background",
    );

    await savePublish.handlePublish();

    expect(savePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({ id: "committed-on-publish" }),
        ]),
      }),
    );
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: "v2" }),
    );
  });

  it("saves authored metadata even when the reactive dirty flag is stale", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    const savePublish = useSavePublish(deps);
    deps.lastSavedSnapshot.value = savePublish.createSnapshot(
      deps.pageBlocks.value,
    );
    deps.hasUnsavedChanges.value = false;

    deps.currentPage.value!.title = "Direct snapshot wins";
    expect(deps.hasUnsavedChanges.value).toBe(false);

    const outcome = await savePublish.handleSave();

    expect(outcome.status).toBe("saved");
    expect(savePageMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Direct snapshot wins" }),
    );
  });

  it("keeps edits made during an in-flight save dirty without auto-saving twice", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    savePageMock.mockImplementationOnce(async () => {
      deps.pageBlocks.value.push(createNode({ id: "typed-during-save" }));
      return {
        data: { version: "v2", nonce: "nonce-after-save" },
        error: null,
      };
    });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(savePageMock).toHaveBeenCalledTimes(1);
    expect(
      (
        savePageMock.mock.calls[0]?.[0] as { blocks: Array<{ id: string }> }
      ).blocks.map((block) => block.id),
    ).not.toContain("typed-during-save");
    expect(deps.pageBlocks.value.map((block) => block.id)).toContain(
      "typed-during-save",
    );
    expect(deps.hasUnsavedChanges.value).toBe(true);
  });

  it("commits the exact saved component snapshot for dependent canvases", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "component";
    deps.currentPage.value = null;
    deps.currentComponent.value = {
      id: "header",
      name: "Header",
      category: "navigation",
      description: "Site header",
      nodes: [createNode({ id: "old-header" })],
      version: "component-v1",
    };
    deps.pageBlocks.value = [createNode({ id: "saved-header" })];

    saveComponentMock.mockImplementationOnce(async () => {
      deps.pageBlocks.value.push(createNode({ id: "typed-during-save" }));
      return {
        data: {
          version: "component-v2",
          nonce: "nonce-component-v2",
          success: true,
        },
        error: null,
      };
    });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(commitSavedComponentToClientCachesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "header",
        version: "component-v2",
        nodes: [expect.objectContaining({ id: "saved-header" })],
      }),
    );
    expect(
      (
        commitSavedComponentToClientCachesMock.mock.calls[0]?.[0] as {
          nodes: Array<{ id: string }>;
        }
      ).nodes.map((node) => node.id),
    ).not.toContain("typed-during-save");
    expect(deps.currentComponent.value?.version).toBe("component-v2");
    expect(deps.hasUnsavedChanges.value).toBe(true);
  });

  it("retries an ambiguous component save response with the same payload", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "component";
    deps.currentPage.value = null;
    deps.currentComponent.value = {
      id: "header",
      name: "Header",
      nodes: [createNode({ id: "old-header" })],
      version: "component-v1",
    };
    deps.pageBlocks.value = [createNode({ id: "saved-header" })];
    saveComponentMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        data: {
          version: "component-v2",
          success: true,
        },
        error: null,
      });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(saveComponentMock).toHaveBeenCalledTimes(2);
    expect(saveComponentMock.mock.calls[1]?.[0]).toEqual(
      saveComponentMock.mock.calls[0]?.[0],
    );
    expect(deps.currentComponent.value?.version).toBe("component-v2");
    expect(commitSavedComponentToClientCachesMock).toHaveBeenCalledOnce();
  });

  it("retries a resolved ambiguous component save error with the same payload", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "component";
    deps.currentPage.value = null;
    deps.currentComponent.value = {
      id: "header",
      name: "Header",
      nodes: [createNode({ id: "old-header" })],
      version: "component-v1",
    };
    deps.pageBlocks.value = [createNode({ id: "saved-header" })];
    saveComponentMock
      .mockResolvedValueOnce({
        data: undefined,
        error: { code: "SERVICE_UNAVAILABLE", message: "Try again" },
      })
      .mockResolvedValueOnce({
        data: {
          version: "component-v2",
          success: true,
        },
        error: null,
      });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(saveComponentMock).toHaveBeenCalledTimes(2);
    expect(saveComponentMock.mock.calls[1]?.[0]).toEqual(
      saveComponentMock.mock.calls[0]?.[0],
    );
    expect(deps.currentComponent.value?.version).toBe("component-v2");
  });

  it("preserves the local draft when component save status remains unknown", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "component";
    deps.currentPage.value = null;
    deps.currentComponent.value = {
      id: "header",
      name: "Header",
      nodes: [createNode({ id: "old-header" })],
      version: "component-v1",
    };
    deps.pageBlocks.value = [createNode({ id: "unsaved-header" })];
    saveComponentMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(saveComponentMock).toHaveBeenCalledTimes(2);
    expect(commitSavedComponentToClientCachesMock).not.toHaveBeenCalled();
    expect(deps.currentComponent.value?.version).toBe("component-v1");
    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Save status is unknown. Your local draft is preserved; try saving again before publishing.",
    );
  });

  it("does not change component caches when the guarded save fails", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "component";
    deps.currentPage.value = null;
    deps.currentComponent.value = {
      id: "header",
      name: "Header",
      nodes: [createNode({ id: "old-header" })],
      version: "component-v1",
    };
    deps.pageBlocks.value = [createNode({ id: "unsaved-header" })];
    saveComponentMock.mockResolvedValueOnce({
      data: undefined,
      error: {
        code: "VERSION_CONFLICT",
        message: "This draft is out of date.",
      },
    });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(commitSavedComponentToClientCachesMock).not.toHaveBeenCalled();
    expect(deps.currentComponent.value.version).toBe("component-v1");
  });

  it("keeps metadata edited during an in-flight save dirty and recoverable", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    const onDraftSynced = vi.fn();
    deps.onDraftSynced = onDraftSynced;
    savePageMock.mockImplementationOnce(async () => {
      deps.currentPage.value!.title = "Edited during save";
      deps.hasUnsavedChanges.value = true;
      return {
        data: { version: "v2", nonce: "nonce-after-save" },
        error: null,
      };
    });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(deps.currentPage.value?.title).toBe("Edited during save");
    expect(deps.currentPage.value?.version).toBe("v2");
    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(onDraftSynced).toHaveBeenCalledWith("v2", expect.any(String), false);
  });

  it("does not apply an old save response to a newly selected page", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    const onDraftSynced = vi.fn();
    deps.onDraftSynced = onDraftSynced;
    savePageMock.mockImplementationOnce(async () => {
      deps.currentPage.value = createSimplePage("Other", {
        id: "page-other",
        slug: "other",
        title: "Other",
        version: "other-v1",
      });
      deps.pageBlocks.value = [createNode({ id: "other-block" })];
      return {
        data: { version: "v2", nonce: "nonce-after-save" },
        error: null,
      };
    });

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(deps.currentPage.value?.id).toBe("page-other");
    expect(deps.currentPage.value?.version).toBe("other-v1");
    expect(onDraftSynced).not.toHaveBeenCalled();
  });

  it("saves the complete guarded layout document including slot edits", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    const deps = createSaveDeps();
    deps.currentItemType.value = "layout";
    deps.currentPage.value = null;
    deps.currentLayout.value = {
      id: "layout-default",
      slug: "default",
      name: "Default",
      title: "Default layout",
      version: "layout-v1",
      nodes: [],
      slots: [
        {
          name: "header",
          defaultContent: [createNode({ id: "shared-header" })],
        },
      ],
      metadata: { regions: { headerComponent: "global-header" } },
    };
    deps.pageBlocks.value = [createNode({ id: "layout-root" })];
    deps.layoutSlotsSnapshot.value = "stale-layout";

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(updateItemMock).toHaveBeenCalledWith({
      collection: "layouts",
      slug: "default",
      data: expect.objectContaining({
        nodes: [expect.objectContaining({ id: "layout-root" })],
        slots: [
          expect.objectContaining({
            name: "header",
            defaultContent: [expect.objectContaining({ id: "shared-header" })],
          }),
        ],
      }),
      expectedVersion: "layout-v1",
    });
    expect(saveLayoutMock).not.toHaveBeenCalled();
    expect(deps.currentLayout.value?.version).toBe("v-layout-next");
    expect(deps.hasUnsavedChanges.value).toBe(false);
  });

  it("saves page and shared layout edits through one atomic action", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    savePageMock.mockResolvedValueOnce({
      data: {
        version: "page-v2",
        layoutVersion: "layout-v2",
        nonce: "nonce-page-home-next",
      },
      error: null,
    });
    const deps = createSaveDeps();
    deps.currentLayout.value = {
      id: "layout-default",
      slug: "default",
      name: "Default",
      version: "layout-v1",
      nodes: [],
      slots: [
        {
          name: "header",
          defaultContent: [createNode({ id: "shared-header" })],
        },
      ],
    };
    deps.layoutSlotsSnapshot.value = "stale-layout";

    const { handleSave } = useSavePublish(deps);
    await handleSave();

    expect(updateItemMock).not.toHaveBeenCalled();
    expect(savePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: "v1",
        layoutDraft: {
          id: "default",
          expectedVersion: "layout-v1",
          dsl: expect.objectContaining({
            id: "layout-default",
            slots: [
              expect.objectContaining({
                defaultContent: [
                  expect.objectContaining({ id: "shared-header" }),
                ],
              }),
            ],
          }),
        },
      }),
    );
    expect(deps.currentPage.value?.version).toBe("page-v2");
    expect(deps.currentLayout.value?.version).toBe("layout-v2");
  });

  it("does not mark edits made during publish as published or clean", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    let finishPublish:
      | ((value: Awaited<ReturnType<typeof publishMock>>) => void)
      | undefined;
    publishMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPublish = resolve;
      }),
    );

    const deps = createSaveDeps();
    const { handlePublish, currentVersion } = useSavePublish(deps);
    const publishing = handlePublish();
    await vi.waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));

    deps.pageBlocks.value.push(createNode({ id: "typed-during-publish" }));
    deps.hasUnsavedChanges.value = true;
    finishPublish?.({
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
          version: "v2",
          draftVersion: "v2",
          publishedVersion: "v2",
        },
      },
      error: null,
    });
    await publishing;

    expect(deps.currentPage.value?.status).toBe("published");
    expect(deps.currentPage.value?.isModifiedSincePublish).toBe(true);
    expect(deps.hasUnsavedChanges.value).toBe(true);
    expect(currentVersion.value).toBe("v2");
  });

  it("never downgrades a newer saved draft when an older publish completes", async () => {
    const { useSavePublish } =
      await import("../../admin/features/Core/composables/useSavePublish");

    let finishPublish:
      | ((value: Awaited<ReturnType<typeof publishMock>>) => void)
      | undefined;
    publishMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finishPublish = resolve;
      }),
    );

    const deps = createSaveDeps();
    const { handlePublish, currentVersion } = useSavePublish(deps);
    const publishing = handlePublish();
    await vi.waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));

    deps.currentPage.value!.version = "v3";
    deps.hasUnsavedChanges.value = false;
    finishPublish?.({
      data: {
        success: true,
        data: {
          slug: "home",
          htmlSize: 2048,
          globalCSSEnabled: true,
          published: true,
          version: "v2",
          draftVersion: "v2",
          publishedVersion: "v2",
        },
      },
      error: null,
    });
    await publishing;

    expect(deps.currentPage.value?.version).toBe("v3");
    expect(deps.currentPage.value?.isModifiedSincePublish).toBe(true);
    expect(currentVersion.value).toBe("v3");
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
