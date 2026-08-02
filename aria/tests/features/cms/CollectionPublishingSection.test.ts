import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import CollectionPublishingSection from "../../../admin/features/CMS/components/CollectionPublishingSection.vue";

const CollectionTemplateCardStub = defineComponent({
  name: "CollectionTemplateCard",
  props: {
    label: { type: String, required: true },
    description: { type: String, required: true },
  },
  setup(props) {
    return () =>
      h("article", { "data-testid": "template-card" }, [
        h("h3", props.label),
        h("p", props.description),
      ]);
  },
});

describe("CollectionPublishingSection", () => {
  it("uses tag-specific labels with collection-focused descriptions", () => {
    const wrapper = mount(CollectionPublishingSection, {
      props: {
        collectionKind: "tags",
      },
      global: {
        stubs: {
          CollectionTemplateCard: CollectionTemplateCardStub,
          Badge: true,
          Input: true,
          Label: true,
        },
      },
    });

    const cards = wrapper.findAll('[data-testid="template-card"]');
    expect(cards[0]?.text()).toContain(
      "Optional all-tags page for your collection.",
    );
    expect(cards[1]?.text()).toContain("Tag URL template");
    expect(cards[1]?.text()).toContain(
      "Template for entry pages for your collection.",
    );
  });
});
