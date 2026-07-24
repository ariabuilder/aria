import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import { createSimpleComponent } from "../../fixtures/testDataGenerator";

const {
  initMock,
  exportItemMock,
  saveComponentMock,
  refreshComponentsMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  initMock: vi.fn(),
  exportItemMock: vi.fn(),
  saveComponentMock: vi.fn(),
  refreshComponentsMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
    saveComponent: (...args: unknown[]) => saveComponentMock(...args),
    importExport: {
      exportItem: (...args: unknown[]) => exportItemMock(...args),
    },
  },
}));

vi.mock("vue-sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    refreshComponents: (...args: unknown[]) => refreshComponentsMock(...args),
  }),
}));

const PassThrough = defineComponent({
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

const ButtonStub = defineComponent({
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["click"],
  setup(props, { emit, slots }) {
    return () =>
      h(
        "button",
        {
          disabled: props.disabled,
          onClick: () => emit("click"),
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("input", {
        value: props.modelValue,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
      });
  },
});

const TextareaStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("textarea", {
        value: props.modelValue,
        onInput: (event: Event) =>
          emit(
            "update:modelValue",
            (event.target as HTMLTextAreaElement).value,
          ),
      });
  },
});

const SelectStub = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

describe("ComponentSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    initMock.mockResolvedValue({
      data: {
        pages: [],
        layouts: [],
      },
      error: null,
    });
    exportItemMock.mockResolvedValue({
      data: {
        success: true,
        content: "---\n<Component />",
      },
      error: null,
    });
    refreshComponentsMock.mockResolvedValue(undefined);
  });

  it("shows an error and does not emit when the save response is malformed", async () => {
    saveComponentMock.mockResolvedValue({
      data: {
        success: true,
        version: 42,
      },
      error: null,
    });

    const ComponentSettingsPanel = (
      await import("../../../admin/features/Composer/components/ComponentSettingsPanel.vue")
    ).default;

    const component = createSimpleComponent("Hero", {
      id: "hero",
      category: "marketing",
      description: "Hero component",
    });

    const wrapper = mount(ComponentSettingsPanel, {
      props: {
        component,
        componentSlug: component.id,
        blocks: component.nodes,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Select: SelectStub,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
        },
      },
    });

    await flushPromises();

    const saveButton = wrapper
      .findAll("button")
      .find((candidate) =>
        candidate.text().includes("Save component settings"),
      );

    expect(saveButton).toBeDefined();

    await saveButton!.trigger("click");
    await flushPromises();

    expect(saveComponentMock).toHaveBeenCalledWith({
      id: "hero",
      blocks: component.nodes,
      name: "Hero",
      description: "Hero component",
      category: "marketing",
    });
    expect(wrapper.emitted("componentSaved")).toBeUndefined();
    expect(wrapper.text()).toContain("Invalid component save response");
    expect(refreshComponentsMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("clears usage state when init returns a malformed payload", async () => {
    initMock.mockResolvedValue({
      data: {
        pages: {},
        layouts: [],
      },
      error: null,
    });

    const ComponentSettingsPanel = (
      await import("../../../admin/features/Composer/components/ComponentSettingsPanel.vue")
    ).default;

    const component = createSimpleComponent("Hero", {
      id: "hero",
      category: "marketing",
      description: "Hero component",
    });

    const wrapper = mount(ComponentSettingsPanel, {
      props: {
        component,
        componentSlug: component.id,
        blocks: component.nodes,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Select: SelectStub,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("No pages are using this component yet.");

    wrapper.unmount();
  });

  it("shows the code-preview fallback when exportItem returns a malformed payload", async () => {
    exportItemMock.mockResolvedValue({
      data: {
        success: true,
        filePath: "src/components/hero.astro",
      },
      error: null,
    });

    const ComponentSettingsPanel = (
      await import("../../../admin/features/Composer/components/ComponentSettingsPanel.vue")
    ).default;

    const component = createSimpleComponent("Hero", {
      id: "hero",
      category: "marketing",
      description: "Hero component",
    });

    const wrapper = mount(ComponentSettingsPanel, {
      props: {
        component,
        componentSlug: component.id,
        blocks: component.nodes,
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Select: SelectStub,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
        },
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("// Failed to generate component code");

    wrapper.unmount();
  });
});
