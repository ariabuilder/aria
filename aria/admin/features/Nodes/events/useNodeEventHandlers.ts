/**
 * UseNodeEventHandlers. ts Facade for node event
 * handlers (CRUD, components, reorder, structure).
 */

import type { Ref } from "vue";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../lib/types/nodes";
import { useNodeManipulation } from "../mutations/useNodeManipulation";
import { useCanvasInteractions } from "./shared/useCanvasInteractions";
import { useBeacon } from "../../Beacon";
import { useInsertionContext } from "../../../composables/useInsertionContext";
import { useNodeEventHistory } from "./shared/nodeEventHistory";
import {
  createDefaultSlotNameResolver,
  resolveMutationPath,
} from "./shared/nodeEventContext";
import { useNodeCrudHandlers } from "./useNodeCrudHandlers";
import { useNodeComponentHandlers } from "./useNodeComponentHandlers";
import { useNodeReorderHandlers } from "./useNodeReorderHandlers";
import { useNodeStructureHandlers } from "./useNodeStructureHandlers";
import { useNodeSwap } from "../composables/useNodeSwap";

export interface NodeEventHandlersSlotContext {
  activeSlot: Ref<{ name: string; scope: "page" | "layout" }>;
  editorNodeRegistry: ReturnType<
    typeof import("../../Core/composables/useEditorNodeRegistry").useEditorNodeRegistry
  >;
  showLayoutSlotGroups?: Ref<boolean>;
}

export function useNodeEventHandlers(
  pageBlocks: Ref<BuilderNode[]>,
  currentPage: Ref<PageDSL | null>,
  currentComponent: Ref<ComponentDSL | null>,
  currentItemType: Ref<"page" | "layout" | "component">,
  currentLayout: Ref<LayoutDSL | null>,
  slotContext?: NodeEventHandlersSlotContext,
) {
  const { executeNodeEventOperation } = useNodeEventHistory();
  const nodeManipulation = useNodeManipulation(pageBlocks);
  const { copyNode, peekClipboard, clearClipboard, cloneNode } =
    useCanvasInteractions();
  const { illuminate, selectedNodeIds } = useBeacon();
  const {
    getInsertionParentId,
    clearInsertionContext,
    handleElementAdded,
  } = useInsertionContext();

  const resolveLayoutDefaultSlotName = createDefaultSlotNameResolver(currentLayout);

  const getDefaultSlotName = () => {
    if (slotContext?.showLayoutSlotGroups?.value === false) {
      return resolveLayoutDefaultSlotName();
    }

    return (
      slotContext?.activeSlot.value.name ?? resolveLayoutDefaultSlotName()
    );
  };

  const findEditorNode = (nodeId: string) =>
    slotContext?.editorNodeRegistry.findNode(nodeId) ??
    nodeManipulation.findNodeById(pageBlocks.value, nodeId);
  const getMutationPath = () =>
    resolveMutationPath({
      currentPage,
      currentComponent,
      currentItemType,
    });

  const crudHandlers = useNodeCrudHandlers({
    pageBlocks,
    nodeManipulation: {
      ...nodeManipulation,
      findNodeById: (_nodes: BuilderNode[], id: string) => findEditorNode(id),
    },
    executeNodeEventOperation,
    setSelectedBlock: illuminate,
    copyNode,
    peekClipboard,
    clearClipboard,
    cloneNode,
    getDefaultSlotName,
    activeSlot: slotContext?.activeSlot,
    currentLayout,
    editorNodeRegistry: slotContext?.editorNodeRegistry,
    resolveMutationPath: getMutationPath,
  });

  const componentHandlers = useNodeComponentHandlers({
    pageBlocks,
    currentPage,
    currentLayout,
    currentComponent,
    nodeManipulation: {
      ...nodeManipulation,
      findNodeById: (_nodes: BuilderNode[], id: string) => findEditorNode(id),
    },
    executeNodeEventOperation,
    setSelectedBlock: illuminate,
    getInsertionParentId,
    clearInsertionContext,
    handleElementAdded,
    resolveMutationPath: getMutationPath,
    getDefaultSlotName,
    activeSlot: slotContext?.activeSlot,
    showLayoutSlotGroups: slotContext?.showLayoutSlotGroups,
    editorNodeRegistry: slotContext?.editorNodeRegistry,
  });

  const reorderHandlers = useNodeReorderHandlers({
    pageBlocks,
    currentPage,
    executeNodeEventOperation,
  });

  const structureHandlers = useNodeStructureHandlers({
    pageBlocks,
    nodeManipulation: {
      ...nodeManipulation,
      findNodeById: (_nodes: BuilderNode[], id: string) => findEditorNode(id),
    },
    executeNodeEventOperation,
    setSelectedBlock: illuminate,
    getSelectedNodeIds: () => [...selectedNodeIds.value],
    editorNodeRegistry: slotContext?.editorNodeRegistry,
  });

  const swapHandlers = useNodeSwap({
    pageBlocks,
    currentLayout,
    executeNodeEventOperation,
    setSelectedBlock: illuminate,
    resolveMutationPath: getMutationPath,
    editorNodeRegistry: slotContext?.editorNodeRegistry,
  });

  return {
    ...crudHandlers,
    ...componentHandlers,
    ...reorderHandlers,
    ...structureHandlers,
    ...swapHandlers,
    executeNodeEventOperation,
    resolveMutationPath: getMutationPath,
  };
}
