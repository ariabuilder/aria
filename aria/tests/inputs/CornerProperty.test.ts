import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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
const removeClassRuleMock = vi.fn();

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
    removeClassRule: removeClassRuleMock,
    getClassRule: vi.fn(() => undefined),
    previewClassRules: vi.fn(() => true),
  }),
}));

vi.mock("../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([
      { name: "base", label: "Base", minWidth: 0 },
      { name: "tablet", label: "Tablet", minWidth: 768 },
    ]),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      borderRadius: { default: "0" },
      cornerShape: { default: "round" },
      borderTopLeftRadius: { default: "0" },
      borderTopRightRadius: { default: "0" },
      borderBottomRightRadius: { default: "0" },
      borderBottomLeftRadius: { default: "0" },
    })),
  }),
}));

function createBaseStubs() {
  return {
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
    InspectorBreakpointIndicators: defineComponent({
      setup(_, { emit }) {
        return () =>
          h("button", {
            type: "button",
            "data-testid": "corner-reset-breakpoint",
            onClick: () => emit("reset"),
          });
      },
    }),
    VariableAssignableInput: defineComponent({
      props: {
        modelValue: { type: String, default: "" },
        disabled: { type: Boolean, default: false },
        inputClass: { type: String, default: "" },
      },
      emits: ["update:modelValue", "commit"],
      setup(props, { attrs, emit }) {
        return () =>
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
          });
      },
    }),
    Slider: defineComponent({
      props: {
        modelValue: {
          type: Array,
          default: () => [0],
        },
        min: { type: Number, default: 0 },
        max: { type: Number, default: 100 },
        step: { type: Number, default: 1 },
        disabled: { type: Boolean, default: false },
      },
      emits: ["update:model-value", "value-commit"],
      setup(props, { attrs, emit }) {
        return () =>
          h("input", {
            ...attrs,
            type: "range",
            min: props.min,
            max: props.max,
            step: props.step,
            disabled: props.disabled,
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
    Select: defineComponent({
      props: {
        modelValue: { type: String, default: "" },
        disabled: { type: Boolean, default: false },
      },
      emits: ["update:model-value"],
      setup(props, { attrs, emit, slots }) {
        return () =>
          h(
            "div",
            {
              ...attrs,
              "data-model-value": props.modelValue,
              "data-disabled": String(props.disabled),
              onClick: () => emit("update:model-value", "scoop"),
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
        return () => h("div", { "data-value": props.value }, slots.default?.());
      },
    }),
  };
}

describe("CornerProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderRadius: { base: "10px" },
        cornerShape: { base: "squircle" },
      },
      children: [],
    };
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
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("hydrates linked radius from borderRadius shorthand and commits changes", async () => {
    const CornerProperty = (
      await import("../../admin/features/Inspector/inputs/CornerProperty.vue")
    ).default;

    const wrapper = mount(CornerProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    const input = wrapper.get('[data-testid="corner-linked-radius-input"]');
    expect((input.element as HTMLInputElement).value).toBe("10");
    expect(input.attributes("class") ?? "").toContain("cursor-ew-resize");
    expect(
      wrapper.find('[data-testid="corner-linked-radius-slider"]').exists(),
    ).toBe(false);
    expect(
      wrapper
        .get('[data-testid="corner-shape-select"]')
        .attributes("data-model-value"),
    ).toBe("squircle");
    expect(
      wrapper.get('[data-testid="corner-shape-select-value"]').text(),
    ).toBe("Squircle");
    expect(
      (
        wrapper.get('[data-testid="corner-linked-shape-slider"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("2");

    await input.setValue("18");
    await input.trigger("blur");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        borderTopLeftRadius: "18px",
        borderTopRightRadius: "18px",
        borderBottomRightRadius: "18px",
        borderBottomLeftRadius: "18px",
      },
      "page",
      "home",
    );

    await wrapper.get('[data-testid="corner-shape-select"]').trigger("click");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { cornerShape: "scoop" },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("previews and commits linked radius drag scrubbing", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    const CornerProperty = (
      await import("../../admin/features/Inspector/inputs/CornerProperty.vue")
    ).default;

    const wrapper = mount(CornerProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    const input = wrapper.get('[data-testid="corner-linked-radius-input"]');
    await input.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 18 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      borderTopLeftRadius: "18px",
      borderTopRightRadius: "18px",
      borderBottomRightRadius: "18px",
      borderBottomLeftRadius: "18px",
    });

    document.dispatchEvent(new MouseEvent("mouseup"));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        borderTopLeftRadius: "18px",
        borderTopRightRadius: "18px",
        borderBottomRightRadius: "18px",
        borderBottomLeftRadius: "18px",
      },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("hides the linked curvature slider for infinite corner shape keywords", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderRadius: { base: "123px" },
        cornerShape: { base: "square" },
      },
      children: [],
    };

    const CornerProperty = (
      await import("../../admin/features/Inspector/inputs/CornerProperty.vue")
    ).default;

    const wrapper = mount(CornerProperty, {
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
        wrapper.get('[data-testid="corner-linked-radius-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("123");
    expect(
      wrapper.find('[data-testid="corner-linked-shape-slider"]').exists(),
    ).toBe(false);

    wrapper.unmount();
  });

  it("keeps the linked shape label visible for in-between slider values and commits on release", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        borderRadius: { base: "4px" },
        cornerShape: { base: "squircle" },
      },
      children: [],
    };

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    const CornerProperty = (
      await import("../../admin/features/Inspector/inputs/CornerProperty.vue")
    ).default;

    const wrapper = mount(CornerProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createBaseStubs(),
      },
    });

    await flushPromises();

    const slider = wrapper.get('[data-testid="corner-linked-shape-slider"]');
    (slider.element as HTMLInputElement).value = "-0.1";
    await slider.trigger("input");
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      cornerShape: "superellipse(-0.1)",
    });
    expect(
      wrapper.get('[data-testid="corner-shape-select-value"]').text(),
    ).toBe("Superellipse (-0.1)");

    await slider.trigger("change");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { cornerShape: "superellipse(-0.1)" },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });
});
