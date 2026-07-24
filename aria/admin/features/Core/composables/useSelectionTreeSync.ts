import { watch, type Ref } from "vue";

import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import type { EditorNodeRegistry } from "../types/injectionKeys";
import { useSelectionTreeState } from "./useSelectionTreeState";

export interface UseSelectionTreeSyncOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentLayout: Ref<LayoutDSL | null>;
  editorNodeRegistry: EditorNodeRegistry;
}

export function useSelectionTreeSync(options: UseSelectionTreeSyncOptions): void {
  const { pageBlocks, currentLayout, editorNodeRegistry } = options;
  const { setSelectionTreeRootNodes } = useSelectionTreeState();

  watch(
    [pageBlocks, currentLayout],
    () => {
      setSelectionTreeRootNodes(editorNodeRegistry.getSelectionTreeRoots());
    },
    { immediate: true, deep: true },
  );
}
