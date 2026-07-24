import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, computed } from "vue";
import {
  createInspectorGlobalStyleDefaultsMock,
  designComposableMocks,
} from "./helpers/inspectorPropertyTestState";

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
const signalSpacingPreviewStartMock = vi.fn();
const signalSpacingPreviewEndMock = vi.fn();
const setClassRuleMock = vi.fn();
const previewClassRulesMock = vi.fn();
const removeClassRuleMock = vi.fn();

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
    useCanvasSignalBridge: undefined,
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    getComputedStyleValue: getComputedStyleValueMock,
  }),
  useCanvasSignalBridge: () => ({
    signalSpacingPreviewStart: signalSpacingPreviewStartMock,
    signalSpacingPreviewEnd: signalSpacingPreviewEndMock,
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
    previewClassRules: previewClassRulesMock,
    setClassRule: setClassRuleMock,
    removeClassRule: removeClassRuleMock,
    getClassRule: vi.fn(() => undefined),
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
      marginTop: { base: "0" },
      marginRight: { base: "0" },
      marginBottom: { base: "0" },
      marginLeft: { base: "0" },
      paddingTop: { base: "0" },
      paddingRight: { base: "0" },
      paddingBottom: { base: "0" },
      paddingLeft: { base: "0" },
    })),
  }),
}));

describe("SpacingProperty", () => {
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
    signalSpacingPreviewStartMock.mockReset();
    signalSpacingPreviewEndMock.mockReset();
    setClassRuleMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("treats explicit zero spacing overrides as changes", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        marginTop: { base: "0" },
        paddingTop: { base: "0" },
      },
      children: [],
    } as never;

    const SpacingProperty = (
      await import("../../admin/features/Inspector/inputs/SpacingProperty.vue")
    ).default;

    const wrapper = mount(SpacingProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
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
          Input: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:modelValue", "blur"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                  onBlur: (event: FocusEvent) => emit("blur", event),
                });
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="base-property"]')
        .attributes("data-has-changes"),
    ).toBe("true");

    wrapper.unmount();
  });

  it("marks non-default spacing values as changes", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        paddingTop: { base: "24px" },
      },
      children: [],
    } as never;

    const SpacingProperty = (
      await import("../../admin/features/Inspector/inputs/SpacingProperty.vue")
    ).default;

    const wrapper = mount(SpacingProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
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
          Input: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:modelValue", "blur"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                  onBlur: (event: FocusEvent) => emit("blur", event),
                });
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="base-property"]')
        .attributes("data-has-changes"),
    ).toBe("true");

    wrapper.unmount();
  });

  it("rehydrates from the active class and saves spacing changes as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        marginTop: { base: "0" },
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
            { property: "paddingTop", value: "24px", important: false },
            { property: "paddingLeft", value: "12px", important: false },
          ],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const SpacingProperty = (
      await import("../../admin/features/Inspector/inputs/SpacingProperty.vue")
    ).default;

    const wrapper = mount(SpacingProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
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
          Input: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
            },
            emits: ["update:modelValue", "blur"],
            setup(props, { attrs, emit }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.modelValue,
                  onInput: (event: Event) =>
                    emit(
                      "update:modelValue",
                      (event.target as HTMLInputElement).value,
                    ),
                  onBlur: (event: FocusEvent) => emit("blur", event),
                });
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();

    const initialInputs = wrapper.findAll("input");
    expect(initialInputs.some((input) => input.element.value === "24px")).toBe(
      true,
    );
    expect(initialInputs.some((input) => input.element.value === "12px")).toBe(
      true,
    );

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [{ property: "marginTop", value: "32px", important: false }],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    await nextTick();
    await flushPromises();

    const refreshedInputs = wrapper.findAll("input");
    const topInput = refreshedInputs.find(
      (input) => input.attributes("placeholder") === "Top",
    );
    const rightInput = refreshedInputs.find(
      (input) => input.attributes("placeholder") === "Right",
    );

    expect(topInput?.element.value).toBe("32px");

    await rightInput!.setValue("16");
    await rightInput!.trigger("blur");

    expect(setClassRuleMock).toHaveBeenCalledWith("marginRight", "16px");

    wrapper.unmount();
  });

  it("previews spacing during scrub and commits once on release", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        marginTop: { base: "8px" },
        marginBottom: { base: "8px" },
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

    const SpacingProperty = (
      await import("../../admin/features/Inspector/inputs/SpacingProperty.vue")
    ).default;

    const wrapper = mount(SpacingProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
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
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();

    const input = wrapper.findAll("input")[0];
    expect(input?.exists()).toBe(true);

    await input!.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 22 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      marginTop: "20px",
      marginBottom: "20px",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 22 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        marginTop: "20px",
        marginBottom: "20px",
      },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });
});
