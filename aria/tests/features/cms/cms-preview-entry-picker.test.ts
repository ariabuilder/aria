import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import CmsPreviewEntryPicker from "../../../admin/features/CMS/components/CmsPreviewEntryPicker.vue";

vi.mock(
  "../../../admin/features/CMS/components/CmsEntryCommandSelect.vue",
  () => ({
    default: {
      name: "CmsEntryCommandSelect",
      props: [
        "modelValue",
        "targetCollection",
        "disabled",
        "placeholder",
        "variant",
        "leadingIcon",
      ],
      template:
        '<button data-testid="entry-select" type="button">{{ modelValue || placeholder }}</button>',
    },
  }),
);

describe("CmsPreviewEntryPicker", () => {
  it("renders sidebar-style entry picker without collection label", () => {
    const wrapper = mount(CmsPreviewEntryPicker, {
      props: {
        collectionId: "blog-id",
        modelValue: "entry-1",
      },
    });

    const select = wrapper.findComponent({ name: "CmsEntryCommandSelect" });
    expect(select.props("variant")).toBe("sidebar");
    expect(select.props("leadingIcon")).toBeTruthy();
    expect(wrapper.text()).not.toContain("Blog");
    expect(wrapper.find('[data-testid="entry-select"]').exists()).toBe(true);
  });
});
