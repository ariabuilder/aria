import type { Ref } from "vue";
import { actions } from "astro:actions";
import type { BuilderNode, LayoutDSL } from "../../../../../lib/types/nodes";
import type { ActiveLayoutSlot } from "../../../../../lib/schemas/slotEditing";
import {
  insertNode as insertNodeInTree,
  deleteNodeById,
} from "../../../../../lib/blocks/nodeUtils";
import type { useEditorNodeRegistry } from "../../../Core/composables/useEditorNodeRegistry";
import type { ExecuteNodeEventOperation } from "./nodeEventHistory";
import { normalizeBuilderNodeClassFields } from "../../../../../lib/blocks/normalizeBuilderNodeClasses";

type EditorNodeRegistry = ReturnType<typeof useEditorNodeRegistry>;

function layoutUsesNodeRegistry(
  editorNodeRegistry: EditorNodeRegistry | undefined,
  currentLayout: LayoutDSL | null | undefined,
): boolean {
  return Boolean(editorNodeRegistry && (currentLayout?.slots?.length ?? 0) > 0);
}

export interface InsertNodeViaActionDeps {
  pageBlocks: Ref<BuilderNode[]>;
  currentLayout: Ref<LayoutDSL | null>;
  activeSlot?: Ref<ActiveLayoutSlot>;
  showLayoutSlotGroups?: Ref<boolean>;
  editorNodeRegistry?: EditorNodeRegistry;
  executeNodeEventOperation: ExecuteNodeEventOperation;
  setSelectedBlock: (id: string | null) => void;
  resolveMutationPath: () => {
    collection: "pages" | "layouts" | "components";
    id: string;
  } | null;
  findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null;
}

export interface InsertNodeViaActionInput {
  newNode: BuilderNode;
  parentId: string | null | undefined;
  insertPosition: number;
  historyDescription: string;
}

export type InsertNodeViaActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing-context" | "parent-not-found" | "operation-failed";
      message: string;
    };

export async function insertNodeViaAction(
  deps: InsertNodeViaActionDeps,
  input: InsertNodeViaActionInput,
): Promise<InsertNodeViaActionResult> {
  const {
    pageBlocks,
    currentLayout,
    activeSlot,
    showLayoutSlotGroups,
    editorNodeRegistry,
    executeNodeEventOperation,
    setSelectedBlock,
    resolveMutationPath,
    findNodeById,
  } = deps;

  const { newNode: rawNode, historyDescription } = input;
  const parentId = input.parentId ?? null;
  const insertPosition = input.insertPosition;

  // Normalize class fields before the history snapshot so undo/redo
  // preserves the clean shape (no legacy className / props.class).
  let newNode: BuilderNode;
  try {
    newNode = normalizeBuilderNodeClassFields(rawNode).node;
  } catch {
    return {
      ok: false,
      reason: "operation-failed",
      message: "Element data is invalid and could not be inserted",
    };
  }

  const mutationPath = resolveMutationPath();
  if (!mutationPath) {
    return {
      ok: false,
      reason: "missing-context",
      message: "Missing editor context for add operation",
    };
  }

  const layoutSlotInsert =
    parentId === null &&
    activeSlot?.value.scope === "layout" &&
    (showLayoutSlotGroups?.value ?? true) &&
    Boolean(editorNodeRegistry);

  const usesRegistry =
    layoutUsesNodeRegistry(editorNodeRegistry, currentLayout.value) &&
    Boolean(editorNodeRegistry);

  if (parentId !== null) {
    const located = editorNodeRegistry?.locateNode(parentId) ?? null;
    const inPageBlocks = findNodeById(pageBlocks.value, parentId);

    if (!located && !inPageBlocks) {
      return {
        ok: false,
        reason: "parent-not-found",
        message: "Drop target not found in the page tree",
      };
    }

    if (
      usesRegistry &&
      located?.store.kind === "layout-slot" &&
      editorNodeRegistry
    ) {
      const slotName = located.store.slotName;
      const roots = editorNodeRegistry.getEditableNodesForSlot(slotName);
      const parentInSlot = findNodeById(roots, parentId);
      if (!parentInSlot && located.node.id !== parentId) {
        return {
          ok: false,
          reason: "parent-not-found",
          message: "Drop target not found in layout slot",
        };
      }
    }
  }

  const insertIntoRegistrySlot = (
    slotName: string,
    resolvedParentId: string | null,
    index: number,
  ): void => {
    if (!editorNodeRegistry) {
      return;
    }

    const roots = [...editorNodeRegistry.getEditableNodesForSlot(slotName)];
    if (resolvedParentId === null) {
      roots.splice(index, 0, newNode);
      editorNodeRegistry.setRootNodesForSlot(slotName, roots);
      return;
    }

    editorNodeRegistry.setRootNodesForSlot(
      slotName,
      insertNodeInTree(roots, resolvedParentId, newNode, index),
    );
  };

  const result = await executeNodeEventOperation(
    {
      type: "insert-node",
      description: historyDescription,
      affectedNodeIds: [newNode.id],
    },
    {
      redo: async () => {
        if (layoutSlotInsert && editorNodeRegistry) {
          editorNodeRegistry.insertIntoActiveTree(
            null,
            newNode,
            insertPosition,
          );
          setSelectedBlock(newNode.id);
          return;
        }

        if (usesRegistry && parentId && editorNodeRegistry) {
          const located = editorNodeRegistry.locateNode(parentId);
          if (located?.store.kind === "layout-slot") {
            insertIntoRegistrySlot(
              located.store.slotName,
              parentId,
              insertPosition,
            );
            setSelectedBlock(newNode.id);
            return;
          }
        }

        const response = await actions.insertNode({
          collection: mutationPath.collection,
          id: mutationPath.id,
          parentId,
          node: newNode,
          position: insertPosition,
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        pageBlocks.value = insertNodeInTree(
          pageBlocks.value,
          parentId,
          newNode,
          insertPosition,
        );
        setSelectedBlock(newNode.id);
      },
      undo: async () => {
        if (layoutSlotInsert && editorNodeRegistry) {
          editorNodeRegistry.deleteFromRegistry(newNode.id);
          setSelectedBlock(null);
          return;
        }

        if (usesRegistry && parentId && editorNodeRegistry) {
          const located = editorNodeRegistry.locateNode(parentId);
          if (located?.store.kind === "layout-slot") {
            editorNodeRegistry.deleteFromRegistry(newNode.id);
            setSelectedBlock(null);
            return;
          }
        }

        const response = await actions.deleteNode({
          collection: mutationPath.collection,
          id: mutationPath.id,
          nodeId: newNode.id,
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        pageBlocks.value = deleteNodeById(pageBlocks.value, newNode.id);
        setSelectedBlock(null);
      },
    },
  );

  if (!result.success) {
    return {
      ok: false,
      reason: "operation-failed",
      message: result.error ?? "Failed to add element",
    };
  }

  return { ok: true };
}

export function resolveInsertPosition(
  pageBlocks: readonly BuilderNode[],
  parentId: string | null | undefined,
  explicitPosition: number | undefined,
  findNodeById: (nodes: BuilderNode[], id: string) => BuilderNode | null,
): number {
  if (typeof explicitPosition === "number") {
    return explicitPosition;
  }

  if (parentId) {
    return findNodeById([...pageBlocks], parentId)?.children?.length ?? 0;
  }

  return pageBlocks.length;
}
