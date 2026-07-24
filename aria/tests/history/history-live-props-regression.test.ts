import { describe, it, expect, beforeEach } from "vitest";
import { useBeacon } from "../../admin/features/Beacon/composables/useBeacon";
import type { BuilderNode } from "../../lib/types/nodes";

function createTextNode(id: string, content: string): BuilderNode {
  return {
    id,
    type: "text",
    props: { content },
    styles: {},
    children: [],
  };
}

function flushMessageQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function dispatchComposerMessage(type: string, payload: unknown): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: window.location.origin,
      data: {
        source: "aria-composer",
        type,
        payload,
      },
    }),
  );
}

describe("History regression - live update-props should not pre-mutate beacon state", () => {
  beforeEach(() => {
    const beacon = useBeacon();
    beacon.dim();
    beacon.setRootNodes([]);
  });

  it("keeps selected node props unchanged for source-tagged live updates, then applies persisted updates", async () => {
    const beacon = useBeacon();
    const node = createTextNode("node-1", "Original");

    beacon.setRootNodes([node]);
    expect(beacon.illuminateById("node-1", [node])).toBe(true);
    expect(beacon.focusedNode.value?.props.content).toBe("Original");

    dispatchComposerMessage("update-props", {
      nodeId: "node-1",
      props: { content: "Live typing" },
      source: "inspector-live",
    });

    await flushMessageQueue();

    expect(beacon.focusedNode.value?.props.content).toBe("Original");
    expect(node.props.content).toBe("Original");

    dispatchComposerMessage("update-props", {
      nodeId: "node-1",
      props: { content: "Persisted" },
    });

    await flushMessageQueue();

    expect(beacon.focusedNode.value?.props.content).toBe("Persisted");
    expect(node.props.content).toBe("Persisted");
  });

  it("tracks primary and selected node ids when replacing selection", async () => {
    const beacon = useBeacon();
    const firstNode = createTextNode("node-1", "First");
    const secondNode = createTextNode("node-2", "Second");

    beacon.setRootNodes([firstNode, secondNode]);
    beacon.replaceSelection(["node-1", "node-2"], {
      primarySelectedNodeId: "node-2",
      selectionAnchorNodeId: "node-1",
      emitFocusSignal: false,
    });

    expect(beacon.focusedNodeId.value).toBe("node-2");
    expect(beacon.primarySelectedNodeId.value).toBe("node-2");
    expect(beacon.selectedNodeIds.value).toEqual(["node-1", "node-2"]);
    expect(beacon.selectionAnchorNodeId.value).toBe("node-1");

    beacon.toggleSelection("node-2");

    expect(beacon.focusedNodeId.value).toBe("node-1");
    expect(beacon.selectedNodeIds.value).toEqual(["node-1"]);
    expect(beacon.selectionAnchorNodeId.value).toBe("node-1");
  });
});
