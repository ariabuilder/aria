import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref, type Ref } from "vue";

import type { BuilderNode } from "../../lib/types/nodes";

const pagesRef = ref([
  {
    id: "page-home",
    title: "Home",
    slug: "index",
    status: "published",
    layout: "",
    updatedAt: null,
  },
]);

function builderNodeRef(node: BuilderNode | null): Ref<BuilderNode | null> {
  return ref(node as unknown) as Ref<BuilderNode | null>;
}

function builderNodeListRef(nodes: BuilderNode[]): Ref<BuilderNode[]> {
  return ref(nodes as unknown) as Ref<BuilderNode[]>;
}

vi.mock("@/composables/useBuilderData", () => ({
  useBuilderData: () => ({
    pages: pagesRef,
  }),
}));

vi.mock("../../admin/features/Inspector/composables/usePropertySchema", () => ({
  usePropertySchema: () => ({
    safeParse: vi.fn(() => ({ success: true })),
  }),
}));

describe("useLinkPropertyForm anchor picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects page anchor options when anchor mode is active", async () => {
    const { useLinkPropertyForm } =
      await import("../../admin/features/Inspector/composables/useLinkPropertyForm");

    const pageRootNodes = builderNodeListRef([
      {
        id: "section-pricing",
        type: "Container",
        props: { id: "pricing" },
        styles: {},
        metadata: { label: "Pricing" },
        children: [],
      },
    ]);
    const selectedNode = builderNodeRef({
      id: "node-1",
      type: "Text",
      props: {},
      styles: {},
      children: [],
    });

    const formApi = useLinkPropertyForm(selectedNode, { pageRootNodes });
    formApi.setMode("anchor");

    expect(formApi.pageAnchorOptions.value).toEqual([
      { id: "pricing", label: "Pricing" },
    ]);
  });

  it("validates custom anchor ids before accepting them", async () => {
    const { useLinkPropertyForm } =
      await import("../../admin/features/Inspector/composables/useLinkPropertyForm");

    const selectedNode = builderNodeRef({
      id: "node-1",
      type: "Text",
      props: {},
      styles: {},
      children: [],
    });

    const formApi = useLinkPropertyForm(selectedNode, {
      pageRootNodes: builderNodeListRef([]),
    });
    formApi.setMode("anchor");
    formApi.anchorSearchQuery.value = "123invalid";

    expect(formApi.showCustomAnchorOption.value).toBe(true);
    expect(formApi.setAnchorId("123invalid")).toBe(false);
    expect(formApi.anchorValidationError.value).toBeTruthy();
    expect(formApi.form.value.anchorId).toBe("");
  });

  it("accepts listed anchor ids without revalidation", async () => {
    const { useLinkPropertyForm } =
      await import("../../admin/features/Inspector/composables/useLinkPropertyForm");

    const pageRootNodes = builderNodeListRef([
      {
        id: "section-pricing",
        type: "Container",
        props: { id: "pricing" },
        styles: {},
        metadata: { label: "Pricing" },
        children: [],
      },
    ]);
    const selectedNode = builderNodeRef({
      id: "node-1",
      type: "Text",
      props: {},
      styles: {},
      children: [],
    });

    const formApi = useLinkPropertyForm(selectedNode, { pageRootNodes });
    formApi.setMode("anchor");

    expect(formApi.setAnchorId("pricing", { fromList: true })).toBe(true);
    expect(formApi.form.value.anchorId).toBe("pricing");
    expect(formApi.serializeLinkState().href).toBe("#pricing");
  });

  it("preserves stale unmatched anchor ids for display", async () => {
    const { useLinkPropertyForm } =
      await import("../../admin/features/Inspector/composables/useLinkPropertyForm");

    const selectedNode = builderNodeRef({
      id: "node-1",
      type: "Text",
      props: { href: "#removed-section" },
      styles: {},
      children: [],
    });

    const formApi = useLinkPropertyForm(selectedNode, {
      pageRootNodes: builderNodeListRef([]),
    });

    expect(formApi.form.value.mode).toBe("anchor");
    expect(formApi.selectedAnchorTriggerLabel.value).toBe("removed-section");
    expect(formApi.selectedAnchorSubtitle.value).toBe("Custom section ID");
    expect(formApi.selectedAnchorOption.value).toBeNull();
  });
});
