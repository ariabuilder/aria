/**
 * Attaches drop listener to execute reorder operations.
 */

import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { BuilderNode } from "../../../../lib/types/nodes";

export interface UseDropReorderOptions {
  iframeRef: Ref<HTMLIFrameElement | null>;
  getBlocks: () => BuilderNode[];
  canvasReorder: {
    executeDrop: (blocksRef: ComputedRef<BuilderNode[]>) => {
      sourceParentId: string | null;
      sourceIndex: number;
      targetParentId: string | null;
      targetIndex: number;
    } | null;
  };
  emit: {
    (
      e: "reorderBlock",
      operation: {
        sourceParentId: string | null;
        sourceIndex: number;
        targetParentId: string | null;
        targetIndex: number;
      },
    ): void;
  };
}

export function useDropReorder(options: UseDropReorderOptions) {
  const { iframeRef, getBlocks, canvasReorder, emit } = options;

  const setupDropListener = (): void => {
    const iframe = iframeRef.value;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const handler = (e: DragEvent) => {
      e.preventDefault();
      if (import.meta.env.DEV) {
        console.log("[StageFrame] Drop event - executing reorder");
      }

      const blocksRef = computed(() => getBlocks());
      const operation = canvasReorder.executeDrop(blocksRef);
      if (operation) {
        if (import.meta.env.DEV) {
          console.log("[StageFrame] Emitting reorderBlock:", operation);
        }
        emit("reorderBlock", operation);
      }
    };

    doc.addEventListener("drop", handler, true);
  };

  return {
    setupDropListener,
  };
}
