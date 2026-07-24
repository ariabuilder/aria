import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const { previewDesignColorAssignmentMock, setActiveDesignSwatchMock } =
  vi.hoisted(() => ({
    previewDesignColorAssignmentMock: vi.fn(() => "var(--primary-500)"),
    setActiveDesignSwatchMock: vi.fn(),
  }));

vi.mock("@/features/Design/composables/useGlobalStyles", () => ({
  useGlobalStyles: () => ({
    globalStyles: ref({ variables: { custom: {}, aliases: {} } }),
    isLoading: ref(false),
    loadGlobalStyles: vi.fn(),
  }),
}));

vi.mock("@/features/Design/composables/useDesignSystem", () => ({
  useDesignSystem: () => ({
    palettes: ref([]),
    semanticColors: ref({}),
    isLoading: ref(false),
    load: vi.fn(),
  }),
}));

vi.mock("@/composables/useColorPickerRecents", () => ({
  useColorPickerRecents: () => ({
    recents: ref([]),
    pushRecent: vi.fn(),
    refreshFromStorage: vi.fn(),
  }),
}));

vi.mock("@/composables/useEyeDropper", () => ({
  useEyeDropper: () => ({
    isSupported: ref(false),
    open: vi.fn(),
  }),
}));

vi.mock("@/composables/useVariableReferenceOptions", () => ({
  useVariableReferenceOptions: () => ({
    variableReferenceOptions: ref([]),
  }),
}));

vi.mock("../../admin/components/ui/color-picker/useColorPickerDesign", () => ({
  useColorPickerDesign: () => ({
    isDesignSystemLoading: ref(false),
    designPalettes: ref([]),
    semanticColorOptions: ref([]),
    activeShadeSource: ref(null),
    activeDesignSwatch: ref(null),
    setActiveDesignSwatch: setActiveDesignSwatchMock,
    isActivePaletteSwatch: () => false,
    isActiveSemanticSwatch: () => false,
    designSwatchTitle: () => "Primary 500",
    paletteTokenSourceKey: (name: string, shade?: number) =>
      `${name}-${shade ?? "DEFAULT"}`,
    semanticTokenSourceKey: (key: string) => key,
    previewDesignColorAssignment: previewDesignColorAssignmentMock,
  }),
}));

import ColorPicker from "../../admin/components/ui/color-picker/ColorPicker.vue";

const designSelectOptions = {
  tokenSourceKey: "primary-500",
  fallbackColor: "#336699",
  paletteName: "primary",
  shade: 500,
};

const semanticSelectOptions = {
  tokenSourceKey: "tokens.colors.semantic.success",
  fallbackColor: "#16a34a",
  semanticKey: "success" as const,
};

type ColorPickerExpose = {
  handleDesignSelect: (
    options: typeof designSelectOptions | typeof semanticSelectOptions,
  ) => void;
};

function mountColorPicker(persistMode: "commit" | "live") {
  return shallowMount(ColorPicker, {
    props: {
      modelValue: "#000000",
      showDesignColors: true,
      layout: "unified",
      persistMode,
    },
  });
}

describe("ColorPicker design select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewDesignColorAssignmentMock.mockReturnValue("var(--primary-500)");
  });

  it("emits preview then commit in commit mode", async () => {
    const wrapper = mountColorPicker("commit");

    await flushPromises();
    (wrapper.vm as unknown as ColorPickerExpose).handleDesignSelect(
      designSelectOptions,
    );
    await flushPromises();

    expect(previewDesignColorAssignmentMock).toHaveBeenCalled();
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "var(--primary-500)",
    ]);
    expect(wrapper.emitted("preview")).toEqual([["var(--primary-500)"]]);
    expect(wrapper.emitted("commit")).toEqual([["var(--primary-500)"]]);
  });

  it("renders the design panel for the unified design-aware picker", async () => {
    const renderSlot = defineComponent({
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    });
    const wrapper = shallowMount(ColorPicker, {
      props: {
        modelValue: "#000000",
        showDesignColors: true,
        layout: "unified",
        persistMode: "commit",
      },
      global: {
        stubs: {
          Popover: renderSlot,
          PopoverTrigger: renderSlot,
          PopoverContent: renderSlot,
          ColorPickerPanel: renderSlot,
        },
      },
    });

    await flushPromises();

    expect(wrapper.find("color-picker-design-panel-stub").exists()).toBe(true);
  });

  it("updates model value without commit in live mode", async () => {
    const wrapper = mountColorPicker("live");

    await flushPromises();
    (wrapper.vm as unknown as ColorPickerExpose).handleDesignSelect(
      designSelectOptions,
    );
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "var(--primary-500)",
    ]);
    expect(wrapper.emitted("preview")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  it("emits semantic assignment with preview and commit in commit mode", async () => {
    previewDesignColorAssignmentMock.mockReturnValue("var(--success)");
    const wrapper = mountColorPicker("commit");

    await flushPromises();
    (wrapper.vm as unknown as ColorPickerExpose).handleDesignSelect(
      semanticSelectOptions,
    );
    await flushPromises();

    expect(setActiveDesignSwatchMock).toHaveBeenCalledWith({
      kind: "semantic",
      key: "success",
    });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "var(--success)",
    ]);
    expect(wrapper.emitted("preview")).toEqual([["var(--success)"]]);
    expect(wrapper.emitted("commit")).toEqual([["var(--success)"]]);
  });
});
