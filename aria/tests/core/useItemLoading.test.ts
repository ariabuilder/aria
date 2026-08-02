import { ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../lib/types/nodes";
import {
  createNode,
  createSimpleLayout,
  createSimplePage,
} from "../fixtures/testDataGenerator";

const { composeMock, getItemMock } = vi.hoisted(() => ({
  composeMock: vi.fn(),
  getItemMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    compose: composeMock,
    getItem: getItemMock,
  },
}));

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function componentRef(component: ComponentDSL | null): Ref<ComponentDSL | null> {
  return ref(component as unknown) as Ref<ComponentDSL | null>;
}

function createAppState() {
  return {
    pageBlocks: pageBlocksRef([]),
    composeNonce: ref<string | null>(null),
    currentPage: pageRef(null),
    currentLayout: layoutRef(null),
    currentComponent: componentRef(null),
    currentItemType: ref<"page" | "layout" | "component">("page"),
    selectedLayoutRegion: ref<string | null>(null),
    hasUnsavedChanges: ref(true),
    lastSavedSnapshot: ref("stale-snapshot"),
    layoutSlotsSnapshot: ref(""),
    loadingState: ref({
      isLoading: false,
      loadError: null,
    }),
  };
}

async function startEditingForSlug(
  itemType: "page" | "layout" | "component",
  itemSlug: string,
): Promise<void> {
  const { useAppRouter } = await import("@/features/Core");
  useAppRouter().startEditing({ itemType, itemSlug });
}

function createComposeResult(overrides?: {
  slug?: string;
  title?: string;
  blockId?: string;
}) {
  const slug = overrides?.slug ?? "home";
  const title = overrides?.title ?? "Home Page";
  const blockId = overrides?.blockId ?? "page-block-1";

  return {
    data: {
      pageBlocks: [createNode({ id: blockId })],
      originalNodes: [createNode({ id: "original-block-1" })],
      nonce: "nonce-home",
      pageMetadata: {
        id: `page-${slug}`,
        title,
        description: "Saved description",
        slug,
        version: "v-current",
        status: "draft",
        updatedAt: "2026-03-31T22:00:00.000Z",
        layout: "default",
        regions: {},
        frontmatter: {},
        settings: {
          cssVariables: { "--brand": "#111111" },
          breakpoints: [],
          seo: {
            title: "Saved SEO title",
            description: "Saved SEO description",
            noindex: false,
            nofollow: false,
          },
        },
      },
      currentLayout: {
        id: "default",
        slug: "default",
        title: "Default Layout",
        version: "layout-v1",
        slots: [
          { name: "header", label: "Header", required: true },
          {
            name: "main",
            label: "Main",
            required: true,
            isDefault: true,
            defaultContent: [createNode({ id: "slot-main-default" })],
          },
          { name: "footer", label: "Footer", required: true },
        ],
        regions: {},
      },
    },
    error: null,
  };
}

describe("useItemLoading", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "debug").mockImplementation(() => undefined);

    const { clearComposeCache } =
      await import("../../admin/composables/composeClientCache");
    const { __resetItemLoadingGenerationsForTests } =
      await import("../../admin/composables/useItemLoading");
    clearComposeCache();
    __resetItemLoadingGenerationsForTests();

    const { setFeatureFlagCacheForTests } = await import("../../lib/features");
    setFeatureFlagCacheForTests({
      "studio.layouts": true,
      "studio.agent": true,
    });

    const { useAppRouter } = await import("@/features/Core");
    useAppRouter().stopEditing();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a page through compose and synchronizes the builder runtime state", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    composeMock.mockResolvedValue(createComposeResult());

    await startEditingForSlug("page", "home");

    const appState = createAppState();
    const setSelectedBlock = vi.fn();
    const createSnapshot = vi.fn(
      (blocks: Array<{ id: string }>) =>
        `snapshot:${blocks.map((block) => block.id).join(",")}`,
    );

    const loader = useItemLoading(appState, setSelectedBlock, createSnapshot);
    const result = await loader.loadPage("home");

    expect(result?.pageData.slug).toBe("home");
    expect(result?.pageData.title).toBe("Home Page");
    expect(result?.layoutData?.id).toBe("default");
    expect(appState.currentItemType.value).toBe("page");
    expect(appState.currentPage.value?.slug).toBe("home");
    expect(appState.currentPage.value?.version).toBe("v-current");
    expect(appState.currentPage.value?.description).toBe("Saved description");
    expect(appState.currentPage.value?.settings?.seo?.title).toBe(
      "Saved SEO title",
    );
    expect(appState.currentLayout.value?.id).toBe("default");
    expect(appState.currentLayout.value?.version).toBe("layout-v1");
    expect(appState.composeNonce.value).toBe("nonce-home");
    expect(appState.pageBlocks.value.map((block) => block.id)).toEqual([
      "page-block-1",
    ]);
    expect(appState.lastSavedSnapshot.value).toBe("snapshot:page-block-1");
    expect(appState.hasUnsavedChanges.value).toBe(false);
    expect(setSelectedBlock).toHaveBeenCalledTimes(1);
  });

  it("preserves page policy metadata from compose responses", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    const composeResult = createComposeResult({
      slug: "post-template",
      title: "Post Template",
    });
    Object.assign(composeResult.data.pageMetadata, {
      systemRole: "cms-entry",
      accessMode: "public",
      hasPassword: false,
    });
    composeMock.mockResolvedValue(composeResult);

    await startEditingForSlug("page", "post-template");

    const appState = createAppState();
    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot:page-block-1"),
    );

    const result = await loader.loadPage("post-template");

    expect(result?.pageData.systemRole).toBe("cms-entry");
    expect(result?.pageData.accessMode).toBe("public");
    expect(result?.pageData.hasPassword).toBe(false);
    expect(appState.currentPage.value?.systemRole).toBe("cms-entry");
  });

  it("preserves full layout slot metadata from compose responses", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    composeMock.mockResolvedValue(createComposeResult());

    await startEditingForSlug("page", "home");

    const appState = createAppState();
    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot:page-block-1"),
    );

    const result = await loader.loadPage("home");
    const mainSlot = result?.layoutData?.slots.find(
      (slot: { name: string }) => slot.name === "main",
    );

    expect(mainSlot).toMatchObject({
      name: "main",
      label: "Main",
      required: true,
      isDefault: true,
    });
    expect(mainSlot?.defaultContent?.map((node) => node.id)).toEqual([
      "slot-main-default",
    ]);
    expect(
      appState.currentLayout.value?.slots.find(
        (slot: { name: string; isDefault?: boolean }) => slot.name === "main",
      )?.isDefault,
    ).toBe(true);
  });

  it("does not mark load-time slot cleanup as a user edit", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    const composeResult = createComposeResult();
    composeResult.data.pageBlocks = [
      createNode({ id: "legacy-header-root", slot: "header" }),
      createNode({ id: "page-content-root", slot: "main" }),
    ];
    composeMock.mockResolvedValue(composeResult);

    await startEditingForSlug("page", "home");

    const appState = createAppState();
    const createSnapshot = (blocks: BuilderNode[]) =>
      `snapshot:${blocks.map((block) => block.id).join(",")}`;
    const loader = useItemLoading(appState, vi.fn(), createSnapshot);

    await loader.loadPage("home");

    expect(appState.pageBlocks.value.map((block) => block.id)).toEqual([
      "page-content-root",
    ]);
    expect(appState.lastSavedSnapshot.value).toBe(
      "snapshot:page-content-root",
    );
    expect(appState.hasUnsavedChanges.value).toBe(false);
  });

  it("reuses the same in-flight compose request for prefetch and load", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    let resolveCompose:
      | ((value: ReturnType<typeof createComposeResult>) => void)
      | undefined;
    composeMock.mockReturnValue(
      new Promise<ReturnType<typeof createComposeResult>>((resolve) => {
        resolveCompose = resolve;
      }),
    );

    await startEditingForSlug("page", "home");

    const appState = createAppState();
    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot:page-block-1"),
    );

    const prefetchPromise = loader.prefetchPageData("home");
    const loadPromise = loader.loadPage("home");

    expect(composeMock).toHaveBeenCalledTimes(1);

    resolveCompose!(createComposeResult());

    const result = await loadPromise;
    await prefetchPromise;

    expect(result?.pageData.slug).toBe("home");
    expect(appState.pageBlocks.value.map((block) => block.id)).toEqual([
      "page-block-1",
    ]);
  });

  it("rejects invalid layout payloads before mutating layout-editing state", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    getItemMock.mockResolvedValue({
      data: {
        id: "broken-layout",
        slots: "not-an-array",
      },
      error: null,
    });

    const appState = createAppState();
    appState.currentLayout.value = createSimpleLayout("Existing Layout", {
      id: "existing-layout",
    });

    await startEditingForSlug("layout", "broken-layout");

    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot"),
    );
    await loader.loadLayout("broken-layout");

    expect(appState.currentLayout.value).toBeNull();
    expect(appState.currentItemType.value).toBe("page");
    expect(loader.loadError.value).toBe("Invalid layout DSL returned");
  });

  it("rejects malformed page compose payloads before mutating page-editing state", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [{ id: "broken-node" }],
        originalNodes: [createNode({ id: "original-node" })],
        nonce: "nonce-home",
        pageMetadata: {
          slug: "home",
          title: "Home",
          settings: {},
        },
      },
      error: null,
    });

    const appState = createAppState();
    appState.currentPage.value = createSimplePage("Existing Page", {
      id: "existing-page",
      slug: "existing-page",
      title: "Existing Page",
    });
    appState.pageBlocks.value = [createNode({ id: "keep-page-block" })];

    await startEditingForSlug("page", "home");

    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot"),
    );
    const result = await loader.loadPage("home");

    expect(result).toBeNull();
    expect(appState.currentPage.value).toBeNull();
    expect(appState.pageBlocks.value).toEqual([]);
    expect(loader.loadError.value).toBe("Invalid compose data returned");
  });

  it("rejects malformed component compose payloads before mutating component-editing state", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    composeMock.mockResolvedValue({
      data: {
        pageBlocks: [createNode({ id: "component-block" })],
        originalNodes: [createNode({ id: "component-source" })],
        nonce: "nonce-component",
        pageMetadata: {
          id: "component-card",
          title: "Card",
          slug: "card",
          settings: {},
          propSchema: "not-an-array",
        },
      },
      error: null,
    });

    const appState = createAppState();
    appState.currentComponent.value = {
      id: "existing-component",
      name: "Existing Component",
      nodes: [createNode({ id: "keep-component-block" })],
    };

    await startEditingForSlug("component", "card");

    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn(() => "snapshot"),
    );
    await loader.loadComponent("card");

    expect(appState.currentComponent.value).toBeNull();
    expect(appState.pageBlocks.value).toEqual([]);
    expect(loader.loadError.value).toBe("Invalid compose data returned");
  });

  it("ignores stale page load results when a newer page load superseded it", async () => {
    const { useItemLoading } =
      await import("../../admin/composables/useItemLoading");

    let resolveHome:
      | ((value: ReturnType<typeof createComposeResult>) => void)
      | undefined;
    let resolveAbout:
      | ((value: ReturnType<typeof createComposeResult>) => void)
      | undefined;

    composeMock
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof createComposeResult>>((resolve) => {
            resolveHome = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ReturnType<typeof createComposeResult>>((resolve) => {
            resolveAbout = resolve;
          }),
      );

    const appState = createAppState();
    appState.currentPage.value = createSimplePage("Stale Page", {
      id: "stale-page",
      slug: "stale",
      title: "Stale Page",
    });
    appState.pageBlocks.value = [createNode({ id: "stale-block" })];

    const loader = useItemLoading(
      appState,
      vi.fn(),
      vi.fn((blocks: Array<{ id: string }>) =>
        `snapshot:${blocks.map((block) => block.id).join(",")}`,
      ),
    );

    const { useAppRouter } = await import("@/features/Core");
    const appRouter = useAppRouter();

    appRouter.startEditing({ itemType: "page", itemSlug: "home" });
    const homePromise = loader.loadPage("home");

    appRouter.startEditing({ itemType: "page", itemSlug: "about" });
    const aboutPromise = loader.loadPage("about");

    resolveAbout!(
      createComposeResult({
        slug: "about",
        title: "About Page",
        blockId: "about-block",
      }),
    );
    await aboutPromise;

    resolveHome!(
      createComposeResult({
        slug: "home",
        title: "Home Page",
        blockId: "home-block",
      }),
    );
    const homeResult = await homePromise;

    expect(homeResult).toBeNull();
    expect(appState.currentPage.value?.slug).toBe("about");
    expect(appState.pageBlocks.value.map((block) => block.id)).toEqual([
      "about-block",
    ]);
  });
});
