import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const selectedNodeRef = ref<any>(null);
const selectedNodeIdRef = ref<string | null>(null);
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const saveNodeUpdatesMock = vi.fn();
const broadcastPropsUpdateMock = vi.fn();
const pagesRef = ref([
  {
    id: "page-home",
    title: "Home",
    slug: "index",
    status: "published",
    layout: "",
    updatedAt: null,
  },
  {
    id: "page-pricing",
    title: "Pricing",
    slug: "pricing",
    status: "published",
    layout: "",
    updatedAt: null,
  },
]);

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

const SelectStub = defineComponent({
  name: "SelectStub",
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
});

const SelectTriggerStub = defineComponent({
  inheritAttrs: false,
  props: {
    asChild: { type: Boolean, default: false },
  },
  setup(_, { slots }) {
    return () => slots.default?.();
  },
});

const SelectValueStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.();
  },
});

const SelectContentStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.();
  },
});

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: pagesRef,
  }),
}));

vi.mock("@/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    enabledIconPacks: ref(["lucide", "coreui-brands"]),
    defaultIconPack: ref("lucide"),
    loadSettings: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../admin/features/Stage/utils/canvasIconHydration", () => ({
  hydrateIconHost: vi.fn(async ({ host, iconValue }: { host: HTMLElement; iconValue: unknown }) => {
    if (typeof iconValue === "string" && iconValue.trim().length > 0) {
      host.className = `${host.className} ${iconValue}`.trim();
    }
  }),
}));

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: ref("base"),
    isLoading: isLoadingRef,
    error: errorRef,
    saveNodeUpdates: saveNodeUpdatesMock,
  }),
  useCanvasSignalBridge: () => ({
    broadcastPropsUpdate: broadcastPropsUpdateMock,
    broadcastClassUpdate: vi.fn(),
    signalStyleUpdate: vi.fn(),
    signalPropsUpdate: vi.fn(),
    signalA11yUpdate: vi.fn(),
    signalMotionUpdate: vi.fn(),
    signalSpacingPreviewStart: vi.fn(),
    signalSpacingPreviewEnd: vi.fn(),
    broadcastComponentWrapperResponse: vi.fn(),
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: ref([]),
    setSelectionTreeRootNodes: vi.fn(),
  }),
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
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
  }),
}));

function createGlobalStubs() {
  return {
    BaseProperty: defineComponent({
      props: {
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
    Button: defineComponent({
      setup(_, { attrs, slots }) {
        return () => h("button", attrs, slots.default?.());
      },
    }),
    Input: defineComponent({
      props: {
        modelValue: { type: String, default: "" },
        placeholder: { type: String, default: "" },
      },
      emits: ["update:modelValue", "blur"],
      setup(props, { attrs, emit }) {
        return () =>
          h("input", {
            ...attrs,
            value: props.modelValue,
            placeholder: props.placeholder,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
            onBlur: (event: FocusEvent) => emit("blur", event),
          });
      },
    }),
    Label: defineComponent({
      setup(_, { slots }) {
        return () => h("label", slots.default?.());
      },
    }),
    ScrollArea: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    Popover: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    PopoverTrigger: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    PopoverContent: defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
    Switch: defineComponent({
      props: {
        modelValue: { type: Boolean, default: false },
      },
      emits: ["update:modelValue"],
      setup(props, { attrs, emit }) {
        return () =>
          h("input", {
            ...attrs,
            type: "checkbox",
            checked: props.modelValue,
            onChange: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).checked,
              ),
          });
      },
    }),
    VariableAssignableInput: defineComponent({
      props: {
        modelValue: { type: String, default: "" },
        placeholder: { type: String, default: "" },
        disabled: { type: Boolean, default: false },
        inputClass: { type: String, default: "" },
      },
      emits: ["update:modelValue", "commit"],
      setup(props, { attrs, emit }) {
        return () =>
          h("input", {
            ...attrs,
            value: props.modelValue,
            placeholder: props.placeholder,
            disabled: props.disabled,
            class: props.inputClass,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLInputElement).value,
              ),
            onBlur: (event: FocusEvent) =>
              emit("commit", (event.target as HTMLInputElement).value),
          });
      },
    }),
    Select: SelectStub,
    SelectTrigger: SelectTriggerStub,
    SelectValue: SelectValueStub,
    SelectContent: SelectContentStub,
    SelectItem: defineComponent({
      props: {
        value: { type: String, required: true },
      },
      setup(props, { slots }) {
        return () => h("option", { value: props.value }, slots.default?.());
      },
    }),
    IconPickerDialog: defineComponent({
      name: "IconPickerDialog",
      props: {
        open: { type: Boolean, default: false },
        value: { type: String, default: "" },
      },
      emits: ["update:open", "select"],
      setup() {
        return () => null;
      },
    }),
    MediaPickerDialog: defineComponent({
      setup() {
        return () => null;
      },
    }),
  };
}

describe("ButtonProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        variant: "primary",
        disabled: true,
        href: "/",
      },
      a11y: {
        ariaLabel: "Buy now button",
      },
      children: [],
    };
    isLoadingRef.value = false;
    errorRef.value = null;
    saveNodeUpdatesMock.mockResolvedValue(true);
  });

  it("hydrates label, disabled, and aria label from the selected button node", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        variant: "destructive",
        icon: "i-lucide:star",
        iconPosition: "right",
        iconGap: "1rem",
        iconSpaceBetween: true,
        disabled: true,
        href: "/",
      },
      a11y: {
        ariaLabel: "Buy now button",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await flushPromises();

    expect(
      wrapper.get('[data-testid="button-label-input"]').element,
    ).toHaveProperty("value", "Buy now");
    expect(
      wrapper.get('[data-testid="button-variant-select"]').element,
    ).toHaveProperty("value", "destructive");
    expect(
      wrapper.get('[data-testid="button-icon-picker-preview"]').classes(),
    ).toContain("i-lucide:star");
    expect(
      wrapper
        .get('[data-testid="button-icon-position-right"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper.get('[data-testid="button-icon-gap-input"]').element,
    ).toHaveProperty("value", "1rem");
    expect(
      wrapper.get('[data-testid="button-icon-space-between-switch"]').element,
    ).toHaveProperty("checked", true);
    expect(
      wrapper.get('[data-testid="button-aria-label-input"]').element,
    ).toHaveProperty("value", "Buy now button");
    expect(
      wrapper.get('[data-testid="button-disabled-switch"]').element,
    ).toHaveProperty("checked", true);
  });

  it("saves the selected page href through the button property", async () => {
    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    const pricingButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Pricing"));

    expect(pricingButton).toBeTruthy();

    await pricingButton!.trigger("click");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "primary",
          text: undefined,
          icon: undefined,
          iconPosition: undefined,
          iconGap: undefined,
          iconSpaceBetween: undefined,
          disabled: true,
          href: "/pricing",
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: "Buy now button",
        },
      },
      "page",
      "home",
    );
  });

  it("saves the selected button variant", async () => {
    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper
      .get('[data-testid="button-variant-select"]')
      .setValue("muted");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "muted",
          text: undefined,
          icon: undefined,
          iconPosition: undefined,
          iconGap: undefined,
          iconSpaceBetween: undefined,
          disabled: true,
          href: "/",
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: "Buy now button",
        },
      },
      "page",
      "home",
    );
  });

  it("saves icon position for button icons", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        icon: "i-lucide:star",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper
      .get('[data-testid="button-icon-position-right"]')
      .trigger("click");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "primary",
          text: undefined,
          icon: {
            id: "lucide:star",
            pack: "lucide",
            name: "star",
            source: "iconify",
            version: "2026-02-25-snapshot",
          },
          iconPosition: "right",
          iconGap: undefined,
          iconSpaceBetween: undefined,
          disabled: undefined,
          href: undefined,
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: undefined,
        },
      },
      "page",
      "home",
    );
  });

  it("saves icon spacing controls", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        icon: "i-lucide:star",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper.get('[data-testid="button-icon-gap-input"]').setValue("1rem");
    await wrapper.get('[data-testid="button-icon-gap-input"]').trigger("blur");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenLastCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "primary",
          text: undefined,
          icon: {
            id: "lucide:star",
            pack: "lucide",
            name: "star",
            source: "iconify",
            version: "2026-02-25-snapshot",
          },
          iconPosition: "left",
          iconGap: "1rem",
          iconSpaceBetween: undefined,
          disabled: undefined,
          href: undefined,
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: undefined,
        },
      },
      "page",
      "home",
    );

    await wrapper
      .get('[data-testid="button-icon-space-between-switch"]')
      .setValue(true);
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenLastCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "primary",
          text: undefined,
          icon: {
            id: "lucide:star",
            pack: "lucide",
            name: "star",
            source: "iconify",
            version: "2026-02-25-snapshot",
          },
          iconPosition: "left",
          iconGap: "1rem",
          iconSpaceBetween: true,
          disabled: undefined,
          href: undefined,
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: undefined,
        },
      },
      "page",
      "home",
    );
  });

  it("saves the selected icon from the icon picker", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper
      .findComponent({ name: "IconPickerDialog" })
      .vm.$emit("select", "i-lucide:rocket");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenCalledWith(
      {
        props: {
          label: "Buy now",
          variant: "primary",
          text: undefined,
          icon: {
            id: "lucide:rocket",
            pack: "lucide",
            name: "rocket",
            source: "iconify",
            version: "2026-02-25-snapshot",
          },
          iconPosition: "left",
          iconGap: undefined,
          iconSpaceBetween: undefined,
          disabled: undefined,
          href: undefined,
          target: undefined,
          rel: undefined,
          title: undefined,
          download: undefined,
          ariaLabel: undefined,
        },
        a11y: {
          ariaLabel: undefined,
        },
      },
      "page",
      "home",
    );
  });

  it("broadcasts live previews while typing the button label", async () => {
    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper
      .get('[data-testid="button-label-input"]')
      .setValue("Checkout");

    expect(broadcastPropsUpdateMock).toHaveBeenLastCalledWith({
      nodeId: "node-1",
      props: {
        label: "Checkout",
        variant: "primary",
        disabled: true,
      },
      source: "inspector-live",
    });
  });

  it("broadcasts live previews during icon gap scrubs", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        icon: "i-lucide:star",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    const input = wrapper.get('[data-testid="button-icon-gap-input"]')
      .element as HTMLInputElement;

    input.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 100 }),
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 120 }),
    );

    expect(broadcastPropsUpdateMock).toHaveBeenLastCalledWith({
      nodeId: "node-1",
      props: {
        label: "Buy now",
        variant: "primary",
        icon: "i-lucide:star",
        iconPosition: "left",
        iconGap: "1.5rem",
        iconSpaceBetween: false,
        iconSize: "1em",
      },
      source: "inspector-live",
    });

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  it("hides icon detail controls until an icon is selected", async () => {
    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    expect(wrapper.find('[data-testid="button-icon-size-input"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="button-icon-clear"]').exists()).toBe(
      false,
    );
  });

  it("clears the selected icon and hides icon detail controls", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Button",
      props: {
        label: "Buy now",
        icon: "i-lucide:star",
        iconPosition: "right",
      },
      children: [],
    };

    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper.get('[data-testid="button-icon-clear"]').trigger("click");
    await flushPromises();

    expect(saveNodeUpdatesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          label: "Buy now",
          icon: undefined,
          iconPosition: undefined,
        }),
      }),
      "page",
      "home",
    );
    expect(wrapper.find('[data-testid="button-icon-clear"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="button-icon-size-input"]').exists()).toBe(
      false,
    );
  });

  it("keeps anchor destination mode open until a section is selected", async () => {
    const ButtonProperty = (
      await import("../../admin/features/Inspector/inputs/ButtonProperty.vue")
    ).default;

    const wrapper = mount(ButtonProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: createGlobalStubs(),
      },
    });

    await wrapper
      .get('[data-testid="button-destination-select"]')
      .setValue("anchor");
    await flushPromises();

    expect(saveNodeUpdatesMock).not.toHaveBeenCalled();
    expect(
      wrapper.get('[data-testid="button-destination-select"]').element,
    ).toHaveProperty("value", "anchor");
  });
});
