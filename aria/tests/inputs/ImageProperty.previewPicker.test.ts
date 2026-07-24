import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const selectedNodeRef = ref<any>(null);
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

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: breakpointNameRef,
    isLoading: isLoadingRef,
    error: errorRef,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
    getComputedStyleValue: vi.fn(
      (
        propertyName: string,
        fallback?: string,
        breakpoint: string = breakpointNameRef.value,
      ) => {
        const value = selectedNodeRef.value?.styles?.[propertyName];
        if (typeof value === "string") {
          return value;
        }
        if (!value || typeof value !== "object") {
          return fallback;
        }
        const responsiveValue = value as Record<string, string | undefined>;
        return responsiveValue[breakpoint] ?? responsiveValue.base ?? fallback;
      },
    ),
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

vi.mock("@/components/ui/button", () => ({
  Button: {
    name: "Button",
    template: '<button type="button" v-bind="$attrs"><slot /></button>',
  },
}));

vi.mock("@/components/ui/input", () => ({
  Input: defineComponent({
    name: "Input",
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
}));

vi.mock("@/components/ui/select", () => ({
  Select: defineComponent({
    name: "Select",
    props: {
      modelValue: { type: String, default: "" },
    },
    emits: ["update:modelValue"],
    setup(props, { emit, slots, attrs }) {
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
  }),
  SelectTrigger: defineComponent({
    name: "SelectTrigger",
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  SelectValue: defineComponent({
    name: "SelectValue",
    setup(_, { slots }) {
      return () => h("span", slots.default?.());
    },
  }),
  SelectContent: defineComponent({
    name: "SelectContent",
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  SelectItem: defineComponent({
    name: "SelectItem",
    props: {
      value: { type: String, required: true },
    },
    setup(props, { slots }) {
      return () => h("option", { value: props.value }, slots.default?.());
    },
  }),
}));

vi.mock(
  "../../admin/features/Inspector/inputs/InspectorBreakpointIndicators.vue",
  () => ({
    default: defineComponent({
      name: "InspectorBreakpointIndicators",
      setup() {
        return () => h("div", { "data-testid": "image-breakpoint-indicators" });
      },
    }),
  }),
);

vi.mock("../../admin/features/Inspector/inputs/LinkProperty.vue", () => ({
  default: defineComponent({
    name: "LinkProperty",
    setup() {
      return () => h("div", { "data-testid": "embedded-image-link-property" });
    },
  }),
}));

vi.mock("../../admin/features/Inspector/inputs/BaseProperty.vue", () => ({
  default: defineComponent({
    name: "BaseProperty",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "image-base-property" }, [
          slots["header-actions"]?.(),
          slots.default?.(),
        ]);
    },
  }),
}));

vi.mock("@/features/Studio/media/components/MediaPickerDialog.vue", () => ({
  default: defineComponent({
    name: "MediaPickerDialog",
    props: {
      open: { type: Boolean, default: false },
    },
    emits: ["update:open", "select"],
    setup(props, { emit }) {
      return () =>
        h("div", {
          "data-testid": "media-picker-dialog",
          "data-open": String(props.open),
        }, [
          h(
            "button",
            {
              type: "button",
              "data-testid": "media-picker-select-stub",
              onClick: () =>
                emit("select", {
                  url: "/uploads/bar.png",
                  deliveryUrl: "/uploads/bar.png",
                }),
            },
            "Select asset",
          ),
        ]);
    },
  }),
}));

describe("ImageProperty preview picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-image";
    selectedNodeRef.value = {
      id: "node-image",
      type: "image",
      props: {
        src: "/uploads/foo.png",
        alt: "Foo",
      },
      styles: {},
      children: [],
    };
    pageBlocksRef.value = [selectedNodeRef.value] as never;
    breakpointNameRef.value = "base";
    savePropertyMock.mockResolvedValue(true);
  });

  async function mountImageProperty() {
    const ImageProperty = (
      await import("../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
    });

    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 70));
    await flushPromises();

    return wrapper;
  }

  it("exposes icon controls and a clickable preview in media mode", async () => {
    const wrapper = await mountImageProperty();

    expect(wrapper.find("img").exists()).toBe(true);

    const replaceButton = wrapper.get('[data-testid="image-replace-button"]');
    expect(replaceButton.attributes("aria-label")).toBe("Replace image");
    expect(replaceButton.find("span[aria-hidden='true']").exists()).toBe(true);

    const clearButton = wrapper.get('[data-testid="image-clear-button"]');
    expect(clearButton.attributes("aria-label")).toBe("Clear image");
    expect(clearButton.find("span[aria-hidden='true']").exists()).toBe(true);

    const preview = wrapper.get('[data-testid="image-preview-open-picker"]');
    expect(preview.attributes("role")).toBe("button");
    expect(preview.attributes("aria-label")).toBe("Replace image");
    expect(preview.attributes("tabindex")).toBe("0");

    wrapper.unmount();
  });

  it("sizes source mode controls to their labels instead of equal columns", async () => {
    const wrapper = await mountImageProperty();

    const sourceMode = wrapper.get('[data-testid="image-source-mode"]');
    expect(sourceMode.classes()).toContain("flex");
    expect(sourceMode.classes()).toContain("w-full");
    expect(sourceMode.classes()).toContain("flex-nowrap");
    expect(sourceMode.classes()).not.toContain("grid-cols-3");

    const mediaButton = wrapper.get('[data-testid="image-source-mode-media"]');
    expect(mediaButton.classes()).toContain("flex-[1_1_auto]");
    expect(mediaButton.classes()).toContain("min-w-0");
    expect(mediaButton.classes()).toContain("whitespace-nowrap");
    expect(mediaButton.classes()).toContain("text-[10px]");

    wrapper.unmount();
  });

  it("replaces the image src when a new asset is selected without clearing first", async () => {
    const wrapper = await mountImageProperty();
    await flushPromises();
    savePropertyMock.mockClear();

    await wrapper.get('[data-testid="media-picker-select-stub"]').trigger("click");
    await flushPromises();

    expect(savePropertyMock).toHaveBeenCalledWith(
      "src",
      "/uploads/bar.png",
      "page",
      "home",
    );
    expect(savePropertyMock).not.toHaveBeenCalledWith(
      "src",
      "",
      "page",
      "home",
    );

    wrapper.unmount();
  });
});
