import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { BuilderNode } from "../../../../lib/types/nodes";
import PageStructureList from "../../../../admin/features/Studio/pages/components/PageStructureList.vue";
import {
  applySectionLabel,
  getSectionDisplayLabel,
  parseSectionLabel,
} from "../../../../admin/features/Studio/pages/lib/sectionLabel";

function createSectionNode(
  overrides: Partial<BuilderNode> & Pick<BuilderNode, "id">,
): BuilderNode {
  return {
    type: "Section",
    props: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

const sampleSections = [
  {
    id: "section-1",
    name: "Hero",
    type: "Section",
    isVisible: true,
  },
  {
    id: "section-2",
    name: "Features",
    type: "Section",
    isVisible: false,
  },
];

describe("sectionLabel helpers", () => {
  it("parses valid section labels", () => {
    expect(parseSectionLabel("  Hero Section  ")).toEqual({
      success: true,
      data: "Hero Section",
    });
  });

  it("rejects empty and overlong labels", () => {
    expect(parseSectionLabel("   ").success).toBe(false);
    expect(parseSectionLabel("a".repeat(101)).success).toBe(false);
  });

  it("returns display label from metadata or type", () => {
    expect(
      getSectionDisplayLabel(
        createSectionNode({
          id: "a",
          metadata: { label: "Intro" },
        }),
      ),
    ).toBe("Intro");
    expect(getSectionDisplayLabel(createSectionNode({ id: "b" }))).toBe(
      "Section",
    );
  });

  it("updates only the matching root node label", () => {
    const nodes = [
      createSectionNode({
        id: "section-1",
        metadata: { label: "Hero", hidden: false, order: 0 },
      }),
      createSectionNode({
        id: "section-2",
        metadata: { label: "Features", hidden: true, order: 1 },
      }),
    ];

    const nextNodes = applySectionLabel(nodes, "section-2", "Benefits");

    expect(nextNodes).not.toBeNull();
    expect(nextNodes?.[0]?.metadata).toEqual({
      label: "Hero",
      hidden: false,
      order: 0,
    });
    expect(nextNodes?.[1]?.metadata).toEqual({
      label: "Benefits",
      hidden: true,
      order: 1,
    });
  });

  it("returns null when label is unchanged", () => {
    const nodes = [
      createSectionNode({
        id: "section-1",
        metadata: { label: "Hero" },
      }),
    ];

    expect(applySectionLabel(nodes, "section-1", "Hero")).toBeNull();
    expect(applySectionLabel(nodes, "section-1", "  Hero  ")).toBeNull();
  });

  it("returns null for invalid labels or missing nodes", () => {
    const nodes = [createSectionNode({ id: "section-1" })];

    expect(applySectionLabel(nodes, "missing", "New Name")).toBeNull();
    expect(applySectionLabel(nodes, "section-1", "   ")).toBeNull();
  });
});

describe("PageStructureList rename", () => {
  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  function mountList(
    overrides: Partial<{
      sections: typeof sampleSections;
      canEdit: boolean;
      isSaving: boolean;
    }> = {},
  ) {
    return mount(PageStructureList, {
      props: {
        sections: sampleSections,
        canEdit: true,
        isLoading: false,
        isSaving: false,
        ...overrides,
      },
    });
  }

  it("enters inline rename mode when section name is clicked", async () => {
    const wrapper = mountList();

    await wrapper.get('[aria-label="Rename section"]').trigger("click");

    expect(wrapper.find("input").exists()).toBe(true);
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
      "Hero",
    );
  });

  it("emits rename-section on valid confirm", async () => {
    const wrapper = mountList();

    await wrapper.get('[aria-label="Rename section"]').trigger("click");
    const input = wrapper.get("input");
    await input.setValue("Intro");
    await wrapper.get('[aria-label="Confirm section rename"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("rename-section")).toEqual([["section-1", "Intro"]]);
  });

  it("does not emit rename-section for empty labels", async () => {
    const wrapper = mountList();

    await wrapper.get('[aria-label="Rename section"]').trigger("click");
    const input = wrapper.get("input");
    await input.setValue("   ");
    await wrapper.get('[aria-label="Confirm section rename"]').trigger("click");
    await flushPromises();

    expect(wrapper.emitted("rename-section")).toBeUndefined();
  });

  it("disables rename affordances when editing is not allowed", () => {
    const wrapper = mountList({ canEdit: false });

    expect(wrapper.find('[aria-label="Rename section"]').exists()).toBe(false);
    expect(
      wrapper.get("button.text-sm.font-medium").attributes("disabled"),
    ).toBeDefined();
  });

  it("disables rename affordances while saving", () => {
    const wrapper = mountList({ isSaving: true });

    expect(wrapper.find('[aria-label="Rename section"]').exists()).toBe(false);
    expect(
      wrapper.get("button.text-sm.font-medium").attributes("disabled"),
    ).toBeDefined();
  });
});
