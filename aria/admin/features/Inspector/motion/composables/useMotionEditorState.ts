/**
 * Aria Motion local editor state
 */

import { ref, watch, type Ref } from "vue";
import type { BuilderNode } from "../../../../../lib/types/nodes";
import {
  DEFAULT_NODE_MOTION,
  NodeMotionSchema,
  type NodeMotion,
} from "../../../../../lib/motion/schemas/nodeMotion.schema";

function readNodeMotion(node: BuilderNode | null | undefined): NodeMotion {
  const parsed = NodeMotionSchema.safeParse(node?.motion ?? DEFAULT_NODE_MOTION);
  return parsed.success ? parsed.data : DEFAULT_NODE_MOTION;
}

export function useMotionEditorState(
  selectedNode: Ref<BuilderNode | null | undefined>,
) {
  const draft = ref<NodeMotion>(DEFAULT_NODE_MOTION);
  const persisted = ref<NodeMotion>(DEFAULT_NODE_MOTION);

  watch(
    selectedNode,
    (node) => {
      const next = readNodeMotion(node);
      draft.value = NodeMotionSchema.parse(next);
      persisted.value = NodeMotionSchema.parse(next);
    },
    { immediate: true },
  );

  const isDirty = () =>
    JSON.stringify(draft.value) !== JSON.stringify(persisted.value);

  function resetDraft() {
    draft.value = NodeMotionSchema.parse(persisted.value);
  }

  function commitDraft() {
    persisted.value = NodeMotionSchema.parse(draft.value);
  }

  function setDraft(next: NodeMotion) {
    draft.value = NodeMotionSchema.parse(next);
  }

  return {
    draft,
    persisted,
    isDirty,
    resetDraft,
    commitDraft,
    setDraft,
  };
}
