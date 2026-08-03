import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

const renderSlot = defineComponent({
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    setup(_, { slots }) {
      return () => h("button", { type: "button" }, slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: renderSlot,
  PopoverContent: renderSlot,
  PopoverTrigger: renderSlot,
}));

vi.mock("@/components/ui/command", () => ({
  Command: renderSlot,
  CommandGroup: renderSlot,
  CommandList: renderSlot,
  CommandShortcut: renderSlot,
  CommandItem: defineComponent({
    props: {
      value: {
        type: String,
        required: true,
      },
    },
    emits: ["select"],
    setup(props, { emit, slots }) {
      return () =>
        h(
          "button",
          {
            type: "button",
            "data-command-value": props.value,
            onClick: () => emit("select"),
          },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("@/features/Design", () => ({
  useTheme: () => ({
    isDark: { value: false },
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ComposerCanvasOptionsMenu", () => {
  it("shows the selection toolbar option and defaults it on", async () => {
    const ComposerCanvasOptionsMenu = (
      await import(
        "../../../admin/features/Composer/components/ComposerCanvasOptionsMenu.vue"
      )
    ).default;
    const wrapper = mount(ComposerCanvasOptionsMenu);
    const toolbarOption = wrapper.get(
      '[data-command-value="show-selection-toolbar"]',
    );

    expect(toolbarOption.text()).toContain(
      "composer.options.showSelectionToolbar",
    );

    await toolbarOption.trigger("click");

    expect(wrapper.emitted("update:show-selection-toolbar")).toEqual([
      [false],
    ]);
  });

  it("emits the enabled state when the toolbar is hidden", async () => {
    const ComposerCanvasOptionsMenu = (
      await import(
        "../../../admin/features/Composer/components/ComposerCanvasOptionsMenu.vue"
      )
    ).default;
    const wrapper = mount(ComposerCanvasOptionsMenu, {
      props: {
        showSelectionToolbar: false,
      },
    });

    await wrapper
      .get('[data-command-value="show-selection-toolbar"]')
      .trigger("click");

    expect(wrapper.emitted("update:show-selection-toolbar")).toEqual([[true]]);
  });

  it("toggles selection sizing independently from the toolbar", async () => {
    const ComposerCanvasOptionsMenu = (
      await import(
        "../../../admin/features/Composer/components/ComposerCanvasOptionsMenu.vue"
      )
    ).default;
    const wrapper = mount(ComposerCanvasOptionsMenu);
    const sizingOption = wrapper.get(
      '[data-command-value="show-selection-sizing"]',
    );

    expect(sizingOption.text()).toContain(
      "composer.options.showSelectionSizing",
    );

    await sizingOption.trigger("click");

    expect(wrapper.emitted("update:show-selection-sizing")).toEqual([[false]]);
    expect(wrapper.emitted("update:show-selection-toolbar")).toBeUndefined();
  });
});
