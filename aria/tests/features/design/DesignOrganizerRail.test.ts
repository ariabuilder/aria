import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";

vi.mock(
  "../../../admin/features/Studio/core/composables/useSlidingNavIndicator",
  () => ({
    useSlidingNavIndicator: () => ({
      navRef: ref(null),
      indicator: reactive({ visible: false, top: 0, height: 0 }),
      indicatorAnimated: ref(false),
      registerButton: vi.fn(),
      onItemEnter: vi.fn(),
      onNavLeave: vi.fn(),
      updateIndicator: vi.fn(),
    }),
  }),
);

import DesignOrganizerRail from "../../../admin/features/Design/components/DesignOrganizerRail.vue";

const SlotStub = defineComponent({
  setup(_props, { slots }) {
    return () => h("button", slots.default?.());
  },
});

describe("DesignOrganizerRail", () => {
  it("fills its container and starts with Colors", () => {
    const wrapper = mount(DesignOrganizerRail, {
      props: { activeSection: "colors" },
      global: {
        stubs: {
          FlickeringNavItem: SlotStub,
          SlidingNavIndicator: true,
        },
      },
    });

    const rail = wrapper.get("[data-studio-organizer-rail]");
    expect(rail.classes()).toContain("h-full");
    expect(rail.classes()).toContain("min-h-0");
    expect(wrapper.text()).toContain("Colors");
    expect(wrapper.text()).not.toContain("Overview");

    wrapper.unmount();
  });
});
