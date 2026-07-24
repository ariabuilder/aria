import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import {
  createInspectorGlobalStyleDefaultsMock,
  createInspectorPropertySaveMock,
  designComposableMocks,
  inspectorPropertyState,
} from "./helpers/inspectorPropertyTestState";

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

vi.mock("@/components/ui/variable-reference-picker", () => ({
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
}));

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: defineComponent({
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

vi.mock("../../admin/features/Inspector/composables/useInspectorPropertyOverrides", () => ({
  useInspectorPropertyOverrides: () => ({
    overrideBreakpointIds: ref([]),
    overrideBreakpoints: ref([]),
    currentBreakpointOverrideKeys: ref([]),
    hasCurrentBreakpointOverride: ref(false),
    currentBreakpointLabel: ref("Base"),
    clearCurrentBreakpointOverrides: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
    getDefault: vi.fn(() => ({
      transform: { default: "none" },
      transformOrigin: { default: "center center" },
    })),
  }),
}));

describe("TransformProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        transform: {
          base: "translate(12px, 18px) rotate(15deg) scale(1.1, 1.2) skew(2deg, 4deg)",
        },
        transformOrigin: { base: "left top" },
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
    setClassRulesMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
  });

  function createWrapper(component: any) {
    return mount(component, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          InspectorBreakpointIndicators: defineComponent({
            props: {
              resetTestId: { type: String, default: "" },
            },
            emits: ["reset"],
            setup(props, { emit }) {
              return () =>
                h("button", {
                  "data-testid":
                    props.resetTestId || "transform-reset-breakpoint",
                  onClick: () => emit("reset"),
                });
            },
          }),
        },
      },
    });
  }

  it("hydrates current transform styles and saves committed changes", async () => {
    const TransformProperty = (
      await import("../../admin/features/Inspector/inputs/TransformProperty.vue")
    ).default;

    const wrapper = createWrapper(TransformProperty);
    await flushPromises();

    expect(
      (
        wrapper.get('[data-testid="transform-translate-x-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("12px");
    expect(
      (
        wrapper.get('[data-testid="transform-origin-x-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("left");

    const rotateInput = wrapper.get('[data-testid="transform-rotate-input"]');
    await rotateInput.setValue("45deg");
    await rotateInput.trigger("blur");

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        transform:
          "translate(12px, 18px) rotate(45deg) scale(1.1, 1.2) skew(2deg, 4deg)",
      },
      "page",
      "home",
    );

    await wrapper
      .get('[data-testid="transform-origin-center-center"]')
      .trigger("click");

    expect(savePropertiesMock).toHaveBeenLastCalledWith(
      {
        transformOrigin: "center center",
      },
      "page",
      "home",
    );
  });

  it("renders a higher contrast preview with an explicit origin anchor", async () => {
    const TransformProperty = (
      await import("../../admin/features/Inspector/inputs/TransformProperty.vue")
    ).default;

    const wrapper = createWrapper(TransformProperty);
    await flushPromises();

    const shellClasses = wrapper
      .get('[data-testid="transform-preview-shell"]')
      .classes();
    expect(shellClasses).toContain("bg-background/65");
    expect(shellClasses).toContain("border-border/70");

    const stageClasses = wrapper
      .get('[data-testid="transform-preview-stage"]')
      .classes();
    expect(stageClasses).toContain("bg-sidebar/70");
    expect(stageClasses).toContain("dark:bg-background/25");

    const subjectClasses = wrapper
      .get('[data-testid="transform-preview-subject"]')
      .classes();
    expect(subjectClasses).toContain("border-primary/35");
    expect(subjectClasses).toContain("bg-primary/16");

    const anchor = wrapper.get(
      '[data-testid="transform-preview-origin-anchor"]',
    );
    expect(anchor.classes()).toContain("bg-primary");
    expect(anchor.attributes("style")).toContain("left: 0%");
    expect(anchor.attributes("style")).toContain("top: 0%");
  });

  it("batches class rule updates when editing transform in class mode", async () => {
    editingModeRef.value = "class";
    activeClassNameRef.value = "card";

    const TransformProperty = (
      await import("../../admin/features/Inspector/inputs/TransformProperty.vue")
    ).default;

    const wrapper = createWrapper(TransformProperty);
    await flushPromises();

    const rotateInput = wrapper.get('[data-testid="transform-rotate-input"]');
    await rotateInput.setValue("90deg");
    await rotateInput.trigger("blur");

    expect(setClassRulesMock).toHaveBeenCalledWith({
      transform: "rotate(90deg)",
    });
    expect(savePropertiesMock).not.toHaveBeenCalled();
    expect(setClassRulesMock).toHaveBeenCalledTimes(1);
  });

  it("previews scrubbed transform updates before saving", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      },
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );

    const TransformProperty = (
      await import("../../admin/features/Inspector/inputs/TransformProperty.vue")
    ).default;

    const wrapper = createWrapper(TransformProperty);
    await flushPromises();

    const translateXInput = wrapper.get(
      '[data-testid="transform-translate-x-input"]',
    );
    translateXInput.element.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        clientX: 100,
        bubbles: true,
      }),
    );

    document.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: 112,
        bubbles: true,
      }),
    );

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      transform:
        "translate(24px, 18px) rotate(15deg) scale(1.1, 1.2) skew(2deg, 4deg)",
      transformOrigin: "left top",
    });

    document.dispatchEvent(
      new MouseEvent("mouseup", {
        clientX: 112,
        bubbles: true,
      }),
    );

    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        transform:
          "translate(24px, 18px) rotate(15deg) scale(1.1, 1.2) skew(2deg, 4deg)",
      },
      "page",
      "home",
    );
  });
});
