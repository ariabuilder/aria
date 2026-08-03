import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, inject, provide, ref } from "vue";

import ListProperty from "../../admin/features/Inspector/inputs/ListProperty.vue";
import type { BuilderNodeFixture } from "../helpers/builderNodeFixture";

const tabsSelectionKey = Symbol("tabs-selection");

const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = ref<Record<string, unknown> | null>(null);
const selectionTreeRootNodesRef = ref<BuilderNodeFixture[]>([]);
const savePropertyMock = vi.fn();
const saveNodeUpdatesMock = vi.fn();
const previewPropsMock = vi.fn(() => true);
const previewStylePropertiesMock = vi.fn(() => true);
const previewResponsiveStyleUpdatesMock = vi.fn(() => true);
const removeClassRuleMock = vi.fn();
const setClassRuleMock = vi.fn();
const signalAddBlockMock = vi.fn();
const replaceSelectedNodeMock = vi.fn(
  (nodeId: string, replacement: BuilderNodeFixture) => {
    if (selectedNodeRef.value?.id === nodeId) {
      selectedNodeRef.value = replacement;
    }
    selectionTreeRootNodesRef.value = selectionTreeRootNodesRef.value.map(
      (node) => (node.id === nodeId ? replacement : node),
    );
    return replacement;
  },
);
const executeHistoryMock = vi.fn(
  async (operation: { redo: () => Promise<void> | void }) => {
    await operation.redo();
    return { success: true };
  },
);

vi.mock("../../admin/features/Core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../admin/features/Core")>();
  const { getComputedValue } =
    await import("../../admin/features/Core/utils/responsive");
  const { normalizeResponsiveStyleMap } =
    await import("../../lib/blocks/normalizeResponsiveStyleMap");

  return {
    ...actual,
    useSelectionTreeState: () => ({
      selectionTreeRootNodes: selectionTreeRootNodesRef,
    }),
    useSelectedNodeState: () => ({
      replaceSelectedNode: replaceSelectedNodeMock,
    }),
    useStageSignalBridge: () => ({
      signalAddBlock: signalAddBlockMock,
    }),
    usePropertySave: () => ({
      selectedNode: selectedNodeRef,
      selectedNodeId: selectedNodeIdRef,
      breakpointName: breakpointNameRef,
      isLoading: isLoadingRef,
      error: errorRef,
      saveProperty: savePropertyMock,
      saveProperties: vi.fn(),
      saveNodeUpdates: saveNodeUpdatesMock,
      previewProps: previewPropsMock,
      previewStyleProperties: previewStylePropertiesMock,
      previewResponsiveStyleUpdates: previewResponsiveStyleUpdatesMock,
      getComputedStyleValue: (
        propertyName: string,
        fallback?: string,
        breakpoint: string = "base",
        targetNodeId?: string,
      ) => {
        const nodeId = targetNodeId ?? selectedNodeIdRef.value;
        const node =
          selectedNodeRef.value?.id === nodeId
            ? selectedNodeRef.value
            : selectionTreeRootNodesRef.value.find(
                (entry) => entry?.id === nodeId,
              );
        const value = node?.styles?.[propertyName];

        if (typeof value === "string") {
          return value;
        }

        if (!value || typeof value !== "object") {
          return fallback;
        }

        const resolvedValue = getComputedValue(
          normalizeResponsiveStyleMap(value),
          breakpoint,
          [
            { name: "base", label: "Desktop", minWidth: "1280px" },
            { name: "tablet", label: "Tablet", minWidth: "768px" },
            { name: "mobile", label: "Mobile", minWidth: "0px" },
          ],
        );

        return typeof resolvedValue === "string" ? resolvedValue : fallback;
      },
    }),
  };
});

vi.mock("../../admin/features/History", () => ({
  useHistory: () => ({
    execute: executeHistoryMock,
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useClassEditor", () => ({
  useClassEditor: () => ({
    editingMode: editingModeRef,
    activeClassName: activeClassNameRef,
    activeClass: activeClassRef,
    isLoading: classEditorLoadingRef,
    error: classEditorErrorRef,
    setClassRule: setClassRuleMock,
    removeClassRule: removeClassRuleMock,
    getClassRule: vi.fn(() => undefined),
    previewClassRules: vi.fn(() => true),
  }),
}));

vi.mock("@/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([
      {
        name: "testing",
        label: "Testing",
        minWidth: "2400px",
        canvasWidth: 2400,
      },
      { name: "base", label: "Desktop", minWidth: "1280px", canvasWidth: 1440 },
      { name: "tablet", label: "Tablet", minWidth: "768px", canvasWidth: 768 },
      { name: "mobile", label: "Mobile", minWidth: "0px", canvasWidth: 375 },
    ]),
    enabledBreakpoints: ref([
      { id: "base", label: "Desktop", canvasWidth: 1440, icon: null },
      { id: "tablet", label: "Tablet", canvasWidth: 768, icon: null },
      { id: "mobile", label: "Mobile", canvasWidth: 375, icon: null },
    ]),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      ordered: false,
      listStyleType: { default: "none" },
      listStylePosition: { default: "outside" },
    })),
  }),
}));

describe("ListProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "list-1";
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    classEditorLoadingRef.value = false;
    classEditorErrorRef.value = null;
    editingModeRef.value = "element";
    activeClassNameRef.value = null;
    activeClassRef.value = null;
    savePropertyMock.mockResolvedValue(true);
    saveNodeUpdatesMock.mockResolvedValue(true);
    setClassRuleMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    selectionTreeRootNodesRef.value = [];
  });

  it("hydrates current list values and toggles ordered lists through a semantic node update", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: true,
      },
      styles: {
        listStyleType: { base: "upper-alpha" },
        listStylePosition: { base: "inside" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
              hasChanges: { type: Boolean, default: false },
              showReset: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", { "data-has-changes": String(props.hasChanges) }, [
                  slots["header-actions"]?.(),
                  slots.default?.(),
                ]);
            },
          }),
          InspectorBreakpointIndicators: defineComponent({
            props: {
              showReset: { type: Boolean, default: false },
            },
            setup(_, { emit: _emit }) {
              return () =>
                h("div", {
                  "data-testid": "list-breakpoint-indicators",
                  "data-show-reset": "false",
                });
            },
          }),
          Tabs: defineComponent({
            props: {
              modelValue: { type: String, default: "unordered" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, attrs, slots }) {
              provide(tabsSelectionKey, {
                modelValue: computed(() => props.modelValue),
                select: (value: string) => emit("update:model-value", value),
              });

              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                  },
                  slots.default?.(),
                );
            },
          }),
          TabsList: defineComponent({
            setup(_, { slots, attrs }) {
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsTrigger: defineComponent({
            props: {
              value: { type: String, required: true },
            },
            setup(props, { slots, attrs }) {
              const tabs = inject<{
                modelValue: { value: string };
                select: (value: string) => void;
              }>(tabsSelectionKey);

              return () =>
                h(
                  "button",
                  {
                    ...attrs,
                    "data-state":
                      tabs?.modelValue.value === props.value
                        ? "active"
                        : "inactive",
                    onClick: () => tabs?.select(props.value),
                  },
                  slots.default?.(),
                );
            },
          }),
          Select: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, slots, attrs }) {
              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                    onClick: () => {
                      const testId = String(attrs["data-testid"] ?? "");
                      if (testId === "list-style-type-select") {
                        emit("update:model-value", "square");
                        return;
                      }

                      emit("update:model-value", "outside");
                    },
                  },
                  slots.default?.(),
                );
            },
          }),
          SelectTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          SelectValue: defineComponent({
            setup(_, { slots }) {
              return () => h("span", slots.default?.());
            },
          }),
          SelectContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          SelectItem: defineComponent({
            props: {
              value: { type: String, required: true },
            },
            setup(props, { slots }) {
              return () =>
                h("div", { "data-value": props.value }, slots.default?.());
            },
          }),
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="list-ordered-tabs"]')
        .attributes("data-model-value"),
    ).toBe("ordered");
    expect(
      wrapper
        .get('[data-testid="list-breakpoint-indicators"]')
        .attributes("data-show-reset"),
    ).toBe("false");
    expect(
      wrapper
        .get('[data-testid="list-style-type-select"]')
        .attributes("data-model-value"),
    ).toBe("upper-alpha");
    expect(
      wrapper
        .get('[data-testid="list-style-position-select"]')
        .attributes("data-model-value"),
    ).toBe("inside");

    await wrapper
      .get('[data-testid="list-type-unordered-tab"]')
      .trigger("click");
    await flushPromises();

    expect(executeHistoryMock).toHaveBeenCalledTimes(1);
    expect(replaceSelectedNodeMock).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({
        props: expect.objectContaining({ element: "ul", ordered: false }),
        styles: expect.objectContaining({
          listStyleType: expect.objectContaining({ base: "none" }),
        }),
      }),
    );
    expect(savePropertyMock).not.toHaveBeenCalled();
  });

  it("saves marker style and marker position as style properties", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        listStyleType: { base: "disc" },
        listStylePosition: { base: "inside" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: defineComponent({
            props: {
              modelValue: { type: String, default: "unordered" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, slots, attrs }) {
              provide(tabsSelectionKey, {
                modelValue: computed(() => props.modelValue),
                select: (value: string) => emit("update:model-value", value),
              });

              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                  },
                  slots.default?.(),
                );
            },
          }),
          TabsList: defineComponent({
            setup(_, { slots, attrs }) {
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsTrigger: defineComponent({
            props: {
              value: { type: String, required: true },
            },
            setup(props, { slots, attrs }) {
              const tabs = inject<{
                modelValue: { value: string };
                select: (value: string) => void;
              }>(tabsSelectionKey);

              return () =>
                h(
                  "button",
                  {
                    ...attrs,
                    onClick: () => tabs?.select(props.value),
                  },
                  slots.default?.(),
                );
            },
          }),
          Select: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, slots, attrs }) {
              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                    onClick: () => {
                      const testId = String(attrs["data-testid"] ?? "");
                      emit(
                        "update:model-value",
                        testId === "list-style-type-select"
                          ? "square"
                          : "outside",
                      );
                    },
                  },
                  slots.default?.(),
                );
            },
          }),
          SelectTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          SelectValue: defineComponent({
            setup(_, { slots }) {
              return () => h("span", slots.default?.());
            },
          }),
          SelectContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          SelectItem: defineComponent({
            props: {
              value: { type: String, required: true },
            },
            setup(props, { slots }) {
              return () =>
                h("div", { "data-value": props.value }, slots.default?.());
            },
          }),
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="list-style-type-select"]')
      .trigger("click");
    await wrapper
      .get('[data-testid="list-style-position-select"]')
      .trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      {
        listStyleType: "square",
      },
      "list-1",
    );
    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      {
        listStylePosition: "outside",
      },
      "list-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "listStyleType",
      "square",
      "page",
      "home",
      "list-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "listStylePosition",
      "outside",
      "page",
      "home",
      "list-1",
    );
  });

  it("adds a new child block to icon lists from the inspector", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        listStyleType: { base: "none" },
      },
      children: [
        {
          id: "item-1",
          type: "listitem",
          props: {},
          styles: {},
          children: [
            {
              id: "icon-1",
              type: "icon",
              props: {
                icon: "i-lucide:circle-check",
              },
              styles: {},
              children: [],
            },
          ],
        },
      ],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: defineComponent({
            props: { modelValue: { type: String, default: "unordered" } },
            emits: ["update:model-value"],
            setup(props, { emit, attrs, slots }) {
              provide(tabsSelectionKey, {
                modelValue: computed(() => props.modelValue),
                select: (value: string) => emit("update:model-value", value),
              });
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsList: defineComponent({
            setup(_, { slots, attrs }) {
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsTrigger: defineComponent({
            props: { value: { type: String, required: true } },
            setup(props, { slots, attrs }) {
              const tabs = inject<{ select: (value: string) => void }>(
                tabsSelectionKey,
              );
              return () =>
                h(
                  "button",
                  { ...attrs, onClick: () => tabs?.select(props.value) },
                  slots.default?.(),
                );
            },
          }),
          Select: true,
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="list-ordered-tabs"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('[data-testid="list-style-type-select"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="list-style-position-select"]').exists(),
    ).toBe(false);

    await wrapper.get('[data-testid="list-add-item-button"]').trigger("click");

    expect(signalAddBlockMock).toHaveBeenCalledTimes(1);
    expect(signalAddBlockMock.mock.calls[0]?.[0]?.parentId).toBe("list-1");
    expect(signalAddBlockMock.mock.calls[0]?.[0]?.block?.type).toBe("listitem");
    expect(
      signalAddBlockMock.mock.calls[0]?.[0]?.block?.children?.[0]?.type,
    ).toBe("icon");
  });

  it("shows semantic type and add controls for description lists", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        element: "dl",
      },
      styles: {},
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: defineComponent({
            props: { modelValue: { type: String, default: "unordered" } },
            emits: ["update:model-value"],
            setup(_props, { emit, attrs, slots }) {
              provide(tabsSelectionKey, {
                select: (value: string) => emit("update:model-value", value),
              });
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsList: defineComponent({
            setup(_, { slots, attrs }) {
              return () => h("div", attrs, slots.default?.());
            },
          }),
          TabsTrigger: defineComponent({
            props: { value: { type: String, required: true } },
            setup(props, { slots, attrs }) {
              const tabs = inject<{ select: (value: string) => void }>(
                tabsSelectionKey,
              );
              return () =>
                h(
                  "button",
                  { ...attrs, onClick: () => tabs?.select(props.value) },
                  slots.default?.(),
                );
            },
          }),
          Select: true,
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Button: true,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="list-add-item-button"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="list-ordered-tabs"]').exists()).toBe(
      true,
    );
    expect(
      wrapper.find('[data-testid="list-type-description-tab"]').exists(),
    ).toBe(true);
    expect(
      wrapper.get('[data-testid="list-type-unordered-tab"]').text(),
    ).toBe("Bulleted list");
    expect(
      wrapper.get('[data-testid="list-type-ordered-tab"]').text(),
    ).toBe("Numbered list");
    expect(
      wrapper.get('[data-testid="list-type-description-tab"]').text(),
    ).toBe("Description list");
    expect(
      wrapper
        .get('[data-testid="list-type-description-tab"] [aria-hidden="true"]')
        .classes(),
    ).toContain("i-hugeicons:list-tree");
    expect(
      wrapper
        .get('[data-testid="list-add-item-button"]')
        .attributes("aria-label"),
    ).toBe("Add list item");
    expect(
      wrapper.find('[data-testid="list-style-type-select"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="list-style-position-select"]').exists(),
    ).toBe(false);

    await wrapper.get('[data-testid="list-add-item-button"]').trigger("click");

    expect(signalAddBlockMock).toHaveBeenCalledTimes(1);
    expect(signalAddBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "list-1",
        block: expect.objectContaining({
          type: "container",
          children: [
            expect.objectContaining({ props: { element: "dt" } }),
            expect.objectContaining({ props: { element: "dd" } }),
          ],
        }),
      }),
    );

    await wrapper
      .get('[data-testid="list-type-unordered-tab"]')
      .trigger("click");
    await flushPromises();

    expect(replaceSelectedNodeMock).toHaveBeenCalledWith(
      "list-1",
      expect.objectContaining({
        props: expect.objectContaining({ element: "ul", ordered: false }),
      }),
    );
  });

  it("cascades desktop list marker values to smaller breakpoints when reading", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        listStyleType: { base: "none" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];
    breakpointNameRef.value = "tablet";

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: true,
          TabsList: true,
          TabsTrigger: true,
          Select: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            setup(props, { attrs }) {
              return () =>
                h("div", {
                  ...attrs,
                  "data-model-value": props.modelValue,
                });
            },
          }),
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Button: true,
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="list-style-type-select"]')
        .attributes("data-model-value"),
    ).toBe("none");
  });

  it("clears downstream marker overrides when saving from desktop", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        listStyleType: { base: "disc", tablet: "disc" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];
    breakpointNameRef.value = "base";

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: true,
          TabsList: true,
          TabsTrigger: true,
          Select: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, slots, attrs }) {
              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                    onClick: () => {
                      if (attrs["data-testid"] === "list-style-type-select") {
                        emit("update:model-value", "none");
                      }
                    },
                  },
                  slots.default?.(),
                );
            },
          }),
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Button: true,
        },
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="list-style-type-select"]')
      .trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      { listStyleType: "none" },
      "list-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "listStyleType",
      "none",
      "page",
      "home",
      "list-1",
    );
    expect(saveNodeUpdatesMock).not.toHaveBeenCalled();
  });

  it("propagates upstream testing marker saves to desktop and clears smaller overrides", async () => {
    selectedNodeRef.value = {
      id: "list-1",
      type: "list",
      props: {
        ordered: false,
      },
      styles: {
        listStyleType: { base: "disc", tablet: "disc" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];
    breakpointNameRef.value = "testing";

    const wrapper = mount(ListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () =>
                h("div", [slots["header-actions"]?.(), slots.default?.()]);
            },
          }),
          InspectorBreakpointIndicators: true,
          Tabs: true,
          TabsList: true,
          TabsTrigger: true,
          Select: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:model-value"],
            setup(props, { emit, slots, attrs }) {
              return () =>
                h(
                  "div",
                  {
                    ...attrs,
                    "data-model-value": props.modelValue,
                    onClick: () => {
                      if (attrs["data-testid"] === "list-style-type-select") {
                        emit("update:model-value", "none");
                      }
                    },
                  },
                  slots.default?.(),
                );
            },
          }),
          SelectTrigger: true,
          SelectValue: true,
          SelectContent: true,
          SelectItem: true,
          Button: true,
        },
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="list-style-type-select"]')
      .trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      { listStyleType: "none" },
      "list-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "listStyleType",
      "none",
      "page",
      "home",
      "list-1",
    );
    expect(saveNodeUpdatesMock).not.toHaveBeenCalled();
  });
});
