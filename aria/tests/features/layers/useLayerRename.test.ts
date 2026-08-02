import { describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { BuilderNode, LayoutDSL } from "../../../lib/types/nodes";
import { useEditorNodeRegistry } from "../../../admin/features/Core/composables/useEditorNodeRegistry";
import { useLayerRename } from "../../../admin/features/Layers/composables/useLayerRename";
import type { LayerStateChangeRecord } from "../../../admin/features/Layers/composables/useLayerHistory";

const section = (
  id: string,
  children: BuilderNode[] = [],
  slot?: string,
): BuilderNode => ({
  id,
  type: "Section",
  props: {},
  styles: {},
  children,
  slot,
});

const layout = (): LayoutDSL => ({
  id: "site-layout",
  name: "Site layout",
  nodes: [],
  slots: [
    {
      name: "header",
      defaultContent: [section("header-section", [], "header")],
    },
    {
      name: "main",
      isDefault: true,
    },
  ],
});

describe("useLayerRename", () => {
  it("renames the canonical page node when Layers supplied a display clone", () => {
    const pageBlocks = shallowRef<BuilderNode[]>([section("main-section")]);
    const currentLayout = shallowRef<LayoutDSL | null>(layout());
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot: ref({ name: "main", scope: "page" }),
      currentItemType: ref("page"),
    });
    const displayNode = registry.getDisplayNodesForSlot("main")[0];
    const emitUpdateBlocks = vi.fn<(blocks: BuilderNode[]) => void>();
    const changes: LayerStateChangeRecord[] = [];
    const { renameNode } = useLayerRename({
      blocks: pageBlocks,
      currentLayout,
      nodeRegistry: registry,
      emitUpdateBlocks,
      recordStateChange: (change) => changes.push(change),
    });

    expect(displayNode).not.toBe(pageBlocks.value[0]);
    expect(displayNode?.metadata).toBeUndefined();

    const result = renameNode("main-section", "Hero");

    expect(result).toEqual({ success: true, store: "page-root" });
    expect(pageBlocks.value[0]?.metadata?.label).toBe("Hero");
    expect(displayNode?.metadata).toBeUndefined();
    expect(registry.getDisplayNodesForSlot("main")[0]?.metadata?.label).toBe(
      "Hero",
    );
    expect(emitUpdateBlocks).toHaveBeenCalledOnce();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.previousBlocks[0]?.metadata).toBeUndefined();
    expect(changes[0]?.nextBlocks[0]?.metadata?.label).toBe("Hero");
    expect(changes[0]?.previousBlocks).not.toBe(changes[0]?.nextBlocks);
  });

  it("immutably renames a nested canonical page node", () => {
    const child = section("nested-section");
    const root = section("root-section", [child]);
    const pageBlocks = shallowRef<BuilderNode[]>([root]);
    const currentLayout = shallowRef<LayoutDSL | null>(null);
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot: ref({ name: "page-content", scope: "page" }),
      currentItemType: ref("page"),
    });
    const { renameNode } = useLayerRename({
      blocks: pageBlocks,
      currentLayout,
      nodeRegistry: registry,
      emitUpdateBlocks: vi.fn(),
      recordStateChange: vi.fn(),
    });

    const result = renameNode("nested-section", "Features");

    expect(result).toEqual({ success: true, store: "page-root" });
    expect(pageBlocks.value[0]).not.toBe(root);
    expect(pageBlocks.value[0]?.children?.[0]).not.toBe(child);
    expect(pageBlocks.value[0]?.children?.[0]?.metadata?.label).toBe(
      "Features",
    );
    expect(child.metadata).toBeUndefined();
  });

  it("renames shared layout-slot content and records layout history", () => {
    const pageBlocks = shallowRef<BuilderNode[]>([section("main-section")]);
    const currentLayout = shallowRef<LayoutDSL | null>(layout());
    const registry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot: ref({ name: "header", scope: "layout" }),
      currentItemType: ref("page"),
    });
    const emitUpdateBlocks = vi.fn<(blocks: BuilderNode[]) => void>();
    const changes: LayerStateChangeRecord[] = [];
    const { renameNode } = useLayerRename({
      blocks: pageBlocks,
      currentLayout,
      nodeRegistry: registry,
      emitUpdateBlocks,
      recordStateChange: (change) => changes.push(change),
    });

    const result = renameNode("header-section", "Site Header");

    expect(result).toEqual({ success: true, store: "layout-slot" });
    expect(
      currentLayout.value?.slots[0]?.defaultContent?.[0]?.metadata?.label,
    ).toBe("Site Header");
    expect(emitUpdateBlocks).not.toHaveBeenCalled();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.previousLayoutSnapshot).not.toBe(
      changes[0]?.nextLayoutSnapshot,
    );
    expect(changes[0]?.previousBlocks).toEqual(changes[0]?.nextBlocks);
  });

  it("fails closed when the node no longer exists", () => {
    const pageBlocks = shallowRef<BuilderNode[]>([section("main-section")]);
    const { renameNode } = useLayerRename({
      blocks: pageBlocks,
      emitUpdateBlocks: vi.fn(),
      recordStateChange: vi.fn(),
    });

    expect(renameNode("missing", "Missing")).toEqual({
      success: false,
      reason: "NODE_NOT_FOUND",
    });
    expect(pageBlocks.value[0]?.metadata).toBeUndefined();
  });
});
