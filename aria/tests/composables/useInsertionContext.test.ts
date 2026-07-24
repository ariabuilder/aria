import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const selectionTreeRootNodesRef = ref([
  {
    id: "section-1",
    type: "section",
    props: {},
    styles: {},
    children: [],
  },
]);

vi.mock("../../admin/features/Core/composables/useSelectionTreeState", () => ({
  useSelectionTreeState: () => ({
    selectionTreeRootNodes: selectionTreeRootNodesRef,
  }),
}));

describe("useInsertionContext", () => {
  beforeEach(async () => {
    const { useInsertionContext } =
      await import("../../admin/composables/useInsertionContext");

    useInsertionContext().clearInsertionContext();
  });

  it("sets structural insertion context from validated Beacon focus events", async () => {
    const { useInsertionContext } =
      await import("../../admin/composables/useInsertionContext");

    const insertionContext = useInsertionContext();

    window.dispatchEvent(
      new CustomEvent("aria:node-focused", {
        detail: {
          nodeId: "section-1",
          path: [],
          source: "layers",
        },
      }),
    );

    expect(insertionContext.insertionContextId.value).toBe("section-1");
  });

  it("clears insertion context only for validated clear-insertion-context signals", async () => {
    const { useInsertionContext } =
      await import("../../admin/composables/useInsertionContext");

    const insertionContext = useInsertionContext();
    insertionContext.setInsertionContext("section-2", "section");

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: {
          source: "aria-composer",
          type: "clear-insertion-context",
          payload: {},
        },
      }),
    );

    expect(insertionContext.insertionContextId.value).toBeNull();
  });
});
