import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

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

type SplitButtonTestProps = {
  status: "draft" | "published" | "scheduled" | "archived";
  canPublish?: boolean;
  scheduledFor?: string | null;
  isModifiedSincePublish?: boolean;
};

function mountSplitButton(props: Partial<SplitButtonTestProps> = {}) {
  return mount(PagePublishSplitButton, {
    props: {
      status: "draft",
      canPublish: true,
      ...props,
    },
  });
}

describe("PagePublishSplitButton", () => {
  it("shows Publish for draft pages with publish permission", () => {
    const wrapper = mountSplitButton({ status: "draft", canPublish: true });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Publish");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("shows Published and disables the main action for published pages", () => {
    const wrapper = mountSplitButton({
      status: "published",
      canPublish: true,
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Published");
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("shows Scheduled for scheduled pages", () => {
    const wrapper = mountSplitButton({
      status: "scheduled",
      scheduledFor: "2026-07-15T14:00:00.000Z",
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toMatch(/Scheduled|Jul/);
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("emits publishNow when the main button is clicked for draft pages", async () => {
    const wrapper = mountSplitButton({ status: "draft", canPublish: true });
    await wrapper.find("[data-testid='button']").trigger("click");
    expect(wrapper.emitted("publishNow")).toEqual([[]]);
  });

  it("shows Publish changes for published pages with unpublished edits", () => {
    const wrapper = mountSplitButton({
      status: "published",
      canPublish: true,
      isModifiedSincePublish: true,
    });
    const button = wrapper.find("[data-testid='button']");
    expect(button.text()).toContain("Publish changes");
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("emits publishNow when publish changes is clicked", async () => {
    const wrapper = mountSplitButton({
      status: "published",
      canPublish: true,
      isModifiedSincePublish: true,
    });
    await wrapper.find("[data-testid='button']").trigger("click");
    expect(wrapper.emitted("publishNow")).toEqual([[]]);
  });
});
