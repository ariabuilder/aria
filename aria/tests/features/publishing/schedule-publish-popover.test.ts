import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

import SchedulePublishPopover from "../../../admin/features/Publishing/components/SchedulePublishPopover.vue";
import { studioIcons } from "../../../admin/lib/icons";

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    name: "Popover",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "popover" }, slots.default?.());
    },
  }),
  PopoverAnchor: defineComponent({
    name: "PopoverAnchor",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "popover-anchor" }, slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    name: "PopoverTrigger",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "popover-trigger" }, slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    name: "PopoverContent",
    setup(_, { attrs, slots }) {
      return () =>
        h(
          "div",
          {
            ...attrs,
            "data-testid": "popover-content",
          },
          slots.default?.(),
        );
    },
  }),
}));

function hasIconClass(wrapper: ReturnType<typeof mount>, iconClass: string): boolean {
  return wrapper.findAll("span").some((span) => span.classes().includes(iconClass));
}

describe("SchedulePublishPopover", () => {
  it("renders polished calendar controls, time input, and quick picks", () => {
    const wrapper = mount(SchedulePublishPopover, {
      props: { open: true },
      slots: {
        default: () => h("button", "Open"),
      },
    });

    expect(wrapper.text()).toContain("Schedule publish");
    expect(hasIconClass(wrapper, studioIcons.schedule)).toBe(true);
    expect(hasIconClass(wrapper, studioIcons.chevronLeft)).toBe(true);
    expect(hasIconClass(wrapper, studioIcons.chevronRight)).toBe(true);
    expect(wrapper.find("#schedule-time").exists()).toBe(true);
    expect(wrapper.text()).toContain("Tomorrow at 9:00 AM");
  });

  it("emits confirm with the selected schedule and closes", async () => {
    const wrapper = mount(SchedulePublishPopover, {
      props: { open: true },
      slots: {
        default: () => h("button", "Open"),
      },
    });

    await wrapper.get("button:not([data-slot='calendar-cell-trigger'])").trigger(
      "click",
    );
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Schedule")
      ?.trigger("click");

    expect(wrapper.emitted("confirm")?.[0]?.[0]).toEqual(expect.any(String));
    expect(wrapper.emitted("update:open")?.some(([value]) => value === false)).toBe(
      true,
    );
  });

  it("emits cancel and closes without confirming", async () => {
    const wrapper = mount(SchedulePublishPopover, {
      props: { open: true },
      slots: {
        default: () => h("button", "Open"),
      },
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Cancel")
      ?.trigger("click");

    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("update:open")?.some(([value]) => value === false)).toBe(
      true,
    );
  });
});
