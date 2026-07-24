import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

vi.mock("../../admin/components/ui/collapsible", () => ({
  Collapsible: defineComponent({
    props: {
      open: { type: Boolean, default: false },
    },
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CollapsibleTrigger: defineComponent({
    props: {
      class: {
        type: [String, Array, Object],
        default: "",
      },
    },
    setup(props, { slots }) {
      return () => h("button", { class: props.class }, slots.default?.());
    },
  }),
  CollapsibleContent: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
}));

describe("BaseProperty", () => {
  it("uses the header-title slot when provided", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Classes",
      },
      slots: {
        "header-title": () =>
          h("span", { "data-testid": "custom-header-title" }, ".hero"),
      },
    });

    expect(wrapper.get('[data-testid="custom-header-title"]').text()).toBe(
      ".hero",
    );
    expect(wrapper.text()).not.toContain("Classes");

    wrapper.unmount();
  });

  it("marks the header as highlighted when tinted", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Classes",
        headerTinted: true,
      },
    });

    const header = wrapper.get(".property-header");

    expect(header.attributes("data-highlighted")).toBe("true");

    wrapper.unmount();
  });

  it("shows a primary change dot when a collapsed section has changes", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Typography",
        hasChanges: true,
        defaultOpen: false,
      },
    });

    const changeIndicator = wrapper.get(
      '[data-testid="property-change-indicator"]',
    );

    expect(changeIndicator.classes()).toContain("relative");
    expect(changeIndicator.classes()).toContain("h-[9px]");
    const pulseDot = changeIndicator.findAll("span")[0];
    const centerDot = changeIndicator.findAll("span")[1];

    expect(pulseDot?.classes()).toContain("live-ping");
    expect(pulseDot?.classes()).toContain("bg-primary/45");
    expect(centerDot?.classes()).toContain("bg-primary");
    expect(wrapper.text()).not.toContain("+");

    wrapper.unmount();
  });

  it("shows the same change dot when an expanded section has changes", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Background",
        hasChanges: true,
        defaultOpen: true,
      },
    });

    const changeIndicator = wrapper.get(
      '[data-testid="property-change-indicator"]',
    );

    expect(changeIndicator.classes()).toContain("relative");
    const pulseDot = changeIndicator.findAll("span")[0];
    const centerDot = changeIndicator.findAll("span")[1];

    expect(pulseDot?.classes()).toContain("live-ping");
    expect(centerDot?.classes()).toContain("bg-primary");
    expect(wrapper.text()).not.toContain("-");

    wrapper.unmount();
  });

  it("hides the change dot when the section has no changes", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Spacing",
        hasChanges: false,
      },
    });

    expect(
      wrapper.find('[data-testid="property-change-indicator"]').exists(),
    ).toBe(false);

    wrapper.unmount();
  });

  it("emits reset when the header reset button is clicked", async () => {
    const BaseProperty = (
      await import("../../admin/features/Inspector/inputs/BaseProperty.vue")
    ).default;

    const wrapper = mount(BaseProperty, {
      props: {
        title: "Link",
        hasChanges: true,
        showReset: true,
        defaultOpen: false,
      },
    });

    await wrapper.get('[data-testid="property-reset-button"]').trigger("click");

    expect(wrapper.emitted("reset")).toBeTruthy();

    wrapper.unmount();
  });
});
