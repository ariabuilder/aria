import { ref, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BuilderNode, LayoutDSL, PageDSL } from "../../lib/types/nodes";

const { recordLayoutSelectionChangeMock, recordLayoutMetadataUpdateMock } =
  vi.hoisted(() => ({
    recordLayoutSelectionChangeMock: vi.fn(),
    recordLayoutMetadataUpdateMock: vi.fn(),
  }));

vi.mock("../../admin/features/Stage/composables/useStageLayoutHistory", () => ({
  useStageLayoutHistory: () => ({
    recordLayoutSelectionChange: recordLayoutSelectionChangeMock,
    recordLayoutMetadataUpdate: recordLayoutMetadataUpdateMock,
  }),
}));

vi.mock("../../admin/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canEditPageStructure: { value: true },
  }),
}));

function pageRef(page: PageDSL | null): Ref<PageDSL | null> {
  return ref(page as unknown) as Ref<PageDSL | null>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

describe("useStageLayoutActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    recordLayoutSelectionChangeMock.mockImplementation(async (input) => {
      await input.applyLayoutSelection(input.nextLayout);
      return { success: true };
    });

    recordLayoutMetadataUpdateMock.mockImplementation(async (input) => {
      await input.applyMetadata(input.nextMetadata);
      return { success: true };
    });
  });

  it("applies layout selection only through the history helper and saves once", async () => {
    const { useStageLayoutActions } =
      await import("../../admin/features/Stage/composables/useStageLayoutActions");

    const handleLoadLayoutDataOnly = vi.fn(async (slug: string) => ({
      id: slug,
      name: slug,
      slug,
      nodes: [],
      slots: [],
    }));
    const handleSave = vi.fn(async () => {});
    const currentPage = pageRef({
      id: "home",
      slug: "home",
      title: "Home",
      nodes: [],
      layout: "marketing-shell",
    });
    const currentLayout = layoutRef(null);
    const pageBlocks = pageBlocksRef([]);

    const { handleLayoutUpdate } = useStageLayoutActions({
      currentPage,
      currentLayout,
      currentItemType: ref("page"),
      pageBlocks,
      history: { execute: vi.fn() } as never,
      handleLoadLayoutDataOnly,
      handleSave,
    });

    handleLayoutUpdate("docs-shell");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordLayoutSelectionChangeMock).toHaveBeenCalledTimes(1);
    expect(currentPage.value?.layout).toBe("docs-shell");
    expect(handleLoadLayoutDataOnly).toHaveBeenCalledTimes(1);
    expect(handleLoadLayoutDataOnly).toHaveBeenCalledWith("docs-shell");
    expect(currentLayout.value?.slug).toBe("docs-shell");
    expect(handleSave).toHaveBeenCalledTimes(1);
  });

  it("applies layout metadata only through the history helper and saves once", async () => {
    const { useStageLayoutActions } =
      await import("../../admin/features/Stage/composables/useStageLayoutActions");

    const handleSave = vi.fn(async () => {});
    const currentLayout = layoutRef({
      id: "docs-shell",
      name: "Docs Shell",
      slug: "docs-shell",
      nodes: [],
      slots: [],
      metadata: {
        description: "Original",
      },
    });

    const { handleLayoutMetadataUpdate } = useStageLayoutActions({
      currentPage: pageRef(null),
      currentLayout,
      currentItemType: ref("layout"),
      pageBlocks: pageBlocksRef([]),
      history: { execute: vi.fn() } as never,
      handleLoadLayoutDataOnly: vi.fn(),
      handleSave,
    });

    await handleLayoutMetadataUpdate({
      description: "Updated",
      layoutType: "docs",
      slots: [{ name: "main", required: true }],
    });

    expect(recordLayoutMetadataUpdateMock).toHaveBeenCalledTimes(1);
    expect(currentLayout.value?.metadata).toEqual({
      description: "Updated",
      layoutType: "docs",
      slots: [{ name: "main", required: true }],
    });
    expect(handleSave).toHaveBeenCalledTimes(1);
  });
});
