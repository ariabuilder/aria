import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createSimplePage } from "../../fixtures/testDataGenerator";
import type { ComponentDSL, LayoutDSL } from "../../../lib/types/nodes";

const fetchBuilderDataMock = vi.fn();
const loadClassesMock = vi.fn();
const createClassMock = vi.fn();
const renameClassMock = vi.fn();
const duplicateClassMock = vi.fn();
const deleteClassMock = vi.fn();
const setActiveClassMock = vi.fn();
const setClassRuleMock = vi.fn();
const removeClassRuleMock = vi.fn();
const refreshCssMock = vi.fn();
const clearActiveClassMock = vi.fn();

const pagesRef = ref([{ id: "home", slug: "home", title: "Home" }]);
const layoutsRef = ref<LayoutDSL[]>([]);
const componentsRef = ref<ComponentDSL[]>([]);
const customClassesRef = ref<Record<string, never>>({});
const currentBreakpointRef = ref("base");

const pageDocument = createSimplePage("Home", {
  id: "home",
  slug: "home",
  nodes: [
    {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {},
      classNames: { base: [] },
      customClasses: ["background-blue"],
      children: [],
      metadata: { label: "Hero" },
    },
  ],
});

vi.mock("astro:actions", () => ({
  actions: {
    getItem: vi.fn(
      async ({ collection, slug }: { collection: string; slug: string }) => {
        if (collection === "pages" && slug === "home") {
          return { data: structuredClone(pageDocument) };
        }

        return { error: { message: "Not found" } };
      },
    ),
    designSystem: {
      getBreakpoints: vi.fn(async () => ({
        data: {
          success: true,
          data: {
            breakpoints: [
              {
                id: "base",
                label: "Desktop",
                icon: "Monitor",
                minWidth: 1280,
                canvasWidth: 1440,
                enabled: true,
                isDefault: true,
                order: 0,
              },
            ],
          },
        },
        error: null,
      })),
    },
    nodes: {
      removeCustomClass: vi.fn(
        async ({
          collection,
          id,
          nodeId,
          className,
        }: {
          collection: string;
          id: string;
          nodeId: string;
          className: string;
        }) => {
          if (collection !== "pages" || id !== "home") {
            return { error: { message: "Invalid location" } };
          }

          const targetNode = pageDocument.nodes.find(
            (node) => node.id === nodeId,
          );
          if (!targetNode) {
            return { error: { message: "Node not found" } };
          }

          targetNode.customClasses = (targetNode.customClasses ?? []).filter(
            (name) => name !== className,
          );

          return { data: { version: "v2" } };
        },
      ),
    },
  },
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: pagesRef,
    layouts: layoutsRef,
    components: componentsRef,
    fetchBuilderData: fetchBuilderDataMock,
  }),
}));

vi.mock("../../../admin/features/Inspector/composables/useClassEditor", () => ({
  useClassEditor: () => ({
    customClasses: customClassesRef,
    isLoading: ref(false),
    loadClasses: loadClassesMock,
    createClass: createClassMock,
    renameClass: renameClassMock,
    duplicateClass: duplicateClassMock,
    deleteClass: deleteClassMock,
    setActiveClass: setActiveClassMock,
    setClassRule: setClassRuleMock,
    removeClassRule: removeClassRuleMock,
    refreshCSS: refreshCssMock,
    clearActiveClass: clearActiveClassMock,
    currentBreakpoint: currentBreakpointRef,
  }),
}));

describe("useClassManagerInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageDocument.nodes[0]!.customClasses = ["background-blue"];
    fetchBuilderDataMock.mockResolvedValue(undefined);
    loadClassesMock.mockResolvedValue(undefined);
    createClassMock.mockResolvedValue(true);
    renameClassMock.mockResolvedValue(true);
    duplicateClassMock.mockResolvedValue(true);
    deleteClassMock.mockResolvedValue(true);
    setClassRuleMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    refreshCssMock.mockResolvedValue(undefined);
  });

  it("removes orphaned references from saved content and refreshes inventory", async () => {
    const { useClassManagerInventory } =
      await import("../../../admin/features/Design/composables/useClassManagerInventory");

    const inventory = useClassManagerInventory();

    await inventory.loadInventory();

    expect(inventory.rows.value).toHaveLength(1);
    expect(inventory.rows.value[0]?.status).toBe("orphaned");

    const success = await inventory.removeOrphanedClassReferences(
      "background-blue",
      inventory.rows.value[0]!.locations,
    );

    expect(success).toBe(true);
    expect(pageDocument.nodes[0]?.customClasses).toEqual([]);
    expect(inventory.rows.value).toHaveLength(0);
  });
});
