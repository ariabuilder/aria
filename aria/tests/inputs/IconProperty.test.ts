import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/color-picker", async () => {
  const { defineComponent, h } = await import("vue");
  const ColorFieldStub = defineComponent({
    name: "ColorField",
    props: { modelValue: { type: String, default: "" } },
    emits: ["update:modelValue", "preview", "commit"],
    setup(_props, { emit }) {
      return () =>
        h("div", { "data-testid": "icon-color-input" }, [
          h(
            "button",
            {
              type: "button",
              "data-testid": "icon-color-swatch",
              onClick: () => {
                emit("preview", "#ff0000");
                emit("update:modelValue", "#ff0000");
                emit("commit", "#ff0000");
              },
            },
            "pick",
          ),
        ]);
    },
  });
  return {
    ColorField: ColorFieldStub,
  };
});
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const fetchMock = vi.fn();
const selectedNodeRef = ref<any>(null);
const selectedNodeIdRef = ref<string | null>(null);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const selectionTreeRootNodesRef = ref<any[]>([]);
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const getComputedStyleValueMock = vi.fn();
const loadSettingsMock = vi.fn();

vi.mock("../../admin/features/Core", () => ({
  usePropertySave: () => ({
    selectedNode: selectedNodeRef,
    selectedNodeId: selectedNodeIdRef,
    breakpointName: breakpointNameRef,
    getComputedStyleValue: getComputedStyleValueMock,
    isLoading: isLoadingRef,
    error: errorRef,
    previewStyleProperties: previewStylePropertiesMock,
    saveProperty: savePropertyMock,
    saveProperties: savePropertiesMock,
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
  }),
}));

vi.mock("../../admin/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    enabledIconPacks: ["lucide", "coreui-brands"],
    defaultIconPack: "lucide",
    loadSettings: loadSettingsMock,
  }),
}));

const VariableAssignableInputStub = defineComponent({
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: "" },
    inputClass: { type: String, default: "" },
  },
  emits: ["update:modelValue", "commit"],
  setup(props, { attrs, emit, slots }) {
    return () =>
      h("div", [
        h("input", {
          ...attrs,
          value: props.modelValue,
          class: props.inputClass,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: Event) =>
            emit("commit", (event.target as HTMLInputElement).value),
        }),
        slots["end-actions"]?.(),
      ]);
  },
});

describe("IconProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    selectedNodeIdRef.value = "icon-1";
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    selectionTreeRootNodesRef.value = [];
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
    getComputedStyleValueMock.mockImplementation((property: string) => {
      if (property === "width") {
        return "40px";
      }

      return undefined;
    });
    loadSettingsMock.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        icons: {
          "lucide:star": {
            svg: '<svg viewBox="0 0 24 24"></svg>',
          },
        },
      }),
    });
  });

  it("renders icon, size, and aria controls without the old preview row", async () => {
    selectedNodeRef.value = {
      id: "icon-1",
      type: "icon",
      props: {
        icon: {
          id: "lucide:star",
          pack: "lucide",
          name: "star",
          source: "iconify",
          version: "2026-02-25-snapshot",
        },
        ariaLabel: "Feature icon",
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const IconProperty = (
      await import("../../admin/features/Inspector/inputs/IconProperty.vue")
    ).default;

    const wrapper = mount(IconProperty, {
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
          Input: defineComponent({
            props: {
              value: { type: String, default: "" },
            },
            setup(props, { attrs }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.value,
                });
            },
          }),
          VariableAssignableInput: VariableAssignableInputStub,
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          ColorPicker: defineComponent({
            name: "ColorPicker",
            emits: ["update:model-value"],
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          IconPickerDialog: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("Icon");
    expect(wrapper.text()).toContain("Color");
    expect(wrapper.text()).toContain("Size");
    expect(wrapper.text()).toContain("ARIA");
    expect(wrapper.find('[data-testid="icon-preview-row"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="icon-color-row"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="icon-color-input"]').exists()).toBe(
      true,
    );
    expect(wrapper.get('[data-testid="icon-class-row"]').classes()).toContain(
      "grid",
    );
    expect(wrapper.get('[data-testid="icon-class-input"]').classes()).toContain(
      "h-8",
    );
    expect(wrapper.get('[data-testid="icon-size-input"]').classes()).toContain(
      "h-8",
    );
    expect(wrapper.get('[aria-label="Drag to resize icon"]').classes()).toContain(
      "cursor-ew-resize",
    );
    expect(wrapper.get('[data-testid="icon-aria-input"]').classes()).toContain(
      "h-8",
    );
    expect(
      wrapper.get('[data-testid="icon-picker-trigger-svg"]').html(),
    ).toContain("<svg");

    await wrapper.get('[data-testid="icon-color-swatch"]').trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      {
        color: "#ff0000",
      },
      "icon-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "color",
      "#ff0000",
      "page",
      "home",
      "icon-1",
    );

    wrapper.unmount();
  });

  it("previews icon size during scrub and commits once on release", async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    selectedNodeRef.value = {
      id: "icon-1",
      type: "icon",
      props: {
        icon: {
          id: "lucide:star",
          pack: "lucide",
          name: "star",
          source: "iconify",
          version: "2026-02-25-snapshot",
        },
      },
      styles: {
        width: { base: "40px" },
      },
      children: [],
    };
    selectionTreeRootNodesRef.value = [selectedNodeRef.value];

    const IconProperty = (
      await import("../../admin/features/Inspector/inputs/IconProperty.vue")
    ).default;

    const wrapper = mount(IconProperty, {
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
          Input: defineComponent({
            props: {
              value: { type: String, default: "" },
            },
            setup(props, { attrs }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.value,
                });
            },
          }),
          VariableAssignableInput: VariableAssignableInputStub,
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          ColorPicker: defineComponent({
            name: "ColorPicker",
            emits: ["update:model-value"],
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          IconPickerDialog: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    const sizeDragHandle = wrapper.get(
      '[aria-label="Drag to resize icon"]',
    );
    await sizeDragHandle.trigger("mousedown", { clientX: 10 });
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 18 }));

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      {
        width: "48px",
        height: "48px",
        fontSize: "48px",
      },
      "icon-1",
    );

    document.dispatchEvent(new MouseEvent("mouseup", { clientX: 18 }));
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        width: "48px",
        height: "48px",
        fontSize: "48px",
      },
      "page",
      "home",
      "icon-1",
    );

    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

  it("commits manually typed icon sizes", async () => {
    selectedNodeRef.value = {
      id: "icon-1",
      type: "icon",
      props: {
        icon: {
          id: "lucide:star",
          pack: "lucide",
          name: "star",
          source: "iconify",
          version: "2026-02-25-snapshot",
        },
      },
      styles: {
        width: { base: "40px" },
      },
      children: [],
    };

    const IconProperty = (
      await import("../../admin/features/Inspector/inputs/IconProperty.vue")
    ).default;

    const wrapper = mount(IconProperty, {
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
          VariableAssignableInput: VariableAssignableInputStub,
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          ColorField: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
          IconPickerDialog: defineComponent({
            setup() {
              return () => h("div");
            },
          }),
        },
      },
    });

    await flushPromises();

    await wrapper.get('[data-testid="icon-size-input"]').setValue("32");
    await wrapper.get('[data-testid="icon-size-input"]').trigger("blur");
    await flushPromises();

    expect(savePropertiesMock).toHaveBeenCalledWith(
      {
        width: "32px",
        height: "32px",
        fontSize: "32px",
      },
      "page",
      "home",
      "icon-1",
    );
  });
});
