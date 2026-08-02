import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, computed } from "vue";
import { studioIcons } from "../../admin/lib/icons";
import { getComputedValue } from "../../admin/features/Core/utils/responsive";
import { normalizeResponsiveStyleMap } from "../../lib/blocks/normalizeResponsiveStyleMap";
import {
  createInspectorGlobalStyleDefaultsMock,
  designComposableMocks,
} from "./helpers/inspectorPropertyTestState";

type DisplayTestNode = Record<string, unknown> & {
  id: string;
  styles?: Record<string, unknown>;
  children?: DisplayTestNode[];
};

const selectedNodeRef = ref<DisplayTestNode | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const selectionTreeRootNodesRef = ref<DisplayTestNode[]>([]);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = ref<Record<string, unknown> | null>(null);
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const previewResponsiveStyleUpdatesMock = vi.fn();
const setClassRuleMock = vi.fn();
const setClassRulesMock = vi.fn();
const previewClassRulesMock = vi.fn(() => true);
const removeClassRuleMock = vi.fn();
const setTargetBreakpointMock = vi.fn();
const canonicalBreakpoints = [
  { name: "base", label: "Base", minWidth: "0px" },
  { name: "tablet", label: "Tablet", minWidth: "768px" },
  { name: "desktop", label: "Desktop", minWidth: "1280px" },
];

const getComputedStyleValueMock = vi.fn(
  (
    propertyName: string,
    fallback?: string,
    breakpoint = "base",
    targetNodeId?: string,
  ) => {
    const findNodeById = (
      nodes: DisplayTestNode[],
      nodeId: string,
    ): DisplayTestNode | null => {
      for (const node of nodes) {
        if (node.id === nodeId) {
          return node;
        }

        if (Array.isArray(node.children)) {
          const match = findNodeById(node.children, nodeId);
          if (match) {
            return match;
          }
        }
      }

      return null;
    };

    const node = targetNodeId
      ? (findNodeById(selectionTreeRootNodesRef.value, targetNodeId) ??
        (selectedNodeRef.value?.id === targetNodeId
          ? selectedNodeRef.value
          : null))
      : selectedNodeRef.value;
    const value = node?.styles?.[propertyName];

    if (typeof value === "string") {
      return value;
    }

    if (value && typeof value === "object") {
      const resolved = getComputedValue<string>(
        normalizeResponsiveStyleMap(value),
        breakpoint,
        canonicalBreakpoints,
      );
      return typeof resolved === "string" ? resolved : fallback;
    }

    return fallback;
  },
);

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    selectedNodes: computed(() =>
      selectedNodeRef.value ? [selectedNodeRef.value] : [],
    ),
    breakpointName: breakpointNameRef,
    isLoading: isLoadingRef,
    error: errorRef,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    previewStyleProperties: previewStylePropertiesMock,
    previewResponsiveStyleUpdates: previewResponsiveStyleUpdatesMock,
    getComputedStyleValue: getComputedStyleValueMock,
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
  }),
}));

vi.mock(
  "../../admin/features/Inspector/composables/useInspectorGlobalStyleDefaults",
  () => ({
    useInspectorGlobalStyleDefaults: createInspectorGlobalStyleDefaultsMock(),
  }),
);

vi.mock("../../admin/features/Design/composables/useGlobalStyles", () => ({
  useGlobalStyles: designComposableMocks.useGlobalStyles,
}));
vi.mock("../../admin/features/Design/composables/useTypography", () => ({
  useTypography: designComposableMocks.useTypography,
}));
vi.mock("../../admin/features/Design/composables/useDesignSystem", () => ({
  useDesignSystem: designComposableMocks.useDesignSystem,
}));

vi.mock("../../admin/features/Inspector/composables/useInspectorState", () => ({
  useInspectorState: () => ({
    selectedPseudo: ref("default"),
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
    setClassRules: setClassRulesMock,
    removeClassRule: removeClassRuleMock,
    previewClassRules: previewClassRulesMock,
    getClassRule: vi.fn(() => undefined),
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    enabledBreakpoints: ref([
      {
        id: "base",
        label: "Base",
        icon: "monitor",
        minWidth: 0,
        canvasWidth: 1440,
        enabled: true,
        isDefault: true,
        order: 0,
      },
      {
        id: "tablet",
        label: "Tablet",
        icon: "tablet",
        minWidth: 768,
        canvasWidth: 768,
        enabled: true,
        isDefault: true,
        order: 1,
      },
      {
        id: "desktop",
        label: "Desktop",
        icon: "monitor",
        minWidth: 1280,
        canvasWidth: 1600,
        enabled: true,
        isDefault: false,
        order: 2,
      },
    ]),
    activeBreakpoints: ref(canonicalBreakpoints),
  }),
}));

vi.mock("../../admin/composables/useResponsiveTarget", () => ({
  useResponsiveTarget: () => ({
    targetBreakpoint: breakpointNameRef,
    isBaseTarget: ref(false),
    hasOverrideTarget: ref(true),
    setTargetBreakpoint: setTargetBreakpointMock,
    clearTargetBreakpoint: vi.fn(),
    toggleTargetBreakpoint: vi.fn(),
  }),
}));

vi.mock("../../admin/components/ui/select", () => ({
  Select: defineComponent({
    props: {
      modelValue: { type: String, default: "" },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:model-value"],
    setup(props, { emit, slots }) {
      return () =>
        h(
          "div",
          {
            "data-testid": "display-select",
            "data-model-value": props.modelValue,
            "data-disabled": String(props.disabled),
            onClick: () => emit("update:model-value", "grid"),
          },
          slots.default?.(),
        );
    },
  }),
  SelectTrigger: defineComponent({
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "display-trigger" }, slots.default?.());
    },
  }),
  SelectValue: defineComponent({
    setup(_, { slots }) {
      return () =>
        h("span", { "data-testid": "display-value" }, slots.default?.());
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
      return () => h("div", { "data-value": props.value }, slots.default?.());
    },
  }),
  SelectSeparator: defineComponent({
    setup() {
      return () => h("div");
    },
  }),
}));

vi.mock("@/components/ui/variable-reference-picker", () => ({
  VariableAssignableInput: defineComponent({
    inheritAttrs: false,
    props: {
      modelValue: { type: String, default: "" },
      disabled: { type: Boolean, default: false },
      inputClass: { type: String, default: "" },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h("div", [
          h("input", {
            ...attrs,
            value: props.modelValue,
            disabled: props.disabled,
            class: props.inputClass,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
            onBlur: (event: Event) =>
              emit("commit", (event.target as HTMLInputElement).value),
          }),
          slots["end-actions"]?.(),
        ]);
    },
  }),
}));

vi.mock("../../admin/components/ui/popover", () => ({
  Popover: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("../../admin/components/ui/switch", () => ({
  Switch: defineComponent({
    props: {
      modelValue: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:model-value"],
    setup(props, { attrs, emit }) {
      return () =>
        h("button", {
          ...attrs,
          type: "button",
          disabled: props.disabled,
          "data-checked": String(props.modelValue),
          onClick: () => emit("update:model-value", !props.modelValue),
        });
    },
  }),
}));

vi.mock("../../admin/components/ui/tooltip", () => ({
  TooltipProvider: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  Tooltip: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

describe("DisplayProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = null;
    selectedNodeIdRef.value = null;
    selectionTreeRootNodesRef.value = [];
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    classEditorLoadingRef.value = false;
    classEditorErrorRef.value = null;
    editingModeRef.value = "element";
    activeClassNameRef.value = null;
    activeClassRef.value = null;
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    previewResponsiveStyleUpdatesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    setClassRulesMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    setTargetBreakpointMock.mockReset();
    getComputedStyleValueMock.mockClear();
  });

  it("syncs the selected display value when the active breakpoint changes and marks changes", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Heading",
      props: { text: "Hello" },
      styles: {
        display: {
          base: "block",
          tablet: "grid",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h(
                  "div",
                  {
                    "data-testid": "base-property",
                    "data-has-changes": String(props.hasChanges),
                  },
                  slots.default?.(),
                );
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="display-select"]')
        .attributes("data-model-value"),
    ).toBe("block");
    expect(
      wrapper
        .get('[data-testid="base-property"]')
        .attributes("data-has-changes"),
    ).toBe("true");

    breakpointNameRef.value = "tablet";
    await nextTick();
    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="display-select"]')
        .attributes("data-model-value"),
    ).toBe("grid");

    wrapper.unmount();
  });

  it("saves display changes through the class editor when editing a class", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "block",
        },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    activeClassNameRef.value = "layout-shell";
    activeClassRef.value = {
      id: "class-1",
      name: "layout-shell",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "display", value: "flex", important: false }],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();
    await wrapper.get('[data-testid="display-select"]').trigger("click");

    expect(setClassRuleMock).toHaveBeenCalledWith("display", "grid");

    wrapper.unmount();
  });

  it("renders compact flex controls and saves enum layout properties", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "flex",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="flex-direction-column"]').exists()).toBe(
      true,
    );

    await wrapper.get('[data-testid="flex-direction-column"]').trigger("click");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "flexDirection",
      "column",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("uses higher contrast control styling for light mode display controls", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "grid",
        },
        justifyContent: {
          base: "stretch",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const inactiveControlClasses = wrapper
      .get('[data-testid="grid-justify-content-start"]')
      .classes();
    expect(inactiveControlClasses).toContain("bg-background/75");
    expect(inactiveControlClasses).toContain("text-foreground/75");
    expect(inactiveControlClasses).toContain("border-border/70");
    expect(inactiveControlClasses).toContain("dark:bg-sidebar/55");

    const activeControlClasses = wrapper
      .get('[data-testid="grid-justify-content-stretch"]')
      .classes();
    expect(activeControlClasses).toContain("bg-primary/10!");
    expect(activeControlClasses).toContain("text-primary");

    const inputClasses = wrapper.get('[data-testid="grid-cols-input"]').classes();
    expect(inputClasses).toContain("bg-background/75");
    expect(inputClasses).toContain("px-2");

    const helperClasses = wrapper
      .get('[data-testid="grid-cols-helper-trigger"]')
      .classes();
    expect(helperClasses).toContain("text-foreground/70");
    expect(helperClasses).toContain("opacity-70");
    expect(helperClasses).not.toContain("opacity-0");

    wrapper.unmount();
  });

  it("toggles visibility by saving visibility hidden and restoring visible", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Heading",
      props: { text: "Hello" },
      styles: {
        display: {
          base: "block",
        },
        visibility: {
          base: "visible",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const visibleSwitch = wrapper.get('[data-testid="display-visible-switch"]');
    expect(visibleSwitch.attributes("data-checked")).toBe("true");

    await visibleSwitch.trigger("click");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "visibility",
      "hidden",
      "page",
      "home",
    );

    selectedNodeRef.value = {
      id: "node-1",
      type: "Heading",
      props: { text: "Hello" },
      styles: {
        display: {
          base: "block",
        },
        visibility: {
          base: "hidden",
        },
      },
      children: [],
    } as never;

    await nextTick();
    await flushPromises();

    expect(visibleSwitch.attributes("data-checked")).toBe("false");

    await visibleSwitch.trigger("click");

    expect(savePropertyMock).toHaveBeenLastCalledWith(
      "visibility",
      "visible",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("shows breakpoint override icons and resets the current breakpoint override", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "block",
          tablet: "grid",
        },
        gap: {
          tablet: "24px",
        },
      },
      children: [],
    } as never;
    breakpointNameRef.value = "tablet";

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        open: true,
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h(
                  "div",
                  {
                    "data-testid": "base-property",
                    "data-has-changes": String(props.hasChanges),
                  },
                  [slots["header-actions"]?.(), slots.default?.()],
                );
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[aria-label="Base override"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Tablet override"]').exists()).toBe(true);
    expect(
      wrapper
        .get(
          '[data-testid="breakpoint-indicator-tablet"] [aria-hidden="true"]',
        )
        .classes(),
    ).toContain(studioIcons.tablet);
    expect(wrapper.text()).toContain("Overrides on Tablet");

    await wrapper
      .get('[data-testid="breakpoint-indicator-tablet"]')
      .trigger("click");

    expect(setTargetBreakpointMock).toHaveBeenCalledWith("tablet");

    await wrapper
      .get('[data-testid="display-reset-breakpoint"]')
      .trigger("click");

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      display: undefined,
    });
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { display: undefined },
      "page",
      "home",
    );

    previewStylePropertiesMock.mockClear();
    previewResponsiveStyleUpdatesMock.mockClear();
    savePropertiesMock.mockResolvedValueOnce(false);

    await wrapper
      .get('[data-testid="display-reset-breakpoint"]')
      .trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      display: undefined,
    });
    expect(previewResponsiveStyleUpdatesMock).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("renders compact grid controls and saves text layout properties", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "grid",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const columnsInput = wrapper.get('[data-testid="grid-cols-input"]');
    await columnsInput.setValue("repeat(3, 1fr)");
    await columnsInput.trigger("blur");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "gridTemplateColumns",
      "repeat(3, 1fr)",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("reuses grid controls for grid lanes and saves flow tolerance", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "grid-lanes",
        },
        flowTolerance: {
          base: "1em",
        },
        gridTemplateColumns: {
          base: "repeat(auto-fill, minmax(250px, 1fr))",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="display-select"]')
        .attributes("data-model-value"),
    ).toBe("grid-lanes");
    expect(wrapper.find('[data-testid="grid-cols-input"]').exists()).toBe(true);

    const toleranceInput = wrapper.get(
      '[data-testid="grid-flow-tolerance-input"]',
    );
    expect((toleranceInput.element as HTMLInputElement).value).toBe("1em");

    await toleranceInput.setValue("2em");
    await toleranceInput.trigger("blur");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "flowTolerance",
      "2em",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("applies grid template presets from the helper", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        display: {
          base: "grid",
        },
      },
      children: [],
    } as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();
    await wrapper
      .get('[data-testid="grid-cols-preset-three-columns"]')
      .trigger("click");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "gridTemplateColumns",
      "repeat(3, minmax(0, 1fr))",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("hydrates and saves grid column placement values", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Article",
      props: {},
      styles: {
        display: {
          base: "block",
        },
        gridColumn: {
          base: "span 2",
        },
      },
      children: [],
    } as never;
    selectionTreeRootNodesRef.value = [
      {
        id: "grid-parent",
        type: "Section",
        props: {},
        styles: {
          display: {
            base: "grid",
          },
        },
        children: [selectedNodeRef.value],
      },
    ] as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const gridColumnInput = wrapper.get('[data-testid="grid-column-input"]');
    expect((gridColumnInput.element as HTMLInputElement).value).toBe("span 2");

    await gridColumnInput.setValue("-3 / -1");
    await gridColumnInput.trigger("blur");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "gridColumn",
      "-3 / -1",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("hides grid span controls for nodes without a grid parent", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Article",
      props: {},
      styles: {
        display: {
          base: "block",
        },
        gridColumn: {
          base: "span 2",
        },
      },
      children: [],
    } as never;
    selectionTreeRootNodesRef.value = [selectedNodeRef.value] as never;

    const DisplayProperty = (
      await import("../../admin/features/Inspector/inputs/DisplayProperty.vue")
    ).default;

    const wrapper = mount(DisplayProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="grid-column-input"]').exists()).toBe(
      false,
    );

    wrapper.unmount();
  });
});
