import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPromises,
  mount,
  type DOMWrapper,
} from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createInspectorGlobalStyleDefaultsMock,
  createInspectorPropertySaveMock,
  designComposableMocks,
  inspectorPropertyState,
} from "./helpers/inspectorPropertyTestState";

const selectedNodeRef = inspectorPropertyState.selectedNodeRef;
const selectedNodeIdRef = inspectorPropertyState.selectedNodeIdRef;
const breakpointNameRef = inspectorPropertyState.breakpointNameRef;
const isLoadingRef = inspectorPropertyState.isLoadingRef;
const errorRef = inspectorPropertyState.errorRef;
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = ref<Record<string, unknown> | null>(null);
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const setClassRuleMock = vi.fn();
const setClassRulesMock = vi.fn();
const previewClassRulesMock = vi.fn(() => true);
const removeClassRuleMock = vi.fn();
const getClassRuleMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: createInspectorPropertySaveMock({
    saveProperties: savePropertiesMock,
    previewStyleProperties: previewStylePropertiesMock,
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

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipProvider: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/select", () => ({
  Select: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  SelectContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  SelectItem: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  SelectTrigger: defineComponent({
    setup(_, { slots, attrs }) {
      return () => h("button", attrs, slots.default?.());
    },
  }),
  SelectValue: defineComponent({
    setup(_, { slots }) {
      return () => h("span", slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/input", () => ({
  Input: defineComponent({
    props: {
      modelValue: { type: String, default: undefined },
      value: { type: String, default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue ?? props.value ?? "",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("../../admin/components/ui/input", () => ({
  Input: defineComponent({
    props: {
      modelValue: { type: String, default: undefined },
      value: { type: String, default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue ?? props.value ?? "",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("../../admin/components/ui/input/index.ts", () => ({
  Input: defineComponent({
    props: {
      modelValue: { type: String, default: undefined },
      value: { type: String, default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue ?? props.value ?? "",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("../../admin/components/ui/input/Input.vue", () => ({
  default: defineComponent({
    props: {
      modelValue: { type: String, default: undefined },
      value: { type: String, default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue ?? props.value ?? "",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: defineComponent({
    props: {
      open: { type: Boolean, default: false },
      hasChanges: { type: Boolean, default: false },
      title: { type: String, default: "" },
    },
    setup(props, { slots }) {
      return () =>
        h("div", { "data-has-changes": String(props.hasChanges) }, [
          slots["header-actions"]?.(),
          slots["header-content"]?.(),
          slots.default?.(),
        ]);
    },
  }),
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CollapsibleContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CollapsibleTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

const { ColorFieldStub } = vi.hoisted(() => {
  const { defineComponent, h } = require("vue") as typeof import("vue");

  const stub = defineComponent({
    name: "ColorField",
    props: { modelValue: { type: String, default: "" } },
    emits: ["update:modelValue", "update:model-value", "preview", "commit"],
    setup(props, { attrs, emit }) {
      return () =>
        h("div", [
          h("input", { ...attrs, value: props.modelValue }),
          h(
            "button",
            {
              type: "button",
              "data-testid": "border-color-picker",
              onClick: () => {
                emit("update:model-value", "#00FF00");
                emit("commit", "#00FF00");
              },
            },
            "pick",
          ),
        ]);
    },
  });

  return { ColorFieldStub: stub };
});

vi.mock("@/components/ui/color-picker", () => ({
  ColorPicker: ColorFieldStub,
  ColorField: ColorFieldStub,
}));

vi.mock("../../admin/components/ui/color-picker", () => ({
  ColorPicker: ColorFieldStub,
  ColorField: ColorFieldStub,
}));

vi.mock(
  "../../admin/features/Inspector/inputs/InspectorBreakpointIndicators.vue",
  () => ({
    default: defineComponent({
      setup(_, { emit }) {
        return () =>
          h("button", {
            type: "button",
            "data-testid": "border-reset-breakpoint",
            onClick: () => emit("reset"),
          });
      },
    }),
  }),
);

vi.mock("../../admin/composables/useVariableReferenceOptions", () => ({
  useVariableReferenceOptions: () => ({
    variableReferenceOptions: ref([]),
    isLoadingVariableReferences: ref(false),
  }),
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: defineComponent({
    props: {
      modelValue: {
        type: Array,
        default: () => [0],
      },
    },
    emits: ["update:model-value", "value-commit"],
    setup(props, { emit }) {
      return () =>
        h("input", {
          type: "range",
          value: props.modelValue[0] ?? 0,
          onInput: (event: Event) => {
            const value = Number((event.target as HTMLInputElement).value);
            emit("update:model-value", [value]);
          },
          onChange: (event: Event) => {
            const value = Number((event.target as HTMLInputElement).value);
            emit("value-commit", [value]);
          },
        });
    },
  }),
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
    getClassRule: getClassRuleMock,
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([
      { name: "base", label: "Base", minWidth: 0 },
      { name: "tablet", label: "Tablet", minWidth: 768 },
      { name: "desktop", label: "Desktop", minWidth: 1280 },
    ]),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn((key: string) => {
      if (key === "border") {
        return {
          borderWidth: { base: "0" },
          borderStyle: { base: "solid" },
          borderColor: { base: "transparent" },
        };
      }

      return {
        borderRadius: { base: "0" },
        borderTopLeftRadius: { base: "0" },
        borderTopRightRadius: { base: "0" },
        borderBottomRightRadius: { base: "0" },
        borderBottomLeftRadius: { base: "0" },
      };
    }),
  }),
}));

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

function createBaseStubs() {
  return {
    Collapsible: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    CollapsibleContent: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    CollapsibleTrigger: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    BaseProperty: defineComponent({
      props: {
        open: { type: Boolean, default: false },
        hasChanges: { type: Boolean, default: false },
      },
      setup(props, { slots }) {
        return () =>
          h("div", { "data-has-changes": String(props.hasChanges) }, [
            h("div", [
              slots["header-actions"]?.(),
              slots["header-content"]?.(),
              props.open ? "open" : "closed",
            ]),
            slots.default?.(),
          ]);
      },
    }),
    VariableAssignableInput: createVariableAssignableInputStub(),
    Button: defineComponent({
      inheritAttrs: false,
      setup(_, { slots, attrs }) {
        return () => h("button", { type: "button", ...attrs }, slots.default?.());
      },
    }),
  };
}

describe("BorderProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeRef.value = null;
    selectedNodeIdRef.value = null;
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    classEditorLoadingRef.value = false;
    classEditorErrorRef.value = null;
    editingModeRef.value = "element";
    activeClassNameRef.value = null;
    activeClassRef.value = null;
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    setClassRulesMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    getClassRuleMock.mockImplementation(() => undefined);
  });

  it("previews border width during scrub and commits once on release", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderWidth: { base: "2px" },
        borderColor: { base: "#112233" },
        borderStyle: { base: "solid" },
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

    const BorderProperty = (
      await import(
        "../../admin/features/Inspector/inputs/BorderProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(BorderProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    const input = wrapper.get('[data-testid="border-width-input"]');
    await input.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 18 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      borderWidth: "10px",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 18 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { borderWidth: "10px" },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("previews linked border radius during scrub and commits once on release", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderTopLeftRadius: { base: "4px" },
        borderTopRightRadius: { base: "4px" },
        borderBottomRightRadius: { base: "4px" },
        borderBottomLeftRadius: { base: "4px" },
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

    const BorderProperty = (
      await import(
        "../../admin/features/Inspector/inputs/BorderProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(BorderProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    const input = wrapper.get('[data-testid="border-linked-radius-input"]');
    await input.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 19 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      borderTopLeftRadius: "13px",
      borderTopRightRadius: "13px",
      borderBottomRightRadius: "13px",
      borderBottomLeftRadius: "13px",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 19 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        borderTopLeftRadius: "13px",
        borderTopRightRadius: "13px",
        borderBottomRightRadius: "13px",
        borderBottomLeftRadius: "13px",
      },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("rehydrates from the active class and saves border updates as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderWidth: { base: "1px" },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    activeClassNameRef.value = "class-1";
    activeClassRef.value = {
      id: "class-1",
      name: "class-1",
      variants: [
        {
          breakpoint: "base",
          rules: [
            {
              property: "borderWidth",
              value: "2px",
              important: false,
            },
            {
              property: "borderColor",
              value: "#112233",
              important: false,
            },
            {
              property: "borderStyle",
              value: "dashed",
              important: false,
            },
          ],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const BorderProperty = (
      await import(
        "../../admin/features/Inspector/inputs/BorderProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(BorderProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    expect(
      (
        wrapper.get(
          '[data-testid="border-width-input"]',
        ) as DOMWrapper<HTMLInputElement>
      ).element.value,
    ).toBe("2");

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [
            {
              property: "borderWidth",
              value: "4px",
              important: false,
            },
            {
              property: "borderColor",
              value: "#445566",
              important: false,
            },
            {
              property: "borderStyle",
              value: "solid",
              important: false,
            },
          ],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await nextTick();
    await flushPromises();

    expect(
      (
        wrapper.get(
          '[data-testid="border-width-input"]',
        ) as DOMWrapper<HTMLInputElement>
      ).element.value,
    ).toBe("4");

    await wrapper.get('[data-testid="border-color-picker"]').trigger("click");

    expect(setClassRulesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        borderColor: "#00FF00",
        borderWidth: "4px",
        borderStyle: "solid",
      }),
    );
    expect(savePropertiesMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
