import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useInspector } from "../../../admin/features/Inspector/composables/useInspector";
import { useInspectorDocumentPath } from "../../../admin/features/Inspector/composables/useInspectorDocumentPath";
import { useSelectedNodeState } from "../../../admin/features/Core/composables/useSelectedNodeState";

describe("useInspector singleton", () => {
  it("shares document path across callers", () => {
    const inspectorA = useInspector();
    const inspectorB = useInspector();

    inspectorA.setDocumentPath("pages", "home");

    expect(inspectorB.getNodeTarget()).toBeNull();

    const { selectedNodeId } = useSelectedNodeState();
    selectedNodeId.value = "n_test";

    const target = inspectorB.getNodeTarget();
    expect(target).toEqual({
      path: { collection: "pages", id: "home" },
      nodeId: "n_test",
    });
  });
});

describe("useInspectorDocumentPath", () => {
  it("syncs the active document into the shared inspector", () => {
    const inspector = useInspector();
    const itemType = ref<"page" | "layout" | "component" | undefined>("page");
    const itemSlug = ref<string | undefined>("about");

    useInspectorDocumentPath(itemType, itemSlug);

    const { selectedNodeId } = useSelectedNodeState();
    selectedNodeId.value = "n_about";

    expect(inspector.getNodeTarget()).toEqual({
      path: { collection: "pages", id: "about" },
      nodeId: "n_about",
    });
  });
});
