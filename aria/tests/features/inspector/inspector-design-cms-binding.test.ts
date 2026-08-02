import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { BuilderNodeFixture } from "../../helpers/builderNodeFixture";

const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
const selectedNodeIdRef = ref<string | null>("node-1");
const hasCmsContext = ref(true);
const isBound = ref(false);

function createBindingMock(propName: string) {
  return {
    propName: ref(propName),
    hasCmsContext,
    isBound,
    boundPath: ref(""),
    fieldGroups: ref([]),
    bindingPickerMode: ref("fast-fields"),
    displayLabel: ref(""),
    pickerDisabled: ref(false),
    isReadOnly: ref(false),
    bindingMode: ref("static"),
    showFieldPicker: computed(() => true),
    showStaticCollectionToggle: computed(() => hasCmsContext.value),
    propsEditor: {
      isAssignedCmsTemplatePage: ref(false),
      hasInheritedCmsLoopSource: ref(false),
    },
    enterCollectionMode: vi.fn(),
    leaveCollectionMode: vi.fn(),
    bind: vi.fn(),
    clear: vi.fn(),
    setBindingMode: vi.fn(),
  };
}

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorPropBinding",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../admin/features/Inspector/composables/useInspectorPropBinding")
      >();

    return {
      ...actual,
      useInspectorPropBinding: vi.fn(({ propName }: { propName: string }) =>
        createBindingMock(propName),
      ),
    };
  },
);

vi.mock("../../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: ref("base"),
    isLoading: ref(false),
    error: ref(null),
    saveProperty: vi.fn().mockResolvedValue(true),
    saveProperties: vi.fn().mockResolvedValue(true),
    getComputedStyleValue: vi.fn(
      (_prop: string, fallback?: string) => fallback,
    ),
  }),
  useInjectedPageBlocks: () => ref([]),
  useInjectedStageIframeRef: () => ref(null),
  useCanvasSignalBridge: () => ({ on: vi.fn() }),
  useSelectionTreeState: () => ({ selectionTreeRootNodes: ref([]) }),
}));

vi.mock("../../../admin/features/Inspector/composables/useClassEditor", () => ({
  useClassEditor: () => ({
    editingMode: ref("element"),
    activeClassName: ref(null),
    activeClass: ref(null),
    isLoading: ref(false),
    error: ref(null),
    setClassRule: vi.fn(),
    removeClassRule: vi.fn(),
    getClassRule: vi.fn(),
  }),
}));

vi.mock("../../../admin/composables/useCanonicalBreakpoints", () => ({
  useCanonicalBreakpoints: () => ({
    activeBreakpoints: ref([{ name: "base", label: "Base", minWidth: 0 }]),
  }),
}));

vi.mock(
  "../../../admin/features/Inspector/composables/usePropertySchema",
  () => ({
    usePropertySchema: () => ({
      safeParse: vi.fn(() => ({ success: true })),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorStyleTarget",
  () => ({
    useInspectorStyleTarget: () => ({
      isClassEditing: ref(false),
      activeClass: ref(null),
      error: ref(null),
      getStyleValue: vi.fn((_prop: string, fallback?: string) => fallback),
      getStyleValueState: vi.fn(() => ({ value: undefined })),
      saveStyleProperties: vi.fn().mockResolvedValue(true),
      saveStyleProperty: vi.fn().mockResolvedValue(true),
      removeStyleProperties: vi.fn().mockResolvedValue(true),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorStyleTargetWithGlobalDefaults",
  () => ({
    useInspectorStyleTargetWithGlobalDefaults: () => ({
      styleTarget: {
        isClassEditing: ref(false),
        activeClassName: ref(null),
        activeClass: ref(null),
        error: ref(null),
        getStyleValue: vi.fn((_prop: string, fallback?: string) => fallback),
        getStyleValueState: vi.fn(() => ({ value: undefined })),
        saveStyleProperties: vi.fn().mockResolvedValue(true),
        saveStyleProperty: vi.fn().mockResolvedValue(true),
        removeStyleProperties: vi.fn().mockResolvedValue(true),
      },
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useStylePreviewQueue",
  () => ({
    useStylePreviewQueue: () => ({
      queueStylePreview: vi.fn(),
      flushStylePreview: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorPanelControls",
  () => ({
    useInspectorPanelControls: () => ({
      isPersisting: ref(false),
      isPanelDisabled: ref(false),
    }),
  }),
);

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorPropertyOverrides",
  () => ({
    useInspectorPropertyOverrides: () => ({
      overrideBreakpointIds: ref([]),
      hasOverrides: ref(false),
      resetOverrides: vi.fn(),
    }),
  }),
);

vi.mock("../../../admin/composables/useSignals", () => ({
  useSignals: () => ({ on: vi.fn() }),
}));

vi.mock(
  "../../../admin/features/Inspector/composables/useInspectorGlobalStyleDefaults",
  () => ({
    useInspectorGlobalStyleDefaults: () => ({
      designColors: ref([]),
      isLoading: ref(false),
    }),
  }),
);

const InspectorPropBindingStub = defineComponent({
  name: "InspectorPropBinding",
  props: ["modelValue", "displayLabel"],
  template: `<div data-testid="inspector-prop-binding">{{ displayLabel || modelValue || 'picker' }}</div>`,
});

describe("Design tab CMS binding controls", () => {
  beforeEach(() => {
    hasCmsContext.value = true;
    isBound.value = false;
    selectedNodeIdRef.value = "node-1";
  });

  it("shows Collection source mode on ImageProperty when CMS context exists", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "image",
      props: { src: "/image.png", alt: "Alt" },
      styles: {},
      children: [],
    };

    const ImageProperty = (
      await import("../../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: {
        stubs: {
          BaseProperty: { template: "<div><slot /></div>" },
          InspectorBreakpointIndicators: true,
          InspectorPropBinding: InspectorPropBindingStub,
          LinkProperty: true,
          MediaPickerDialog: true,
        },
      },
    });

    expect(
      wrapper.find('[data-testid="image-source-mode-collection"]').exists(),
    ).toBe(true);
  });

  it("hides Collection source mode on ImageProperty without CMS context", async () => {
    hasCmsContext.value = false;

    selectedNodeRef.value = {
      id: "node-1",
      type: "image",
      props: { src: "/image.png", alt: "Alt" },
      styles: {},
      children: [],
    };

    const ImageProperty = (
      await import("../../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: {
        stubs: {
          BaseProperty: { template: "<div><slot /></div>" },
          InspectorBreakpointIndicators: true,
          InspectorPropBinding: InspectorPropBindingStub,
          LinkProperty: true,
          MediaPickerDialog: true,
        },
      },
    });

    expect(
      wrapper.find('[data-testid="image-source-mode-collection"]').exists(),
    ).toBe(false);
  });

  it("shows Collection toggle on TextProperty when CMS context exists", async () => {
    selectedNodeRef.value = {
      id: "text-1",
      type: "text",
      props: { text: "Hello" },
      styles: {},
      children: [],
    };

    const TextProperty = (
      await import("../../../admin/features/Inspector/inputs/TextProperty.vue")
    ).default;

    const wrapper = mount(TextProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: {
        stubs: {
          BaseProperty: { template: "<div><slot /></div>" },
          InspectorPropBinding: InspectorPropBindingStub,
        },
      },
    });

    expect(wrapper.text()).toContain("Collection");
  });

  it("maps background image style binding key for CMS image fields", async () => {
    const { STYLE_BINDING_BACKGROUND_IMAGE } =
      await import("../../../lib/cms/styleBindings");

    expect(STYLE_BINDING_BACKGROUND_IMAGE).toBe("styles.backgroundImage");
  });

  it("disables image URL input when src is CMS-bound", async () => {
    isBound.value = true;
    selectedNodeRef.value = {
      id: "node-1",
      type: "image",
      props: { src: "https://cdn.example.com/bound.jpg", alt: "" },
      styles: {},
      children: [],
    };

    const ImageProperty = (
      await import("../../../admin/features/Inspector/inputs/ImageProperty.vue")
    ).default;

    const wrapper = mount(ImageProperty, {
      props: { currentItemType: "page", currentItemSlug: "home" },
      global: {
        stubs: {
          BaseProperty: { template: "<div><slot /></div>" },
          InspectorBreakpointIndicators: true,
          InspectorPropBinding: InspectorPropBindingStub,
          LinkProperty: true,
          MediaPickerDialog: true,
        },
      },
    });

    expect(
      wrapper.find('[data-testid="inspector-prop-binding"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('[data-testid="image-source-url-input"]').exists(),
    ).toBe(false);
  });
});
