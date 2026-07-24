import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

import type { ColorPickerTriggerSlotProps } from "../../admin/components/ui/color-picker/types";

const previewColorRef = ref("rgb(34, 197, 94)");
const valueModeRef = ref<ColorPickerTriggerSlotProps["valueMode"]>("reference");

vi.mock("../../admin/components/ui/color-picker/ColorPicker.vue", () => ({
  default: defineComponent({
    name: "ColorPicker",
    props: {
      modelValue: { type: String, default: "" },
      resolvedModelValue: { type: String, default: null },
      layout: { type: String, default: "compact" },
      showDesignColors: { type: Boolean, default: false },
      showVariables: { type: Boolean, default: undefined },
    },
    emits: ["update:modelValue", "commit"],
    setup(props, { slots, emit }) {
      const showInlineAssign = () =>
        props.layout === "unified" && props.showVariables !== false;

      return () =>
        h("div", { "data-testid": "color-picker-stub" }, [
          h("div", { class: showInlineAssign() ? "flex gap-1.5" : "" }, [
            slots.default?.({
              previewColor: previewColorRef.value,
              valueMode: valueModeRef.value,
            }),
            showInlineAssign()
              ? h(
                  "button",
                  {
                    type: "button",
                    "data-testid": "inline-variable-assign",
                    onClick: () => {
                      emit("update:modelValue", "var(--brand-primary)");
                      emit("commit", "var(--brand-primary)");
                    },
                  },
                  "assign",
                )
              : null,
          ]),
        ]);
    },
  }),
}));

import { ColorField } from "../../admin/components/ui/color-picker";

describe("ColorField trigger swatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewColorRef.value = "rgb(34, 197, 94)";
    valueModeRef.value = "reference";
  });

  it("shows the full var(--*) token in the collapsed field label", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "var(--secondary-500)",
        layout: "unified",
      },
    });

    await flushPromises();

    expect(wrapper.text()).toContain("var(--secondary-500)");
  });

  it("uses scoped previewColor on the inspector swatch instead of raw var(--*)", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "var(--secondary-500)",
        layout: "unified",
      },
    });

    await flushPromises();

    const swatch = wrapper.find("span.block.size-full.rounded-sm");
    expect(swatch.exists()).toBe(true);
    expect(swatch.attributes("style")).toContain(
      "background-color: rgb(34, 197, 94)",
    );
    expect(swatch.attributes("style")).not.toContain("var(--secondary-500)");
  });

  it("uses scoped previewColor on the toolbar swatch", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "var(--secondary-500)",
        variant: "toolbar",
      },
    });

    await flushPromises();

    const swatch = wrapper.find("span.absolute.inset-0");
    expect(swatch.exists()).toBe(true);
    expect(swatch.attributes("style")).toContain(
      "background-color: rgb(34, 197, 94)",
    );
  });

  it("shows transparent swatch when preview is unresolved", async () => {
    previewColorRef.value = "transparent";
    valueModeRef.value = "reference-unresolved";

    const wrapper = mount(ColorField, {
      props: {
        modelValue: "var(--missing)",
        layout: "unified",
      },
    });

    await flushPromises();

    const swatch = wrapper.find("span.block.size-full.rounded-sm");
    expect(swatch.attributes("style")).toContain("transparent");
  });
});

describe("ColorField inline variable assign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewColorRef.value = "rgb(34, 197, 94)";
    valueModeRef.value = "literal";
  });

  it("shows inline assign control for unified layout with show-variables", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "#ff0000",
        layout: "unified",
        showVariables: true,
      },
    });

    await flushPromises();

    expect(
      wrapper.find('[data-testid="inline-variable-assign"]').exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it("hides inline assign control for toolbar variant", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "#ff0000",
        variant: "toolbar",
      },
    });

    await flushPromises();

    expect(
      wrapper.find('[data-testid="inline-variable-assign"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it("forwards the unified design picker configuration for toolbar fields", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "#ff0000",
        variant: "toolbar",
        layout: "unified",
        showDesignColors: true,
        showVariables: true,
      },
    });

    await flushPromises();

    const picker = wrapper.findComponent({ name: "ColorPicker" });
    expect(picker.props("layout")).toBe("unified");
    expect(picker.props("showDesignColors")).toBe(true);
    expect(picker.props("showVariables")).toBe(false);
    expect(
      wrapper.find('[data-testid="inline-variable-assign"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it("forwards variable assignment through ColorPicker commit", async () => {
    const wrapper = mount(ColorField, {
      props: {
        modelValue: "#ff0000",
        layout: "unified",
        showVariables: true,
      },
    });

    await flushPromises();

    await wrapper
      .get('[data-testid="inline-variable-assign"]')
      .trigger("click");

    const updates = wrapper.emitted("update:modelValue") ?? [];
    expect(updates[updates.length - 1]?.[0]).toBe("var(--brand-primary)");

    const commits = wrapper.emitted("commit") ?? [];
    expect(commits[commits.length - 1]?.[0]).toBe("var(--brand-primary)");

    wrapper.unmount();
  });
});
