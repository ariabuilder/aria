import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, computed } from "vue";
import type { BuilderNode } from "../../lib/types/nodes";
import {
  createInspectorGlobalStyleDefaultsMock,
  designComposableMocks,
} from "./helpers/inspectorPropertyTestState";

const selectedNodeRef = ref<BuilderNode | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const classEditorLoadingRef = ref(false);
const classEditorErrorRef = ref<string | null>(null);
const editingModeRef = ref<"element" | "class">("element");
const activeClassNameRef = ref<string | null>(null);
const activeClassRef = ref<Record<string, unknown> | null>(null);
const selectedPseudoRef = ref<
  "default" | "hover" | "focus" | "before" | "after"
>("default");
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const setClassRuleMock = vi.fn();
const setClassRulesMock = vi.fn();
const setClassPseudoRuleMock = vi.fn();
const setClassPseudoRulesMock = vi.fn();
const previewClassRulesMock = vi.fn();
const previewClassPseudoRulesMock = vi.fn();
const removeClassRuleMock = vi.fn();
const removeClassPseudoRuleMock = vi.fn();
const removeClassRulesMock = vi.fn();
const removeClassPseudoRulesMock = vi.fn();

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
) {
  const value = selectedNodeRef.value?.styles?.[propertyName];

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
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    getComputedStyleValue: getComputedStyleValueMock,
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
    previewClassPseudoRules: previewClassPseudoRulesMock,
    setClassRule: setClassRuleMock,
    setClassRules: setClassRulesMock,
    setClassPseudoRule: setClassPseudoRuleMock,
    setClassPseudoRules: setClassPseudoRulesMock,
    removeClassRule: removeClassRuleMock,
    removeClassPseudoRule: removeClassPseudoRuleMock,
    removeClassRules: removeClassRulesMock,
    removeClassPseudoRules: removeClassPseudoRulesMock,
    getClassRule: vi.fn(() => undefined),
    getClassPseudoRule: vi.fn(() => undefined),
  }),
}));

vi.mock("../../admin/features/Inspector/composables/useInspectorState", () => ({
  useInspectorState: () => ({
    selectedPseudo: selectedPseudoRef,
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
      width: { base: "auto" },
      height: { base: "auto" },
      widthSizing: { base: "hug" },
      heightSizing: { base: "hug" },
      minWidth: { base: "0" },
      minHeight: { base: "0" },
      maxWidth: { base: "none" },
      maxHeight: { base: "none" },
    })),
  }),
}));

describe("SizeProperty", () => {
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
    selectedPseudoRef.value = "default";
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    setClassRuleMock.mockResolvedValue(true);
    setClassRulesMock.mockResolvedValue(true);
    setClassPseudoRuleMock.mockResolvedValue(true);
    setClassPseudoRulesMock.mockResolvedValue(true);
    previewClassRulesMock.mockReturnValue(true);
    previewClassPseudoRulesMock.mockReturnValue(true);
    removeClassRuleMock.mockResolvedValue(true);
    removeClassPseudoRuleMock.mockResolvedValue(true);
    removeClassRulesMock.mockResolvedValue(true);
    removeClassPseudoRulesMock.mockResolvedValue(true);
  });

  it("keeps exact inputs clear for auto values and previews scrub before a single commit", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        width: { base: "auto" },
        height: { base: "auto" },
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

    const SizeProperty = (
      await import("../../admin/features/Inspector/inputs/SizeProperty.vue")
    ).default;

    const wrapper = mount(SizeProperty, {
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
        },
      },
    });

    await flushPromises();

    const buttons = wrapper.findAll("button");
    await buttons[2]!.trigger("click");
    await nextTick();

    const exactInput = wrapper.find("input");
    expect(exactInput.element.value).toBe("");

    await exactInput.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 24 }));
    await nextTick();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      width: "14px",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 24 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { width: "14px", widthSizing: "exact" },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("previews width constraints while typing and saves only on commit", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        width: { base: "auto" },
        minWidth: { base: "0" },
        maxWidth: { base: "none" },
      },
      children: [],
    } as never;

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(0), 0);
      });

    const SizeProperty = (
      await import("../../admin/features/Inspector/inputs/SizeProperty.vue")
    ).default;

    const wrapper = mount(SizeProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();
    await wrapper.get('[data-testid="size-width-mode-exact"]').trigger("click");
    await nextTick();

    await wrapper.findAll("input")[0]!.setValue("320");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(previewStylePropertiesMock).toHaveBeenLastCalledWith({
      width: "320px",
    });

    await wrapper.findAll("input")[1]!.setValue("12");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(previewStylePropertiesMock).toHaveBeenLastCalledWith({
      minWidth: "12px",
    });

    await wrapper.findAll("input")[3]!.setValue("640");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(previewStylePropertiesMock).toHaveBeenLastCalledWith({
      maxWidth: "640px",
    });

    expect(savePropertiesMock).not.toHaveBeenCalled();

    await wrapper.findAll("input")[0]!.trigger("blur");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledTimes(1);
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { width: "320px", widthSizing: "exact" },
      "page",
      "home",
    );

    requestAnimationFrameSpy.mockRestore();
    wrapper.unmount();
  });

  it("uses higher contrast mode button styling for light mode", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        width: { base: "auto" },
        height: { base: "100%" },
      },
      children: [],
    } as never;

    const SizeProperty = (
      await import("../../admin/features/Inspector/inputs/SizeProperty.vue")
    ).default;

    const wrapper = mount(SizeProperty, {
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
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          VariableAssignableInput: createVariableAssignableInputStub(),
        },
      },
    });

    await flushPromises();

    const widthGroupClasses = wrapper
      .get('[data-testid="size-width-mode-group"]')
      .classes();
    expect(widthGroupClasses).toContain("bg-background/75");
    expect(widthGroupClasses).toContain("border-border/70");
    expect(widthGroupClasses).toContain("dark:bg-sidebar/55");

    const activeWidthClasses = wrapper
      .get('[data-testid="size-width-mode-hug"]')
      .classes();
    expect(activeWidthClasses).toContain("bg-primary/10!");
    expect(activeWidthClasses).toContain("text-primary");
    expect(activeWidthClasses).not.toContain("text-primary-foreground!");

    const inactiveWidthClasses = wrapper
      .get('[data-testid="size-width-mode-fill"]')
      .classes();
    expect(inactiveWidthClasses).toContain("text-foreground/75");
    expect(inactiveWidthClasses).toContain("border-transparent");

    wrapper.unmount();
  });

  it("rehydrates from the active class and saves size changes as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        width: { base: "auto" },
        height: { base: "auto" },
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
            { property: "width", value: "480px", important: false },
            { property: "height", value: "100%", important: false },
          ],
        },
      ],
      pseudoVariants: [],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const SizeProperty = (
      await import("../../admin/features/Inspector/inputs/SizeProperty.vue")
    ).default;

    const wrapper = mount(SizeProperty, {
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const exactInputs = wrapper.findAll("input");
    expect(exactInputs[0]?.element.value).toBe("480");

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [
            { property: "width", value: "auto", important: false },
            { property: "height", value: "360px", important: false },
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

    const allButtons = wrapper.findAll("button");
    await allButtons[1]!.trigger("click");

    expect(setClassRulesMock).toHaveBeenCalledWith({ widthSizing: "fill" });

    wrapper.unmount();
  });

  it("saves class-mode changes into pseudo rules when a pseudo state is active", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedPseudoRef.value = "hover";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Container",
      props: {},
      styles: {
        width: { base: "320px" },
      },
      children: [],
    } as never;
    editingModeRef.value = "class";
    activeClassNameRef.value = "class-1";
    activeClassRef.value = {
      id: "class-1",
      name: "class-1",
      variants: [],
      pseudoVariants: [
        {
          state: "hover",
          breakpoint: "base",
          rules: [{ property: "width", value: "320px", important: false }],
        },
      ],
      usageCount: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const SizeProperty = (
      await import("../../admin/features/Inspector/inputs/SizeProperty.vue")
    ).default;

    const wrapper = mount(SizeProperty, {
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const exactInputs = wrapper.findAll("input");
    expect(exactInputs[0]?.element.value).toBe("320");

    const allButtons = wrapper.findAll("button");
    await allButtons[1]!.trigger("click");

    expect(setClassPseudoRulesMock).toHaveBeenCalledWith("hover", {
      widthSizing: "fill",
    });
    expect(removeClassPseudoRulesMock).toHaveBeenCalledWith("hover", ["width"]);
    expect(setClassRuleMock).not.toHaveBeenCalled();
    expect(previewStylePropertiesMock).toHaveBeenCalledWith({
      width: undefined,
      widthSizing: undefined,
    });
    expect(savePropertiesMock).toHaveBeenCalledWith(
      { width: undefined, widthSizing: undefined },
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
