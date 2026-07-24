import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppProvides } from "../../admin/features/Core";

vi.mock("vue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue")>();

  return {
    ...actual,
    defineAsyncComponent: () =>
      actual.defineComponent({
        name: "BlockLibraryAsyncElementStub",
        setup() {
          return () => actual.h("div");
        },
      }),
  };
});

const testState = vi.hoisted(() => ({
  dragSourceValue: "",
  dragDropStartMock: vi.fn(),
  dragDropEndMock: vi.fn(),
  canvasStartDragMock: vi.fn(),
  canvasDestroyMock: vi.fn(),
}));

const dragSourceRef = {
  get value(): string {
    return testState.dragSourceValue;
  },
  set value(nextValue: string) {
    testState.dragSourceValue = nextValue;
  },
};

vi.mock("../../admin/composables/useDragDrop", () => ({
  useDragDrop: () => ({
    startDrag: (source: string, data: unknown) => {
      dragSourceRef.value = source;
      testState.dragDropStartMock(source, data);
    },
    endDrag: () => {
      dragSourceRef.value = "";
      testState.dragDropEndMock();
    },
    dragSource: dragSourceRef,
  }),
}));

vi.mock("../../admin/features/Stage/dragdrop/useCanvasDrop", () => ({
  useCanvasDrop: () => ({
    state: ref({
      isDragging: false,
      currentDropZone: null,
      draggedData: null,
      currentChildIndex: 0,
    }),
    isDragging: computed(() => false),
    currentDropZone: computed(() => null),
    currentInsertionIndex: computed(() => 0),
    startDrag: testState.canvasStartDragMock,
    endDrag: vi.fn(),
    init: vi.fn(),
    destroy: testState.canvasDestroyMock,
  }),
}));

describe("BlockLibrary runtime injections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dragSourceRef.value = "";
  });

  it("fails loudly when BlockLibrary mounts without runtime providers", async () => {
    const BlockLibrary = (
      await import("../../admin/features/Blocks/components/BlockLibrary.vue")
    ).default;

    expect(() => mount(BlockLibrary)).toThrow(
      "Missing required app runtime injection: stageIframeRef.",
    );
  });

  it("mounts with a null iframe and skips canvas drag activation", async () => {
    const BlockLibrary = (
      await import("../../admin/features/Blocks/components/BlockLibrary.vue")
    ).default;

    const iframeRef = ref<HTMLIFrameElement | null>(null);
    const prefetchPageData = vi.fn(async () => undefined);
    const prewarmBuilder = vi.fn(async () => undefined);

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => iframeRef.value),
          prefetchPageData,
          prewarmBuilder,
        });

        return () => h(BlockLibrary);
      },
    });

    const wrapper = mount(Provider);
    const blockLibrary = wrapper.findComponent(BlockLibrary);
    const draggableItems = blockLibrary.findAll('[draggable="true"]');

    expect(draggableItems.length).toBeGreaterThan(0);

    await draggableItems[0].trigger("click");

    expect((blockLibrary as any).emitted("addElement")).toEqual([
      [{ type: "section", data: { type: "section" } }],
    ]);

    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    await draggableItems[0].trigger("dragstart", { dataTransfer });

    expect(testState.dragDropStartMock).toHaveBeenCalledWith("add-elements", {
      type: "section",
    });
    expect(testState.canvasStartDragMock).not.toHaveBeenCalled();

    wrapper.unmount();

    expect(testState.canvasDestroyMock).toHaveBeenCalledTimes(1);
  });

  it("activates canvas drag when the injected iframe is ready", async () => {
    const BlockLibrary = (
      await import("../../admin/features/Blocks/components/BlockLibrary.vue")
    ).default;

    const iframeRef = ref<HTMLIFrameElement | null>(
      document.createElement("iframe"),
    );
    const prefetchPageData = vi.fn(async () => undefined);
    const prewarmBuilder = vi.fn(async () => undefined);

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => iframeRef.value),
          prefetchPageData,
          prewarmBuilder,
        });

        return () => h(BlockLibrary);
      },
    });

    const wrapper = mount(Provider);
    const blockLibrary = wrapper.findComponent(BlockLibrary);
    const draggableItems = blockLibrary.findAll('[draggable="true"]');

    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    await draggableItems[0].trigger("dragstart", { dataTransfer });

    expect(testState.canvasStartDragMock).toHaveBeenCalledWith({
      type: "section",
    });

    wrapper.unmount();
  });

  it("emits and drags list blocks with three starter items", async () => {
    const BlockLibrary = (
      await import("../../admin/features/Blocks/components/BlockLibrary.vue")
    ).default;

    const iframeRef = ref<HTMLIFrameElement | null>(null);

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => iframeRef.value),
          prefetchPageData: vi.fn(async () => undefined),
          prewarmBuilder: vi.fn(async () => undefined),
        });

        return () => h(BlockLibrary);
      },
    });

    const wrapper = mount(Provider);
    const blockLibrary = wrapper.findComponent(BlockLibrary);
    const listDraggable = blockLibrary.get('[data-block-library-id="list"]');

    await listDraggable.trigger("click");

    const clickPayload = (blockLibrary as any).emitted("addElement")?.[0]?.[0];
    expect(clickPayload?.type).toBe("list");
    expect(clickPayload?.data?.type).toBe("list");
    expect(clickPayload?.data?.children).toHaveLength(3);
    expect(
      clickPayload?.data?.children?.map(
        (child: any) => child.children?.[0]?.props?.content,
      ),
    ).toEqual(["First item", "Second item", "Third item"]);

    const dataTransfer = {
      effectAllowed: "",
      setData: vi.fn(),
      setDragImage: vi.fn(),
    };

    await listDraggable.trigger("dragstart", { dataTransfer });

    const dragPayload = testState.dragDropStartMock.mock.calls[0]?.[1];
    expect(dragPayload?.type).toBe("list");
    expect(dragPayload?.children).toHaveLength(3);
    expect(
      dragPayload?.children?.map(
        (child: any) => child.children?.[0]?.props?.content,
      ),
    ).toEqual(["First item", "Second item", "Third item"]);
    expect(dragPayload?.id).not.toBe(clickPayload?.data?.id);

    wrapper.unmount();
  });

  it("emits addElement when canvas:drop detail matches the schema", async () => {
    const BlockLibrary = (
      await import("../../admin/features/Blocks/components/BlockLibrary.vue")
    ).default;

    const iframeRef = ref<HTMLIFrameElement | null>(null);

    const Provider = defineComponent({
      setup() {
        useAppProvides({
          pageBlocks: ref([]),
          currentLayout: ref(null),
          stageIframeRef: computed(() => iframeRef.value),
          prefetchPageData: vi.fn(async () => undefined),
          prewarmBuilder: vi.fn(async () => undefined),
        });

        return () => h(BlockLibrary);
      },
    });

    const wrapper = mount(Provider);
    const blockLibrary = wrapper.findComponent(BlockLibrary);

    dragSourceRef.value = "add-elements";

    window.dispatchEvent(
      new CustomEvent("canvas:drop", {
        detail: {
          zone: { id: "parent-node" },
          data: { type: "text" },
          insertionIndex: 1,
          x: 10,
          y: 20,
        },
      }),
    );

    await nextTick();

    expect((blockLibrary as any).emitted("addElement")).toEqual([
      [
        {
          type: "text",
          data: { type: "text" },
          insertionMode: "parent",
          parentId: "parent-node",
          position: 1,
        },
      ],
    ]);

    wrapper.unmount();
  });
});
