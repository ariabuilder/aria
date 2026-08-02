import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import type { BuilderNodeFixture } from "../helpers/builderNodeFixture";

const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const selectionTreeRootNodesRef = ref<BuilderNodeFixture[]>([]);
const savePropertiesMock = vi.fn();
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

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: pagesRef,
  }),
}));

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    isLoading: isLoadingRef,
    error: errorRef,
    saveProperties: savePropertiesMock,
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
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

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
  }),
}));

describe("LinkProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectedNodeIdRef.value = "node-1";
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: {},
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];
    isLoadingRef.value = false;
    errorRef.value = null;
    savePropertiesMock.mockResolvedValue(true);
  });

  it("filters the page list from the search field", async () => {
    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    wrapper.findComponent(SelectStub).vm.$emit("update:modelValue", "page");
    await flushPromises();

    const searchInput = wrapper.find('input[placeholder="Search pages..."]');
    await searchInput.setValue("pricing");
    await flushPromises();

    const buttons = wrapper.findAll("button").map((button) => button.text());

    expect(buttons.some((text) => text.includes("Pricing"))).toBe(true);
    expect(buttons.some((text) => text.includes("Home"))).toBe(false);
  });

  it("saves the selected page href from the page picker", async () => {
    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    wrapper.findComponent(SelectStub).vm.$emit("update:modelValue", "page");
    await flushPromises();

    const pricingButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Pricing"));

    expect(pricingButton).toBeTruthy();

    await pricingButton!.trigger("click");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        href: "/pricing",
        target: undefined,
        rel: undefined,
        title: undefined,
        download: undefined,
        linkScope: undefined,
      },
      "page",
      "home",
      "node-1",
    );
  });

  it("defaults to none and only reveals advanced link fields after a destination is configured", async () => {
    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    expect(wrapper.findComponent(SelectStub).props("modelValue")).toBe("none");
    expect(wrapper.text()).not.toContain("Open in new tab");
    expect(wrapper.text()).not.toContain("Rel");
    expect(wrapper.find('[data-testid="link-title-field"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).not.toContain("Select a page");

    wrapper.findComponent(SelectStub).vm.$emit("update:modelValue", "page");
    await flushPromises();

    expect(wrapper.text()).toContain("Page");
    expect(wrapper.text()).not.toContain("Open in new tab");
    expect(wrapper.text()).not.toContain("Rel");
    expect(wrapper.find('[data-testid="link-title-field"]').exists()).toBe(
      false,
    );

    const pricingButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Pricing"));

    expect(pricingButton).toBeTruthy();
    await pricingButton!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Open in new tab");
    expect(wrapper.text()).toContain("Rel");
    expect(wrapper.find('[data-testid="link-title-field"]').exists()).toBe(
      true,
    );
  });

  it("renders the embedded link mode selector as a single compact row", async () => {
    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
      props: {
        embedded: true,
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
            setup(_, { slots, attrs }) {
              return () => h("label", attrs, slots.default?.());
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    expect(wrapper.get('[data-testid="link-mode-label"]').text()).toBe("Link");
    expect(wrapper.get('[data-testid="link-mode-row"]').classes()).toContain(
      "grid",
    );
    expect(wrapper.findComponent(SelectStub).props("modelValue")).toBe("none");
  });

  it("marks the header as changed when the selected node has link values", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: {
        href: "/pricing",
      },
      children: [],
    };

    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    await flushPromises();

    expect(wrapper.attributes("data-has-changes")).toBe("true");
  });

  it("resets link values back to default when the header reset action is used", async () => {
    selectedNodeRef.value = {
      id: "node-1",
      type: "Text",
      props: {
        href: "/pricing",
        target: "_blank",
        rel: "noopener noreferrer",
        title: "Pricing",
      },
      children: [],
    };

    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            props: {
              hasChanges: { type: Boolean, default: false },
              showReset: { type: Boolean, default: false },
            },
            emits: ["reset"],
            setup(props, { slots, emit }) {
              return () =>
                h(
                  "div",
                  {
                    "data-has-changes": String(props.hasChanges),
                    "data-show-reset": String(props.showReset),
                  },
                  [
                    h(
                      "button",
                      {
                        type: "button",
                        onClick: () => emit("reset"),
                      },
                      "Reset",
                    ),
                    slots.default?.(),
                  ],
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    await wrapper.get('button[type="button"]').trigger("click");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        href: undefined,
        target: undefined,
        rel: undefined,
        title: undefined,
        download: undefined,
        linkScope: undefined,
      },
      "page",
      "home",
      "node-1",
    );
  });

  it("targets a parent list item and saves list link scope", async () => {
    selectionTreeRootNodesRef.value = [
      {
        id: "list-1",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "listitem",
            props: {
              href: "/features",
            },
            children: [
              {
                id: "text-1",
                type: "text",
                props: { text: "Features" },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    selectedNodeIdRef.value = "text-1";
    selectedNodeRef.value =
      selectionTreeRootNodesRef.value[0].children[0].children[0];

    const LinkProperty = (
      await import("../../admin/features/Inspector/inputs/LinkProperty.vue")
    ).default;

    const wrapper = mount(LinkProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        targetNodeId: "item-1",
        showScopeControl: true,
        defaultScope: "row",
      },
      global: {
        stubs: {
          BaseProperty: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
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
            setup(props, { emit }) {
              return () =>
                h("input", {
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
        },
      },
    });

    await flushPromises();

    const selects = wrapper.findAllComponents(SelectStub);
    expect(selects).toHaveLength(2);

    selects[1]!.vm.$emit("update:modelValue", "text");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        href: "/features",
        target: undefined,
        rel: undefined,
        title: undefined,
        download: undefined,
        linkScope: "text",
      },
      "page",
      "home",
      "item-1",
    );
  });
});
