import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ClassTagChip from "../../../admin/features/Inspector/components/ClassTagChip.vue";

describe("ClassTagChip", () => {
  it("renders remove control with static CSS hook classes", () => {
    const wrapper = mount(ClassTagChip, {
      props: {
        label: "flex-col",
        variant: "utility",
      },
    });

    const remove = wrapper.find('[aria-label="Remove class"]');
    expect(remove.exists()).toBe(true);
    expect(remove.classes()).toContain("class-tag-remove");

    const removeBtn = remove.find(".class-tag-remove-btn");
    expect(removeBtn.exists()).toBe(true);

    const removeIcon = remove.find(".class-tag-remove-icon");
    expect(removeIcon.exists()).toBe(true);
  });

  it("uses legacy remove icon size for legacy variant", () => {
    const wrapper = mount(ClassTagChip, {
      props: {
        label: "legacy-class",
        variant: "legacy",
      },
    });

    const remove = wrapper.find('[aria-label="Remove class"]');
    expect(remove.find(".class-tag-remove-btn").exists()).toBe(true);
  });

  it("keeps custom chips tight around the label", () => {
    const wrapper = mount(ClassTagChip, {
      props: {
        label: ".test",
        variant: "custom",
        active: true,
      },
    });

    const chip = wrapper.get(".class-tag-chip");

    expect(chip.classes()).toContain("px-2");
    expect(chip.classes()).not.toContain("gap-1");
    expect(chip.classes()).not.toContain("pr-2");
  });
});
