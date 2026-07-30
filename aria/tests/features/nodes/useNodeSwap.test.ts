import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../lib/types/nodes";
import { useNodeSwap } from "../../../admin/features/Nodes/composables/useNodeSwap";
import { IconReferenceSchema } from "../../../lib/icons/reference";

const { actionsMock, toastMock } = vi.hoisted(() => ({
  actionsMock: {
    replaceNode: vi.fn(async () => ({
      data: { version: "v-1" },
      error: null,
    })),
  },
  toastMock: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("astro:actions", () => ({
  actions: actionsMock,
}));

vi.mock("vue-sonner", () => ({
  toast: toastMock,
}));

function createNode(
  id: string,
  type: string,
  props: BuilderNode["props"] = {},
): BuilderNode {
  return {
    id,
    type,
    props,
    styles: {},
    children: [],
  };
}

function pageBlocksRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

const createNodeEventExecutorMock = (options?: { runRedo?: boolean }) =>
  vi.fn(
    async (
      _metadata: unknown,
      callbacks: { redo?: () => void | Promise<void> },
    ) => {
      if (options?.runRedo && callbacks.redo) {
        await callbacks.redo();
      }
      return { success: true };
    },
  );

describe("useNodeSwap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists replace options for svg and icon nodes", () => {
    const pageBlocks = pageBlocksRef([
      createNode("svg-1", "Svg"),
      createNode("icon-1", "icon"),
      createNode("div-1", "div"),
    ]);

    const { getSwapOptionsForNode } = useNodeSwap({
      pageBlocks,
      executeNodeEventOperation: createNodeEventExecutorMock(),
      setSelectedBlock: vi.fn(),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    expect(getSwapOptionsForNode(pageBlocks.value[0]!)).toEqual([
      { id: "svg-to-icon", label: "Icon" },
    ]);
    expect(getSwapOptionsForNode(pageBlocks.value[1]!)).toEqual([
      { id: "icon-to-svg", label: "SVG" },
    ]);
    expect(getSwapOptionsForNode(pageBlocks.value[2]!)).toEqual([]);
  });

  it("swaps svg to icon locally without creating a server revision", async () => {
    const pageBlocks = pageBlocksRef([createNode("svg-1", "svg")]);
    const setSelectedBlock = vi.fn();

    const { swapNode } = useNodeSwap({
      pageBlocks,
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await swapNode("svg-1", "svg-to-icon");

    expect(actionsMock.replaceNode).not.toHaveBeenCalled();
    expect(pageBlocks.value[0]?.type).toBe("icon");
    expect(
      IconReferenceSchema.safeParse(pageBlocks.value[0]?.props.icon).success,
    ).toBe(true);
    expect(setSelectedBlock).toHaveBeenCalledWith("svg-1");
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("swaps svg to icon in layout slot without calling replaceNode", async () => {
    const svgNode = createNode("svg-layout-1", "Svg");
    const layoutSlotRoots = pageBlocksRef([svgNode]);
    const pageBlocks = pageBlocksRef([]);
    const currentLayout = layoutRef({
      id: "default",
      name: "Default",
      nodes: [],
      slots: [
        {
          name: "header",
          label: "Header",
          defaultContent: layoutSlotRoots.value,
        },
      ],
    } as LayoutDSL);
    const setSelectedBlock = vi.fn();

    const editorNodeRegistry = {
      getEditableTreeForNode: vi.fn(() => ({
        roots: layoutSlotRoots.value,
        commit: (roots: BuilderNode[]) => {
          layoutSlotRoots.value = roots;
          const slot = currentLayout.value!.slots?.[0];
          if (slot) {
            slot.defaultContent = roots;
          }
        },
      })),
      locateNode: vi.fn(() => ({
        node: svgNode,
        store: { kind: "layout-slot" as const, slotName: "header" },
        parentId: null,
        index: 0,
      })),
    };

    const { swapNode } = useNodeSwap({
      pageBlocks,
      currentLayout,
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock,
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
      editorNodeRegistry: editorNodeRegistry as never,
    });

    await swapNode("svg-layout-1", "svg-to-icon");

    expect(actionsMock.replaceNode).not.toHaveBeenCalled();
    expect(layoutSlotRoots.value[0]?.type).toBe("icon");
    expect(setSelectedBlock).toHaveBeenCalledWith("svg-layout-1");
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("does not swap icon to svg without a canonical icon id", async () => {
    const pageBlocks = pageBlocksRef([
      createNode("icon-1", "icon", { icon: "invalid" }),
    ]);

    const { swapNode } = useNodeSwap({
      pageBlocks,
      executeNodeEventOperation: createNodeEventExecutorMock({ runRedo: true }),
      setSelectedBlock: vi.fn(),
      resolveMutationPath: () => ({ collection: "pages", id: "page-1" }),
    });

    await swapNode("icon-1", "icon-to-svg");

    expect(actionsMock.replaceNode).not.toHaveBeenCalled();
    expect(pageBlocks.value[0]?.type).toBe("icon");
    expect(toastMock.error).toHaveBeenCalled();
  });
});
