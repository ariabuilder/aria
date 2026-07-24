import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import {
  createSimpleLayout,
  createSimplePage,
} from "../../fixtures/testDataGenerator";

const { initMock, getItemMock, updateItemMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  getItemMock: vi.fn(),
  updateItemMock: vi.fn(),
}));

const { getPolicyMock, updatePolicyMock } = vi.hoisted(() => ({
  getPolicyMock: vi.fn(),
  updatePolicyMock: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    init: (...args: unknown[]) => initMock(...args),
    getItem: (...args: unknown[]) => getItemMock(...args),
    updateItem: (...args: unknown[]) => updateItemMock(...args),
    pages: {
      getPolicy: (...args: unknown[]) => getPolicyMock(...args),
      updatePolicy: (...args: unknown[]) => updatePolicyMock(...args),
    },
  },
}));

vi.mock("../../../admin/composables/useStudioCapabilities", () => ({
  useStudioCapabilities: () => ({
    canEditPageStructure: { value: true },
    canManagePagePolicy: { value: true },
    canEditPageSeo: { value: true },
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

const SwitchStub = defineComponent({
  props: {
    checked: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:checked"],
  setup(props, { emit }) {
    return () =>
      h("button", {
        "data-switch": "true",
        "aria-pressed": props.checked,
        onClick: () => emit("update:checked", !props.checked),
      });
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
  setup(props, { attrs, emit }) {
    return () =>
      h("input", {
        ...attrs,
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
  setup(props, { attrs, emit }) {
    return () =>
      h("textarea", {
        ...attrs,
        value: props.modelValue,
        onInput: (event: Event) =>
          emit(
            "update:modelValue",
            (event.target as HTMLTextAreaElement).value,
          ),
      });
  },
});

describe("PageSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    initMock.mockResolvedValue({
      data: {
        layouts: [createSimpleLayout("Default Layout", { id: "default" })],
      },
      error: null,
    });
    getItemMock.mockResolvedValue({
      data: createSimplePage("Home", {
        id: "home",
        slug: "home",
        version: "page-home-v1",
      }),
      error: null,
    });
    updateItemMock.mockResolvedValue({
      data: {
        success: true,
        slug: "home",
        version: "page-home-v2",
      },
      error: null,
    });
    getPolicyMock.mockResolvedValue({
      data: {
        id: "home-id",
        slug: "home",
        systemRole: "standard",
        accessMode: "password",
        hasPassword: true,
        promptTitle: "Protected page",
        promptDescription: "Enter the password to continue.",
        rememberForDays: 7,
        policyVersion: 2,
      },
      error: null,
    });
    updatePolicyMock.mockResolvedValue({
      data: {
        id: "home-id",
        slug: "home",
        systemRole: "standard",
        accessMode: "password",
        hasPassword: true,
        promptTitle: "Protected page",
        promptDescription: "Enter the password to continue.",
        rememberForDays: 7,
        policyVersion: 2,
      },
      error: null,
    });
  });

  it("saves page policy through the dedicated pages action before metadata", async () => {
    const PageSettingsPanel = (
      await import("../../../admin/features/Composer/components/PageSettingsPanel.vue")
    ).default;
    const page = createSimplePage("Home", { id: "home", slug: "home" });

    const wrapper = mount(PageSettingsPanel, {
      props: {
        page,
        currentLayout: {
          id: "default",
          name: "Default Layout",
        },
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Switch: SwitchStub,
          ScrollArea: PassThrough,
          Popover: PassThrough,
          PopoverContent: PassThrough,
          PopoverTrigger: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
          Select: PassThrough,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          MediaPickerDialog: PassThrough,
        },
      },
    });

    await flushPromises();

    const saveButton = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes("Save page settings"));

    expect(saveButton).toBeDefined();

    await saveButton!.trigger("click");
    await flushPromises();

    expect(getPolicyMock).toHaveBeenCalledWith({ slug: "home" });
    expect(updatePolicyMock).toHaveBeenCalledWith({
      slug: "home",
      systemRole: "standard",
      accessMode: "password",
      newPassword: undefined,
      clearPassword: undefined,
      promptTitle: "Protected page",
      promptDescription: "Enter the password to continue.",
      rememberForDays: 7,
    });
    expect(updateItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        slug: "home",
        expectedVersion: "page-home-v1",
      }),
    );
    expect(wrapper.emitted("pageSaved")).toEqual([
      [expect.objectContaining({ slug: "home", version: "page-home-v2" })],
    ]);

    wrapper.unmount();
  });

  it("shows a layout error when init returns a malformed layout payload", async () => {
    initMock.mockResolvedValue({
      data: {
        layouts: {},
      },
      error: null,
    });

    const PageSettingsPanel = (
      await import("../../../admin/features/Composer/components/PageSettingsPanel.vue")
    ).default;
    const page = createSimplePage("Home", { id: "home", slug: "home" });

    const wrapper = mount(PageSettingsPanel, {
      props: {
        page,
        mode: "layout",
        currentLayout: {
          id: "default",
          name: "Default Layout",
        },
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Switch: SwitchStub,
          ScrollArea: PassThrough,
          Popover: PassThrough,
          PopoverContent: PassThrough,
          PopoverTrigger: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
          Select: PassThrough,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          MediaPickerDialog: PassThrough,
        },
      },
    });

    await flushPromises();

    const layoutPicker = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Default Layout"));
    expect(layoutPicker).toBeDefined();
    await layoutPicker!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Failed to load layouts");

    wrapper.unmount();
  });

  it("does not emit when getItem returns a malformed page payload", async () => {
    getItemMock.mockResolvedValue({
      data: {
        id: "home",
        slug: "home",
        nodes: 42,
      },
      error: null,
    });

    const PageSettingsPanel = (
      await import("../../../admin/features/Composer/components/PageSettingsPanel.vue")
    ).default;
    const page = createSimplePage("Home", { id: "home", slug: "home" });

    const wrapper = mount(PageSettingsPanel, {
      props: {
        page,
        currentLayout: {
          id: "default",
          name: "Default Layout",
        },
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Switch: SwitchStub,
          ScrollArea: PassThrough,
          Popover: PassThrough,
          PopoverContent: PassThrough,
          PopoverTrigger: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
          Select: PassThrough,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          MediaPickerDialog: PassThrough,
        },
      },
    });

    await flushPromises();

    const saveButton = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes("Save page settings"));

    expect(saveButton).toBeDefined();

    await saveButton!.trigger("click");
    await flushPromises();

    expect(wrapper.emitted("pageSaved")).toBeUndefined();
    expect(wrapper.text()).toContain("Failed to load current page");
    expect(updateItemMock).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("does not emit when updateItem returns a malformed success payload", async () => {
    updateItemMock.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });

    const PageSettingsPanel = (
      await import("../../../admin/features/Composer/components/PageSettingsPanel.vue")
    ).default;
    const page = createSimplePage("Home", { id: "home", slug: "home" });

    const wrapper = mount(PageSettingsPanel, {
      props: {
        page,
        currentLayout: {
          id: "default",
          name: "Default Layout",
        },
      },
      global: {
        stubs: {
          Button: ButtonStub,
          Input: InputStub,
          Textarea: TextareaStub,
          Switch: SwitchStub,
          ScrollArea: PassThrough,
          Popover: PassThrough,
          PopoverContent: PassThrough,
          PopoverTrigger: PassThrough,
          Collapsible: PassThrough,
          CollapsibleContent: PassThrough,
          CollapsibleTrigger: PassThrough,
          Select: PassThrough,
          SelectContent: PassThrough,
          SelectItem: PassThrough,
          SelectTrigger: PassThrough,
          SelectValue: PassThrough,
          MediaPickerDialog: PassThrough,
        },
      },
    });

    await flushPromises();

    const saveButton = wrapper
      .findAll("button")
      .find((candidate) => candidate.text().includes("Save page settings"));

    expect(saveButton).toBeDefined();

    await saveButton!.trigger("click");
    await flushPromises();

    expect(updateItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        slug: "home",
      }),
    );
    expect(wrapper.emitted("pageSaved")).toBeUndefined();
    expect(wrapper.text()).toContain("Failed to save page settings");

    wrapper.unmount();
  });
});
