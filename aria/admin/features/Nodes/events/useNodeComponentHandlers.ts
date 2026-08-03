import type { Ref } from "vue";
import { toast } from "vue-sonner";
import { actions } from "astro:actions";
import type {
  BuilderNode,
  ComponentDSL,
  PageDSL,
  LayoutDSL,
} from "../../../../lib/types/nodes";
import type {
  AddElementPayload,
  DropComponentPayload,
} from "../../../types/app";
import {
  collectNodeIds,
  ensureUniqueNodeIdentities,
} from "../../../../lib/blocks/nodeIdentity";
import { nodeTreeContainsNavigation } from "../../../../lib/blocks/navigationPresetClasses";
import {
  AddElementPayloadSchema,
  GetItemNodesSchema,
} from "./shared/nodeEventSchemas";
import { isEmptyLibraryComponentPayload } from "./shared/libraryComponentGuard";
import {
  insertNodeViaAction,
  resolveInsertPosition,
} from "./shared/insertNodeViaAction";
import {
  cloneDeep,
  findParentAndIndex,
  isComponentInstance,
  normalizeBuilderNode,
} from "./shared/nodeEventTreeUtils";
import type { ExecuteNodeEventOperation } from "./shared/nodeEventHistory";
import { useShellSignalBridge } from "../../Core";
import { useSiteSettings } from "../../../composables/useSiteSettings";
import { log } from "@/lib/utils/logger";
import type { useEditorNodeRegistry } from "../../Core/composables/useEditorNodeRegistry";

interface UseNodeComponentHandlersOptions {
  pageBlocks: Ref<BuilderNode[]>;
  currentPage: Ref<PageDSL | null>;
  currentLayout: Ref<LayoutDSL | null>;
  currentComponent: Ref<ComponentDSL | null>;
  nodeManipulation: {
    findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null;
    regenerateNodeIds: (node: BuilderNode) => BuilderNode;
  };
  executeNodeEventOperation: ExecuteNodeEventOperation;
  setSelectedBlock: (id: string | null) => void;
  getInsertionParentId: () => string | null;
  clearInsertionContext: () => void;
  handleElementAdded: (node: BuilderNode) => string | null;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  getDefaultSlotName: () => string;
  activeSlot?: Ref<{ name: string; scope: "page" | "layout" }>;
  showLayoutSlotGroups?: Ref<boolean>;
  editorNodeRegistry?: ReturnType<typeof useEditorNodeRegistry>;
}

interface EditableComponentTreeContext {
  roots: BuilderNode[];
  commit: (roots: BuilderNode[]) => void;
  node: BuilderNode;
}

export function useNodeComponentHandlers(
  options: UseNodeComponentHandlersOptions,
) {
  const {
    pageBlocks,
    currentPage,
    currentLayout,
    nodeManipulation,
    executeNodeEventOperation,
    setSelectedBlock,
    getInsertionParentId,
    clearInsertionContext,
    handleElementAdded,
    resolveMutationPath,
    getDefaultSlotName,
    activeSlot,
    showLayoutSlotGroups,
    editorNodeRegistry,
  } = options;
  const { broadcastRequestComponentPicker } = useShellSignalBridge();
  const { isReady, loadSettings } = useSiteSettings();

  const prepareNodeForInsertion = (
    source: Partial<BuilderNode>,
    fallbackType: string,
    slot?: string,
  ): BuilderNode => {
    const normalized = normalizeBuilderNode(source, fallbackType, slot);
    const reservedIds = collectNodeIds(pageBlocks.value);
    for (const layoutSlot of currentLayout.value?.slots ?? []) {
      collectNodeIds(layoutSlot.defaultContent ?? [], reservedIds);
    }

    const result = ensureUniqueNodeIdentities([normalized], {
      reservedIds,
    });
    if (result.repairs.length > 0) {
      log("warn", "[NodeIdentity] Regenerated colliding insertion IDs", {
        repairCount: result.repairs.length,
        repairedIds: result.repairs.map((repair) => repair.previousId),
      });
    }

    const prepared = result.nodes[0];
    if (!prepared) {
      throw new Error("Failed to prepare node for insertion");
    }
    return prepared;
  };

  const resolveEditableComponentTree = (
    nodeId: string,
  ): EditableComponentTreeContext | null => {
    const editable = editorNodeRegistry?.getEditableTreeForNode(nodeId);
    const roots = editable?.roots ?? pageBlocks.value;
    const position = findParentAndIndex(roots, nodeId);
    if (!position) {
      return null;
    }

    const targetArray = position.parent?.children ?? roots;
    const node = targetArray[position.index];
    if (!node) {
      return null;
    }

    return {
      roots,
      commit:
        editable?.commit ??
        ((nextRoots) => {
          pageBlocks.value = nextRoots;
        }),
      node,
    };
  };

  const replaceNodeInEditorTree = (
    roots: BuilderNode[],
    nodeId: string,
    replacementNodes: readonly BuilderNode[],
  ): BuilderNode[] | null => {
    const nextRoots = cloneDeep(roots);
    const position = findParentAndIndex(nextRoots, nodeId);
    if (!position) {
      return null;
    }

    const targetArray = position.parent?.children ?? nextRoots;
    targetArray.splice(
      position.index,
      1,
      ...cloneDeep([...replacementNodes]),
    );
    return nextRoots;
  };

  const handleDetachComponent = async (nodeId: string): Promise<void> => {
    const editableTree = resolveEditableComponentTree(nodeId);
    if (!editableTree) {
      toast.error("Not a component instance");
      return;
    }

    const componentNode = editableTree.node;
    if (!isComponentInstance(componentNode)) {
      toast.error("Not a component instance");
      return;
    }

    let detachedChildren: BuilderNode[] = [];

    if (componentNode.children && componentNode.children.length > 0) {
      detachedChildren = cloneDeep(componentNode.children);
    } else {
      const rawMasterId =
        componentNode.reference?.masterId ||
        componentNode.componentRef ||
        componentNode.props?.componentId;
      const masterId =
        typeof rawMasterId === "string" && rawMasterId.trim().length > 0
          ? rawMasterId
          : null;

      if (!masterId) {
        toast.error("Component has no content to detach");
        return;
      }

      try {
        toast.info("Fetching component content...");
        const result = await actions.getItem({
          collection: "components",
          slug: masterId,
        });

        const parsedItem = GetItemNodesSchema.safeParse(result.data);
        if (
          parsedItem.success &&
          parsedItem.data.nodes &&
          parsedItem.data.nodes.length > 0
        ) {
          detachedChildren = parsedItem.data.nodes.map((node: BuilderNode) =>
            nodeManipulation.regenerateNodeIds(node),
          );
        } else {
          toast.error("Component has no content to detach");
          return;
        }
      } catch (error) {
        log("error", "[useNodeComponentHandlers] Failed to fetch component", {
          error: error instanceof Error ? error.message : String(error),
          nodeId,
        });
        toast.error("Failed to fetch component content");
        return;
      }
    }

    if (detachedChildren.length === 0) {
      toast.error("Component has no content to detach");
      return;
    }

    const beforeRoots = cloneDeep(editableTree.roots);
    const afterRoots = replaceNodeInEditorTree(
      beforeRoots,
      nodeId,
      detachedChildren,
    );
    if (!afterRoots) {
      toast.error("Could not find component position");
      return;
    }

    const executeResult = await executeNodeEventOperation(
      {
        type: "update-node",
        description: "Detached component instance",
        affectedNodeIds: [nodeId],
      },
      {
        undo: () => {
          editableTree.commit(cloneDeep(beforeRoots));
          setSelectedBlock(nodeId);
        },
        redo: () => {
          editableTree.commit(cloneDeep(afterRoots));
          setSelectedBlock(null);
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to detach component instance");
      return;
    }

    toast.success("Component instance detached");
  };

  const handleReplaceBlockWithComponent = async (
    nodeId: string,
    componentSlug: string,
  ): Promise<void> => {
    const editableTree = resolveEditableComponentTree(nodeId);
    if (!editableTree) {
      toast.error("Block not found");
      return;
    }
    const sourceNode = editableTree.node;

    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      toast.error("Missing editor context for component conversion");
      return;
    }

    const originalNode = cloneDeep(sourceNode);
    const componentInstanceNode: BuilderNode = {
      id: originalNode.id,
      type: "Component",
      props: {},
      styles: {},
      children: [],
      slot: originalNode.slot,
      componentRef: componentSlug,
      reference: {
        type: "instance",
        masterId: componentSlug,
      },
    };
    const beforeRoots = cloneDeep(editableTree.roots);
    const afterRoots = replaceNodeInEditorTree(beforeRoots, nodeId, [
      componentInstanceNode,
    ]);
    if (!afterRoots) {
      toast.error("Could not find block position");
      return;
    }

    const executeResult = await executeNodeEventOperation(
      {
        type: "update-node",
        description: `Converted ${originalNode.type} to component`,
        affectedNodeIds: [nodeId],
      },
      {
        undo: async () => {
          editableTree.commit(cloneDeep(beforeRoots));
          setSelectedBlock(originalNode.id);
        },
        redo: async () => {
          editableTree.commit(cloneDeep(afterRoots));
          setSelectedBlock(componentInstanceNode.id);
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to replace block");
      return;
    }

    toast.success(`Converted ${originalNode.type} to component`);
  };

  const handleDropComponent = (payload: DropComponentPayload): void => {
    const {
      source,
      componentType,
      componentData,
      slot,
      position,
      componentSlug,
    } = payload;

    log("debug", "[useNodeComponentHandlers] Drop component received", {
      source,
      componentType,
      slot,
      position,
      componentSlug,
      data: componentData,
    });

    const droppedType = String(componentType || "").toLowerCase();
    const droppedNodeType = String(
      (componentData as { type?: string })?.type || "",
    ).toLowerCase();
    const droppedMasterId = (
      componentData as {
        reference?: { masterId?: string };
      }
    )?.reference?.masterId;

    if (
      (droppedType === "component" || droppedNodeType === "component") &&
      !componentSlug &&
      !droppedMasterId
    ) {
      broadcastRequestComponentPicker(slot || getDefaultSlotName());
      return;
    }

    const page = currentPage.value;
    if (!page) {
      toast.error("No active page loaded");
      return;
    }

    const resolvedSlot = slot ?? getDefaultSlotName();
    const newNode = prepareNodeForInsertion(
      componentData,
      String(componentType || "Container"),
      resolvedSlot,
    );

    if (componentSlug) {
      newNode.componentRef = componentSlug;
    }

    const nodesInSlot = page.nodes.filter((node) => node.slot === resolvedSlot);
    const allNodes = page.nodes;
    const positionIndex =
      typeof position === "number" && Number.isFinite(position)
        ? position
        : nodesInSlot.length;

    let insertIndex: number;

    if (positionIndex === 0) {
      const firstNodeInSlot = allNodes.find(
        (node) => node.slot === resolvedSlot,
      );
      insertIndex = firstNodeInSlot
        ? allNodes.indexOf(firstNodeInSlot)
        : allNodes.length;
    } else if (positionIndex >= nodesInSlot.length) {
      const lastNodeInSlot = [...allNodes]
        .reverse()
        .find((node) => node.slot === resolvedSlot);
      insertIndex = lastNodeInSlot
        ? allNodes.indexOf(lastNodeInSlot) + 1
        : allNodes.length;
    } else {
      const targetNode = nodesInSlot[positionIndex];
      insertIndex = allNodes.indexOf(targetNode);
    }

    void executeNodeEventOperation(
      {
        type: "insert-node",
        description: `Add ${newNode.type || componentType} to ${resolvedSlot} slot`,
        affectedNodeIds: [newNode.id],
      },
      {
        undo: () => {
          page.nodes.splice(insertIndex, 1);
          setSelectedBlock(null);
        },
        redo: () => {
          page.nodes.splice(insertIndex, 0, newNode);
          setSelectedBlock(newNode.id);
        },
      },
    ).then((result) => {
      if (!result.success) {
        toast.error(result.error ?? "Failed to drop component");
      }
    });
  };

  const handleAddElement = async (
    payload: AddElementPayload,
  ): Promise<void> => {
    log("debug", "[useNodeComponentHandlers] Add element clicked", {
      ...payload,
    });

    const validation = AddElementPayloadSchema.safeParse(payload);
    if (!validation.success) {
      toast.error(
        validation.error.issues[0]?.message ?? "Invalid add element payload",
      );
      return;
    }

    const validatedPayload = validation.data;

    if (!isReady.value) {
      try {
        await loadSettings();
      } catch (error) {
        log(
          "warn",
          "[useNodeComponentHandlers] Failed to load site settings before add",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    const {
      type,
      data,
      componentSlug,
      parentId: explicitParentId,
      insertionMode = "contextual",
    } = validatedPayload;

    if (isEmptyLibraryComponentPayload(type, data, componentSlug)) {
      broadcastRequestComponentPicker(
        typeof data.slot === "string" && data.slot.trim().length > 0
          ? data.slot
          : getDefaultSlotName(),
      );
      return;
    }

    const newNode = prepareNodeForInsertion(data, type, getDefaultSlotName());

    if (componentSlug) {
      newNode.componentRef = componentSlug;
    }

    if (nodeTreeContainsNavigation(newNode)) {
      const response = await actions.styles.ensureNavigationPresetClasses({});
      if (response.error) {
        toast.error(response.error.message);
        return;
      }
    }

    // Read the current context without changing it. Structural nodes only
    // become insertion targets after their insert succeeds, otherwise a
    // failed insert leaves a parent ID that does not exist in the tree.
    let contextualParentId =
      insertionMode === "contextual" ? getInsertionParentId() : null;
    if (insertionMode === "contextual" && contextualParentId) {
      const locatedContext = editorNodeRegistry?.locateNode(contextualParentId);
      const contextExists = Boolean(
        locatedContext ??
        nodeManipulation.findNodeById(pageBlocks.value, contextualParentId),
      );
      const contextIsInActiveSlot =
        !activeSlot ||
        !locatedContext ||
        locatedContext.store.slotName === activeSlot.value.name;

      if (!contextExists || !contextIsInActiveSlot) {
        clearInsertionContext();
        contextualParentId = null;
      }
    }
    const parentId =
      insertionMode === "root"
        ? null
        : (explicitParentId ?? contextualParentId ?? null);
    const insertPosition = resolveInsertPosition(
      pageBlocks.value,
      parentId,
      validatedPayload.position,
      nodeManipulation.findNodeById,
    );

    const insertResult = await insertNodeViaAction(
      {
        pageBlocks,
        currentLayout,
        activeSlot,
        showLayoutSlotGroups,
        editorNodeRegistry,
        executeNodeEventOperation,
        setSelectedBlock,
        resolveMutationPath,
        findNodeById: nodeManipulation.findNodeById,
      },
      {
        newNode,
        parentId,
        insertPosition,
        historyDescription: `Add ${type}${parentId ? " (nested)" : ""}`,
      },
    );

    if (!insertResult.ok) {
      toast.error(insertResult.message);
      return;
    }

    handleElementAdded(newNode);
    toast.success(`Added ${type}${parentId ? " (nested)" : ""}`);
  };

  return {
    handleDetachComponent,
    handleReplaceBlockWithComponent,
    handleDropComponent,
    handleAddElement,
  };
}
