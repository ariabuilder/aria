import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";

import EntryPublishOverflowMenu from "../../../admin/features/Publishing/components/EntryPublishOverflowMenu.vue";
import PagePublishSplitButton from "../../../admin/features/Publishing/components/PagePublishSplitButton.vue";

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
      return () =>
        h("div", { "data-testid": "dropdown-menu" }, slots.default?.());
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
      return () =>
        h("div", { "data-testid": "dropdown-content" }, slots.default?.());
    },
  }),
  DropdownMenuItem: defineComponent({
    name: "DropdownMenuItem",
    setup(_, { attrs, slots }) {
      return () =>
        h("button", { ...attrs, type: "button" }, slots.default?.());
    },
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

type PublishButtonTestProps = {
  status: "draft" | "published" | "scheduled" | "archived";
  canPublish?: boolean;
  scheduledFor?: string | null;
  isModifiedSincePublish?: boolean;
};

function mountPublishButton(props: Partial<PublishButtonTestProps> = {}) {
  return mount(PagePublishSplitButton, {
    props: {
      status: "draft",
      canPublish: true,
      ...props,
    },
  });
}

type OverflowMenuTestProps = {
  status: "draft" | "published" | "scheduled" | "archived";
  canSchedule?: boolean;
  canUnpublish?: boolean;
  canArchive?: boolean;
  canDelete?: boolean;
  scheduledFor?: string | null;
};

function mountOverflowMenu(props: Partial<OverflowMenuTestProps> = {}) {
  return mount(EntryPublishOverflowMenu, {
    props: {
      status: "draft",
      canSchedule: true,
      canUnpublish: true,
      canArchive: true,
      canDelete: true,
      ...props,
    },
  });
}

describe("PagePublishSplitButton (entry detail)", () => {
  it("shows Publish for draft entries with publish permission", () => {
    const wrapper = mountPublishButton({ status: "draft", canPublish: true });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Publish");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("shows Published and disables the main action for published entries", () => {
    const wrapper = mountPublishButton({
      status: "published",
      canPublish: true,
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Published");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("shows Scheduled for scheduled entries", () => {
    const wrapper = mountPublishButton({
      status: "scheduled",
      scheduledFor: "2026-07-15T14:00:00.000Z",
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toMatch(/Scheduled|Jul/);
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("emits publishNow when the main button is clicked for draft entries", async () => {
    const wrapper = mountPublishButton({ status: "draft", canPublish: true });
    await wrapper.find("[data-testid='button']").trigger("click");
    expect(wrapper.emitted("publishNow")).toEqual([[]]);
  });

  it("shows Publish changes for published entries with unsaved edits", () => {
    const wrapper = mountPublishButton({
      status: "published",
      canPublish: true,
      isModifiedSincePublish: true,
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Publish changes");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("emits publishNow when publish changes is clicked", async () => {
    const wrapper = mountPublishButton({
      status: "published",
      canPublish: true,
      isModifiedSincePublish: true,
    });
    await wrapper.find("[data-testid='button']").trigger("click");
    expect(wrapper.emitted("publishNow")).toEqual([[]]);
  });
});

describe("EntryPublishOverflowMenu", () => {
  it("renders schedule and archive actions for draft entries", () => {
    const wrapper = mountOverflowMenu({
      status: "draft",
      canSchedule: true,
      canArchive: true,
    });
    const text = wrapper.text();
    expect(text).toContain("Schedule");
    expect(text).toContain("Archive");
    expect(text).toContain("Delete");
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
      scheduledFor,
    });

    await wrapper.findAll("button").find((button) => button.text().includes("Reschedule"))?.trigger("click");
    await flushScheduleOpen();

    const popover = wrapper.find("[data-testid='schedule-popover']");
    expect(popover.attributes("data-open")).toBe("true");
    expect(popover.attributes("data-initial-iso")).toBe(scheduledFor);
    expect(popover.attributes("data-confirm-label")).toBe("Update");
  });

  it("renders unpublish for published entries", () => {
    const wrapper = mountOverflowMenu({
      status: "published",
      canUnpublish: true,
    });
    expect(wrapper.text()).toContain("Unpublish");
  });
});
