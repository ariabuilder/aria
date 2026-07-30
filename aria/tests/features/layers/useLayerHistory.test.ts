import { describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../lib/types/nodes";
import { snapshotLayoutSlots } from "../../../lib/layouts/slotEditing";
import { useLayerHistory } from "../../../admin/features/Layers/composables/useLayerHistory";

const { mockRecordLayerReorder } = vi.hoisted(() => ({
  mockRecordLayerReorder: vi.fn(),
}));

vi.mock(
  "../../../admin/features/Layers/composables/useLayerReorderHistory",
  () => ({
    useLayerReorderHistory: () => ({
      recordLayerReorder: mockRecordLayerReorder,
    }),
  }),
);

function createNode(id: string, type: string): BuilderNode {
  return {
    id,
    type,
    props: {},
    styles: {},
    children: [],
  };
}

function nodeListRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

describe("useLayerHistory", () => {
  it("restores layout slots through a writable currentLayout ref", async () => {
    mockRecordLayerReorder.mockReset();
    mockRecordLayerReorder.mockImplementation(async (input) => {
      if (!input.alreadyApplied) {
        await input.applyBlocks(input.nextBlocks ?? []);
        if (input.applyLayoutSnapshot && input.nextLayoutSnapshot) {
          await input.applyLayoutSnapshot(input.nextLayoutSnapshot);
        }
      }
      return { success: true };
    });

    const node = createNode("footer-section", "Footer");
    const pageBlocks = nodeListRef([node]);
    const currentLayout = layoutRef({
      id: "layout-1",
      name: "Full Width",
      slots: [
        { name: "footer", defaultContent: [] },
        { name: "main", isDefault: true },
      ],
    } as LayoutDSL);

    const emittedBlocks: BuilderNode[][] = [];
    const { recordStateChange } = useLayerHistory({
      blocks: pageBlocks,
      currentLayout,
      currentItemType: ref("page"),
      currentItemSlug: ref("index"),
      emitUpdateBlocks: (blocks) => {
        emittedBlocks.push(blocks);
      },
    });

    const previousLayoutSnapshot = snapshotLayoutSlots(currentLayout.value!);
    currentLayout.value = {
      ...currentLayout.value!,
      slots: currentLayout.value!.slots?.map((slot) =>
        slot.name === "footer" ? { ...slot, defaultContent: [node] } : slot,
      ),
    } as LayoutDSL;
    pageBlocks.value = [];

    const nextLayoutSnapshot = snapshotLayoutSlots(currentLayout.value!);

    recordStateChange({
      previousBlocks: [node],
      nextBlocks: [],
      description: "Move node to footer slot",
      previousLayoutSnapshot,
      nextLayoutSnapshot,
    });

    await vi.waitFor(() => {
      expect(mockRecordLayerReorder).toHaveBeenCalled();
    });

    const input = mockRecordLayerReorder.mock.calls[0]?.[0];
    expect(input?.applyLayoutSnapshot).toBeTypeOf("function");
    expect(input?.alreadyApplied).toBe(true);
    expect(emittedBlocks).toEqual([]);

    const beforeRedo = snapshotLayoutSlots(currentLayout.value!);
    await input?.applyLayoutSnapshot?.(previousLayoutSnapshot);
    expect(snapshotLayoutSlots(currentLayout.value!)).toBe(
      previousLayoutSnapshot,
    );

    await input?.applyLayoutSnapshot?.(nextLayoutSnapshot);
    expect(snapshotLayoutSlots(currentLayout.value!)).toBe(beforeRedo);

    await input?.applyBlocks?.([]);
    expect(emittedBlocks.at(-1)).toEqual([]);
  });

  it("applies a reorder once before deferring its history record", async () => {
    mockRecordLayerReorder.mockReset();
    mockRecordLayerReorder.mockResolvedValue({ success: true });
    const first = createNode("first", "Text");
    const second = createNode("second", "Text");
    const pageBlocks = nodeListRef([first, second]);
    const emittedBlocks: BuilderNode[][] = [];
    const { updateBlocksWithHistory } = useLayerHistory({
      blocks: pageBlocks,
      currentLayout: layoutRef(null),
      currentItemType: ref("page"),
      currentItemSlug: ref("index"),
      emitUpdateBlocks: (blocks) => {
        emittedBlocks.push(blocks);
      },
    });

    updateBlocksWithHistory([second, first], "Reordered layer");

    expect(emittedBlocks).toEqual([[second, first]]);
    expect(mockRecordLayerReorder).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(mockRecordLayerReorder).toHaveBeenCalledTimes(1);
    });

    expect(mockRecordLayerReorder.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        previousBlocks: [first, second],
        nextBlocks: [second, first],
        alreadyApplied: true,
      }),
    );
    expect(emittedBlocks).toHaveLength(1);
  });
});
