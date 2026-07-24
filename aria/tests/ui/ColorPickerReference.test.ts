import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { ref } from "vue";

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
    variableReferenceOptions: ref([
      {
        value: "info-800",
        label: "Info 800",
        meta: "Semantic",
        group: "Semantic",
      },
    ]),
  }),
}));

vi.mock("../../admin/components/ui/color-picker/useColorPickerDesign", () => ({
  useColorPickerDesign: () => ({
    isDesignSystemLoading: ref(false),
    designPalettes: ref([]),
    semanticColorOptions: ref([]),
    activeShadeSource: ref(null),
    activeDesignSwatch: ref(null),
    setActiveDesignSwatch: vi.fn(),
    isActivePaletteSwatch: () => false,
    isActiveSemanticSwatch: () => false,
    designSwatchTitle: () => "Info 800",
    paletteTokenSourceKey: (name: string, shade?: number) =>
      `${name}-${shade ?? "DEFAULT"}`,
    semanticTokenSourceKey: (key: string) => key,
    previewDesignColorAssignment: vi.fn(() => "var(--info-800)"),
  }),
}));

import ColorPicker from "../../admin/components/ui/color-picker/ColorPicker.vue";

type ColorPickerExpose = {
  applyVariableReference: (nextKey: string | null) => void;
};

function mountReferenceColorPicker(modelValue = "var(--primary-400)") {
  return shallowMount(ColorPicker, {
    props: {
      modelValue,
      showVariables: true,
      layout: "unified",
      persistMode: "commit",
    },
  });
}

describe("ColorPicker variable references", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits the selected variable reference without converting to literal hex", async () => {
    const wrapper = mountReferenceColorPicker();

    await flushPromises();
    (wrapper.vm as unknown as ColorPickerExpose).applyVariableReference(
      "info-800",
    );
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "var(--info-800)",
    ]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual(["var(--info-800)"]);
    expect(wrapper.emitted("preview")).toBeUndefined();
  });
});
