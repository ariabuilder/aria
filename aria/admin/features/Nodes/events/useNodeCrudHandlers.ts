import type { Ref } from "vue";
import { toast } from "vue-sonner";
import { actions } from "astro:actions";
import type { BuilderNode, LayoutDSL } from "../../../../lib/types/nodes";
import { normalizeRootNodeForSlot } from "../../../../lib/layouts/slotEditing";
import type { ActiveLayoutSlot } from "../../../../lib/schemas/slotEditing";
import type { useEditorNodeRegistry } from "../../Core/composables/useEditorNodeRegistry";
import {
  insertNode as insertNodeInTree,
  insertNodes as insertNodesInTree,
  deleteNodeById,
  deleteNodesById as deleteNodesInTree,
} from "../../../../lib/blocks/nodeUtils";
import {
  importHtmlToNodes as importHtmlToNodesDefault,
  type HtmlToNodesImportResult,
} from "../../../../lib/blocks/htmlToNodes";
import { isLikelyUtilityClassName } from "../../../../lib/styles/utilityClassDetection";
import { isStructuralContainerNodeType } from "../../../../lib/blocks/containerTypes";
import { isNodeInLayoutDefaultSlot } from "../../../../lib/layouts/resolveNodeSlot";
import { isLeafNodeType } from "../../Layers/utils/nodeHelpers";
import {
  NodeIdInputSchema,
  PasteTargetInputSchema,
} from "./shared/nodeEventSchemas";
import { findParentAndIndex } from "./shared/nodeEventTreeUtils";
import type { ExecuteNodeEventOperation } from "./shared/nodeEventHistory";
import {
  buildMarkupCandidates,
  detectTokenizedMarkupImport,
  HTML_PASTE_COMPLETE_EVENT,
  importHtmlFromClipboard,
} from "./clipboardMarkup";

type EditorNodeRegistry = ReturnType<typeof useEditorNodeRegistry>;

interface EditorParentContext {
  parent: BuilderNode | null;
  index: number;
  roots: BuilderNode[];
  commitTree: (roots: BuilderNode[]) => void;
  usesRegistry: boolean;
  /** Slot whose root list receives top-level inserts (parentId === null). */
  rootSlotName: string;
}

interface UseNodeCrudHandlersOptions {
  pageBlocks: Ref<BuilderNode[]>;
  nodeManipulation: {
    findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null;
    regenerateNodeIds: (node: BuilderNode) => BuilderNode;
  };
  executeNodeEventOperation: ExecuteNodeEventOperation;
  setSelectedBlock: (id: string | null) => void;
  copyNode: (node: BuilderNode) => void;
  peekClipboard: () => BuilderNode | null;
  clearClipboard?: () => void;
  cloneNode: (
    node: BuilderNode,
    options?: { regenerateIds?: boolean },
  ) => BuilderNode;
  getDefaultSlotName?: () => string;
  activeSlot?: Ref<ActiveLayoutSlot>;
  currentLayout?: Ref<LayoutDSL | null>;
  editorNodeRegistry?: EditorNodeRegistry;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  readClipboardText?: () => Promise<string>;
  importHtmlToNodes?: (html: string) => Promise<HtmlToNodesImportResult>;
}

interface HandlePasteBlockOptions {
  clipboardText?: string;
  clipboardHtml?: string;
}

function resolveTopLevelPasteSlot(
  targetNode: BuilderNode | null,
  getDefaultSlotName: () => string,
): string {
  const targetSlot =
    typeof targetNode?.slot === "string" ? targetNode.slot.trim() : "";

  return targetSlot || getDefaultSlotName();
}

function isNodeInDefaultRootSlot(
  node: BuilderNode,
  slotName: string,
  layout?: { slots?: { name: string; isDefault?: boolean }[] } | null,
): boolean {
  if (layout?.slots?.length) {
    return isNodeInLayoutDefaultSlot(node, layout);
  }
  return !node.slot || node.slot === slotName || node.slot === "default";
}

function resolveDefaultRootInsertIndex(
  nodes: BuilderNode[],
  defaultSlotName: string,
): number {
  const lastNodeInDefaultSlot = [...nodes]
    .reverse()
    .find((node) => isNodeInDefaultRootSlot(node, defaultSlotName));

  return lastNodeInDefaultSlot
    ? nodes.indexOf(lastNodeInDefaultSlot) + 1
    : nodes.length;
}

function assignTopLevelSlot(
  node: BuilderNode,
  slotName: string,
  layout?: LayoutDSL | null,
): BuilderNode {
  if (layout?.slots?.length) {
    return normalizeRootNodeForSlot(node, slotName, layout);
  }
  return {
    ...node,
    slot: slotName,
  };
}

function layoutUsesNodeRegistry(
  editorNodeRegistry: EditorNodeRegistry | undefined,
  currentLayout: Ref<LayoutDSL | null> | undefined,
): boolean {
  return Boolean(
    editorNodeRegistry && (currentLayout?.value?.slots?.length ?? 0) > 0,
  );
}

function findNodeInEditor(
  editorNodeRegistry: EditorNodeRegistry | undefined,
  pageBlocks: readonly BuilderNode[],
  findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null,
  nodeId: string,
): BuilderNode | null {
  return (
    editorNodeRegistry?.findNode(nodeId) ??
    findNodeById([...pageBlocks], nodeId)
  );
}

function readClipboardTextFromNavigator(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return Promise.resolve("");
  }

  return navigator.clipboard.readText();
}

async function ensureImportedCustomClasses(
  classNames: string[],
): Promise<void> {
  const uniqueClassNames = Array.from(new Set(classNames.filter(Boolean)));

  for (const className of uniqueClassNames) {
    if (isLikelyUtilityClassName(className)) {
      continue;
    }

    const response = await actions.styles.createClass({
      name: className,
      description: "Imported from pasted HTML",
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    const payload = response.data as
      | { success?: boolean; error?: { message?: string; code?: string } }
      | undefined;
    if (payload?.success === false && payload.error?.code !== "CLASS_EXISTS") {
      throw new Error(
        payload.error?.message ?? `Failed to create ${className}`,
      );
    }
  }
}

function hasImportChanges(result: HtmlToNodesImportResult): boolean {
  return (
    result.report.removedAttributes.length > 0 ||
    result.report.removedElements.length > 0 ||
    result.report.rejectedStyleBlocks > 0
  );
}

function buildPasteImportToastMessage(
  insertedCount: number,
  imported: HtmlToNodesImportResult,
): string {
  const extractedStyles = imported.report.extractedStyleBlocks;
  const nodeLabel =
    insertedCount === 1
      ? "Pasted 1 imported node"
      : `Pasted ${insertedCount} imported nodes`;

  if (extractedStyles === 0) {
    return nodeLabel;
  }

  const styleLabel =
    extractedStyles === 1
      ? "1 style block as Code (render enabled)"
      : `${extractedStyles} style blocks as Code (render enabled)`;

  return `${nodeLabel} — imported ${styleLabel}`;
}

async function readClipboardHtmlFromNavigator(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return "";
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (!item.types.includes("text/html")) {
        continue;
      }

      const blob = await item.getType("text/html");
      return (await blob.text()).trim();
    }
  } catch {
    return "";
  }

  return "";
}

function countImportedNodes(nodes: BuilderNode[]): number {
  let count = 0;

  const walk = (node: BuilderNode): void => {
    count += 1;
    node.children?.forEach(walk);
  };

  nodes.forEach(walk);
  return count;
}

function isLargeHtmlImport(nodes: BuilderNode[]): boolean {
  if (nodes.length > 1) {
    return true;
  }

  const [root] = nodes;
  if (!root) {
    return false;
  }

  const rootType = root.type?.toLowerCase() ?? "";
  if (
    ["footer", "header", "section", "article", "main", "nav", "aside"].includes(
      rootType,
    )
  ) {
    return true;
  }

  return countImportedNodes(nodes) > 12;
}

function resolveHtmlPasteInsertion(
  targetNode: BuilderNode | null,
  targetResult: { parent: BuilderNode | null; index: number } | null,
  importedNodes: BuilderNode[],
  searchRoots: BuilderNode[],
  defaultRootInsertIndex: number,
): { parentId: string | null; insertIndex: number } {
  if (!targetNode || !targetResult) {
    return { parentId: null, insertIndex: defaultRootInsertIndex };
  }

  const { parent, index } = targetResult;
  const targetType = targetNode.type ?? "";

  const parentType = parent?.type ?? "";
  const shouldReparentLargePaste =
    isLargeHtmlImport(importedNodes) &&
    parent &&
    parentType.toLowerCase() === "link";

  if (isLeafNodeType(targetType) || shouldReparentLargePaste) {
    if (!parent) {
      return { parentId: null, insertIndex: defaultRootInsertIndex };
    }

    const parentResult = findParentAndIndex(searchRoots, parent.id);
    if (!parentResult) {
      return { parentId: null, insertIndex: defaultRootInsertIndex };
    }

    return {
      parentId: parentResult.parent?.id ?? null,
      insertIndex: parentResult.index + 1,
    };
  }

  if (
    isStructuralContainerNodeType(targetType) &&
    !isLeafNodeType(targetType)
  ) {
    return {
      parentId: targetNode.id,
      insertIndex: targetNode.children?.length ?? 0,
    };
  }

  return {
    parentId: parent?.id ?? null,
    insertIndex: index + 1,
  };
}

export function useNodeCrudHandlers(options: UseNodeCrudHandlersOptions) {
  const {
    pageBlocks,
    nodeManipulation,
    executeNodeEventOperation,
    setSelectedBlock,
    copyNode,
    peekClipboard,
    clearClipboard,
    cloneNode,
    getDefaultSlotName = () => "default",
    currentLayout,
    editorNodeRegistry,
    resolveMutationPath,
    readClipboardText = readClipboardTextFromNavigator,
    importHtmlToNodes = importHtmlToNodesDefault,
  } = options;

  const resolveEditorParentContext = (
    nodeId: string,
  ): EditorParentContext | null => {
    if (editorNodeRegistry) {
      const editable = editorNodeRegistry.getEditableTreeForNode(nodeId);
      if (editable) {
        const parentResult = findParentAndIndex(editable.roots, nodeId);
        if (!parentResult) {
          return null;
        }

        const located = editorNodeRegistry.locateNode(nodeId);
        const usesRegistry = layoutUsesNodeRegistry(
          editorNodeRegistry,
          currentLayout,
        );
        const rootSlotName = located?.store.slotName ?? getDefaultSlotName();

        return {
          parent: parentResult.parent,
          index: parentResult.index,
          roots: editable.roots,
          commitTree: editable.commit,
          usesRegistry,
          rootSlotName,
        };
      }
    }

    const parentResult = findParentAndIndex(pageBlocks.value, nodeId);
    if (!parentResult) {
      return null;
    }

    return {
      parent: parentResult.parent,
      index: parentResult.index,
      roots: pageBlocks.value,
      commitTree: (roots) => {
        pageBlocks.value = roots;
      },
      usesRegistry: false,
      rootSlotName: getDefaultSlotName(),
    };
  };

  const resolveRootPasteContext = (): {
    roots: BuilderNode[];
    defaultRootInsertIndex: number;
    usesRegistry: boolean;
    topLevelPasteSlot: string;
    commitTree: (roots: BuilderNode[]) => void;
    rootSlotName: string;
  } => {
    const slotName = getDefaultSlotName();
    const usesRegistry = layoutUsesNodeRegistry(
      editorNodeRegistry,
      currentLayout,
    );

    if (usesRegistry && editorNodeRegistry) {
      const roots = editorNodeRegistry.getEditableNodesForSlot(slotName);
      return {
        roots,
        defaultRootInsertIndex: resolveDefaultRootInsertIndex(roots, slotName),
        usesRegistry: true,
        topLevelPasteSlot: slotName,
        rootSlotName: slotName,
        commitTree: (nextRoots) => {
          editorNodeRegistry.setRootNodesForSlot(slotName, nextRoots);
        },
      };
    }

    return {
      roots: pageBlocks.value,
      defaultRootInsertIndex: resolveDefaultRootInsertIndex(
        pageBlocks.value,
        slotName,
      ),
      usesRegistry: false,
      topLevelPasteSlot: slotName,
      rootSlotName: slotName,
      commitTree: (nextRoots) => {
        pageBlocks.value = nextRoots;
      },
    };
  };

  const insertNodeInEditor = (
    parentId: string | null,
    node: BuilderNode,
    insertIndex: number,
    context: EditorParentContext | null,
  ): void => {
    if (context?.usesRegistry && editorNodeRegistry) {
      const slotName = context.rootSlotName;
      const roots = [...editorNodeRegistry.getEditableNodesForSlot(slotName)];

      if (parentId === null) {
        roots.splice(insertIndex, 0, node);
        editorNodeRegistry.setRootNodesForSlot(slotName, roots);
        return;
      }

      const next = insertNodeInTree(roots, parentId, node, insertIndex);
      context.commitTree(next);
      return;
    }

    pageBlocks.value = insertNodeInTree(
      pageBlocks.value,
      parentId,
      node,
      insertIndex,
    );
  };

  const deleteNodeFromEditor = (nodeId: string): boolean => {
    if (editorNodeRegistry?.deleteFromRegistry(nodeId)) {
      return true;
    }
    pageBlocks.value = deleteNodeById(pageBlocks.value, nodeId);
    return true;
  };

  const handleDeleteBlock = async (nodeId: string): Promise<void> => {
    const validation = NodeIdInputSchema.safeParse({ nodeId });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Invalid node id");
      return;
    }

    const validatedNodeId = validation.data.nodeId;
    const nodeToDelete = findNodeInEditor(
      editorNodeRegistry,
      pageBlocks.value,
      nodeManipulation.findNodeById,
      validatedNodeId,
    );
    if (!nodeToDelete) {
      toast.error("Block not found");
      return;
    }

    const editorContext = resolveEditorParentContext(validatedNodeId);
    if (!editorContext) {
      toast.error("Could not find block to delete");
      return;
    }

    const { parent, index } = editorContext;
    const deletedBlock = nodeToDelete;
    const parentId = parent?.id || null;
    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      toast.error("Missing editor context for delete operation");
      return;
    }

    const executeResult = await executeNodeEventOperation(
      {
        type: "delete-node",
        description: `Deleted ${deletedBlock.type} block`,
        affectedNodeIds: [validatedNodeId],
      },
      {
        undo: async () => {
          if (editorContext.usesRegistry) {
            insertNodeInEditor(parentId, deletedBlock, index, editorContext);
            setSelectedBlock(validatedNodeId);
            return;
          }

          const response = await actions.insertNode({
            collection: mutationPath.collection,
            id: mutationPath.id,
            parentId,
            node: deletedBlock,
            position: index,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = insertNodeInTree(
            pageBlocks.value,
            parentId,
            deletedBlock,
            index,
          );
          setSelectedBlock(validatedNodeId);
        },
        redo: async () => {
          if (editorContext.usesRegistry) {
            deleteNodeFromEditor(validatedNodeId);
            setSelectedBlock(null);
            return;
          }

          const response = await actions.deleteNode({
            collection: mutationPath.collection,
            id: mutationPath.id,
            nodeId: validatedNodeId,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = deleteNodeById(pageBlocks.value, validatedNodeId);
          setSelectedBlock(null);
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to delete block");
      return;
    }

    toast.success(`Deleted ${deletedBlock.type} block`);
  };

  const handleDeleteBlocks = async (nodeIds: string[]): Promise<void> => {
    const validatedNodeIds: string[] = [];
    for (const nodeId of nodeIds) {
      const validation = NodeIdInputSchema.safeParse({ nodeId });
      if (!validation.success) {
        toast.error(validation.error.issues[0]?.message ?? "Invalid node id");
        return;
      }
      validatedNodeIds.push(validation.data.nodeId);
    }

    if (validatedNodeIds.length === 0) return;

    for (const nodeId of validatedNodeIds) {
      const node = findNodeInEditor(
        editorNodeRegistry,
        pageBlocks.value,
        nodeManipulation.findNodeById,
        nodeId,
      );
      if (!node) {
        toast.error("Block not found");
        return;
      }
    }

    const editorContext = resolveEditorParentContext(validatedNodeIds[0]);
    if (!editorContext) {
      toast.error("Could not find block to delete");
      return;
    }

    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      toast.error("Missing editor context for delete operation");
      return;
    }

    // Snapshot deleted nodes for undo — capture positions + full editor context
    // BEFORE the delete so undo can re-insert accurately
    const positions: {
      parentId: string | null;
      index: number;
      node: BuilderNode;
      editorContext: EditorParentContext | null;
    }[] = [];

    for (const nodeId of validatedNodeIds) {
      const node = findNodeInEditor(
        editorNodeRegistry,
        pageBlocks.value,
        nodeManipulation.findNodeById,
        nodeId,
      );
      if (!node) continue;
      const ctx = resolveEditorParentContext(nodeId);
      if (!ctx) continue;
      const { parent, index } = ctx;
      const parentId = parent?.id || null;
      positions.push({ parentId, index, node, editorContext: ctx });
    }

    // Sort descending by index so undo re-inserts largest indices first,
    // preventing earlier insertions from shifting later target positions
    positions.sort((a, b) => b.index - a.index);

    const executeResult = await executeNodeEventOperation(
      {
        type: "delete-node",
        description: `Deleted ${validatedNodeIds.length} block${validatedNodeIds.length === 1 ? "" : "s"}`,
        affectedNodeIds: validatedNodeIds,
      },
      {
        undo: async () => {
          if (editorContext.usesRegistry) {
            // Use captured editor context from snapshot — nodes are deleted
            // so re-resolving the parent context would fail
            for (const pos of positions) {
              if (!pos.editorContext) continue;
              insertNodeInEditor(
                pos.parentId,
                pos.node,
                pos.index,
                pos.editorContext,
              );
            }
            return;
          }

          // Re-insert in descending index order so earlier insertions
          // don't shift the target indices of later insertions
          for (const pos of positions) {
            const response = await actions.insertNode({
              collection: mutationPath.collection,
              id: mutationPath.id,
              parentId: pos.parentId,
              node: pos.node,
              position: pos.index,
            });
            if (response.error) {
              throw new Error(response.error.message);
            }
            pageBlocks.value = insertNodeInTree(
              pageBlocks.value,
              pos.parentId,
              pos.node,
              pos.index,
            );
          }
        },
        redo: async () => {
          if (editorContext.usesRegistry) {
            for (const nodeId of validatedNodeIds) {
              deleteNodeFromEditor(nodeId);
            }
            return;
          }

          const response = await actions.deleteNodes({
            collection: mutationPath.collection,
            id: mutationPath.id,
            nodeIds: validatedNodeIds,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = deleteNodesInTree(
            pageBlocks.value,
            validatedNodeIds,
          );
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to delete blocks");
      return;
    }

    // No success toast — this is a background operation
  };

  const handleDuplicateBlock = async (nodeId: string): Promise<void> => {
    const validation = NodeIdInputSchema.safeParse({ nodeId });
    if (!validation.success) {
      toast.error(validation.error.issues[0]?.message ?? "Invalid node id");
      return;
    }

    const validatedNodeId = validation.data.nodeId;
    const nodeToDuplicate = findNodeInEditor(
      editorNodeRegistry,
      pageBlocks.value,
      nodeManipulation.findNodeById,
      validatedNodeId,
    );
    if (!nodeToDuplicate) {
      toast.error("Block not found");
      return;
    }

    const clonedNode = nodeManipulation.regenerateNodeIds(nodeToDuplicate);
    const editorContext = resolveEditorParentContext(validatedNodeId);
    if (!editorContext) {
      toast.error("Could not find insertion point");
      return;
    }

    const { parent, index } = editorContext;
    const parentId = parent?.id || null;
    const insertIndex = index + 1;
    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      toast.error("Missing editor context for duplicate operation");
      return;
    }

    const executeResult = await executeNodeEventOperation(
      {
        type: "insert-node",
        description: `Duplicated ${nodeToDuplicate.type} block`,
        affectedNodeIds: [clonedNode.id],
      },
      {
        undo: async () => {
          if (editorContext.usesRegistry) {
            deleteNodeFromEditor(clonedNode.id);
            return;
          }

          const response = await actions.deleteNode({
            collection: mutationPath.collection,
            id: mutationPath.id,
            nodeId: clonedNode.id,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = deleteNodeById(pageBlocks.value, clonedNode.id);
        },
        redo: async () => {
          if (editorContext.usesRegistry) {
            insertNodeInEditor(
              parentId,
              clonedNode,
              insertIndex,
              editorContext,
            );
            setSelectedBlock(clonedNode.id);
            return;
          }

          const response = await actions.insertNode({
            collection: mutationPath.collection,
            id: mutationPath.id,
            parentId,
            node: clonedNode,
            position: insertIndex,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = insertNodeInTree(
            pageBlocks.value,
            parentId,
            clonedNode,
            insertIndex,
          );
          setSelectedBlock(clonedNode.id);
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to duplicate block");
      return;
    }

    toast.success(`Duplicated ${nodeToDuplicate.type} block`);
  };

  const handleCopyBlock = (nodeId: string): void => {
    const node = nodeManipulation.findNodeById(pageBlocks.value, nodeId);
    if (!node) {
      return;
    }
    copyNode(node);
    toast.success("Copied to clipboard");
  };

  const handlePasteBlock = async (
    targetNodeId?: string | null,
    pasteOptions?: HandlePasteBlockOptions,
  ): Promise<void> => {
    const validatedTargetId = (() => {
      if (
        typeof targetNodeId !== "string" ||
        targetNodeId.trim().length === 0
      ) {
        return null;
      }

      const validation = PasteTargetInputSchema.safeParse({ targetNodeId });
      if (!validation.success) {
        toast.error(
          validation.error.issues[0]?.message ?? "Invalid paste target id",
        );
        return null;
      }

      return validation.data.targetNodeId;
    })();

    const clipboardNode = peekClipboard();

    const eventPlain = pasteOptions?.clipboardText?.trim() ?? "";
    const eventHtml = pasteOptions?.clipboardHtml?.trim() ?? "";
    const hasEventMarkupCandidates =
      buildMarkupCandidates({
        clipboardText: eventPlain,
        clipboardHtml: eventHtml,
      }).length > 0;

    let systemHasHtml = hasEventMarkupCandidates;
    if (!systemHasHtml && !eventPlain && !eventHtml) {
      const navigatorText = await readClipboardText();
      const navigatorHtml = await readClipboardHtmlFromNavigator();
      systemHasHtml =
        buildMarkupCandidates(undefined, {
          plain: navigatorText,
          html: navigatorHtml,
        }).length > 0;
    }

    const targetNode = validatedTargetId
      ? findNodeInEditor(
          editorNodeRegistry,
          pageBlocks.value,
          nodeManipulation.findNodeById,
          validatedTargetId,
        )
      : null;
    if (validatedTargetId && !targetNode) return;

    const editorContext = validatedTargetId
      ? resolveEditorParentContext(validatedTargetId)
      : null;
    if (validatedTargetId && !editorContext) return;

    const rootPasteContext = validatedTargetId
      ? null
      : resolveRootPasteContext();

    const result = editorContext
      ? { parent: editorContext.parent, index: editorContext.index }
      : null;

    const topLevelPasteSlot = !result?.parent?.id
      ? resolveTopLevelPasteSlot(targetNode, getDefaultSlotName)
      : null;
    const defaultRootInsertIndex = rootPasteContext
      ? rootPasteContext.defaultRootInsertIndex
      : editorContext &&
          layoutUsesNodeRegistry(editorNodeRegistry, currentLayout) &&
          editorNodeRegistry
        ? resolveDefaultRootInsertIndex(
            editorNodeRegistry.getEditableNodesForSlot(editorContext.rootSlotName),
            editorContext.rootSlotName,
          )
        : resolveDefaultRootInsertIndex(
            pageBlocks.value,
            topLevelPasteSlot ?? getDefaultSlotName(),
          );
    const pasteUsesRegistry =
      editorContext?.usesRegistry ?? rootPasteContext?.usesRegistry ?? false;
    const mutationPath = resolveMutationPath();
    if (!mutationPath) {
      toast.error("Missing editor context for paste operation");
      return;
    }

    if (clipboardNode && !systemHasHtml) {
      const parentId = result?.parent?.id || null;
      const insertIndex = result ? result.index + 1 : defaultRootInsertIndex;
      let clonedNode = cloneNode(clipboardNode, { regenerateIds: true });

      if (!parentId && topLevelPasteSlot) {
        clonedNode = assignTopLevelSlot(
          clonedNode,
          topLevelPasteSlot,
          currentLayout?.value ?? null,
        );
      }

      const pasteContext =
        editorContext ??
        (rootPasteContext
          ? {
              parent: null,
              index: defaultRootInsertIndex,
              roots: rootPasteContext.roots,
              commitTree: rootPasteContext.commitTree,
              usesRegistry: rootPasteContext.usesRegistry,
              rootSlotName: rootPasteContext.rootSlotName,
            }
          : null);

      const executeResult = await executeNodeEventOperation(
        {
          type: "insert-node",
          description: `Pasted ${clonedNode.type}`,
          affectedNodeIds: [clonedNode.id],
        },
        {
          undo: async () => {
            if (pasteUsesRegistry) {
              deleteNodeFromEditor(clonedNode.id);
              setSelectedBlock(null);
              return;
            }

            const response = await actions.deleteNode({
              collection: mutationPath.collection,
              id: mutationPath.id,
              nodeId: clonedNode.id,
            });

            if (response.error) {
              throw new Error(response.error.message);
            }

            pageBlocks.value = deleteNodeById(pageBlocks.value, clonedNode.id);
          },
          redo: async () => {
            if (pasteUsesRegistry && pasteContext) {
              insertNodeInEditor(
                parentId,
                clonedNode,
                insertIndex,
                pasteContext,
              );
              setSelectedBlock(clonedNode.id);
              return;
            }

            const response = await actions.insertNode({
              collection: mutationPath.collection,
              id: mutationPath.id,
              parentId,
              node: clonedNode,
              position: insertIndex,
            });

            if (response.error) {
              throw new Error(response.error.message);
            }

            pageBlocks.value = insertNodeInTree(
              pageBlocks.value,
              parentId,
              clonedNode,
              insertIndex,
            );
            setSelectedBlock(clonedNode.id);
          },
        },
      );

      if (!executeResult.success) {
        toast.error(executeResult.error ?? "Failed to paste block");
        return;
      }

      toast.success("Pasted block");
      return;
    }

    clearClipboard?.();

    const importResult = await importHtmlFromClipboard(
      readClipboardText,
      readClipboardHtmlFromNavigator,
      pasteOptions,
      importHtmlToNodes,
    );

    if (!importResult) {
      toast.error("Clipboard is empty");
      return;
    }

    if (detectTokenizedMarkupImport(importResult.nodes)) {
      toast.error(
        "Clipboard looks like source code, not a layout. Copy the file contents again or paste from the code view.",
      );
      return;
    }

    const imported = {
      nodes: importResult.nodes,
      report: importResult.report,
    };

    await ensureImportedCustomClasses(imported.report.createdCustomClasses);

    const htmlPasteSearchRoots =
      editorContext && editorNodeRegistry
        ? editorNodeRegistry.getEditableNodesForSlot(editorContext.rootSlotName)
        : rootPasteContext && editorNodeRegistry
          ? editorNodeRegistry.getEditableNodesForSlot(
              rootPasteContext.rootSlotName,
            )
          : pageBlocks.value;
    const { parentId, insertIndex } = resolveHtmlPasteInsertion(
      targetNode,
      result,
      imported.nodes,
      htmlPasteSearchRoots,
      defaultRootInsertIndex,
    );

    const insertedNodes =
      !parentId && topLevelPasteSlot
        ? imported.nodes.map((node) =>
            assignTopLevelSlot(
              node,
              topLevelPasteSlot,
              currentLayout?.value ?? null,
            ),
          )
        : imported.nodes;

    const htmlPasteContext =
      editorContext ??
      (rootPasteContext
        ? {
            parent: null,
            index: defaultRootInsertIndex,
            roots: rootPasteContext.roots,
            commitTree: rootPasteContext.commitTree,
            usesRegistry: rootPasteContext.usesRegistry,
            rootSlotName: rootPasteContext.rootSlotName,
          }
        : null);

    const importedNodeIds = insertedNodes.map((node) => node.id);

    const executeResult = await executeNodeEventOperation(
      {
        type: "insert-node",
        description:
          insertedNodes.length === 1
            ? `Pasted imported ${insertedNodes[0]?.type ?? "node"}`
            : `Pasted ${insertedNodes.length} imported nodes`,
        affectedNodeIds: importedNodeIds,
      },
      {
        undo: async () => {
          if (pasteUsesRegistry) {
            for (const nodeId of importedNodeIds) {
              deleteNodeFromEditor(nodeId);
            }
            setSelectedBlock(null);
            return;
          }

          for (const nodeId of importedNodeIds) {
            const response = await actions.deleteNode({
              collection: mutationPath.collection,
              id: mutationPath.id,
              nodeId,
            });

            if (response.error) {
              throw new Error(response.error.message);
            }

            pageBlocks.value = deleteNodeById(pageBlocks.value, nodeId);
          }
        },
        redo: async () => {
          if (pasteUsesRegistry && htmlPasteContext) {
            if (insertedNodes.length === 1) {
              insertNodeInEditor(
                parentId,
                insertedNodes[0]!,
                insertIndex,
                htmlPasteContext,
              );
            } else {
              const slotName = htmlPasteContext.rootSlotName;
              let nextRoots = editorNodeRegistry
                ? [...editorNodeRegistry.getEditableNodesForSlot(slotName)]
                : [...htmlPasteContext.roots];
              for (const [offset, node] of insertedNodes.entries()) {
                nextRoots = insertNodeInTree(
                  nextRoots,
                  parentId,
                  node,
                  insertIndex + offset,
                );
              }
              htmlPasteContext.commitTree(nextRoots);
            }
            setSelectedBlock(insertedNodes[0]?.id ?? null);
            return;
          }

          const response = await actions.insertNodes({
            collection: mutationPath.collection,
            id: mutationPath.id,
            parentId,
            nodes: insertedNodes,
            position: insertIndex,
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          pageBlocks.value = insertNodesInTree(
            pageBlocks.value,
            parentId,
            insertedNodes,
            insertIndex,
          );
          setSelectedBlock(insertedNodes[0]?.id ?? null);
        },
      },
    );

    if (!executeResult.success) {
      toast.error(executeResult.error ?? "Failed to paste block");
      return;
    }

    if (hasImportChanges(imported)) {
      toast.info("Pasted HTML with unsupported markup removed");
    }

    toast.success(buildPasteImportToastMessage(insertedNodes.length, imported));

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(HTML_PASTE_COMPLETE_EVENT));
    }
  };

  return {
    handleDeleteBlock,
    handleDeleteBlocks,
    handleDuplicateBlock,
    handleCopyBlock,
    handlePasteBlock,
  };
}
