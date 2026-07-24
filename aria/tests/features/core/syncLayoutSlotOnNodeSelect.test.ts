import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref, type Ref } from "vue";
import type { LayoutDSL } from "../../../lib/types/nodes";
import { useActiveLayoutSlot } from "../../../admin/features/Core/composables/useActiveLayoutSlot";
import { syncLayoutSlotOnNodeSelect } from "../../../admin/features/Core/lib/syncLayoutSlotOnNodeSelect";
import type { LocatedEditorNode } from "../../../admin/features/Core/composables/useEditorNodeRegistry";

const toastFn = vi.fn();

vi.mock("vue-sonner", () => ({
  toast: (...args: unknown[]) => toastFn(...args),
}));

const layoutWithSlots = {
  id: "layout-1",
  title: "Full Width",
  name: "full-width",
  slots: [
    { name: "header", label: "Header", defaultContent: [] },
    { name: "main", isDefault: true, label: "Main" },
    { name: "footer", label: "Footer", defaultContent: [] },
  ],
} as LayoutDSL;

function layoutRef(layout: LayoutDSL | null): Ref<LayoutDSL | null> {
  return ref(layout as unknown) as Ref<LayoutDSL | null>;
}

function createActiveSlot() {
  const currentLayout = layoutRef(layoutWithSlots);
  const currentItemType = ref<"page" | "layout" | "component">("page");
  const activeLayoutSlot = useActiveLayoutSlot({ currentLayout, currentItemType });
  return { currentLayout, currentItemType, activeLayoutSlot };
}

describe("syncLayoutSlotOnNodeSelect", () => {
  beforeEach(() => {
    toastFn.mockClear();
  });

  it("enters layout slot and toasts when node is in layout-slot store", () => {
    const { activeLayoutSlot } = createActiveSlot();
    const locateNode = vi.fn(
      (): LocatedEditorNode => ({
        node: { id: "hdr-1", type: "Container", props: {}, styles: {}, children: [] },
        store: { kind: "layout-slot", slotName: "header" },
        parentId: null,
        index: 0,
      }),
    );

    const result = syncLayoutSlotOnNodeSelect({
      nodeId: "hdr-1",
      registry: { locateNode },
      activeLayoutSlot,
      layout: layoutWithSlots,
    });

    expect(result.slotChanged).toBe(true);
    expect(result.slotName).toBe("header");
    expect(activeLayoutSlot.activeSlot.value.name).toBe("header");
  });

  it("resets to page scope when selecting a page-root node while editing layout slot", () => {
    const { activeLayoutSlot, currentItemType } = createActiveSlot();
    currentItemType.value = "layout";
    activeLayoutSlot.enterSlot("footer");

    const locateNode = vi.fn(
      (): LocatedEditorNode => ({
        node: { id: "main-1", type: "Container", props: {}, styles: {}, children: [] },
        store: { kind: "page-root", slotName: "main" },
        parentId: null,
        index: 0,
      }),
    );

    const result = syncLayoutSlotOnNodeSelect({
      nodeId: "main-1",
      registry: { locateNode },
      activeLayoutSlot,
      layout: layoutWithSlots,
    });

    expect(result.slotChanged).toBe(true);
    expect(activeLayoutSlot.activeSlot.value.name).toBe("main");
    expect(activeLayoutSlot.activeSlot.value.scope).toBe("page");
  });

  it("returns no change when registry or active slot is missing", () => {
    const result = syncLayoutSlotOnNodeSelect({
      nodeId: "missing",
      registry: null,
      activeLayoutSlot: null,
      layout: layoutWithSlots,
    });

    expect(result.slotChanged).toBe(false);
    expect(result.located).toBeNull();
  });
});
