import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";

const selectedNodeRef = ref(null);
const selectedNodeIdRef = ref<string | null>(null);
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
const setClassRuleMock = vi.fn();
const removeClassRuleMock = vi.fn();

function getComputedStyleValueMock(
  propertyName: string,
  fallback?: string,
  breakpoint: string = breakpointNameRef.value,
) {
  const value = (selectedNodeRef.value as Record<string, unknown> | null)
    ?.styles as Record<string, unknown> | undefined;
  if (!value) return fallback;
  const prop = value[propertyName];
  if (typeof prop === "string") return prop;
  if (!prop || typeof prop !== "object") return fallback;
  const responsive = prop as Record<string, string | undefined>;
  return responsive[breakpoint] ?? responsive.base ?? fallback;
}

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: breakpointNameRef,
    isLoading: isLoadingRef,
    error: errorRef,
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    getComputedStyleValue: getComputedStyleValueMock,
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
      filter: { base: "none" },
      backdropFilter: { base: "none" },
    })),
  }),
}));

vi.mock("@/components/ui/slider", () => ({
  Slider: defineComponent({
    name: "Slider",
    props: {
      modelValue: { type: Array, default: () => [] },
      min: { type: Number, default: 0 },
      max: { type: Number, default: 100 },
      step: { type: Number, default: 1 },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:modelValue", "valueCommit"],
    setup(props, { emit }) {
      return () =>
        h("button", {
          type: "button",
          "data-testid": "filter-slider",
          "data-value": String((props.modelValue as number[])[0] ?? ""),
          "data-min": String(props.min),
          "data-max": String(props.max),
          "data-step": String(props.step),
          "data-disabled": String(props.disabled),
          onClick: () => {
            emit("update:modelValue", [props.max]);
            emit("valueCommit", [props.max]);
          },
        });
    },
  }),
}));

function createVariableAssignableInputStub() {
  return defineComponent({
    props: {
      modelValue: { type: String, default: "" },
      disabled: { type: Boolean, default: false },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { attrs, emit }) {
      return () =>
        h("input", {
          ...attrs,
          value: props.modelValue,
          disabled: props.disabled,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: () => emit("commit", props.modelValue),
        });
    },
  });
}

function createBaseStubs() {
  return {
    BaseProperty: defineComponent({
      props: { hasChanges: { type: Boolean, default: false } },
      setup(props, { slots }) {
        return () =>
          h(
            "div",
            { "data-has-changes": String(props.hasChanges) },
            slots.default?.(),
          );
      },
    }),
    InspectorBreakpointIndicators: defineComponent({
      props: {
        breakpoints: Array,
        currentBreakpointLabel: String,
        showReset: Boolean,
        resetTestId: String,
      },
      emits: ["reset"],
      setup(props, { slots }) {
        return () =>
          h("div", { "data-testid": props.resetTestId }, slots.default?.());
      },
    }),
    ColorPicker: defineComponent({
      props: { modelValue: String, showDesignColors: Boolean },
      emits: ["update:modelValue"],
      setup(_props, { slots }) {
        return () => h("div", { onClick: () => {} }, slots.default?.());
      },
    }),
    ColorField: defineComponent({
      props: { modelValue: String, showDesignColors: Boolean },
      emits: ["update:modelValue"],
      setup(_props, { slots }) {
        return () => h("div", { onClick: () => {} }, slots.default?.());
      },
    }),
    VariableAssignableInput: createVariableAssignableInputStub(),
  };
}

describe("FilterProperty", () => {
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
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("renders inline inputs with default identity values when no styles are set", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "none" },
        backdropFilter: { base: "none" },
      },
      children: [],
    } as never;

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect(inputs.length).toBe(16);
    expect(inputs[0]?.element.value).toBe("0");
    expect(inputs[1]?.element.value).toBe("100");

    wrapper.unmount();
  });

  it("parses existing filter CSS and populates fields", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(4px) brightness(80%) contrast(120%)" },
        backdropFilter: { base: "none" },
      },
      children: [],
    } as never;

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    expect(inputs[0]?.element.value).toBe("4"); // blur
    expect(inputs[1]?.element.value).toBe("80"); // brightness
    expect(inputs[2]?.element.value).toBe("120"); // contrast

    wrapper.unmount();
  });

  it("preserves variable filter values instead of dropping the row", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(var(--blur-strength))" },
        backdropFilter: { base: "none" },
      },
      children: [],
    } as never;

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const blurInput = wrapper.findAll("input")[0]!;
    expect(blurInput.element.value).toBe("var(--blur-strength)");
    expect(wrapper.findAll('[data-testid="filter-slider"]')[0]?.attributes("data-disabled")).toBe("true");

    await blurInput.setValue("var(--next-blur)");
    await blurInput.trigger("blur");

    expect(savePropertyMock).toHaveBeenCalledWith(
      "filter",
      "blur(var(--next-blur))",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("saves bounded slider updates as publishable filter CSS", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(4px)" },
        backdropFilter: { base: "none" },
      },
      children: [],
    } as never;

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const blurSlider = wrapper.findAll('[data-testid="filter-slider"]')[0]!;
    expect(blurSlider.attributes("data-max")).toBe("64");

    await blurSlider.trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      filter: "blur(64px)",
    });
    expect(savePropertyMock).toHaveBeenCalledWith(
      "filter",
      "blur(64px)",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("saves filter CSS when committing a value change in class editing mode", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(4px)" },
        backdropFilter: { base: "none" },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    activeClassNameRef.value = "card";
    activeClassRef.value = {
      id: "card",
      name: "card",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "filter", value: "blur(4px)", important: false }],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const inputs = wrapper.findAll("input");
    // blur input is the first one; update it to 10
    await inputs[0]!.setValue("10");
    await inputs[0]!.trigger("blur");

    expect(setClassRuleMock).toHaveBeenCalledWith("filter", "blur(10px)");

    wrapper.unmount();
  });

  it("previews filter scrub updates before saving", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(4px)" },
        backdropFilter: { base: "none" },
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

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const blurInput = wrapper.findAll("input")[0]!;
    await blurInput.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 18 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      filter: "blur(12px)",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 18 }));
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "filter",
      "blur(12px)",
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("clamps scrubbed filter values before preview and save", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        filter: { base: "blur(4px)" },
        backdropFilter: { base: "none" },
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

    const FilterProperty = (
      await import("../../admin/features/Inspector/inputs/FilterProperty.vue")
    ).default;

    const wrapper = mount(FilterProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: { stubs: createBaseStubs() },
    });

    await flushPromises();

    const blurInput = wrapper.findAll("input")[0]!;
    await blurInput.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 510 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      filter: "blur(64px)",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 510 }));
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "filter",
      "blur(64px)",
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });
});
