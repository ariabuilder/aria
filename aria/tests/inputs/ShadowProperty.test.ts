import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import {
  createInspectorPropertySaveMock,
  inspectorPropertyState,
} from "./helpers/inspectorPropertyTestState";

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
              "data-testid": "color-picker",
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
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const setClassRuleMock = vi.fn();
const setClassRulesMock = vi.fn();
const previewClassRulesMock = vi.fn(() => true);
const removeClassRuleMock = vi.fn();

const globalStylesRef = ref({
  variables: {
    custom: {
      "shadow-brand": {
        label: "Shadow Brand",
        value: "#123456",
        category: "color",
      },
    },
    aliases: {},
  },
});

const palettesRef = ref([]);
const semanticColorsRef = ref({
  success: "#16a34a",
  warning: "#ca8a04",
  error: "#dc2626",
  info: "#2563eb",
});

const BasePropertyStub = defineComponent({
  props: {
    hasChanges: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () =>
      h("div", { "data-has-changes": String(props.hasChanges) }, [
        slots["header-actions"]?.(),
        slots.default?.(),
      ]);
  },
});

const VariableAssignableInputStub = defineComponent({
  props: {
    modelValue: { type: String, default: "" },
    placeholder: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
    inputClass: { type: String, default: "" },
  },
  emits: ["update:modelValue", "commit"],
  setup(props, { attrs, emit }) {
    return () =>
      h("input", {
        ...attrs,
        value: props.modelValue,
        placeholder: props.placeholder,
        disabled: props.disabled,
        class: props.inputClass,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) =>
          emit("commit", (event.target as HTMLInputElement).value),
      });
  },
});

const InspectorBreakpointIndicatorsStub = defineComponent({
  setup(_, { attrs }) {
    return () => h("div", attrs);
  },
});

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: createInspectorPropertySaveMock({
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    previewStyleProperties: previewStylePropertiesMock,
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
    previewClassRules: previewClassRulesMock,
    removeClassRule: removeClassRuleMock,
    getClassRule: vi.fn(() => undefined),
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
      boxShadow: { base: "none" },
    })),
  }),
}));

vi.mock("../../admin/features/Design/composables/useGlobalStyles", () => ({
  useGlobalStyles: () => ({
    globalStyles: globalStylesRef,
    isLoading: ref(false),
    loadGlobalStyles: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../admin/features/Design/composables/useDesignSystem", () => ({
  useDesignSystem: () => ({
    palettes: palettesRef,
    semanticColors: semanticColorsRef,
    isLoading: ref(false),
    load: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("ShadowProperty", () => {
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
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    setClassRulesMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    globalStylesRef.value = {
      variables: {
        custom: {
          "shadow-brand": {
            label: "Shadow Brand",
            value: "#123456",
            category: "color",
          },
        },
        aliases: {},
      },
    };
  });

  it("rehydrates from the active class and saves shadow changes as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        boxShadow: { base: "none" },
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
              property: "boxShadow",
              value: "2px 6px 12px 0px rgba(0, 0, 0, 0.25)",
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

    const ShadowProperty = (
      await import(
        "../../admin/features/Inspector/inputs/ShadowProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(ShadowProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: BasePropertyStub,
          VariableAssignableInput: VariableAssignableInputStub,
          InspectorBreakpointIndicators: InspectorBreakpointIndicatorsStub,
        },
      },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect(inputs[0]?.element.value).toBe("2");
    expect(inputs[1]?.element.value).toBe("6");
    expect(inputs[2]?.element.value).toBe("12");
    expect(inputs[4]?.element.value).toBe("rgba(0, 0, 0, 0.25)");

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [
            {
              property: "boxShadow",
              value: "4px 10px 20px 4px rgba(255, 0, 0, 0.5)",
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

    expect(inputs[0]?.element.value).toBe("4");
    expect(inputs[4]?.element.value).toBe("rgba(255, 0, 0, 0.5)");

    await inputs[0]!.setValue("8");
    await inputs[0]!.trigger("blur");

    expect(setClassRuleMock).toHaveBeenCalledWith(
      "boxShadow",
      "8px 10px 20px 4px rgba(255, 0, 0, 0.5)",
    );

    wrapper.unmount();
  });

  it("previews shadow during scrub and commits once on release", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        boxShadow: { base: "2px 6px 12px 0px rgba(0, 0, 0, 0.25)" },
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

    const ShadowProperty = (
      await import(
        "../../admin/features/Inspector/inputs/ShadowProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(ShadowProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: BasePropertyStub,
          VariableAssignableInput: VariableAssignableInputStub,
          InspectorBreakpointIndicators: InspectorBreakpointIndicatorsStub,
        },
      },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    await inputs[0]!.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 18 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      boxShadow: "10px 6px 12px 0px rgba(0, 0, 0, 0.25)",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 18 }));
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "boxShadow",
      "10px 6px 12px 0px rgba(0, 0, 0, 0.25)",
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("resolves variable-backed shadow colors and preserves authored shadow values on color commit", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        boxShadow: { base: "0 10px 20px var(--shadow-brand)" },
      },
      children: [],
    } as never;

    const ShadowProperty = (
      await import(
        "../../admin/features/Inspector/inputs/ShadowProperty.vue" as any,
      )
    ).default;

    const wrapper = mount(ShadowProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: BasePropertyStub,
          VariableAssignableInput: VariableAssignableInputStub,
          InspectorBreakpointIndicators: InspectorBreakpointIndicatorsStub,
        },
      },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect(inputs[0]?.element.value).toBe("0");
    expect(inputs[1]?.element.value).toBe("10");
    expect(inputs[2]?.element.value).toBe("20");
    expect(inputs[4]?.element.value).toBe("var(--shadow-brand)");

    await wrapper.get('[data-testid="color-picker"]').trigger("click");
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "boxShadow",
      "0px 10px 20px 0px #00FF00",
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
