import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { describe, expect, it, vi } from "vitest";

import CmsCollectionCommandSelect from "../../../admin/features/CMS/components/CmsCollectionCommandSelect.vue";
import type { CollectionSummary } from "../../../admin/features/CMS/composables/useCollectionsList";

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

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    name: "Popover",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "popover" }, slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    name: "PopoverContent",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "popover-content" }, slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    name: "PopoverTrigger",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "popover-trigger" }, slots.default?.());
    },
  }),
}));

vi.mock("@/components/ui/command", () => ({
  Command: defineComponent({
    name: "Command",
    setup(_, { slots }) {
      return () => h("div", { "data-testid": "command" }, slots.default?.());
    },
  }),
  CommandEmpty: defineComponent({
    name: "CommandEmpty",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "command-empty" }, slots.default?.());
    },
  }),
  CommandGroup: defineComponent({
    name: "CommandGroup",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "command-group" }, slots.default?.());
    },
  }),
  CommandInput: defineComponent({
    name: "CommandInput",
    props: {
      modelValue: { type: String, default: "" },
      placeholder: { type: String, default: "" },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
      return () =>
        h("input", {
          "data-testid": "command-input",
          value: props.modelValue,
          placeholder: props.placeholder,
          onInput: (event: Event) => {
            emit("update:modelValue", (event.target as HTMLInputElement).value);
          },
        });
    },
  }),
  CommandItem: defineComponent({
    name: "CommandItem",
    props: {
      value: { type: String, default: "" },
    },
    emits: ["select"],
    setup(props, { emit, slots }) {
      return () =>
        h(
          "button",
          {
            "data-command-item": props.value,
            type: "button",
            onClick: () => emit("select"),
          },
          slots.default?.(),
        );
    },
  }),
  CommandList: defineComponent({
    name: "CommandList",
    setup(_, { slots }) {
      return () =>
        h("div", { "data-testid": "command-list" }, slots.default?.());
    },
  }),
}));

const collections: CollectionSummary[] = [
  {
    id: "col_authors",
    name: "authors",
    label: "Authors",
    kind: "content",
    iconName: null,
    showInSidebar: true,
    itemCount: 4,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
  {
    id: "col_site_settings",
    name: "site-settings",
    label: "Site Settings",
    kind: "config",
    iconName: null,
    showInSidebar: true,
    itemCount: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  },
];

type PickerProps = {
  modelValue?: string;
  collections?: readonly CollectionSummary[];
  disabled?: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  placeholder?: string;
  emptyLabel?: string;
};

function mountPicker(props: PickerProps = {}) {
  return mount(CmsCollectionCommandSelect, {
    props: {
      collections,
      ...props,
    },
  });
}

describe("CmsCollectionCommandSelect", () => {
  it("displays the selected collection label instead of the stored id", () => {
    const wrapper = mountPicker({ modelValue: "col_authors" });

    expect(wrapper.find('[data-testid="button"]').text()).toContain("Authors");
    expect(wrapper.find('[data-testid="button"]').text()).not.toContain(
      "col_authors",
    );
  });

  it("displays legacy collection names while reselecting canonical ids", async () => {
    const wrapper = mountPicker({ modelValue: "authors" });

    expect(wrapper.find('[data-testid="button"]').text()).toContain("Authors");

    await wrapper.findAll("[data-command-item]")[0]?.trigger("click");

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      "col_authors",
    ]);
  });

  it("emits the selected collection id", async () => {
    const wrapper = mountPicker();

    await wrapper.findAll("[data-command-item]")[1]?.trigger("click");

    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([
      "col_site_settings",
    ]);
  });

  it("filters collections by label, name, kind, and id", async () => {
    const wrapper = mountPicker();

    await wrapper.find('[data-testid="command-input"]').setValue("config");

    const items = wrapper.findAll("[data-command-item]");
    expect(items).toHaveLength(1);
    expect(items[0]?.text()).toContain("Site Settings");
    expect(wrapper.text()).not.toContain("Authors");
  });

  it("keeps unknown legacy target collection values visible", () => {
    const wrapper = mountPicker({ modelValue: "legacy-authors" });

    expect(wrapper.find('[data-testid="button"]').text()).toContain(
      "legacy-authors",
    );
  });
});
