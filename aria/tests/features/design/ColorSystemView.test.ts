import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const { removePaletteMock } = vi.hoisted(() => ({
  removePaletteMock: vi.fn(),
}));
const { applySelectedTemplateMock } = vi.hoisted(() => ({
  applySelectedTemplateMock: vi.fn(),
}));
const { copySwatchHexMock } = vi.hoisted(() => ({
  copySwatchHexMock: vi.fn(),
}));

const showAddModalRef = ref(true);

vi.mock("../../../admin/features/Design/composables", () => ({
  COLOR_SHADES: [500],
  SEMANTIC_TOKENS: [
    {
      key: "success",
      label: "Success",
      var: "--success",
      icon: "i-test-success",
      usage: "Positive confirmation, completed states",
    },
  ],
  useColorSystemViewState: () => ({
    palettes: ref([
      {
        name: "primary",
        label: "Primary",
        shades: {
          25: "#f8fbff",
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
          DEFAULT: "#3b82f6",
        },
      },
    ]),
    semanticColors: ref({
      success: "#16a34a",
      warning: "#ca8a04",
      error: "#dc2626",
      info: "#2563eb",
    }),
    isLoading: ref(false),
    isSaving: ref(false),
    currentTemplateId: ref("sage"),
    removePalette: removePaletteMock,
    updatePaletteBaseColor: vi.fn(),
    updateSemanticColor: vi.fn(),
    getTextColorForBackground: vi.fn(() => "#ffffff"),
    showAddModal: showAddModalRef,
    newPaletteName: ref("Brand"),
    newPaletteColor: ref("#3b82f6"),
    newPaletteVarName: ref("brand"),
    renamingId: ref<string | null>(null),
    renameValue: ref(""),
    renamingVarId: ref<string | null>(null),
    renameVarValue: ref(""),
    tooltip: ref({
      visible: false,
      hex: "",
      usageHint: "",
      contrastHint: "",
      x: 0,
      y: 0,
    }),
    copiedSwatch: ref<string | null>(null),
    primaryLight: ref(false),
    previewPrimaryBg: ref("#2563eb"),
    previewPrimaryText: ref("#ffffff"),
    previewPrimaryHover: ref("#1d4ed8"),
    previewOutlineBorder: ref("#60a5fa"),
    previewOutlineText: ref("#3b82f6"),
    previewLinkColor: ref("#3b82f6"),
    accessibilityPairs: ref([
      {
        id: "primary-on-neutral",
        label: "Primary on Neutral",
        foreground: "#3b82f6",
        background: "#fafafa",
        evaluation: null,
        ratioLabel: "4.50:1",
        largeLabel: "AA",
        normalLabel: "AA",
      },
    ]),
    getShadeHex: vi.fn(
      (palette: { shades: Record<number | string, string> }, shade: number) =>
        palette.shades[shade] ?? palette.shades.DEFAULT,
    ),
    getSemanticShadeHex: vi.fn(() => "#16a34a"),
    getSemanticContrastBadge: vi.fn(() => "AA"),
    getSemanticTokenLabel: vi.fn(() => "Success"),
    getSemanticTokenUsage: vi.fn(() => "Positive confirmation, completed states"),
    SEMANTIC_SCALE_STOPS: [25, 100, 300, 500, 700, 950],
    showSwatchTooltip: vi.fn(),
    hideSwatchTooltip: vi.fn(),
    copySwatchHex: copySwatchHexMock,
    startRename: vi.fn(),
    commitRename: vi.fn(),
    cancelRename: vi.fn(),
    startVarRename: vi.fn(),
    commitVarRename: vi.fn(),
    cancelVarRename: vi.fn(),
    openAddModal: vi.fn(),
    closeAddModal: vi.fn(),
    handleAddPalette: vi.fn(),
    handleSave: vi.fn(),
    templates: [
      {
        id: "sage",
        name: "Sage",
        description: "Soft green palette",
        isBuiltIn: true,
        colors: {
          primary: "#5f7f67",
          secondary: "#8a9f8c",
          muted: "#d8ded2",
          neutral: "#737373",
        },
        semantic: {
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
        },
      },
    ],
    isApplyingTemplate: ref(false),
    applyingTemplateId: ref(null),
    getTemplateSwatchColors: (template: {
      colors: {
        primary: string;
        secondary: string;
        muted: string;
        neutral: string;
      };
    }) => [
      template.colors.primary,
      template.colors.secondary,
      template.colors.muted,
      template.colors.neutral,
    ],
    getTemplatePreviewRows: () => [
      ["#f8fbff", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"],
      ["#f8fafc", "#94a3b8", "#64748b", "#334155", "#020617"],
      ["#fafafa", "#d4d4d8", "#a1a1aa", "#52525b", "#09090b"],
      ["#fafafa", "#d4d4d4", "#737373", "#404040", "#0a0a0a"],
    ],
    applySelectedTemplate: applySelectedTemplateMock,
  }),
}));

vi.mock("@/components/ui/color-picker", () => ({
  ColorPicker: defineComponent({
    name: "ColorPicker",
    props: {
      modelValue: { type: String, default: "" },
      showAlpha: { type: Boolean, default: false },
    },
    setup(props, { slots }) {
      return () =>
        h(
          "div",
          {
            "data-testid": "color-picker",
            "data-model-value": props.modelValue,
            "data-show-alpha": String(props.showAlpha),
          },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    setup(_, { attrs, slots }) {
      return () => h("button", attrs, slots.default?.());
    },
  }),
}));

vi.mock(
  "../../../admin/features/Design/components/DesignHeaderTeleport.vue",
  () => ({
    default: defineComponent({
      name: "DesignHeaderTeleport",
      setup(_, { slots }) {
        return () => h("div", { "data-testid": "header-actions" }, slots.default?.());
      },
    }),
  }),
);

import ColorSystemView from "../../../admin/features/Design/views/ColorSystemView.vue";

describe("ColorSystemView", () => {
  beforeEach(() => {
    removePaletteMock.mockClear();
    applySelectedTemplateMock.mockClear();
    copySwatchHexMock.mockClear();
    copySwatchHexMock.mockResolvedValue(true);
    showAddModalRef.value = true;
  });

  it("enables alpha on palette, semantic, and add-palette color pickers", async () => {
    const wrapper = mount(ColorSystemView, { attachTo: document.body });

    await flushPromises();

    expect(document.body.textContent).toContain("New Palette");

    const visiblePickers = Array.from(
      document.body.querySelectorAll('[data-testid="color-picker"]'),
    );
    expect(visiblePickers.length).toBeGreaterThanOrEqual(2);
    expect(
      visiblePickers.every(
        (picker) => picker.getAttribute("data-show-alpha") === "true",
      ),
    ).toBe(true);

    wrapper.unmount();
  });

  it("confirms before deleting a color palette", async () => {
    const wrapper = mount(ColorSystemView, { attachTo: document.body });

    await flushPromises();

    await wrapper
      .find('[aria-label="Actions for Primary palette"]')
      .trigger("click");
    await flushPromises();

    const deleteMenuItem = Array.from(document.body.querySelectorAll("[role=menuitem]"))
      .find((item) => item.textContent?.includes("Delete palette"));
    expect(deleteMenuItem).toBeDefined();
    (deleteMenuItem as HTMLElement | undefined)?.click();
    await flushPromises();

    expect(removePaletteMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Delete Color Palette");
    expect(document.body.textContent).toContain("--primary");

    const deleteButton = Array.from(document.body.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Delete Palette"));

    expect(deleteButton).toBeDefined();
    deleteButton?.click();
    await flushPromises();

    expect(removePaletteMock).toHaveBeenCalledWith("primary");

    wrapper.unmount();
  });

  it("warns before applying a template palette", async () => {
    const wrapper = mount(ColorSystemView, { attachTo: document.body });

    await flushPromises();

    await wrapper.find('[aria-label="Apply Template"]').trigger("click");
    await flushPromises();

    const sageTemplate = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ).find(
      (item) => item.getAttribute("aria-label") === "Apply Sage palette",
    );
    expect(sageTemplate).toBeDefined();
    (sageTemplate as HTMLElement | undefined)?.click();
    await flushPromises();

    expect(applySelectedTemplateMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Apply Palette Template");
    expect(document.body.textContent).toContain(
      "override your existing color palettes",
    );

    const applyButton = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        '[role="dialog"] button',
      ),
    ).find((button) => button.textContent?.includes("Apply Template"));

    expect(applyButton).toBeDefined();
    applyButton?.click();
    await flushPromises();

    expect(applySelectedTemplateMock).toHaveBeenCalledWith("sage");

    wrapper.unmount();
  });

  it("renders every shade as a labeled copy button", async () => {
    const wrapper = mount(ColorSystemView, { attachTo: document.body });

    await flushPromises();

    const swatches = wrapper.findAll('[data-testid="palette-swatch"]');
    expect(swatches).toHaveLength(12);
    expect(swatches[0]?.attributes("aria-label")).toContain(
      "Copy Primary shade 25",
    );
    expect(wrapper.text()).toContain("#3b82f6");

    await swatches[6]?.trigger("click");
    expect(copySwatchHexMock).toHaveBeenCalledWith("#3b82f6", "primary-500");

    wrapper.unmount();
  });
});
