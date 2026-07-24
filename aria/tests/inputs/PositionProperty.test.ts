import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
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
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const setClassRuleMock = vi.fn();
const removeClassRuleMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: createInspectorPropertySaveMock({
    saveProperties: savePropertiesMock,
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
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
      position: { default: "static" },
      top: { default: "auto" },
      right: { default: "auto" },
      bottom: { default: "auto" },
      left: { default: "auto" },
      zIndex: { default: "auto" },
    })),
  }),
}));

describe("PositionProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        position: { base: "absolute" },
        top: { base: "12px" },
        right: { base: "18px" },
        bottom: { base: "auto" },
        left: { base: "6px" },
        zIndex: { base: "20" },
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
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("hydrates current position styles and saves committed changes", async () => {
    const PositionProperty = (
      await import("../../admin/features/Inspector/inputs/PositionProperty.vue")
    ).default;

    const wrapper = mount(PositionProperty, {
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
          InspectorBreakpointIndicators: defineComponent({
            setup(_, { emit }) {
              return () =>
                h("button", {
                  "data-testid": "position-reset-breakpoint",
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
                    "data-testid": "position-mode-select-stub",
                    "data-model-value": props.modelValue,
                    onClick: () => emit("update:model-value", "fixed"),
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
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="position-mode-select"]')
        .attributes("data-model-value"),
    ).toBe("absolute");
    expect(
      (
        wrapper.get('[data-testid="position-top-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("12px");
    expect(
      wrapper.get('[data-testid="position-top-input"]').attributes("class"),
    ).toContain("cursor-ew-resize");
    expect(
      (
        wrapper.get('[data-testid="position-z-index-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("20");

    await wrapper.get('[data-testid="position-mode-select"]').trigger("click");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "position",
      "fixed",
      "page",
      "home",
    );

    const topInput = wrapper.get('[data-testid="position-top-input"]');
    await topInput.setValue("24px");
    await topInput.trigger("blur");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "top",
      "24px",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("previews scrubbed inset updates before saving", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    const PositionProperty = (
      await import("../../admin/features/Inspector/inputs/PositionProperty.vue")
    ).default;

    const wrapper = mount(PositionProperty, {
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
          InspectorBreakpointIndicators: defineComponent({
            setup(_, { emit }) {
              return () =>
                h("button", {
                  "data-testid": "position-reset-breakpoint",
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
                    "data-testid": "position-mode-select-stub",
                    "data-model-value": props.modelValue,
                    onClick: () => emit("update:model-value", "fixed"),
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
        },
      },
    });

    await flushPromises();

    const topInput = wrapper.get('[data-testid="position-top-input"]');
    await topInput.trigger("mousedown", { clientX: 20 });
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 36, bubbles: true }),
    );

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({ top: "28px" });

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "top",
      "28px",
      "page",
      "home",
    );

    wrapper.unmount();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });
});
