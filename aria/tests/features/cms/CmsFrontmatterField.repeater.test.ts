import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import type { FieldSchema } from "../../../lib/cms/schemas";

vi.mock("vuedraggable", async () => {
  const { cloneVNode, defineComponent, h } = await import("vue");
  const Draggable = defineComponent({
    name: "Draggable",
    props: {
      modelValue: { type: Array, default: () => [] },
      itemKey: { type: [String, Function], required: true },
    },
    setup(props, { slots }) {
      return () =>
        h(
          "div",
          {},
          props.modelValue.flatMap((element: unknown, index) =>
            (slots.item?.({ element, index }) ?? []).map((child) =>
              cloneVNode(child, {
                key:
                  typeof props.itemKey === "function"
                    ? props.itemKey(element)
                    : (element as Record<string, unknown>)[props.itemKey],
              }),
            ),
          ),
        );
    },
  });

  return {
    __esModule: true,
    __isTeleport: false,
    default: Draggable,
  };
});

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: ref([]),
  }),
}));

vi.mock("@/features/Studio/media/composables/useMediaAssets", () => ({
  useMediaAssets: () => ({
    assets: ref([]),
    loadAssets: vi.fn(),
  }),
}));

const repeaterField = {
  key: "steps",
  label: "Steps",
  type: "repeater",
  fields: [
    { key: "label", label: "Label", type: "string" },
    { key: "complete", label: "Complete", type: "boolean" },
  ],
  repeaterDisplay: {
    titleFieldKey: "label",
    addButtonLabel: "Add step",
  },
} satisfies FieldSchema;

const navigationRepeaterField = {
  key: "menuItems",
  label: "Menu items",
  type: "repeater",
  fields: [
    { key: "label", label: "Label", type: "string" },
    { key: "link", label: "Link", type: "link" },
  ],
} satisfies FieldSchema;

async function mountRepeater(
  initialValue: Record<string, unknown>[],
  field: FieldSchema = repeaterField,
) {
  const CmsFrontmatterField = (
    await import("../../../admin/features/CMS/components/CmsFrontmatterField.vue")
  ).default;

  const Harness = defineComponent({
    components: { CmsFrontmatterField },
    setup() {
      const value = ref(structuredClone(initialValue));
      return {
        field,
        value,
      };
    },
    template: `<CmsFrontmatterField v-model="value" :field="field" />`,
  });

  return mount(Harness, { attachTo: document.body });
}

function repeaterValue(wrapper: ReturnType<typeof mountRepeater> extends Promise<infer T> ? T : never) {
  return (wrapper.vm as unknown as { value: Record<string, unknown>[] }).value;
}

async function settleAsyncComponents(): Promise<void> {
  await flushPromises();
  await nextTick();
  await flushPromises();
}

describe("CmsFrontmatterField repeater", () => {
  it("uses compact row controls for adding, expanding, duplicating, and removing rows", async () => {
    const wrapper = await mountRepeater([
      { label: "Create fields", complete: true },
      { label: "Bind fields", complete: false },
    ]);
    await settleAsyncComponents();

    expect(wrapper.text()).toContain("Steps");
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain("Create fields");
    });

    await wrapper.get('button[aria-label="Expand item"]').trigger("click");
    await nextTick();
    expect(wrapper.find('button[aria-label="Collapse item"]').exists()).toBe(true);

    await wrapper.get("button").trigger("click");
    await nextTick();
    expect(repeaterValue(wrapper)).toEqual([
      { label: "Create fields", complete: true },
      { label: "Bind fields", complete: false },
      { label: "", complete: false },
    ]);

    await wrapper.get('button[aria-label="Duplicate item"]').trigger("click");
    await nextTick();
    expect(repeaterValue(wrapper)).toEqual([
      { label: "Create fields", complete: true },
      { label: "Create fields", complete: true },
      { label: "Bind fields", complete: false },
      { label: "", complete: false },
    ]);

    const removeButtons = wrapper.findAll('button[aria-label="Remove item"]');
    await removeButtons[1]?.trigger("click");
    await nextTick();
    expect(repeaterValue(wrapper)).toEqual([
      { label: "Create fields", complete: true },
      { label: "Bind fields", complete: false },
      { label: "", complete: false },
    ]);
  });

  it("reorders rows with visible move controls", async () => {
    const wrapper = await mountRepeater([
      { label: "Create fields", complete: true },
      { label: "Bind fields", complete: false },
    ]);
    await settleAsyncComponents();

    await wrapper.get('button[aria-label="Move item down"]').trigger("click");
    await nextTick();
    expect(repeaterValue(wrapper).map((item) => item.label)).toEqual([
      "Bind fields",
      "Create fields",
    ]);

    const moveUpButtons = wrapper.findAll('button[aria-label="Move item up"]');
    await moveUpButtons[1]?.trigger("click");
    await nextTick();
    expect(repeaterValue(wrapper).map((item) => item.label)).toEqual([
      "Create fields",
      "Bind fields",
    ]);
  });

  it("keeps a nested input mounted and focused while its value changes", async () => {
    const wrapper = await mountRepeater([
      { label: "Create fields", complete: false },
    ]);
    await settleAsyncComponents();

    await wrapper.get('button[aria-label="Expand item"]').trigger("click");
    await nextTick();

    const input = wrapper.get("#cms-field-label");
    (input.element as HTMLInputElement).focus();
    expect(document.activeElement).toBe(input.element);

    await input.setValue("Create navigation");
    await nextTick();

    const updatedInput = wrapper.get("#cms-field-label");
    expect(updatedInput.element).toBe(input.element);
    expect(document.activeElement).toBe(updatedInput.element);
  });

  it("uses a repeater item's label instead of showing a duplicate link label", async () => {
    const wrapper = await mountRepeater(
      [
        {
          label: "Home",
          link: {
            type: "page",
            url: "/",
            pageId: "page-home",
            entryId: "",
            collectionId: "",
            slug: "index",
            label: "Home",
            openInNewTab: false,
          },
        },
      ],
      navigationRepeaterField,
    );
    await settleAsyncComponents();

    await wrapper.get('button[aria-label="Expand item"]').trigger("click");
    await nextTick();

    expect(wrapper.find("#cms-field-label").exists()).toBe(true);
    expect(wrapper.find('input[placeholder="Link label"]').exists()).toBe(false);
  });
});
