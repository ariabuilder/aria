import { nextTick, ref, shallowRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../lib/types/nodes";

const { toastWarningMock } = vi.hoisted(() => ({
  toastWarningMock: vi.fn(),
}));

vi.mock("vue-sonner", () => ({
  toast: {
    warning: toastWarningMock,
  },
}));

import {
  repairSurfaceNodeIdentities,
  useNodeIdentityIntegrity,
} from "../../../admin/features/Core/composables/useNodeIdentityIntegrity";

const node = (id: string, children: BuilderNode[] = []): BuilderNode => ({
  id,
  type: "Container",
  props: {},
  styles: {},
  children,
});

const page = (nodes: BuilderNode[]): PageDSL => ({
  id: "page",
  slug: "page",
  title: "Page",
  status: "draft",
  nodes,
});

describe("useNodeIdentityIntegrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("repairs collisions across page and layout-slot identity namespaces", () => {
    const layout: LayoutDSL = {
      id: "layout",
      name: "Layout",
      nodes: [],
      slots: [
        {
          name: "header",
          defaultContent: [node("shared-id")],
        },
      ],
    };

    const result = repairSurfaceNodeIdentities([node("shared-id")], layout);

    expect(result.pageNodes[0]?.id).toBe("shared-id");
    expect(result.layoutSlots?.[0]?.defaultContent?.[0]?.id).not.toBe(
      "shared-id",
    );
    expect(result.repairs).toHaveLength(1);
  });

  it("repairs an affected active draft and marks it for saving", async () => {
    const duplicateHeading = node("shared-heading");
    const pageBlocks = shallowRef<BuilderNode[]>([
      node("section-a", [node("shared-container", [duplicateHeading])]),
      node("section-b", [node("shared-container", [node("shared-heading")])]),
    ]);
    const currentPage = shallowRef<PageDSL | null>(page(pageBlocks.value));
    const currentLayout = shallowRef<LayoutDSL | null>(null);
    const currentComponent = shallowRef<ComponentDSL | null>(null);
    const hasUnsavedChanges = ref(false);
    const clearSelection = vi.fn();

    useNodeIdentityIntegrity({
      pageBlocks,
      currentPage,
      currentLayout,
      currentComponent,
      currentItemType: ref("page"),
      hasUnsavedChanges,
      clearSelection,
    });
    await nextTick();

    const firstContainer = pageBlocks.value[0]?.children?.[0];
    const secondContainer = pageBlocks.value[1]?.children?.[0];
    expect(firstContainer?.id).toBe("shared-container");
    expect(secondContainer?.id).not.toBe("shared-container");
    expect(firstContainer?.children?.[0]?.id).toBe("shared-heading");
    expect(secondContainer?.children?.[0]?.id).not.toBe("shared-heading");
    expect(currentPage.value?.nodes).toBe(pageBlocks.value);
    expect(hasUnsavedChanges.value).toBe(true);
    expect(clearSelection).toHaveBeenCalledOnce();
    expect(toastWarningMock).toHaveBeenCalledOnce();
  });
});
