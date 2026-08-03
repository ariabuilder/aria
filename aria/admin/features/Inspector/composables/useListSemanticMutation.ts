import {
  isEditorMutationLocked,
  trackEditorCommit,
} from "../../Core/composables/editorCommitCoordinator";
import { useSelectedNodeState } from "../../Core";
import { useHistory } from "../../History";
import {
  convertListSemanticMode,
  resolveListSemanticMode,
  type ListSemanticMode,
} from "../../../../lib/blocks/listNodes";
import type { BuilderNode } from "../../../../lib/types/nodes";

export function useListSemanticMutation() {
  const { replaceSelectedNode } = useSelectedNodeState();
  const { execute } = useHistory();

  async function replaceListSemanticMode(
    listNode: BuilderNode,
    nextMode: ListSemanticMode,
  ): Promise<{ success: true } | { success: false; error: string }> {
    if (isEditorMutationLocked()) {
      return { success: false, error: "The editor is saving" };
    }

    const previousNode = convertListSemanticMode(
      listNode,
      resolveListSemanticMode(listNode),
    );
    const nextNode = convertListSemanticMode(listNode, nextMode);
    const operation = execute({
      type: "update-node",
      timestamp: Date.now(),
      description: `Change list type to ${nextMode}`,
      affectedNodeIds: [listNode.id],
      undo: async () => {
        replaceSelectedNode(listNode.id, previousNode);
      },
      redo: async () => {
        replaceSelectedNode(listNode.id, nextNode);
      },
    });
    const result = await trackEditorCommit(operation, "List type change");

    return result.success
      ? { success: true }
      : {
          success: false,
          error: result.error?.message ?? "Failed to change list type",
        };
  }

  return { replaceListSemanticMode };
}
