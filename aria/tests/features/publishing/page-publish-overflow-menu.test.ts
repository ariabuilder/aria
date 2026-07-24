import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";

import PagePublishOverflowMenu from "../../../admin/features/Publishing/components/PagePublishOverflowMenu.vue";

vi.mock("@/components/ui/button", () => ({
  Button: defineComponent({
    name: "Button",
    setup(_, { attrs, slots }) {
      return () =>
        h(
          "button",
          { ...attrs, "data-testid": "button" },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: defineComponent({
    name: "DropdownMenu",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "dropdown-menu" }, slots.default?.());
    },
  }),
  DropdownMenuTrigger: defineComponent({
    name: "DropdownMenuTrigger",
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  DropdownMenuContent: defineComponent({
    name: "DropdownMenuContent",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "dropdown-content" }, slots.default?.());
    },
  }),
  DropdownMenuItem: defineComponent({
    name: "DropdownMenuItem",
    setup(_, { attrs, slots }) {
      return () => h("button", { ...attrs, type: "button" }, slots.default?.());
    },
  }),
  DropdownMenuSeparator: defineComponent({
    name: "DropdownMenuSeparator",
    template: "<hr />",
  }),
}));

vi.mock(
  "@/features/Studio/core/components/HeaderActionDropdownTooltip.vue",
  () => ({
    default: defineComponent({
      name: "HeaderActionDropdownTooltip",
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
  }),
);

vi.mock(
  "@/features/Studio/pages/components/PageMenuSectionLabel.vue",
  () => ({
    default: defineComponent({
      name: "PageMenuSectionLabel",
      setup(_, { slots }) {
        return () => h("div", slots.default?.());
      },
    }),
  }),
);

vi.mock(
  "../../../admin/features/Publishing/components/SchedulePublishPopover.vue",
  () => ({
    default: defineComponent({
      name: "SchedulePublishPopover",
      props: {
        open: Boolean,
        initialIso: {
          type: String,
          default: null,
        },
        confirmLabel: {
          type: String,
          default: "Schedule",
        },
      },
      setup(props, { slots }) {
        return () =>
          h(
            "div",
            {
              "data-testid": "schedule-popover",
              "data-open": String(props.open),
              "data-initial-iso": props.initialIso ?? "",
              "data-confirm-label": props.confirmLabel,
            },
            [slots.anchor?.(), slots.default?.()],
          );
      },
    }),
  }),
);

async function flushScheduleOpen(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await nextTick();
}

function mountOverflowMenu(
  props: Partial<{
    status: "draft" | "published" | "scheduled" | "archived";
    canSchedule: boolean;
    canUnpublish: boolean;
    canArchive: boolean;
    canDuplicate: boolean;
  }> = {},
) {
  return mount(PagePublishOverflowMenu, {
    props: {
      status: "draft",
      canSchedule: true,
      canUnpublish: true,
      canArchive: true,
      canDelete: true,
      canDuplicate: true,
      ...props,
    },
  });
}

describe("PagePublishOverflowMenu", () => {
  it("renders a header overflow trigger", () => {
    const wrapper = mountOverflowMenu();
    const trigger = wrapper.find('[aria-label="Publishing options"]');
    expect(trigger.exists()).toBe(true);
  });

  it("renders schedule, archive, delete, and duplicate actions for draft pages", () => {
    const wrapper = mountOverflowMenu({
      status: "draft",
      canSchedule: true,
      canArchive: true,
      canDuplicate: true,
    });
    const text = wrapper.text();
    expect(text).toContain("Schedule");
    expect(text).toContain("Archive");
    expect(text).toContain("Delete");
    expect(text).toContain("Duplicate");
  });

  it("opens the schedule popover after selecting Schedule", async () => {
    const wrapper = mountOverflowMenu({
      status: "draft",
      canSchedule: true,
    });

    await wrapper.findAll("button").find((button) => button.text().includes("Schedule"))?.trigger("click");
    await flushScheduleOpen();

    const popover = wrapper.find("[data-testid='schedule-popover']");
    expect(popover.attributes("data-open")).toBe("true");
    expect(popover.attributes("data-initial-iso")).toBe("");
    expect(popover.attributes("data-confirm-label")).toBe("Schedule");
  });

  it("opens the reschedule popover with the current schedule", async () => {
    const scheduledFor = "2027-03-01T14:00:00.000Z";
    const wrapper = mountOverflowMenu({
      status: "scheduled",
      canSchedule: true,
    });
    await wrapper.setProps({ scheduledFor });

    await wrapper.findAll("button").find((button) => button.text().includes("Reschedule"))?.trigger("click");
    await flushScheduleOpen();

    const popover = wrapper.find("[data-testid='schedule-popover']");
    expect(popover.attributes("data-open")).toBe("true");
    expect(popover.attributes("data-initial-iso")).toBe(scheduledFor);
    expect(popover.attributes("data-confirm-label")).toBe("Update");
  });

  it("renders unpublish for published pages", () => {
    const wrapper = mountOverflowMenu({
      status: "published",
      canUnpublish: true,
    });
    expect(wrapper.text()).toContain("Unpublish");
  });
});
