import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AgentActivityIndicator from "../../../../admin/features/Agent/client/components/AgentActivityIndicator.vue";

describe("AgentActivityIndicator", () => {
  it("renders shimmering activity text as a polite status", () => {
    const wrapper = mount(AgentActivityIndicator, {
      props: {
        activity: {
          phase: "reading",
          label: "Reading page...",
          activeToolName: "aria_read_page",
          startedAt: 100,
          elapsedMs: 0,
          requestId: "req-1",
        },
      },
    });

    expect(wrapper.attributes("role")).toBe("status");
    expect(wrapper.attributes("aria-live")).toBe("polite");
    expect(wrapper.text()).toContain("Reading page...");
    expect(wrapper.find(".agent-activity-shimmer").attributes("data-text")).toBe(
      "Reading page...",
    );
  });
});
