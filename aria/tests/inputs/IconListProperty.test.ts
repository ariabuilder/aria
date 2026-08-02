import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import type { BuilderNodeFixture } from "../helpers/builderNodeFixture";

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

const fetchMock = vi.fn();
const selectedNodeRef = ref<BuilderNodeFixture | null>(null);
const selectedNodeIdRef = ref<string | null>(null);
const breakpointNameRef = ref("base");
const isLoadingRef = ref(false);
const errorRef = ref<string | null>(null);
const selectionTreeRootNodesRef = ref<BuilderNodeFixture[]>([]);
const savePropertyMock = vi.fn();
const savePropertiesMock = vi.fn();
const previewStylePropertiesMock = vi.fn();
const getComputedStyleValueMock = vi.fn();
const loadSettingsMock = vi.fn();
const signalAddBlockMock = vi.fn();

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
  useSelectedNodeState: () => ({
    selectedNode: selectedNodeRef,
  }),
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
  }),
  useStageSignalBridge: () => ({
    signalAddBlock: signalAddBlockMock,
  }),
}));

vi.mock("../../admin/composables/useSiteSettings", () => ({
  useSiteSettings: () => ({
    enabledIconPacks: ["lucide", "lucide"],
    defaultIconPack: "lucide",
    loadSettings: loadSettingsMock,
  }),
}));

describe("IconListProperty", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    selectedNodeIdRef.value = "text-1";
    breakpointNameRef.value = "base";
    isLoadingRef.value = false;
    errorRef.value = null;
    savePropertyMock.mockResolvedValue(true);
    savePropertiesMock.mockResolvedValue(true);
    previewStylePropertiesMock.mockReturnValue(true);
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

    selectionTreeRootNodesRef.value = [
      {
        id: "list-1",
        type: "list",
        props: {},
        children: [
          {
            id: "item-1",
            type: "listitem",
            metadata: { label: "Item 1" },
            props: {},
            children: [
              {
                id: "icon-1",
                type: "icon",
                metadata: { label: "Item 1 Icon" },
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
                  color: { base: "#111111" },
                  width: { base: "40px" },
                },
                children: [],
              },
              {
                id: "text-1",
                type: "text",
                props: { text: "Item 1" },
                children: [],
              },
            ],
          },
        ],
      },
    ];
    selectedNodeRef.value =
      selectionTreeRootNodesRef.value[0].children[0].children[1];

    getComputedStyleValueMock.mockImplementation(
      (
        property: string,
        fallback: string | undefined,
        _breakpoint: string,
        targetNodeId?: string,
      ) => {
        if (targetNodeId !== "icon-1") {
          return fallback;
        }

        if (property === "width") {
          return "40px";
        }

        if (property === "color") {
          return "#111111";
        }

        return fallback;
      },
    );
  });

  it("targets the nearest item icon and keeps add-item actions on the list", async () => {
    const IconListProperty = (
      await import("../../admin/features/Inspector/inputs/IconListProperty.vue")
    ).default;

    const wrapper = mount(IconListProperty, {
      props: {
        currentItemType: "page",
        currentItemSlug: "home",
        targetNodeId: "list-1",
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
          VariableAssignableInput: defineComponent({
            props: {
              modelValue: { type: String, default: "" },
              inputClass: { type: String, default: "" },
            },
            setup(props, { attrs }) {
              return () =>
                h("input", {
                  ...attrs,
                  value: props.modelValue,
                  class: props.inputClass,
                });
            },
          }),
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
          LinkProperty: defineComponent({
            props: {
              targetNodeId: {
                type: String,
                default: null,
              },
              embedded: {
                type: Boolean,
                default: false,
              },
              showScopeControl: {
                type: Boolean,
                default: false,
              },
              defaultScope: {
                type: String,
                default: "",
              },
            },
            setup(props) {
              return () =>
                h("div", {
                  "data-testid": "icon-list-link-property",
                  "data-target-node-id": props.targetNodeId ?? "",
                  "data-embedded": String(props.embedded),
                  "data-show-scope-control": String(props.showScopeControl),
                  "data-default-scope": props.defaultScope,
                });
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(
      wrapper.get('[data-testid="icon-list-header-row"]').text(),
    ).toContain("Editing Item 1 Icon");
    expect(
      wrapper.get('[data-testid="icon-list-header-row"]').text(),
    ).toContain("Add list item");
    expect(
      wrapper.get('[data-testid="icon-list-active-icon-label"]').text(),
    ).toContain("Item 1 Icon");
    expect(
      wrapper.find('[data-testid="icon-list-item-link-label"]').exists(),
    ).toBe(false);
    expect(
      wrapper
        .get('[data-testid="icon-list-link-property"]')
        .attributes("data-target-node-id"),
    ).toBe("item-1");
    expect(
      wrapper
        .get('[data-testid="icon-list-link-property"]')
        .attributes("data-embedded"),
    ).toBe("true");
    expect(
      wrapper
        .get('[data-testid="icon-list-link-property"]')
        .attributes("data-show-scope-control"),
    ).toBe("true");
    expect(
      wrapper
        .get('[data-testid="icon-list-link-property"]')
        .attributes("data-default-scope"),
    ).toBe("row");

    await wrapper.get('[data-testid="icon-color-swatch"]').trigger("click");
    await flushPromises();

    expect(previewStylePropertiesMock).toHaveBeenCalledWith(
      { color: "#ff0000" },
      "icon-1",
    );
    expect(savePropertyMock).toHaveBeenCalledWith(
      "color",
      "#ff0000",
      "page",
      "home",
      "icon-1",
    );

    await wrapper
      .get('[data-testid="icon-list-add-item-button"]')
      .trigger("click");

    expect(signalAddBlockMock).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "list-1",
        block: expect.objectContaining({
          type: "listitem",
        }),
      }),
    );
  });
});
