import { type Ref } from "vue";

import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import type { useHistory } from "../../History";
import { useNodeEventHandlers } from "../../Nodes/events/useNodeEventHandlers";
import { useNodeManipulation } from "../../Nodes/mutations/useNodeManipulation";

import { useEditorMutationHandlers } from "./useEditorMutationHandlers";
import { useActiveLayoutSlot } from "./useActiveLayoutSlot";
import { useEditorNodeRegistry } from "./useEditorNodeRegistry";

export interface UseAppEditorRuntimeDeps {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  currentItemType: Ref<"page" | "layout" | "component">;
  hasUnsavedChanges: Ref<boolean>;
  history: ReturnType<typeof useHistory>;
  focusNode: (id: string | null) => void;
  showLayoutSlotGroups?: Ref<boolean>;
}

export interface UseAppEditorRuntimeReturn {
  nodeManipulation: ReturnType<typeof useNodeManipulation>;
  nodeEventHandlers: ReturnType<typeof useNodeEventHandlers>;
  editorMutationHandlers: ReturnType<typeof useEditorMutationHandlers>;
  activeLayoutSlot: ReturnType<typeof useActiveLayoutSlot>;
  editorNodeRegistry: ReturnType<typeof useEditorNodeRegistry>;
}

export function useAppEditorRuntime(
  deps: UseAppEditorRuntimeDeps,
): UseAppEditorRuntimeReturn {
  const activeLayoutSlot = useActiveLayoutSlot({
    currentLayout: deps.currentLayout,
    currentItemType: deps.currentItemType,
  });

  const editorNodeRegistry = useEditorNodeRegistry({
    pageBlocks: deps.pageBlocks,
    currentLayout: deps.currentLayout,
    activeSlot: activeLayoutSlot.activeSlot,
    currentItemType: deps.currentItemType,
  });

  const nodeManipulation = useNodeManipulation(deps.pageBlocks);
  const nodeEventHandlers = useNodeEventHandlers(
    deps.pageBlocks,
    deps.currentPage,
    deps.currentComponent,
    deps.currentItemType,
    deps.currentLayout,
    {
      activeSlot: activeLayoutSlot.activeSlot,
      editorNodeRegistry,
      showLayoutSlotGroups: deps.showLayoutSlotGroups,
    },
  );
  const editorMutationHandlers = useEditorMutationHandlers({
    pageBlocks: deps.pageBlocks,
    hasUnsavedChanges: deps.hasUnsavedChanges,
    history: deps.history,
    nodeManipulation,
    nodeEventHandlers,
    focusNode: deps.focusNode,
  });

  return {
    nodeManipulation,
    nodeEventHandlers,
    editorMutationHandlers,
    activeLayoutSlot,
    editorNodeRegistry,
  };
}
