import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

const variableReferenceOptionsRef = ref([
  {
    value: "space-md",
    label: "Space Md",
    meta: "Spacing · --space-md",
    group: "Custom Variables",
  },
  {
    value: "layout-gap-tight",
    label: "Layout Gap Tight",
    meta: "Alias · --layout-gap-tight",
    group: "Aliases",
  },
]);

const defaultVariableReferenceOptions = [
  {
    value: "space-md",
    label: "Space Md",
    meta: "Spacing · --space-md",
    group: "Custom Variables",
  },
  {
    value: "layout-gap-tight",
    label: "Layout Gap Tight",
    meta: "Alias · --layout-gap-tight",
    group: "Aliases",
  },
];

vi.mock("@/components/ui/input", () => ({
  Input: defineComponent({
    props: {
      modelValue: { type: [String, Number], default: "" },
      placeholder: { type: String, default: "" },
      disabled: { type: Boolean, default: false },
      class: { type: String, default: "" },
    },
    emits: ["update:modelValue", "blur", "keydown"],
    setup(props, { emit }) {
      return () =>
        h("input", {
          value: props.modelValue,
          placeholder: props.placeholder,
          disabled: props.disabled,
          class: props.class,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onBlur: (event: Event) => emit("blur", event),
          onKeydown: (event: KeyboardEvent) => emit("keydown", event),
        });
    },
  }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverTrigger: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  PopoverContent: defineComponent({
    setup(_, { attrs, slots }) {
      return () =>
        h(
          "div",
          { ...attrs, "data-testid": "popover-content" },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("@/components/ui/command", () => ({
  Command: defineComponent({
    setup(_, { attrs, slots }) {
      return () =>
        h(
          "div",
          { ...attrs, "data-testid": "command-root" },
          slots.default?.(),
        );
    },
  }),
  CommandInput: defineComponent({
    props: {
      placeholder: { type: String, default: "" },
    },
    setup(props) {
      return () => h("input", { placeholder: props.placeholder });
    },
  }),
  CommandList: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CommandEmpty: defineComponent({
    setup(_, { slots }) {
      return () => h("div", slots.default?.());
    },
  }),
  CommandGroup: defineComponent({
    props: {
      heading: { type: String, default: "" },
    },
    setup(props, { slots }) {
      return () =>
        h("section", { "data-heading": props.heading }, slots.default?.());
    },
  }),
  CommandItem: defineComponent({
    props: {
      value: { type: String, required: true },
    },
    emits: ["select"],
    setup(props, { slots, emit }) {
      return () =>
        h(
          "button",
          {
            type: "button",
            "data-value": props.value,
            onClick: () => emit("select"),
          },
          slots.default?.(),
        );
    },
  }),
}));

vi.mock("../../admin/composables/useVariableReferenceOptions", () => ({
  useVariableReferenceOptions: () => ({
    variableReferenceOptions: variableReferenceOptionsRef,
    isLoadingVariableReferences: ref(false),
    loadVariableReferences: vi.fn(),
  }),
}));

describe("VariableAssignableInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    variableReferenceOptionsRef.value = defaultVariableReferenceOptions.map(
      (option) => ({ ...option }),
    );
  });

  it("assigns a variable reference from the picker", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "16px",
      },
    });

    await flushPromises();
    await wrapper
      .get('[data-value="Space Md Spacing · --space-md space-md"]')
      .trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([
      "var(--space-md)",
    ]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual(["var(--space-md)"]);
  });

  it("restores the last direct value when variable mode is cleared", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "12px",
      },
    });

    await flushPromises();
    await wrapper
      .get(
        '[data-value="Layout Gap Tight Alias · --layout-gap-tight layout-gap-tight"]',
      )
      .trigger("click");

    await wrapper.setProps({ modelValue: "var(--layout-gap-tight)" });
    await flushPromises();

    await wrapper.get('[data-value="direct-value"]').trigger("click");

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual(["12px"]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual(["12px"]);
  });

  it("adds primary hover styling to the direct value label", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "var(--space-md)",
      },
    });

    await flushPromises();

    const directValueItem = wrapper.get('[data-value="direct-value"]');
    const directValueLabel = directValueItem.find("span");

    expect(directValueItem.attributes("class")).toContain("group/direct-value");
    expect(directValueItem.attributes("class")).toContain("rounded-none");
    expect(directValueLabel.attributes("class")).toContain(
      "group-hover/direct-value:text-primary",
    );
    expect(directValueLabel.attributes("class")).toContain(
      "group-data-highlighted/direct-value:text-primary-foreground",
    );
  });

  it("renders variable picker items without rounded corners", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "16px",
      },
    });

    await flushPromises();

    const optionItem = wrapper.get(
      '[data-value="Space Md Spacing · --space-md space-md"]',
    );

    expect(optionItem.attributes("class")).toContain("rounded-none");
  });

  it("removes the bottom border only from the last picker item", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "16px",
      },
    });

    await flushPromises();

    expect(
      wrapper.get('section[data-heading="Mode"]').attributes("class") ?? "",
    ).not.toContain("[&>[data-slot=command-item]:last-child]:border-b-0");
    expect(
      wrapper
        .get('section[data-heading="Custom Variables"]')
        .attributes("class") ?? "",
    ).not.toContain("[&>[data-slot=command-item]:last-child]:border-b-0");
    expect(
      wrapper.get('section[data-heading="Aliases"]').attributes("class") ?? "",
    ).toContain("[&>[data-slot=command-item]:last-child]:border-b-0");
  });

  it("removes the bottom border from direct value when no variable groups exist", async () => {
    variableReferenceOptionsRef.value = [];

    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "16px",
      },
    });

    await flushPromises();

    expect(
      wrapper.get('section[data-heading="Mode"]').attributes("class") ?? "",
    ).toContain("[&>[data-slot=command-item]:last-child]:border-b-0");
  });

  it("matches the variable picker command shell radius to the popover", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "16px",
      },
    });

    await flushPromises();

    expect(
      wrapper.get('[data-testid="command-root"]').attributes("class"),
    ).toContain("rounded-md");
    expect(
      wrapper.get('[data-testid="popover-content"]').attributes("class"),
    ).toContain("overflow-hidden");
    expect(
      wrapper.get('[data-testid="popover-content"]').attributes("class"),
    ).toContain("rounded-md");
  });

  it("keeps reserved right padding after custom input classes when end actions are present", async () => {
    const { VariableAssignableInput } = await import(
      "@/components/ui/variable-reference-picker"
    );

    const wrapper = mount(VariableAssignableInput, {
      props: {
        modelValue: "repeat(3, minmax(0, 1fr))",
        inputClass: "px-2",
      },
      slots: {
        "end-actions": () =>
          h(
            "button",
            { type: "button", "data-testid": "grid-helper" },
            "Helper",
          ),
      },
    });

    await flushPromises();

    expect(wrapper.find('[data-testid="grid-helper"]').exists()).toBe(true);
    const className = wrapper.get("input").attributes("class") ?? "";

    expect(className).toContain("px-2");
    expect(className).toContain("pr-[4.25rem]");
    expect(className.indexOf("pr-[4.25rem]")).toBeGreaterThan(
      className.indexOf("px-2"),
    );
  });
});
