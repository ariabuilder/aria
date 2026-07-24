import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import CmsFieldCommandSelect from "../../../admin/features/CMS/components/CmsFieldCommandSelect.vue";
import type { CmsBindingFieldOptionGroup } from "../../../admin/features/Inspector/composables/usePropsEditor";

const groups: CmsBindingFieldOptionGroup[] = [
  {
    label: "Recommended",
    options: [
      {
        label: "Title",
        path: "blog.title",
        type: "system",
        source: "system",
        depth: 0,
        isList: false,
      },
      {
        label: "Body",
        path: "blog.body",
        type: "system",
        source: "system",
        depth: 0,
        isList: false,
      },
    ],
  },
  {
    label: "Other fields",
    options: [
      {
        label: "Cover",
        path: "blog.cover",
        type: "image",
        source: "schema",
        depth: 0,
        isList: false,
      },
    ],
  },
];

vi.mock("@/components/ui/popover", () => ({
  Popover: {
    name: "Popover",
    props: ["open"],
    emits: ["update:open"],
    template: "<div><slot /></div>",
  },
  PopoverTrigger: {
    name: "PopoverTrigger",
    template: "<div><slot /></div>",
  },
  PopoverContent: {
    name: "PopoverContent",
    template: "<div><slot /></div>",
  },
}));

describe("CmsFieldCommandSelect", () => {
  it("renders placeholder when no field is selected", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "",
        placeholder: "Choose field",
      },
    });

    expect(wrapper.text()).toContain("Choose field");
  });

  it("renders selected field label in the trigger", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "blog.title",
      },
    });

    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).not.toContain("Choose field");
  });

  it("renders grouped field options in the command list", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "",
      },
    });

    expect(wrapper.text()).toContain("Recommended");
    expect(wrapper.text()).toContain("Body");
    expect(wrapper.text()).toContain("Other fields");
    expect(wrapper.text()).toContain("Cover");
  });

  it("renders toolbar variant as icon-only with accessible label", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "",
        variant: "toolbar",
        displayLabel: "Loop · Posts",
        placeholder: "Loop",
        active: true,
      },
    });

    const button = wrapper.find("button");
    expect(button.attributes("aria-label")).toBe("Loop · Posts");
    expect(button.attributes("title")).toBe("Loop · Posts");
    expect(wrapper.text()).not.toContain("Loop · Posts");
  });

  it("does not auto-clear when the toolbar icon is clicked while bound", async () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "blog.title",
        variant: "toolbar",
        active: true,
      },
    });

    await wrapper.find("button").trigger("click");

    expect(wrapper.emitted("clear")).toBeUndefined();
  });

  it("emits clear once when Static is chosen via pointerdown", async () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "blog.title",
      },
    });

    const items = wrapper.findAllComponents({ name: "CommandItem" });
    const staticItem = items.find((item) => item.text().includes("Static"));
    expect(staticItem).toBeTruthy();

    await staticItem!.trigger("pointerdown");

    expect(wrapper.emitted("clear")).toHaveLength(1);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("emits select when a field is chosen", async () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "",
      },
    });

    const items = wrapper.findAllComponents({ name: "CommandItem" });
    const bodyItem = items.find((item) => item.text().includes("Body"));
    expect(bodyItem).toBeTruthy();

    await bodyItem!.trigger("click");

    expect(wrapper.emitted("select")?.[0]?.[0]).toEqual(
      expect.objectContaining({
        label: "Body",
        path: "blog.body",
      }),
    );
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["blog.body"]);
  });

  it("shows Static option when a field is bound", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "blog.title",
      },
    });

    expect(wrapper.text()).toContain("Static");
    expect(wrapper.text()).toContain("Use manual content instead of a CMS field");
  });

  it("hides Static option when no field is bound", () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "",
      },
    });

    expect(wrapper.text()).not.toContain("Use manual content instead of a CMS field");
  });

  it("emits clear when Static is chosen", async () => {
    const wrapper = mount(CmsFieldCommandSelect, {
      props: {
        groups,
        modelValue: "blog.title",
      },
    });

    const items = wrapper.findAllComponents({ name: "CommandItem" });
    const staticItem = items.find((item) => item.text().includes("Static"));
    expect(staticItem).toBeTruthy();

    await staticItem!.vm.$emit("select");

    expect(wrapper.emitted("clear")).toBeTruthy();
    expect(wrapper.emitted("select")).toBeUndefined();
  });
});
