import { z } from "zod";

import { log } from "@/lib/utils/logger";
import type { OperationType, useHistory } from "../../History";

const EditorMutationHistoryTypeSchema = z.enum([
  "insert-node",
  "reorder-nodes",
  "update-node-props",
]);

const EditorMutationHistoryMetadataSchema = z
  .object({
    type: EditorMutationHistoryTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
    group: z
      .object({
        key: z.string().trim().min(1),
        windowMs: z.int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

interface EditorMutationHistoryCallbacks {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

export function useEditorMutationHistory(
  history: Pick<ReturnType<typeof useHistory>, "execute">,
) {
  function executeEditorMutation(
    metadata: z.input<typeof EditorMutationHistoryMetadataSchema>,
    callbacks: EditorMutationHistoryCallbacks,
  ): boolean {
    const parsedMetadata =
      EditorMutationHistoryMetadataSchema.safeParse(metadata);
    if (!parsedMetadata.success) {
      log("warn", "[EditorMutation] Invalid history metadata", {
        issues: parsedMetadata.error.issues,
      });
      return false;
    }

    void history
      .execute({
        type: parsedMetadata.data.type as OperationType,
        timestamp: Date.now(),
        description: parsedMetadata.data.description,
        affectedNodeIds: parsedMetadata.data.affectedNodeIds,
        group: parsedMetadata.data.group,
        undo: callbacks.undo,
        redo: callbacks.redo,
      })
      .then((result) => {
        if (!result.success) {
          log("warn", "[EditorMutation] History execution failed", {
            type: parsedMetadata.data.type,
            description: parsedMetadata.data.description,
            error:
              result.error?.message ??
              `Failed to execute editor mutation: ${parsedMetadata.data.type}`,
          });
        }
      });

    return true;
  }

  return {
    executeEditorMutation,
  };
}
