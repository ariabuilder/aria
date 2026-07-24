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
      await input.applyBlocks(input.nextBlocks ?? []);
      if (input.applyLayoutSnapshot && input.nextLayoutSnapshot) {
        await input.applyLayoutSnapshot(input.nextLayoutSnapshot);
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
        slot.name === "footer"
          ? { ...slot, defaultContent: [node] }
          : slot,
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

    const beforeRedo = snapshotLayoutSlots(currentLayout.value!);
    await input?.applyLayoutSnapshot?.(previousLayoutSnapshot);
    expect(snapshotLayoutSlots(currentLayout.value!)).toBe(
      previousLayoutSnapshot,
    );

    await input?.applyLayoutSnapshot?.(nextLayoutSnapshot);
    expect(snapshotLayoutSlots(currentLayout.value!)).toBe(beforeRedo);
    expect(emittedBlocks.at(-1)).toEqual([]);
  });
});
