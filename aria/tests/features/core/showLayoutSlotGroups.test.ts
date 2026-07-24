import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";
import type { BuilderNode, LayoutDSL, PageDSL } from "../../../lib/types/nodes";
import { useActiveLayoutSlot } from "../../../admin/features/Core/composables/useActiveLayoutSlot";
import { useNodeEventHandlers } from "../../../admin/features/Nodes/events/useNodeEventHandlers";
import { useEditorNodeRegistry } from "../../../admin/features/Core/composables/useEditorNodeRegistry";

const { actionsMock } = vi.hoisted(() => ({
  actionsMock: {
    insertNode: vi.fn(async () => ({ error: null })),
    deleteNode: vi.fn(async () => ({ error: null })),
    insertNodes: vi.fn(async () => ({ error: null })),
    styles: {
      createClass: vi.fn(async () => ({
        data: { success: true },
        error: null,
      })),
      ensureNavigationPresetClasses: vi.fn(async () => ({ error: null })),
    },
    getItem: vi.fn(async () => ({ data: { nodes: [] }, error: null })),
  },
}));

vi.mock("astro:actions", () => ({
  actions: actionsMock,
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../../../admin/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    isReady: ref(true),
    loadSettings: vi.fn(async () => undefined),
  }),
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

describe("showLayoutSlotGroups", () => {
  beforeEach(() => {
    actionsMock.insertNode.mockClear();
  });

  it("resets active slot scope when hiding layout slot groups", () => {
    const currentLayout = layoutRef(layoutWithSlots);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const { activeLayoutSlot } = {
      activeLayoutSlot: useActiveLayoutSlot({ currentLayout, currentItemType }),
    };

    activeLayoutSlot.enterSlot("footer");
    expect(activeLayoutSlot.activeSlot.value.name).toBe("footer");
    expect(activeLayoutSlot.isLayoutSlotEditing.value).toBe(true);

    activeLayoutSlot.resetToPageScope();

    expect(activeLayoutSlot.activeSlot.value.name).toBe("main");
    expect(activeLayoutSlot.activeSlot.value.scope).toBe("page");
    expect(activeLayoutSlot.isLayoutSlotEditing.value).toBe(false);
  });

  it("inserts into the default page slot when layout slot groups are hidden", async () => {
    const pageBlocks = ref([]) as Ref<BuilderNode[]>;
    const currentPage = ref({
      id: "page-1",
      title: "Home",
      slug: "home",
      nodes: [],
    } as PageDSL);
    const currentLayout = layoutRef(layoutWithSlots);
    const currentItemType = ref<"page" | "layout" | "component">("page");
    const showLayoutSlotGroups = ref(false);

    const activeLayoutSlot = useActiveLayoutSlot({
      currentLayout,
      currentItemType,
    });
    activeLayoutSlot.enterSlot("footer");

    const editorNodeRegistry = useEditorNodeRegistry({
      pageBlocks,
      currentLayout,
      activeSlot: activeLayoutSlot.activeSlot,
      currentItemType,
    });

    const invokeNodeEventHandlers = useNodeEventHandlers as unknown as (
      ...args: unknown[]
    ) => ReturnType<typeof useNodeEventHandlers>;
    const handlers = invokeNodeEventHandlers(
      pageBlocks,
      currentPage,
      ref(null),
      currentItemType,
      currentLayout,
      {
        activeSlot: activeLayoutSlot.activeSlot,
        editorNodeRegistry,
        showLayoutSlotGroups,
      },
    );

    await handlers.handleAddElement({
      type: "text",
      data: {
        id: "home-hero",
        type: "Text",
        props: {},
        styles: {},
        children: [],
      },
      insertionMode: "root",
    });

    expect(actionsMock.insertNode).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: null,
        node: expect.objectContaining({
          id: "home-hero",
        }),
      }),
    );
    expect(pageBlocks.value).toHaveLength(1);
    expect(pageBlocks.value[0]?.id).toBe("home-hero");
    expect(
      currentLayout.value!.slots?.find((slot) => slot.name === "footer")
        ?.defaultContent,
    ).toEqual([]);
  });
});
