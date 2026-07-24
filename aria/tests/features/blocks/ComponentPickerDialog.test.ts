import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComponentPickerDialog from "../../../admin/features/Blocks/dialogs/ComponentPickerDialog.vue";

const groupingState = vi.hoisted(() => ({
  canRead: true,
  hydrated: true,
  groups: [
    { id: "marketing", name: "Marketing" },
    { id: "commerce", name: "Commerce" },
    { id: "empty", name: "Empty" },
  ],
  assignments: {
    hero: "marketing",
    pricing: "commerce",
  } as Record<string, string>,
}));

vi.mock(
  "@/features/Studio/components/composables/useComponentGrouping",
  async () => {
    const { computed } = await import("vue");
    return {
      useComponentGrouping: () => ({
        canReadGrouping: computed(() => groupingState.canRead),
        hasHydratedFromServer: computed(() => groupingState.hydrated),
        customGroups: computed(() => groupingState.groups),
        buildEffectiveAssignments: () => groupingState.assignments,
      }),
    };
  },
);

vi.mock(
  "@/features/Studio/core/components/ExpandableSearchInput.vue",
  () => ({
    default: defineComponent({
      name: "ExpandableSearchInput",
      props: { modelValue: { type: String, default: "" } },
      emits: ["update:modelValue"],
      template:
        '<input data-testid="component-search" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    }),
  }),
);

vi.mock(
  "../../../admin/features/Blocks/dialogs/ComponentPickerCard.vue",
  () => ({
    default: defineComponent({
      name: "ComponentPickerCard",
      props: { component: { type: Object, required: true } },
      emits: ["select"],
      template:
        '<button data-testid="component-card" @click="$emit(\'select\', component)">{{ component.name }}</button>',
    }),
  }),
);

const SlotStub = defineComponent({ template: "<div><slot /></div>" });

function mountPicker() {
  return mount(ComponentPickerDialog, {
    props: {
      open: true,
      components: [
        {
          id: "hero",
          name: "Hero",
          description: "Landing introduction",
          category: "Marketing",
        },
        {
          id: "pricing",
          name: "Pricing",
          description: "Plan comparison",
          category: "Commerce",
        },
      ],
    },
    global: {
      stubs: {
        Dialog: SlotStub,
        DialogContent: SlotStub,
        DialogDescription: SlotStub,
        DialogHeader: SlotStub,
        DialogTitle: SlotStub,
      },
    },
  });
}

describe("ComponentPickerDialog", () => {
  beforeEach(() => {
    groupingState.canRead = true;
    groupingState.hydrated = true;
    groupingState.groups = [
      { id: "marketing", name: "Marketing" },
      { id: "commerce", name: "Commerce" },
      { id: "empty", name: "Empty" },
    ];
    groupingState.assignments = {
      hero: "marketing",
      pricing: "commerce",
    };
  });

  it("shows non-empty groups and filters cards by group", async () => {
    const wrapper = mountPicker();

    expect(wrapper.text()).toContain("Marketing");
    expect(wrapper.text()).toContain("Commerce");
    expect(wrapper.text()).not.toContain("Empty");

    const marketingFilter = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Marketing"));
    await marketingFilter?.trigger("click");

    expect(
      wrapper.findAll('[data-testid="component-card"]').map((card) => card.text()),
    ).toEqual(["Hero"]);
  });

  it("intersects search with the active filter", async () => {
    const wrapper = mountPicker();
    const marketingFilter = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Marketing"));
    await marketingFilter?.trigger("click");

    await wrapper
      .get('[data-testid="component-search"]')
      .setValue("pricing");

    expect(wrapper.findAll('[data-testid="component-card"]')).toHaveLength(0);
    expect(wrapper.text()).toContain("No matching components");
  });

  it("emits selection once, closes, and resets picker state", async () => {
    const wrapper = mountPicker();
    const marketingFilter = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Marketing"));
    await marketingFilter?.trigger("click");
    await wrapper.get('[data-testid="component-search"]').setValue("hero");
    await wrapper.get('[data-testid="component-card"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [expect.objectContaining({ id: "hero", name: "Hero" })],
    ]);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);

    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();

    expect(
      wrapper.findAll('[data-testid="component-card"]').map((card) => card.text()),
    ).toEqual(["Hero", "Pricing"]);
    expect(
      (wrapper.get('[data-testid="component-search"]').element as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("hides group filters when grouping cannot be read", () => {
    groupingState.canRead = false;
    const wrapper = mountPicker();

    expect(wrapper.text()).not.toContain("Groups");
    expect(wrapper.text()).not.toContain("Categories");
    expect(wrapper.findAll('[data-testid="component-card"]')).toHaveLength(2);
  });
});
