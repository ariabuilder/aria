import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import ActivityTimeline from "../../../admin/features/Core/components/ActivityTimeline.vue";
import type { ActivityTimelineItem } from "../../../admin/features/Core/types/activityTimeline";

vi.mock("@/i18n", () => ({
  useStudioI18n: () => ({ t: (key: string) => key }),
}));

function activity(
  id: string,
  action: string,
  isHighlighted?: boolean,
): ActivityTimelineItem {
  return {
    id,
    userName: "Admin",
    action,
    target: "this page",
    timestamp: "Jul 27, 2026, 6:22 PM",
    createdAt: "2026-07-27T22:22:00.000Z",
    isHighlighted,
  };
}

describe("ActivityTimeline", () => {
  it.each(["updated", "published"])(
    "uses the primary accent for the newest %s activity",
    (action) => {
      const wrapper = mount(ActivityTimeline, {
        props: {
          items: [
            activity("newest", action, true),
            activity("older", "updated", false),
          ],
        },
      });

      const primaryMarker = wrapper.find(".bg-primary");
      const primaryRail = wrapper.find(
        ".bg-\\[color-mix\\(in_srgb\\,var\\(--primary\\)_40\\%\\,transparent\\)\\]",
      );

      expect(primaryMarker.exists()).toBe(true);
      expect(primaryMarker.classes()).toContain("ring-primary/15");
      expect(primaryRail.exists()).toBe(true);
      expect(wrapper.find(".bg-secondary").exists()).toBe(false);
      expect(wrapper.find(".bg-emerald-500").exists()).toBe(false);
    },
  );
});
