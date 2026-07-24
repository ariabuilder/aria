import { ref } from "vue";

import type { BuilderNode } from "../../../../lib/types/nodes";

const selectionTreeRootNodes = ref<BuilderNode[]>([]);

export function useSelectionTreeState() {
  function setSelectionTreeRootNodes(nodes: BuilderNode[]): void {
    selectionTreeRootNodes.value = nodes;
  }

  return {
    selectionTreeRootNodes,
    setSelectionTreeRootNodes,
  };
}
