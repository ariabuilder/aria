import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { InspectorPseudoStateSchema } from "../../lib/schemas/classEditor";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipProvider: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  TooltipContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

describe("PseudoSelectorDropdown", () => {
  it("emits supported semantic pseudo states from search results", async () => {
    const PseudoSelectorDropdown = (
      await import("../../admin/features/Inspector/components/PseudoSelectorDropdown.vue")
    ).default;

    const wrapper = mount(PseudoSelectorDropdown, {
      props: {
        modelValue: "default",
        disabled: false,
        hasPseudoRules: true,
      },
      global: {
        stubs: {
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const searchInput = wrapper.find('input[type="text"]');
    expect(searchInput.exists()).toBe(true);
    await searchInput.setValue("hover");

    const hoverButton = wrapper
      .findAll("button")
      .find((node) => node.text().trim() === ":hover");

    expect(hoverButton).toBeDefined();
    await hoverButton!.trigger("click");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toEqual([["hover"]]);
    expect(InspectorPseudoStateSchema.safeParse(emitted?.[0]?.[0]).success).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("emits custom relational pseudo states from search apply", async () => {
    const PseudoSelectorDropdown = (
      await import("../../admin/features/Inspector/components/PseudoSelectorDropdown.vue")
    ).default;

    const wrapper = mount(PseudoSelectorDropdown, {
      props: {
        modelValue: "default",
        disabled: false,
        hasPseudoRules: true,
      },
      global: {
        stubs: {
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const searchInput = wrapper.find('input[type="text"]');
    await searchInput.setValue("has(.icon)");

    const applyButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("Apply has(.icon)"));

    expect(applyButton).toBeDefined();
    await applyButton!.trigger("click");

    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted).toEqual([["custom:has(.icon)"]]);
    expect(InspectorPseudoStateSchema.safeParse(emitted?.[0]?.[0]).success).toBe(
      true,
    );

    wrapper.unmount();
  });

  it("navigates category detail and emits pseudo-element states", async () => {
    const PseudoSelectorDropdown = (
      await import("../../admin/features/Inspector/components/PseudoSelectorDropdown.vue")
    ).default;

    const wrapper = mount(PseudoSelectorDropdown, {
      props: {
        modelValue: "default",
        disabled: false,
        hasPseudoRules: true,
      },
      global: {
        stubs: {
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    const elementsCategory = wrapper
      .findAll("button")
      .find((node) => node.text().trim() === "Elements");
    expect(elementsCategory).toBeDefined();
    await elementsCategory!.trigger("click");

    const beforeButton = wrapper
      .findAll("button")
      .find((node) => node.text().trim() === "::before");
    expect(beforeButton).toBeDefined();
    await beforeButton!.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["before"]]);

    wrapper.unmount();
  });

  it("does not emit while disabled", async () => {
    const PseudoSelectorDropdown = (
      await import("../../admin/features/Inspector/components/PseudoSelectorDropdown.vue")
    ).default;

    const wrapper = mount(PseudoSelectorDropdown, {
      props: {
        modelValue: "default",
        disabled: true,
      },
      global: {
        stubs: {
          Button: defineComponent({
            setup(_, { attrs, slots }) {
              return () => h("button", attrs, slots.default?.());
            },
          }),
          Popover: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverTrigger: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
          PopoverContent: defineComponent({
            setup(_, { slots }) {
              return () => h("div", slots.default?.());
            },
          }),
        },
      },
    });

    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.text()).toContain(
      "Select a custom class to enable pseudo states",
    );

    wrapper.unmount();
  });
});
