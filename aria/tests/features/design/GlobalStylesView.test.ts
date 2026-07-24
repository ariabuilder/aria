import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

import {
  createDefaultGlobalStylesConfig,
  type GlobalStylesConfig,
} from "../../../lib/styles/universalDesignSystem";
import { DEFAULT_TYPOGRAPHY_SCALE } from "../../../lib/styles/defaultTypography";
import { generateNaturalShades } from "../../../lib/design/shades";
import type { TypographyConfig } from "../../../admin/features/Design/composables/useTypography";

const { __designSystemState, __globalStylesState, __typographyState } = vi.hoisted(() => {
  const { ref } = require("vue") as typeof import("vue");

  const globalStylesState = {
    globalStyles: ref({} as GlobalStylesConfig),
    isLoading: ref(false),
    loadGlobalStyles: vi.fn(async () => {}),
  };

  const typographyState = {
    fontOptions: ref([
      {
        label: "Inter",
        family: "Inter",
        source: "system",
        category: "sans-serif",
      },
    ]),
    typography: ref({
      families: {
        body: "Inter",
        heading: "Inter",
        mono: "JetBrains Mono",
      },
      scale: [],
      headingOverrides: {},
      bodyOverrides: {},
    } as TypographyConfig),
    overallScale: ref(100),
    spacingStyle: ref("normal"),
    scaleRatio: ref("minor-third"),
    applyOverallScale: vi.fn((percent: number) => {
      typographyState.overallScale.value = percent;
    }),
    applySpacingStyle: vi.fn((style: string) => {
      typographyState.spacingStyle.value = style;
    }),
    applyScaleRatio: vi.fn((ratio: string) => {
      typographyState.scaleRatio.value = ratio;
    }),
    loadTypography: vi.fn(async () => {}),
    loadFontOptions: vi.fn(async () => {}),
  };

  const designSystemState = {
    palettes: ref<Array<{
      name: string;
      label: string;
      shades: Record<number | "DEFAULT", string>;
    }>>([]),
    semanticColors: ref<Record<string, string>>({}),
    load: vi.fn(async () => {}),
  };

  return {
    __designSystemState: designSystemState,
    __globalStylesState: globalStylesState,
    __typographyState: typographyState,
  };
});

vi.mock("../../../admin/features/Design/composables/useGlobalStyles", async () => {
  const { createDefaultGlobalStylesConfig } = await import(
    "../../../lib/styles/universalDesignSystem"
  );

  __globalStylesState.globalStyles.value = createDefaultGlobalStylesConfig();

  return {
    useGlobalStyles: () => __globalStylesState,
  };
});

vi.mock(
  "../../../admin/features/Design/composables/useDesignSystem",
  () => ({
    useDesignSystem: () => __designSystemState,
    __designSystemState,
  }),
);

vi.mock("../../../admin/features/Design/composables/useTypography", async () => {
  const { DEFAULT_TYPOGRAPHY_SCALE } = await import(
    "../../../lib/styles/defaultTypography"
  );

  __typographyState.typography.value = {
    families: {
      body: "Inter",
      heading: "Inter",
      mono: "JetBrains Mono",
    },
    scale: DEFAULT_TYPOGRAPHY_SCALE.map((step) => ({ ...step })),
    headingOverrides: {},
    bodyOverrides: {},
  };

  return {
    SPACING_MULTIPLIERS: {
      compact: 0.85,
      normal: 1,
      relaxed: 1.15,
      airy: 1.3,
    },
    TYPOGRAPHY_FONTS_UPDATED_EVENT: "aria:fonts-updated",
    useTypography: () => __typographyState,
  };
});

vi.mock("../../../admin/features/Design/components/DesignHeaderTeleport.vue", () => ({
  default: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

import GlobalStylesView from "../../../admin/features/Design/views/GlobalStylesView.vue";

const ButtonStub = defineComponent({
  name: "Button",
  emits: ["click"],
  setup(_, { attrs, emit, slots }) {
    return () =>
      h(
        "button",
        {
          ...attrs,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        slots.default?.(),
      );
  },
});

const InputStub = defineComponent({
  name: "Input",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  setup(props, { attrs }) {
    return () => h("input", { ...attrs, value: props.modelValue });
  },
});

const DivStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h("div", attrs, slots.default?.());
  },
});

const SelectStub = defineComponent({
  name: "Select",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        "div",
        {
          ...attrs,
          "data-disabled": props.disabled ? "true" : "false",
          "data-model-value": props.modelValue,
        },
        slots.default?.(),
      );
  },
});

const VariableAssignableInputStub = defineComponent({
  name: "VariableAssignableInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue", "mousedown"],
  setup(props, { attrs, slots }) {
    return () =>
      h(
        "div",
        {
          ...attrs,
          "data-model-value": props.modelValue,
        },
        [
          slots["end-actions"]?.(),
          slots.default?.({
            previewColor: props.modelValue,
            resolvedValue: props.modelValue,
          }),
        ],
      );
  },
});

const ColorFieldStub = defineComponent({
  name: "ColorField",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    resolvedModelValue: {
      type: String,
      default: "",
    },
    isToolbar: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["update:modelValue", "commit"],
  setup(props, { slots }) {
    return () =>
      h("div", {
        "data-resolved-model-value": props.resolvedModelValue,
      }, [
        slots.default?.({
          previewColor: props.modelValue,
          resolvedValue: props.modelValue,
        }),
      ]);
  },
});

function createWrapper() {
  return mount(GlobalStylesView, {
    global: {
      stubs: {
        Button: ButtonStub,
        ColorField: ColorFieldStub,
        ColorPicker: DivStub,
        GlobalStyleVariablePicker: DivStub,
        Input: InputStub,
        Select: SelectStub,
        SelectContent: DivStub,
        SelectItem: DivStub,
        SelectTrigger: DivStub,
        SelectValue: DivStub,
        VariableAssignableInput: VariableAssignableInputStub,
      },
    },
  });
}

async function clickTab(
  wrapper: ReturnType<typeof mount>,
  label: string,
): Promise<void> {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text().trim() === label);

  if (!button) {
    throw new Error(`Tab button not found: ${label}`);
  }

  await button.trigger("click");
  await nextTick();
  await flushPromises();
}

describe("GlobalStylesView preview", () => {
  beforeEach(() => {
    __globalStylesState.globalStyles.value = createDefaultGlobalStylesConfig();
    __globalStylesState.isLoading.value = false;
    __globalStylesState.loadGlobalStyles.mockClear();
    __designSystemState.palettes.value = [];
    __designSystemState.semanticColors.value = {};
    __designSystemState.load.mockClear();

    __typographyState.fontOptions.value = [
      {
        label: "Inter",
        family: "Inter",
        source: "system",
        category: "sans-serif",
      },
    ];
    __typographyState.typography.value = {
      families: {
        body: "Inter",
        heading: "Inter",
        mono: "JetBrains Mono",
      },
      scale: DEFAULT_TYPOGRAPHY_SCALE.map((step) => ({ ...step })),
      headingOverrides: {},
      bodyOverrides: {},
    };
    __typographyState.overallScale.value = 100;
    __typographyState.spacingStyle.value = "normal";
    __typographyState.scaleRatio.value = "minor-third";
    __typographyState.applyOverallScale.mockClear();
    __typographyState.applySpacingStyle.mockClear();
    __typographyState.applyScaleRatio.mockClear();
    __typographyState.loadTypography.mockClear();
    __typographyState.loadFontOptions.mockClear();
  });

  it("normalizes body controls to one shared global styles height", async () => {
    const wrapper = createWrapper();
    await flushPromises();

    const html = wrapper.html();

    expect(html).toContain(
      'input-class="h-9.5! pl-8 cursor-ew-resize focus:cursor-text"',
    );
    expect(html).toContain(
      'class="h-9.5! px-3 text-sm text-muted-foreground placeholder:text-muted-foreground"',
    );
    expect(html).toContain(
      'class="flex h-9.5 items-center justify-center rounded-sm border border-border/50 border-solid bg-sidebar/40 px-3 text-sm text-muted-foreground"',
    );
    expect(html).toContain(
      'class="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,42rem)_20rem]"',
    );
    expect(html).not.toContain("bg-card/40 px-3 py-2");
    expect(html).not.toContain(">unitless<");

    wrapper.unmount();
  });

  it("shows reset actions for changed fields and resets values", async () => {
    __globalStylesState.globalStyles.value.defaults.body.backgroundColor =
      "#eef2ed";
    __globalStylesState.globalStyles.value.defaults.body.fontFamily = "Inter";
    __globalStylesState.globalStyles.value.defaults.body.fontSize = "16px";
    __typographyState.overallScale.value = 112;
    __typographyState.spacingStyle.value = "relaxed";

    const wrapper = createWrapper();
    await flushPromises();

    const backgroundReset = wrapper.get(
      '[data-testid="global-styles-reset-defaults-body-backgroundColor"]',
    );

    expect(backgroundReset.attributes("class")).toContain("text-foreground");
    expect(backgroundReset.attributes("class")).toContain(
      "hover:text-destructive",
    );

    await backgroundReset.trigger("click");
    expect(
      __globalStylesState.globalStyles.value.defaults.body.backgroundColor,
    ).toBe("");

    expect(
      wrapper
        .find('[data-testid="global-styles-reset-defaults-body-fontSize"]')
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .findAll('button[aria-label="Clear selection"]')
        .length,
    ).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("Inter");

    await wrapper
      .get('[data-testid="global-styles-reset-overall-scale"]')
      .trigger("click");
    expect(__typographyState.applyOverallScale).toHaveBeenCalledWith(100);

    await wrapper
      .get('[data-testid="global-styles-reset-spacing-style"]')
      .trigger("click");
    expect(__typographyState.applySpacingStyle).toHaveBeenCalledWith("normal");

    wrapper.unmount();
  });

  it("updates root colour controls without accessing an undefined style section", async () => {
    const wrapper = createWrapper();
    await flushPromises();
    await clickTab(wrapper, "Root");

    const colorFields = wrapper.findAllComponents(ColorFieldStub);
    expect(colorFields).toHaveLength(5);

    colorFields[0]?.vm.$emit("update:modelValue", "#0ea5e9");
    colorFields[1]?.vm.$emit("update:modelValue", "#ffffff");
    await nextTick();

    expect(__globalStylesState.globalStyles.value.defaults.root.caretColor).toBe(
      "#0ea5e9",
    );
    expect(
      __globalStylesState.globalStyles.value.defaults.root.selectionColor,
    ).toBe("#ffffff");

    wrapper.unmount();
  });

  it("retains the chosen unit for empty measurement fields", async () => {
    const wrapper = createWrapper();
    await flushPromises();

    const bodySizeUnitSelect = wrapper
      .findAllComponents(SelectStub)
      .find(
        (candidate) =>
          candidate.attributes("data-testid") ===
          "global-styles-unit-defaults-body-fontSize",
      );

    const bodySizeInput = wrapper
      .findAllComponents(VariableAssignableInputStub)
      .find(
        (candidate) =>
          candidate.attributes("data-testid") ===
          "global-styles-measurement-defaults-body-fontSize",
      );

    expect(bodySizeUnitSelect).toBeDefined();
    expect(bodySizeInput).toBeDefined();
    expect(bodySizeUnitSelect?.attributes("data-model-value")).toBe("px");

    bodySizeUnitSelect?.vm.$emit("update:modelValue", "rem");
    await nextTick();

    expect(bodySizeUnitSelect?.attributes("data-model-value")).toBe("rem");

    bodySizeInput?.vm.$emit("update:modelValue", "12");
    await nextTick();

    expect(__globalStylesState.globalStyles.value.defaults.body.fontSize).toBe(
      "12rem",
    );

    bodySizeInput?.vm.$emit("update:modelValue", "");
    await nextTick();

    expect(__globalStylesState.globalStyles.value.defaults.body.fontSize).toBe(
      "",
    );
    expect(bodySizeUnitSelect?.attributes("data-model-value")).toBe("rem");

    wrapper.unmount();
  });

  it("applies overall scale and heading scale in the preview rail", async () => {
    __globalStylesState.globalStyles.value.defaults.body.fontSize = "16px";
    __globalStylesState.globalStyles.value.defaults.body.lineHeight = "1.5";
    __typographyState.overallScale.value = 125;
    __typographyState.spacingStyle.value = "airy";
    __typographyState.typography.value.scale = DEFAULT_TYPOGRAPHY_SCALE.map(
      (step) => {
        if (step.id === "4xl") {
          return { ...step, size: 44, lineHeight: 56 };
        }

        if (step.id === "2xl") {
          return { ...step, size: 28, lineHeight: 38 };
        }

        return { ...step };
      },
    ) as typeof __typographyState.typography.value.scale;

    const wrapper = createWrapper();
    await flushPromises();

    expect(
      wrapper.find('[data-testid="body-preview-sample"]').attributes("style"),
    ).toContain("font-size: 20px;");
    expect(
      wrapper.find('[data-testid="body-preview-sample"]').attributes("style"),
    ).toContain("line-height: 1.95;");
    expect(
      wrapper.find('[data-testid="body-preview-sample"] p').classes(),
    ).not.toContain("text-sm");

    await clickTab(wrapper, "Headings");

    expect(
      wrapper
        .find('[data-testid="heading-preview-display"]')
        .attributes("style"),
    ).toContain("font-size: 44px;");
    expect(
      wrapper
        .find('[data-testid="heading-preview-supporting"]')
        .attributes("style"),
    ).toContain("font-size: 28px;");

    wrapper.unmount();
  });

  it("resolves variable-backed section preview values", async () => {
    __globalStylesState.globalStyles.value.defaults.section.contentMaxWidth =
      "var(--section-width)";
    __globalStylesState.globalStyles.value.defaults.section.sectionGap =
      "var(--section-gap)";
    __globalStylesState.globalStyles.value.variables.custom["section-width"] = {
      label: "Section width",
      value: "48rem",
      category: "spacing",
    };
    __globalStylesState.globalStyles.value.variables.custom["section-gap"] = {
      label: "Section gap",
      value: "2rem",
      category: "spacing",
    };

    const wrapper = createWrapper();
    await flushPromises();

    await clickTab(wrapper, "Sections");

    const content = wrapper.find('[data-testid="sections-preview-content"]');
    expect(content.attributes("style")).toContain("max-width: 48rem;");
    expect(content.attributes("style")).toContain("gap: 2rem;");

    wrapper.unmount();
  });

  it("surfaces input focus ring and button hover preview styles", async () => {
    __globalStylesState.globalStyles.value.defaults.body.backgroundColor =
      "#0f172a";
    __globalStylesState.globalStyles.value.defaults.input.focusRingColor =
      "#22c55e";
    __globalStylesState.globalStyles.value.defaults.button.variants.primary.backgroundColor =
      "#111111";
    __globalStylesState.globalStyles.value.defaults.button.variants.primary.color =
      "#ffffff";
    __globalStylesState.globalStyles.value.defaults.button.variants.primary.hoverBackgroundColor =
      "#f97316";
    __globalStylesState.globalStyles.value.defaults.button.variants.primary.hoverColor =
      "#1f2937";

    const wrapper = createWrapper();
    await flushPromises();

    await clickTab(wrapper, "Inputs");

    const inputSurface = wrapper.find('[data-testid="preview-surface"]')
      .element as HTMLDivElement;
    const focusedInput = wrapper.find('[data-testid="inputs-preview-focus"]')
      .element as HTMLDivElement;
    expect(inputSurface.style.backgroundColor).toContain("15, 23, 42");
    expect(focusedInput.style.boxShadow).toContain("#22c55e");

    await clickTab(wrapper, "Buttons");

    const buttonSurface = wrapper.find('[data-testid="preview-surface"]')
      .element as HTMLDivElement;
    const defaultButton = wrapper.find(
      '[data-testid="button-preview-primary-default"]',
    ).element as HTMLButtonElement;
    const hoverButton = wrapper.find(
      '[data-testid="button-preview-primary-hover"]',
    ).element as HTMLButtonElement;

    expect(buttonSurface.style.backgroundColor).toContain("15, 23, 42");
    expect(defaultButton.style.backgroundColor).toContain("17, 17, 17");
    expect(hoverButton.style.backgroundColor).toContain("249, 115, 22");
    expect(hoverButton.style.color).toContain("31, 41, 55");

    wrapper.unmount();
  });

  it("resolves direct palette and semantic shade references in previews", async () => {
    __designSystemState.palettes.value = [
      {
        name: "primary",
        label: "Primary",
        shades: {
          25: "#eff6ff",
          50: "#dbeafe",
          100: "#bfdbfe",
          200: "#93c5fd",
          300: "#60a5fa",
          400: "#3b82f6",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af",
          800: "#1e3a8a",
          900: "#172554",
          950: "#0f172a",
          DEFAULT: "#2d49b7",
        },
      },
    ];
    __designSystemState.semanticColors.value = {
      success: "#16a34a",
      warning: "#f59e0b",
      error: "#dc2626",
      info: "#2563eb",
    };
    __globalStylesState.globalStyles.value.defaults.body.backgroundColor =
      "var(--primary)";
    __globalStylesState.globalStyles.value.defaults.body.color =
      "var(--primary-500)";
    __globalStylesState.globalStyles.value.defaults.input.focusRingColor =
      "var(--success-500)";

    const wrapper = createWrapper();
    await flushPromises();

    const previewSurface = wrapper.find('[data-testid="preview-surface"]')
      .element as HTMLDivElement;
    const bodyPreview = wrapper.find('[data-testid="body-preview-sample"]')
      .element as HTMLDivElement;

    expect(
      wrapper.findAll('[data-resolved-model-value="#2d49b7"]').length,
    ).toBeGreaterThan(0);
    expect(previewSurface.style.backgroundColor).toContain("45, 73, 183");
    expect(bodyPreview.style.color).toContain("37, 99, 235");

    await clickTab(wrapper, "Inputs");

    const focusedInput = wrapper.find('[data-testid="inputs-preview-focus"]')
      .element as HTMLDivElement;
    expect(focusedInput.style.boxShadow).toContain(
      generateNaturalShades("#16a34a")[500],
    );

    wrapper.unmount();
  });
});
