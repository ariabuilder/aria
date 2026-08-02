import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createInspectorCanvasSignalBridgeMock,
  createInspectorGlobalStyleDefaultsMock,
  createInspectorPropertySaveMock,
  createInspectorSelectedNodeStateMock,
  createInspectorSelectionTreeStateMock,
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
const removeClassRuleMock = vi.fn();
const previewClassRulesMock = vi.fn();
const getClassRuleMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: createInspectorPropertySaveMock({
    saveProperties: savePropertiesMock,
    previewStyleProperties: previewStylePropertiesMock,
  }),
  useSelectedNodeState: createInspectorSelectedNodeStateMock(),
  useSelectionTreeState: createInspectorSelectionTreeStateMock(),
  useCanvasSignalBridge: createInspectorCanvasSignalBridgeMock(),
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
    removeClassRules: vi.fn().mockResolvedValue(true),
    removeClassPseudoRules: vi.fn().mockResolvedValue(true),
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
    getDefault: vi.fn(() => ({
      type: "none",
      color: { base: "transparent" },
      gradient: undefined,
      image: undefined,
    })),
  }),
}));

vi.mock(
  "../../admin/features/Studio/media/components/MediaPickerDialog.vue",
  () => ({
    default: defineComponent({
      emits: ["select", "update:open"],
      setup(_, { emit }) {
        return () =>
          h(
            "button",
            {
              type: "button",
              "data-testid": "background-media-select",
              onClick: () => {
                emit("update:open", true);
                emit("select", {
                  id: "media-1",
                  url: "https://cdn.example.com/background.png",
                  deliveryUrl:
                    "https://cdn.example.com/background-delivery.png",
                });
              },
            },
            "select-media",
          );
      },
    }),
  }),
);

const { ColorFieldStub } = vi.hoisted(() => {
  const { defineComponent, h } = require("vue") as typeof import("vue");

  const stub = defineComponent({
    name: "ColorField",
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue", "update:model-value", "preview", "commit"],
    setup(props, { attrs, emit }) {
      return () =>
        h("div", [
          h("input", {
            ...attrs,
            value: props.modelValue,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
          }),
          h(
            "button",
            {
              type: "button",
              "data-testid": "background-color-picker",
              onClick: () => {
                emit("preview", "#00FF00");
                emit("update:modelValue", "#00FF00");
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

vi.mock("@/components/ui/input", () => ({
  Input: defineComponent({
    props: {
      modelValue: { type: [String, Number], default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: String(props.modelValue ?? ""),
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
      modelValue: { type: [String, Number], default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: String(props.modelValue ?? ""),
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
      modelValue: { type: [String, Number], default: undefined },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: String(props.modelValue ?? ""),
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: FocusEvent) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: {
    name: "Button",
    template: '<button type="button" v-bind="$attrs"><slot /></button>',
  },
}));

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: defineComponent({
    name: "BaseProperty",
    props: {
      open: { type: Boolean, default: false },
      hasChanges: { type: Boolean, default: false },
    },
    setup(props, { slots }) {
      return () =>
        h("div", { "data-has-changes": String(props.hasChanges) }, [
          slots["header-actions"]?.(),
          slots.default?.(),
        ]);
    },
  }),
}));

vi.mock(
  "../../admin/features/Inspector/inputs/InspectorBreakpointIndicators.vue",
  () => ({
    default: defineComponent({
      name: "InspectorBreakpointIndicators",
      setup() {
        return () => h("div");
      },
    }),
  }),
);

vi.mock("../../admin/features/Inspector/inputs/GradientAngleDial.vue", () => ({
  default: defineComponent({
    name: "GradientAngleDial",
    props: {
      modelValue: { type: String, default: "180" },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { emit }) {
      return () =>
        h("div", {
          "data-testid": "gradient-angle-dial",
          "data-angle": props.modelValue,
          onClick: () => {
            emit("update:modelValue", "90");
            emit("commit");
          },
        });
    },
  }),
}));

vi.mock("../../admin/features/Inspector/constants/positionOptions", () => ({
  DEFAULT_POSITION_VALUE: "center center",
  POSITION_OPTIONS_3X3: [
    { value: "center center", label: "Center", row: 2, column: 2 },
  ],
  POSITION_PREVIEW_DOT_COUNT: 9,
  getPositionOption: () => ({
    value: "center center",
    label: "Center",
    row: 2,
    column: 2,
  }),
  isPositionPreviewDotActive: () => false,
  normalizePositionValue: (value: string) => value,
}));

describe("BackgroundProperty", () => {
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
    getClassRuleMock.mockImplementation((property: string) => {
      const activeClass = activeClassRef.value as {
        variants?: Array<{
          rules?: Array<{ property: string; value: string }>;
        }>;
      } | null;

      return activeClass?.variants?.[0]?.rules?.find(
        (rule) => rule.property === property,
      )?.value;
    });
  });

  it("rehydrates from the active class and saves background color as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        backgroundColor: {
          base: "#ffffff",
        },
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
              property: "backgroundColor",
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
    };

    const BackgroundProperty = (
      await import(
        "../../admin/features/Inspector/inputs/BackgroundProperty.vue" as any
      )
    ).default;

    const wrapper = mount(BackgroundProperty, {
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
                h("div", { "data-has-changes": String(props.hasChanges) }, [
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
            props: {
              modelValue: { type: [String, Number], default: "" },
            },
            emits: ["update:modelValue", "blur", "keydown"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: String(props.modelValue ?? ""),
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                  onBlur: (event: FocusEvent) => emit("blur", event),
                  onKeydown: (event: KeyboardEvent) => emit("keydown", event),
                });
            },
          }),
          ColorField: ColorFieldStub,
          ColorPicker: ColorFieldStub,
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
      (
        wrapper.find('input[data-testid="background-color-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("#112233");

    await wrapper
      .get('[data-testid="background-color-picker"]')
      .trigger("click");

    expect(setClassRulesMock).toHaveBeenCalledWith({
      backgroundColor: "#00FF00",
    });
    expect(savePropertiesMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("restores the authored background when an element save fails", async () => {
    selectedNodeIdRef.value = "node-failed-background";
    selectedNodeRef.value = {
      id: "node-failed-background",
      type: "section",
      props: {},
      styles: {
        backgroundColor: {
          base: "#112233",
        },
      },
      children: [],
    };
    savePropertiesMock.mockResolvedValue(false);

    const BackgroundProperty = (
      await import("../../admin/features/Inspector/inputs/BackgroundProperty.vue")
    ).default;

    const wrapper = mount(BackgroundProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });
    await flushPromises();

    await wrapper
      .get('[data-testid="background-color-picker"]')
      .trigger("click");
    await flushPromises();
    await nextTick();

    expect(savePropertiesMock).toHaveBeenCalled();
    const colorInput = wrapper.find(
      'input[data-testid="background-color-input"]',
    ).element;
    expect(colorInput).toBeInstanceOf(HTMLInputElement);
    if (!(colorInput instanceof HTMLInputElement)) {
      throw new Error("Background color input must be an HTMLInputElement");
    }
    expect(colorInput.value).toBe("#112233");

    wrapper.unmount();
  });

  it("uses the media picker for image backgrounds and persists attachment and blend mode", async () => {
    selectedNodeIdRef.value = "node-2";
    selectedNodeRef.value = {
      id: "node-2",
      type: "Container",
      props: {},
      styles: {
        backgroundImage: {
          base: 'url("https://cdn.example.com/initial.png")',
        },
        backgroundSize: {
          base: "cover",
        },
        backgroundPosition: {
          base: "center center",
        },
        backgroundRepeat: {
          base: "no-repeat",
        },
      },
      children: [],
    } as never;

    const BackgroundProperty = (
      await import(
        "../../admin/features/Inspector/inputs/BackgroundProperty.vue" as any
      )
    ).default;

    const wrapper = mount(BackgroundProperty, {
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
                h("div", { "data-has-changes": String(props.hasChanges) }, [
                  slots["header-actions"]?.(),
                  slots.default?.(),
                ]);
            },
          }),
          Input: defineComponent({
            inheritAttrs: false,
            props: {
              modelValue: { type: [String, Number], default: "" },
            },
            emits: ["update:modelValue", "blur", "keydown"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: String(props.modelValue ?? ""),
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                  onBlur: (event: FocusEvent) => emit("blur", event),
                  onKeydown: (event: KeyboardEvent) => emit("keydown", event),
                });
            },
          }),
          ColorField: ColorFieldStub,
          ColorPicker: ColorFieldStub,
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          InspectorBreakpointIndicators: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="background-media-select"]')
      .trigger("click");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        backgroundImage:
          'url("https://cdn.example.com/background-delivery.png")',
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: undefined,
        backgroundBlendMode: undefined,
      },
      "page",
      "home",
    );

    selectedNodeRef.value = {
      ...(selectedNodeRef.value as unknown as Record<string, unknown>),
      styles: {
        backgroundImage: {
          base: 'url("https://cdn.example.com/background-delivery.png")',
        },
        backgroundSize: {
          base: "cover",
        },
        backgroundPosition: {
          base: "center center",
        },
        backgroundRepeat: {
          base: "no-repeat",
        },
      },
    } as never;

    await nextTick();
    await flushPromises();

    const sourceMode = wrapper.get(
      '[data-testid="background-image-source-mode"]',
    );
    expect(sourceMode.classes()).toContain("flex");
    expect(sourceMode.classes()).toContain("w-full");
    expect(sourceMode.classes()).toContain("flex-nowrap");
    expect(sourceMode.classes()).not.toContain("grid-cols-3");

    const mediaModeButton = wrapper.get(
      '[data-testid="background-image-source-mode-media"]',
    );
    expect(mediaModeButton.classes()).toContain("flex-[1_1_auto]");
    expect(mediaModeButton.classes()).toContain("min-w-0");
    expect(mediaModeButton.classes()).toContain("whitespace-nowrap");
    expect(mediaModeButton.classes()).toContain("text-[10px]");

    const selectByTestId = (testId: string) =>
      wrapper
        .findAllComponents({ name: "Select" })
        .find((component) => component.attributes("data-testid") === testId);

    selectByTestId("background-attachment-select")?.vm.$emit(
      "update:modelValue",
      "fixed",
    );
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenLastCalledWith(
      {
        backgroundImage:
          'url("https://cdn.example.com/background-delivery.png")',
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundBlendMode: undefined,
      },
      "page",
      "home",
    );

    selectedNodeRef.value = {
      ...(selectedNodeRef.value as unknown as Record<string, unknown>),
      styles: {
        backgroundImage: {
          base: 'url("https://cdn.example.com/background-delivery.png")',
        },
        backgroundSize: {
          base: "cover",
        },
        backgroundPosition: {
          base: "center center",
        },
        backgroundRepeat: {
          base: "no-repeat",
        },
        backgroundAttachment: {
          base: "fixed",
        },
      },
    } as never;

    await nextTick();
    await flushPromises();

    selectByTestId("background-blend-mode-select")?.vm.$emit(
      "update:modelValue",
      "overlay",
    );
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenLastCalledWith(
      {
        backgroundImage:
          'url("https://cdn.example.com/background-delivery.png")',
        backgroundSize: "cover",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundBlendMode: "overlay",
      },
      "page",
      "home",
    );
  });
});
