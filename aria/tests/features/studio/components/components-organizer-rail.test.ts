import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock(
  "../../../../admin/features/Studio/core/composables/useStudioOrganizerDragState",
  () => ({
    useStudioOrganizerDragState: () => ({
      draggedItemId: { value: null },
      dragTargetGroupId: { value: null },
      startDrag: vi.fn(),
      setDropTarget: vi.fn(),
      clearDropTarget: vi.fn(),
      endDrag: vi.fn(),
    }),
  }),
);

vi.mock(
  "../../../../admin/features/Studio/core/components/StudioOrganizerRail.vue",
  () => ({
    default: defineComponent({
      name: "StudioOrganizerRail",
      props: [
        "groups",
        "groupCounts",
        "allCount",
        "activeFilter",
        "canUpdateGrouping",
        "onMoveToGroup",
      ],
      emits: ["selectAll", "selectGroup"],
      setup(_props, { emit }) {
        return () =>
          h("div", {
            "data-test": "group-nav-shell",
            onClick: () => {
              emit("selectAll");
              emit("selectGroup", "grp-1");
            },
          });
      },
    }),
  }),
);

import ComponentsOrganizerRail from "../../../../admin/features/Studio/components/components/ComponentsOrganizerRail.vue";

describe("ComponentsOrganizerRail", () => {
  it("renders the shared group nav shell and forwards selection events", async () => {
    const onMoveToGroup = vi.fn(async () => undefined);
    const wrapper = mount(ComponentsOrganizerRail, {
      props: {
        groups: [{ id: "grp-1", name: "Heroes" }],
        groupCounts: { "grp-1": 2 },
        allCount: 2,
        activeFilter: "all",
        canUpdateGrouping: true,
        onMoveToGroup,
      },
    });

    expect(wrapper.find('[data-test="group-nav-shell"]').exists()).toBe(true);

    await wrapper.find('[data-test="group-nav-shell"]').trigger("click");

    expect(wrapper.emitted("selectAll")).toHaveLength(1);
    expect(wrapper.emitted("selectGroup")).toEqual([["grp-1"]]);
  });
});
