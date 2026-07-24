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
const setClassRulesMock = vi.fn();
const previewClassRulesMock = vi.fn();
const removeClassRuleMock = vi.fn();

const globalStylesRef = ref({
  variables: {
    custom: {
      "opacity-muted": {
        label: "Opacity Muted",
        value: "0.5",
        category: "effects",
      },
      "brand-primary": {
        label: "Brand Primary",
        value: "#10b981",
        category: "color",
      },
    },
    aliases: {},
  },
});

function createBasePropertyStub() {
  return defineComponent({
    props: {
      open: { type: Boolean, default: false },
      hasChanges: { type: Boolean, default: false },
    },
    setup(props, { slots }) {
      return () =>
        h(
          "div",
          {
            "data-testid": "base-property",
            "data-has-changes": String(props.hasChanges),
            "data-open": String(props.open),
          },
          {
            default: () => [
              slots["header-actions"]?.(),
              props.open ? "open" : "closed",
              slots.default?.(),
            ],
          },
        );
    },
  });
}

function createBreakpointIndicatorsStub() {
  return defineComponent({
    props: {
      showReset: { type: Boolean, default: false },
      currentBreakpointLabel: { type: String, default: "" },
    },
    emits: ["reset"],
    setup(props, { emit }) {
      return () =>
        h(
          "button",
          {
            "data-testid": "opacity-reset",
            "data-show-reset": String(props.showReset),
            "data-current-breakpoint-label": props.currentBreakpointLabel,
            onClick: () => emit("reset"),
          },
          "reset",
        );
    },
  });
}

function getComputedStyleValueMock(
  propertyName: string,
  fallback?: string,
  breakpoint: string = breakpointNameRef.value,
) {
  const node = selectedNodeRef.value as {
    styles?: Record<string, unknown>;
  } | null;
  const value = node?.styles?.[propertyName];

  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const responsiveValue = value as Record<string, string | undefined>;
  return responsiveValue[breakpoint] ?? responsiveValue.base ?? fallback;
}

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: createBasePropertyStub(),
}));

vi.mock(
  "../../admin/features/Inspector/inputs/InspectorBreakpointIndicators.vue",
  () => ({
    default: createBreakpointIndicatorsStub(),
  }),
);

vi.mock("@/components/ui/variable-reference-picker", () => ({
  VariableAssignableInput: defineComponent({
    name: "VariableAssignableInput",
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { attrs, slots, emit }) {
      return () => {
        if (slots.control) {
          return h(
            "div",
            {
              ...attrs,
              "data-testid": "opacity-variable-wrapper",
            },
            [
              slots.control(),
              h(
                "button",
                {
                  type: "button",
                  "data-testid": "opacity-variable-assign",
                  onClick: () => {
                    emit("update:modelValue", "var(--opacity-muted)");
                    emit("commit", "var(--opacity-muted)");
                  },
                },
                "assign",
              ),
              h(
                "button",
                {
                  type: "button",
                  "data-testid": "opacity-variable-assign-color",
                  onClick: () => {
                    emit("update:modelValue", "var(--brand-primary)");
                    emit("commit", "var(--brand-primary)");
                  },
                },
                "assign-color",
              ),
            ],
          );
        }

        return h("input", {
          ...attrs,
          "data-testid": "opacity-input",
          value: props.modelValue,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: Event) =>
            emit("commit", (event.target as HTMLInputElement).value),
        });
      };
    },
  }),
}));

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
    previewClassRules: previewClassRulesMock,
    setClassRule: setClassRuleMock,
    setClassRules: setClassRulesMock,
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

vi.mock("../../admin/features/Design/composables/useGlobalStyles", () => ({
  useGlobalStyles: () => ({
    globalStyles: globalStylesRef,
    isLoading: ref(false),
    loadGlobalStyles: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      display: { base: "block" },
      visibility: { base: "visible" },
      opacity: { base: "1" },
    })),
  }),
}));

vi.mock("../../admin/components/ui/slider", () => ({
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
          "data-testid": "opacity-slider",
          type: "range",
          min: 0,
          max: 100,
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

describe("OpacityProperty", () => {
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
    previewClassRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("syncs the displayed opacity when the active breakpoint changes", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        opacity: {
          base: "0.44",
          tablet: "0.72",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="opacity-value"]').text()).toBe("44%");
    expect(
      wrapper
        .get('[data-testid="base-property"]')
        .attributes("data-has-changes"),
    ).toBe("true");

    wrapper.unmount();

    breakpointNameRef.value = "tablet";

    const tabletWrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(tabletWrapper.get('[data-testid="opacity-value"]').text()).toBe(
      "72%",
    );

    tabletWrapper.unmount();
  });

  it("saves percentage values as css opacity decimals", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    await wrapper.get('[data-testid="opacity-slider"]').setValue("44");

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      opacity: "0.44",
    });

    await wrapper.get('[data-testid="opacity-slider"]').trigger("change");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { opacity: "0.44" },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("rehydrates from the active class and saves opacity changes as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
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
              property: "opacity",
              value: "0.44",
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

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(wrapper.get('[data-testid="opacity-value"]').text()).toBe("44%");

    wrapper.unmount();

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [
            {
              property: "opacity",
              value: "0.72",
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

    const classTwoWrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(classTwoWrapper.get('[data-testid="opacity-value"]').text()).toBe(
      "72%",
    );

    await classTwoWrapper.get('[data-testid="opacity-slider"]').setValue("88");
    await classTwoWrapper
      .get('[data-testid="opacity-slider"]')
      .trigger("change");

    expect(setClassRulesMock).toHaveBeenCalledWith({ opacity: "0.88" });

    classTwoWrapper.unmount();
  });

  it("rejects incompatible opacity variables without saving", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    const variableInput = wrapper.findComponent({
      name: "VariableAssignableInput",
    });
    variableInput.vm.$emit("commit", "var(--brand-primary)");
    await flushPromises();
    await nextTick();
    wrapper.vm.$forceUpdate();
    await nextTick();

    expect(savePropertiesMock).not.toHaveBeenCalled();
    expect(previewStylePropertiesMock).toHaveBeenCalledWith({ opacity: "1" });
    expect(wrapper.get('[data-testid="opacity-inspector-error"]').text()).toBe(
      "This variable cannot be used for opacity.",
    );
    expect(wrapper.get('[data-testid="opacity-value"]').text()).toBe("100%");

    wrapper.unmount();
  });

  it("shows a validation error and reverts when save fails", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
        },
      },
      children: [],
    } as never;
    savePropertiesMock.mockResolvedValue(false);
    errorRef.value = "Failed to save page: test3";

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="opacity-variable-assign"]')
      .trigger("click");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { opacity: "var(--opacity-muted)" },
      "page",
      "home",
    );
    expect(wrapper.get('[data-testid="opacity-inspector-error"]').text()).toBe(
      "Failed to save page: test3",
    );
    expect(wrapper.get('[data-testid="opacity-value"]').text()).toBe("100%");

    wrapper.unmount();
  });

  it("saves opacity variable references from the assign control", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="opacity-variable-assign"]')
      .trigger("click");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { opacity: "var(--opacity-muted)" },
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("syncs variable opacity without showing the percentage readout", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        opacity: {
          base: "var(--opacity-muted)",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="opacity-value"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="opacity-slider"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="opacity-input"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it("resets the current breakpoint opacity override from the header control", async () => {
    selectedNodeIdRef.value = "node-1";
    breakpointNameRef.value = "tablet";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Image",
      props: {},
      styles: {
        opacity: {
          base: "1",
          tablet: "0.72",
        },
      },
      children: [],
    } as never;

    const OpacityProperty = (
      await import("../../admin/features/Inspector/inputs/OpacityProperty.vue")
    ).default;

    const wrapper = mount(OpacityProperty, {
      props: {
        open: true,
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="opacity-reset"]')
        .attributes("data-show-reset"),
    ).toBe("true");

    await wrapper.get('[data-testid="opacity-reset"]').trigger("click");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      { opacity: undefined },
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
