import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";

const getConfigMock = vi.fn();
const loggerMock = vi.fn();

const selectedNodeRef = ref(null);
const selectedNodeIdRef = ref<string | null>(null);
const selectedNodeIdsRef = ref<string[]>([]);
const additionalSelectedNodesRef = ref<any[]>([]);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const customClassesByNameRef = ref<Record<string, Record<string, unknown>>>({});
const selectedPseudoRef = ref<"default" | "hover" | "focus">("default");
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const setClassRuleMock = vi.fn();
const setClassPseudoRuleMock = vi.fn();
const previewClassRulesMock = vi.fn();
const previewClassPseudoRulesMock = vi.fn();
const removeClassRuleMock = vi.fn();
const removeClassPseudoRuleMock = vi.fn();

function createVariableAssignableInputStub() {
  return defineComponent({
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) =>
            emit("commit", (event.target as HTMLInputElement).value),
        });
    },
  });
}

function getComputedStyleValueMock(
  propertyName: string,
  fallback?: string,
  breakpoint: string = breakpointNameRef.value,
  targetNodeId?: string,
) {
  const allNodes = [
    ...(selectedNodeRef.value ? [selectedNodeRef.value] : []),
    ...additionalSelectedNodesRef.value,
  ];
  const node = targetNodeId
    ? (allNodes.find((entry) => entry.id === targetNodeId) ?? null)
    : selectedNodeRef.value;
  const value = (node as { styles?: Record<string, unknown> } | null)
    ?.styles?.[propertyName];

  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const responsiveValue = value as Record<string, string | undefined>;
  return responsiveValue[breakpoint] ?? responsiveValue.base ?? fallback;
}

vi.mock("astro:actions", () => ({
  actions: {
    fonts: {
      getConfig: (...args: unknown[]) => getConfigMock(...args),
    },
  },
}));

const ColorFieldStub = defineComponent({
  name: "ColorField",
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue", "preview", "commit"],
  setup(_props, { emit }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          "data-testid": "color-picker",
          onClick: () => {
            emit("preview", "#112233");
            emit("update:modelValue", "#112233");
            emit("commit", "#112233");
          },
        },
        "pick",
      );
  },
});

vi.mock("@/components/ui/color-picker", () => ({
  ColorPicker: ColorFieldStub,
  ColorField: ColorFieldStub,
}));

vi.mock("@/components/ui/variable-reference-picker", () => ({
  VariableAssignableInput: createVariableAssignableInputStub(),
}));

vi.mock("@/lib/utils/logger", () => ({
  log: (...args: unknown[]) => loggerMock(...args),
}));

vi.mock("../../admin/components/ui/collapsible", () => ({
  Collapsible: defineComponent({
    props: {
      open: { type: Boolean, default: false },
    },
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CollapsibleTrigger: defineComponent({
    props: {
      class: {
        type: [String, Array, Object],
        default: "",
      },
    },
    setup(props, { slots }) {
      return () => h("button", { class: props.class }, slots.default?.());
    },
  }),
  CollapsibleContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: defineComponent({
    name: "BaseProperty",
    props: {
      open: { type: Boolean, default: false },
      defaultOpen: { type: Boolean, default: false },
      hasChanges: { type: Boolean, default: false },
      title: { type: String, default: "" },
    },
    setup(props, { slots }) {
      return () =>
        h("div", { "data-testid": "base-property-stub" }, [
          h("div", { "data-open": String(props.open) }, [
            slots["header-actions"]?.(),
            props.open ? "open" : "closed",
          ]),
          slots.default?.(),
        ]);
    },
  }),
}));

vi.mock("@/components/ui/popover", () => ({
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

vi.mock("@/components/ui/select", () => ({
  Select: defineComponent({
    name: "Select",
    props: {
      modelValue: { type: String, default: "" },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit, slots }) {
      return () =>
        h(
          "select",
          {
            ...attrs,
            value: props.modelValue,
            disabled: props.disabled,
            onChange: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLSelectElement).value,
              ),
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
      return () => h("option", { value: props.value }, slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: {
    template: "<div><slot /></div>",
  },
  TooltipContent: {
    template: "<div><slot /></div>",
  },
  TooltipProvider: {
    template: "<div><slot /></div>",
  },
  TooltipTrigger: {
    template: "<div><slot /></div>",
  },
}));

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    selectedNodeIds: selectedNodeIdsRef,
    selectedNodes: computed(() => {
      const selectedNodes = selectedNodeRef.value
        ? [selectedNodeRef.value]
        : [];
      return [...selectedNodes, ...additionalSelectedNodesRef.value];
    }),
    breakpointName: computed(() => breakpointNameRef.value),
    isLoading: isLoadingRef,
    error: errorRef,
    getComputedStyleValue: getComputedStyleValueMock,
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useClassEditor", () => ({
  useClassEditor: () => ({
    editingMode: editingModeRef,
    activeClassName: activeClassNameRef,
    activeClass: computed(() => {
      const className = activeClassNameRef.value;
      if (!className) {
        return null;
      }

      return customClassesByNameRef.value[className] ?? null;
    }),
    isLoading: classEditorLoadingRef,
    error: classEditorErrorRef,
    previewClassRules: previewClassRulesMock,
    previewClassPseudoRules: previewClassPseudoRulesMock,
    setClassRule: setClassRuleMock,
    setClassPseudoRule: setClassPseudoRuleMock,
    removeClassRule: removeClassRuleMock,
    removeClassPseudoRule: removeClassPseudoRuleMock,
    getClassRule: vi.fn(() => undefined),
    getClassPseudoRule: vi.fn(() => undefined),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useInspectorState", () => ({
  useInspectorState: () => ({
    selectedPseudo: selectedPseudoRef,
  }),
}));

vi.mock("../../admin/composables/useResponsiveTarget", () => ({
  useResponsiveTarget: () => ({
    setTargetBreakpoint: vi.fn(),
    toggleTargetBreakpoint: vi.fn(),
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
    activeBreakpoints: ref([
      { name: "base", label: "Base", minWidth: 0 },
      { name: "tablet", label: "Tablet", minWidth: 768 },
      { name: "desktop", label: "Desktop", minWidth: 1280 },
    ]),
  }),
}));

vi.mock(
  "../../admin/features/Inspector/composables/useInspectorGlobalStyleDefaults",
  () => ({
    useInspectorGlobalStyleDefaults: () => ({
      globalStyleDefaults: ref({}),
      isGlobalDefaultsActive: computed(() => false),
      buildResolverInput: vi.fn(),
      compareGlobalDefaultAcrossSelection: vi.fn(() => ({
        value: undefined,
        isMixed: false,
      })),
      coalesceSaveStyleValue: vi.fn(
        (_propertyName: string, value: string) => value,
      ),
    }),
  }),
);

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      fontFamily: { base: "inherit" },
      fontSize: { base: "inherit" },
      fontWeight: { base: "400" },
      lineHeight: { base: "inherit" },
      letterSpacing: { base: "normal" },
      textAlign: { base: "left" },
      textTransform: { base: "none" },
      textDecoration: { base: "none" },
      color: { base: "inherit" },
    })),
  }),
}));

describe("TypographyProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = null;
    selectedNodeIdRef.value = null;
    selectedNodeIdsRef.value = [];
    additionalSelectedNodesRef.value = [];
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    classEditorLoadingRef.value = false;
    classEditorErrorRef.value = null;
    editingModeRef.value = "element";
    activeClassNameRef.value = null;
    customClassesByNameRef.value = {};
    selectedPseudoRef.value = "default";
    HTMLElement.prototype.scrollIntoView = vi.fn();
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    setClassPseudoRuleMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
    previewClassPseudoRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    removeClassPseudoRuleMock.mockResolvedValue(true);
    getConfigMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          customFonts: [],
          enabledGoogleFonts: [],
        },
      },
      error: null,
    });
  });

  it("previews text color during interaction and persists once on commit", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        color: { base: "#111111" },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    previewStylePropertiesMock.mockClear();
    savePropertyMock.mockClear();

    await wrapper.get('[data-testid="color-picker"]').trigger("click");

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      color: "#112233",
    });
    expect(savePropertyMock).toHaveBeenCalledTimes(1);
    expect(savePropertyMock).toHaveBeenCalledWith(
      "color",
      "#112233",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("logs and ignores malformed font config payloads on mount", async () => {
    getConfigMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          customFonts: 42,
          enabledGoogleFonts: [],
        },
      },
      error: null,
    });

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(getConfigMock).toHaveBeenCalledTimes(1);
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Typography] Invalid font action response",
      expect.objectContaining({
        source: "TypographyProperty.onMounted",
        issues: expect.any(Array),
      }),
    );

    wrapper.unmount();
  });

  it("updates the displayed font when the active breakpoint changes", async () => {
    getConfigMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          customFonts: [],
          enabledGoogleFonts: [
            {
              id: "google-dm-sans",
              family: "DM Sans",
              variants: ["400"],
              googleFontsURL:
                "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap",
            },
          ],
        },
      },
      error: null,
    });

    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontFamily: {
          base: "Inter",
          tablet: "DM Sans",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Inter");

    breakpointNameRef.value = "tablet";
    wrapper.unmount();

    const tabletWrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });
    await flushPromises();

    expect(tabletWrapper.text()).toContain("DM Sans");

    tabletWrapper.unmount();
  });

  it("shows mixed typography values for multi-select and still allows overwriting them", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeIdsRef.value = ["node-1", "node-2"];
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontFamily: {
          base: "Inter",
        },
        fontSize: {
          base: "16px",
        },
        color: {
          base: "#111111",
        },
      },
      children: [],
    } as never;
    additionalSelectedNodesRef.value = [
      {
        id: "node-2",
        type: "Text",
        props: { text: "World" },
        styles: {
          fontFamily: {
            base: "DM Sans",
          },
          fontSize: {
            base: "24px",
          },
          color: {
            base: "#111111",
          },
        },
        children: [],
      },
    ];

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
          ColorPicker: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Mixed fonts");

    const sizeInput = wrapper.get('input[placeholder="Mixed"]');
    expect((sizeInput.element as HTMLInputElement).value).toBe("");

    await sizeInput.setValue("20");
    await sizeInput.trigger("blur");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { fontSize: "20px" },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("shows heading level controls under typography for heading nodes and saves level changes", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Heading",
      props: { text: "Hello", level: 2 },
      styles: {
        fontFamily: {
          base: "Inter",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const levelButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "H4");

    expect(wrapper.text()).toContain("Level");
    expect(levelButton).toBeDefined();

    await levelButton!.trigger("click");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { level: 4 },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("shows the source breakpoint indicator when typography overrides exist on another breakpoint", async () => {
    selectedNodeIdRef.value = "node-1";
    breakpointNameRef.value = "base";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontSize: {
          tablet: "48px",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper.find('[data-testid="breakpoint-indicator-tablet"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("Overrides on Tablet");

    wrapper.unmount();
  });

  it("hides the breakpoint indicator when only the active breakpoint has typography overrides", async () => {
    selectedNodeIdRef.value = "node-1";
    breakpointNameRef.value = "base";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontSize: {
          base: "48px",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper.find('[data-testid="breakpoint-indicator-desktop"]').exists(),
    ).toBe(false);

    wrapper.unmount();
  });

  it("shows the dot indicator when the active breakpoint and another breakpoint both have overrides", async () => {
    selectedNodeIdRef.value = "node-1";
    breakpointNameRef.value = "base";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontSize: {
          base: "48px",
          tablet: "40px",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper.find('[data-testid="breakpoint-indicator-tablet"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("Overrides on Tablet");

    wrapper.unmount();
  });

  it("shows reset for the active breakpoint and clears all local typography overrides", async () => {
    selectedNodeIdRef.value = "node-1";
    breakpointNameRef.value = "tablet";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontSize: {
          tablet: "32px",
        },
        color: {
          tablet: "#111111",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        open: true,
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const reset = wrapper.find('[data-testid="typography-reset-breakpoint"]');
    expect(reset.exists()).toBe(true);

    await reset.trigger("click");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        fontSize: undefined,
        color: undefined,
      },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("previews font-size scrub before a single persisted save", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontSize: { base: "12px" },
        lineHeight: { base: "16px" },
        letterSpacing: { base: "1px" },
      },
      children: [],
    } as never;

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
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
            },
            setup(props, { slots }) {
              return () =>
                h(
                  "div",
                  { "data-has-changes": String(props.hasChanges) },
                  slots.default?.(),
                );
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
          ColorPicker: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const sizeInput = wrapper.get('input[placeholder="Size"]');
    await sizeInput.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 22 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      fontSize: "24px",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 22 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { fontSize: "24px" },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("rehydrates from the active class and saves typography changes as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontFamily: {
          base: "Element Font",
        },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    customClassesByNameRef.value = {
      "class-1": {
        id: "class-1",
        name: "class-1",
        variants: [
          {
            breakpoint: "base",
            rules: [
              {
                property: "fontFamily",
                value: "Class One Font",
                important: false,
              },
              {
                property: "color",
                value: "#112233",
                important: false,
              },
            ],
          },
        ],
        pseudoVariants: [],
        usageCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "class-2": {
        id: "class-2",
        name: "class-2",
        variants: [
          {
            breakpoint: "base",
            rules: [
              {
                property: "fontFamily",
                value: "Class Two Font",
                important: false,
              },
            ],
          },
        ],
        pseudoVariants: [],
        usageCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    activeClassNameRef.value = "class-1";

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            emits: ["update:model-value"],
            setup(_, { emit }) {
              return () =>
                h(
                  "button",
                  {
                    type: "button",
                    "data-testid": "color-picker",
                    onClick: () => emit("update:model-value", "#00FF00"),
                  },
                  "pick",
                );
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Class One Font");

    activeClassNameRef.value = "class-2";
    wrapper.unmount();

    const classTwoWrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            emits: ["update:model-value", "preview", "commit"],
            setup(_, { emit }) {
              return () =>
                h(
                  "button",
                  {
                    type: "button",
                    "data-testid": "color-picker",
                    onClick: () => {
                      emit("preview", "#00FF00");
                      emit("update:model-value", "#00FF00");
                      emit("commit", "#00FF00");
                    },
                  },
                  "pick",
                );
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });
    await flushPromises();

    expect(classTwoWrapper.text()).toContain("Class Two Font");

    await classTwoWrapper.get('[data-testid="color-picker"]').trigger("click");

    expect(setClassRuleMock).toHaveBeenCalledWith("color", "#112233");
    expect(savePropertyMock).not.toHaveBeenCalledWith(
      "color",
      "#112233",
      "page",
      "home",
    );

    classTwoWrapper.unmount();
  });

  it("saves pseudo text color into class hover rules and clears inline canvas color", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedPseudoRef.value = "hover";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: {},
      styles: {
        color: { base: "#111111" },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    customClassesByNameRef.value = {
      "class-1": {
        id: "class-1",
        name: "class-1",
        variants: [],
        pseudoVariants: [
          {
            state: "hover",
            breakpoint: "base",
            rules: [
              {
                property: "color",
                value: "#112233",
                important: false,
              },
            ],
          },
        ],
        usageCount: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    activeClassNameRef.value = "class-1";

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            setup(_, { attrs }) {
              return () => h("input", attrs);
            },
          }),
          ColorPicker: defineComponent({
            emits: ["update:model-value", "preview", "commit"],
            setup(_, { emit }) {
              return () =>
                h(
                  "button",
                  {
                    type: "button",
                    "data-testid": "pseudo-color-picker",
                    onClick: () => {
                      emit("preview", "#FF0000");
                      emit("update:model-value", "#FF0000");
                      emit("commit", "#FF0000");
                    },
                  },
                  "pick",
                );
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    await wrapper.get('[data-testid="color-picker"]').trigger("click");

    expect(setClassPseudoRuleMock).toHaveBeenCalledWith(
      "hover",
      "color",
      "#112233",
    );
    expect(setClassRuleMock).not.toHaveBeenCalledWith("color", "#112233");
    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      color: undefined,
    });
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { color: undefined },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("loads and saves font weight variable references", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: { text: "Hello" },
      styles: {
        fontWeight: {
          base: "var(--font-weight-bold)",
        },
      },
      children: [],
    } as never;

    const TypographyProperty = (
      await import("../../admin/features/Inspector/inputs/TypographyProperty.vue")
    ).default;

    const wrapper = mount(TypographyProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              open: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h("div", [
                  h("div", [
                    slots["header-actions"]?.(),
                    props.open ? "open" : "closed",
                  ]),
                  slots.default?.(),
                ]);
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
          ColorPicker: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const weightInput = wrapper.get(
      '[data-testid="typography-font-weight-input"]',
    );
    expect((weightInput.element as HTMLInputElement).value).toBe(
      "var(--font-weight-bold)",
    );

    await weightInput.setValue("var(--font-weight-semibold)");
    await weightInput.trigger("blur");
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "fontWeight",
      "var(--font-weight-semibold)",
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
