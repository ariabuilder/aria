import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import type { BuilderNodeFixture } from "../helpers/builderNodeFixture";

const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
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
const setClassRuleMock = vi.fn();
const removeClassRuleMock = vi.fn();
const pageBlocksRef = ref([]);
const stageIframeRef = ref<HTMLIFrameElement | null>(null);

const SelectStub = defineComponent({
  name: "SelectStub",
  props: {
    modelValue: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h(
        "select",
        {
          ...attrs,
          value: props.modelValue,
          onChange: (event: Event) =>
            emit(
              "update:modelValue",
              (event.target as HTMLSelectElement).value,
            ),
        },
        slots.default?.(),
      );
  },
});

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
    breakpointName: breakpointNameRef,
    isLoading: isLoadingRef,
    error: errorRef,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    getComputedStyleValue: getComputedStyleValueMock,
  }),
  useInjectedPageBlocks: () => pageBlocksRef,
  useInjectedStageIframeRef: () => stageIframeRef,
  useSelectedNodeState: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    primarySelectedNode: selectedNodeRef,
    primarySelectedNodeId: selectedNodeIdRef,
    selectedNodes: ref([]),
    selectedNodeIds: ref([]),
    selectionAnchorNodeId: ref<string | null>(null),
    selectionCount: ref(0),
    isMultiSelect: ref(false),
    updateSelectedNodeClassNames: vi.fn(() => null),
    updateSelectedNodeCustomClasses: vi.fn(() => null),
    updateSelectedNodeProps: vi.fn(() => null),
    updateSelectedNodeStyles: vi.fn(() => null),
    updateSelectedNodeA11y: vi.fn(() => null),
    updateSelectedNodeMotion: vi.fn(() => null),
    updateSelectedNodeDataSource: vi.fn(() => null),
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: ref([]),
    setSelectionTreeRootNodes: vi.fn(),
  }),
  useCanvasSignalBridge: () => ({
    signalA11yUpdate: vi.fn(),
    signalMotionUpdate: vi.fn(),
    signalPropsUpdate: vi.fn(),
    broadcastPropsUpdate: vi.fn(),
    signalStyleUpdate: vi.fn(),
    broadcastClassUpdate: vi.fn(),
    signalSpacingPreviewStart: vi.fn(),
    signalSpacingPreviewEnd: vi.fn(),
    broadcastComponentWrapperResponse: vi.fn(),
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
  }),
}));

describe("ImageProperty", () => {
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
    pageBlocksRef.value = [];
    stageIframeRef.value = null;
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    setClassRuleMock.mockResolvedValue(true);
    removeClassRuleMock.mockResolvedValue(true);
  });

  it("rehydrates from the active class and saves image fit and position as class rules", async () => {
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "image",
      props: {
        src: "/image.png",
        alt: "Image",
      },
      styles: {
        objectFit: { base: "cover" },
        objectPosition: { base: "center center" },
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
            { property: "objectFit", value: "contain", important: false },
            {
              property: "objectPosition",
              value: "top center",
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

    const ImageProperty = (
      await import("../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            name: "BaseProperty",
            props: {
              hasChanges: { type: Boolean, default: false },
            },
            setup(props, { slots }) {
              return () =>
                h(
                  "div",
                  {
                    "data-testid": "image-base-property",
                    "data-has-changes": String(props.hasChanges),
                  },
                  [slots["header-actions"]?.(), slots.default?.()],
                );
            },
          }),
          InspectorBreakpointIndicators: defineComponent({
            props: {
              breakpoints: { type: Array, default: () => [] },
              currentBreakpointLabel: { type: String, default: "" },
              showReset: { type: Boolean, default: false },
              resetTestId: { type: String, default: "" },
            },
            emits: ["reset"],
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "image-breakpoint-indicators",
                  "data-breakpoint-count": String(props.breakpoints.length),
                  "data-current-breakpoint-label": props.currentBreakpointLabel,
                  "data-show-reset": String(props.showReset),
                  "data-reset-test-id": props.resetTestId,
                });
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Select: SelectStub,
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
                h("option", { value: props.value }, slots.default?.());
            },
          }),
          MediaPickerDialog: defineComponent({
            setup() {
              return () => null;
            },
          }),
          LinkProperty: defineComponent({
            props: {
              embedded: { type: Boolean, default: false },
              currentItemType: { type: String, default: "" },
              currentItemSlug: { type: String, default: "" },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "embedded-image-link-property",
                  "data-embedded": String(props.embedded),
                  "data-item-type": props.currentItemType,
                  "data-item-slug": props.currentItemSlug,
                });
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper
        .get('[data-testid="embedded-image-link-property"]')
        .attributes("data-embedded"),
    ).toBe("true");
    expect(
      wrapper
        .get('[data-testid="embedded-image-link-property"]')
        .attributes("data-item-type"),
    ).toBe("page");
    expect(
      wrapper
        .get('[data-testid="embedded-image-link-property"]')
        .attributes("data-item-slug"),
    ).toBe("home");

    const previewImage = wrapper.get("img");
    expect((previewImage.element as HTMLImageElement).style.objectFit).toBe(
      "contain",
    );
    expect(
      (previewImage.element as HTMLImageElement).style.objectPosition,
    ).toBe("top center");

    activeClassNameRef.value = "class-2";
    activeClassRef.value = {
      id: "class-2",
      name: "class-2",
      variants: [
        {
          breakpoint: "base",
          rules: [
            { property: "objectFit", value: "fill", important: false },
            {
              property: "objectPosition",
              value: "bottom right",
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

    expect((previewImage.element as HTMLImageElement).style.objectFit).toBe(
      "fill",
    );
    expect(
      (previewImage.element as HTMLImageElement).style.objectPosition,
    ).toBe("bottom right");

    expect(
      wrapper
        .get('[data-testid="image-base-property"]')
        .attributes("data-has-changes"),
    ).toBe("true");
    expect(
      wrapper
        .get('[data-testid="image-breakpoint-indicators"]')
        .attributes("data-breakpoint-count"),
    ).toBe("1");
    expect(
      wrapper
        .get('[data-testid="image-breakpoint-indicators"]')
        .attributes("data-current-breakpoint-label"),
    ).toBe("Base");

    const selectByTestId = (testId: string) =>
      wrapper
        .findAllComponents(SelectStub)
        .find((component) => component.attributes("data-testid") === testId);

    const objectFitSelect = selectByTestId("image-object-fit-select");
    const objectPositionPicker = wrapper.findComponent({
      name: "InspectorPositionGridPicker",
    });

    objectFitSelect?.vm.$emit("update:modelValue", "none");
    await flushPromises();
    expect(setClassRuleMock).toHaveBeenCalledWith("objectFit", "none");

    objectPositionPicker.vm.$emit("update:modelValue", "center left");
    await flushPromises();
    expect(setClassRuleMock).toHaveBeenCalledWith(
      "objectPosition",
      "center left",
    );

    wrapper.unmount();
  });

  it("saves remote image URLs and alt text on blur against persisted node values", async () => {
    selectedNodeIdRef.value = "node-2";
    selectedNodeRef.value = {
      id: "node-2",
      type: "image",
      props: {
        src: "",
        alt: "",
      },
      styles: {},
      children: [],
    } as never;

    const ImageProperty = (
      await import("../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
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
          InspectorBreakpointIndicators: defineComponent({
            setup() {
              return () => h("div");
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Select: SelectStub,
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
                h("option", { value: props.value }, slots.default?.());
            },
          }),
          MediaPickerDialog: defineComponent({
            setup() {
              return () => null;
            },
          }),
          LinkProperty: defineComponent({
            props: {
              embedded: { type: Boolean, default: false },
              currentItemType: { type: String, default: "" },
              currentItemSlug: { type: String, default: "" },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "embedded-image-link-property",
                  "data-embedded": String(props.embedded),
                  "data-item-type": props.currentItemType,
                  "data-item-slug": props.currentItemSlug,
                });
            },
          }),
        },
      },
    });

    await flushPromises();
    savePropertyMock.mockClear();

    await wrapper.get('[data-testid="image-source-mode-url"]').trigger("click");
    await nextTick();
    await flushPromises();

    const urlInput = wrapper.get('[data-testid="image-source-url-input"]');
    await urlInput.setValue("https://cdn.example.com/hero.jpg");
    await urlInput.trigger("blur");
    await flushPromises();

    const altInput = wrapper.get('[data-testid="image-alt-input"]');
    await altInput.setValue("Hero image alt");
    await altInput.trigger("blur");
    await flushPromises();

    expect(savePropertyMock).toHaveBeenNthCalledWith(
      1,
      "src",
      "https://cdn.example.com/hero.jpg",
      "page",
      "home",
    );
    expect(savePropertyMock).toHaveBeenNthCalledWith(
      2,
      "alt",
      "Hero image alt",
      "page",
      "home",
    );

    wrapper.unmount();
  });

  it("defaults loading to lazy when the prop is absent", async () => {
    selectedNodeIdRef.value = "node-loading-default";
    selectedNodeRef.value = {
      id: "node-loading-default",
      type: "image",
      props: {
        src: "/image.png",
        alt: "Image",
      },
      styles: {},
      children: [],
    } as never;

    const ImageProperty = (
      await import("../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
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
          InspectorBreakpointIndicators: defineComponent({
            setup() {
              return () => h("div");
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Select: SelectStub,
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
                h("option", { value: props.value }, slots.default?.());
            },
          }),
          MediaPickerDialog: defineComponent({
            setup() {
              return () => null;
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    const loadingSelect = wrapper
      .findAllComponents(SelectStub)
      .find(
        (component) =>
          component.attributes("data-testid") === "image-loading-select",
      );

    expect(loadingSelect?.props("modelValue")).toBe("lazy");

    wrapper.unmount();
  });

  it("hydrates and saves image loading from node props", async () => {
    selectedNodeIdRef.value = "node-loading";
    selectedNodeRef.value = {
      id: "node-loading",
      type: "image",
      props: {
        src: "/image.png",
        alt: "Image",
        loading: "eager",
      },
      styles: {},
      children: [],
    } as never;

    const ImageProperty = (
      await import("../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
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
          InspectorBreakpointIndicators: defineComponent({
            setup() {
              return () => h("div");
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
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Select: SelectStub,
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
                h("option", { value: props.value }, slots.default?.());
            },
          }),
          MediaPickerDialog: defineComponent({
            setup() {
              return () => null;
            },
          }),
          LinkProperty: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    const loadingSelect = wrapper
      .findAllComponents(SelectStub)
      .find(
        (component) =>
          component.attributes("data-testid") === "image-loading-select",
      );

    expect(loadingSelect?.props("modelValue")).toBe("eager");

    savePropertyMock.mockClear();
    loadingSelect?.vm.$emit("update:modelValue", "lazy");
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "loading",
      "lazy",
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
