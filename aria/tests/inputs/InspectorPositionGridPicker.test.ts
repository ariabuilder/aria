import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    name: "Popover",
    props: {
      open: { type: Boolean, default: false },
    },
    emits: ["update:open"],
    setup(props, { attrs, slots }) {
      return () =>
        h(
          "div",
          {
            ...attrs,
            "data-testid": attrs["data-testid"] ?? "position-popover",
            "data-open": String(props.open),
          },
          slots.default?.(),
        );
    },
  }),
  PopoverTrigger: defineComponent({
    name: "PopoverTrigger",
    props: {
      asChild: { type: Boolean, default: false },
    },
    setup(_, { slots }) {
      return () => slots.default?.();
    },
  }),
  PopoverContent: defineComponent({
    name: "PopoverContent",
    props: {
      align: { type: String, default: "" },
      side: { type: String, default: "" },
      sideOffset: { type: Number, default: 0 },
    },
    setup(props, { attrs, slots }) {
      return () =>
        h(
          "div",
          {
            ...attrs,
            "data-align": props.align,
            "data-side": props.side,
            "data-side-offset": String(props.sideOffset),
          },
          slots.default?.(),
        );
    },
  }),
}));

describe("InspectorPositionGridPicker", () => {
  it("normalizes known values and emits selected grid positions", async () => {
    const InspectorPositionGridPicker = (
      await import(
        "../../admin/features/Inspector/inputs/InspectorPositionGridPicker.vue"
      )
    ).default;

    const wrapper = mount(InspectorPositionGridPicker, {
      props: {
        modelValue: "top",
      },
      attrs: {
        "data-testid": "image-object-position-select",
      },
    });

    expect(
      wrapper
        .get('[data-testid="image-object-position-select"]')
        .attributes("data-open"),
    ).toBe("false");
    expect(wrapper.get('[data-testid="position-trigger"]').text()).toContain(
      "Top",
    );

    await wrapper.get('button[title="Bottom Right"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["bottom right"]]);

    await wrapper.setProps({ modelValue: "20% 80%" });

    expect(wrapper.get('[data-testid="position-trigger"]').text()).toContain(
      "Position",
    );
    expect(
      wrapper.findAll("button[aria-pressed='true']").map((button) => button.text()),
    ).toEqual([]);
  });

  it("passes disabled state to the trigger only", async () => {
    const InspectorPositionGridPicker = (
      await import(
        "../../admin/features/Inspector/inputs/InspectorPositionGridPicker.vue"
      )
    ).default;

    const wrapper = mount(InspectorPositionGridPicker, {
      props: {
        disabled: true,
        modelValue: "center",
      },
    });

    expect(
      wrapper.get('[data-testid="position-trigger"]').attributes(),
    ).toHaveProperty("disabled");
    expect(
      wrapper.get('[data-testid="position-popover"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("uses an anchored visible theme-aware popover grid", async () => {
    const InspectorPositionGridPicker = (
      await import(
        "../../admin/features/Inspector/inputs/InspectorPositionGridPicker.vue"
      )
    ).default;

    const wrapper = mount(InspectorPositionGridPicker, {
      props: {
        modelValue: "bottom right",
      },
    });

    expect(wrapper.get('[data-testid="position-trigger"]').text()).toContain(
      "Bottom Right",
    );

    const triggerClasses = wrapper
      .get('[data-testid="position-trigger"]')
      .classes();
    expect(triggerClasses).toContain("bg-background/80");
    expect(triggerClasses).toContain("dark:bg-sidebar/70");

    const content = wrapper.get('[data-testid="position-content"]');
    expect(content.attributes("data-align")).toBe("end");
    expect(content.attributes("data-side")).toBe("bottom");
    expect(content.attributes("data-side-offset")).toBe("6");
    expect(content.classes()).toContain("w-[10.75rem]");
    expect(content.classes()).toContain("bg-background");
    expect(content.classes()).toContain("dark:bg-sidebar");

    const firstItemClasses = wrapper.get('button[title="Top Left"]').classes();
    expect(firstItemClasses).toContain("h-12");
    expect(firstItemClasses).toContain("w-12");
    expect(firstItemClasses).toContain("bg-sidebar/45");

    const activeItemClasses = wrapper
      .get('button[title="Bottom Right"]')
      .classes();
    expect(activeItemClasses).toContain("bg-primary/10");
    expect(activeItemClasses).toContain("text-primary");
  });
});
