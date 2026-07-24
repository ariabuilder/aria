import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TrafficDotMatrix from "../../../admin/features/Studio/dashboard/components/TrafficDotMatrix.vue";

const baseProps = {
  visits: 24_860,
  requests: 72_400,
  bandwidthBytes: 18_000_000,
  hourlyVisits: [12, 28, 19, 42, 31, 55, 44],
  hourlyRequests: [40, 62, 58, 90, 75, 110, 104],
  hourlyBandwidthBytes: [1_000, 2_400, 1_800, 3_200, 2_700, 4_100, 3_800],
  hourlyTimestamps: [
    "2026-07-13T12:00:00.000Z",
    "2026-07-14T12:00:00.000Z",
    "2026-07-15T12:00:00.000Z",
    "2026-07-16T12:00:00.000Z",
    "2026-07-17T12:00:00.000Z",
    "2026-07-18T12:00:00.000Z",
    "2026-07-19T12:00:00.000Z",
  ],
  period: "7d" as const,
  canShowMetrics: true,
};

describe("TrafficDotMatrix", () => {
  it("renders the selected metric as a smooth line and area graph", () => {
    const wrapper = mount(TrafficDotMatrix, { props: baseProps });

    expect(wrapper.get(".traffic-chart__line").attributes("d")).toMatch(
      /^M .* C /,
    );
    expect(wrapper.get(".traffic-chart__area").attributes("d")).toMatch(/ Z$/);
    expect(wrapper.findAll(".traffic-chart__point").length).toBeGreaterThan(1);
  });

  it("keeps the graph hidden when analytics are unavailable", () => {
    const wrapper = mount(TrafficDotMatrix, {
      props: { ...baseProps, canShowMetrics: false },
    });

    expect(wrapper.find(".traffic-chart__line").exists()).toBe(false);
    expect(wrapper.text()).toContain("Configure analytics");
  });

  it("shows the analytics failure reason with the configure action", () => {
    const errorMessage =
      "Your API token is missing Analytics Read for this zone.";
    const wrapper = mount(TrafficDotMatrix, {
      props: {
        ...baseProps,
        canShowMetrics: false,
        errorMessage,
      },
    });

    expect(wrapper.get('[role="status"]').text()).toBe(errorMessage);
    expect(wrapper.text()).toContain("Configure analytics");
  });
});
