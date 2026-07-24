import { z } from "zod";

import { useHistory } from "@/features/History/composables/useHistory";
import type { OperationType } from "@/features/History/composables/useHistory";

const MediaHistoryTypeSchema = z.enum([
  "media-upload",
  "media-upload-failed",
  "media-rename",
  "media-rename-failed",
  "media-delete",
  "media-delete-failed",
  "media-duplicate",
  "media-duplicate-failed",
]);

const MediaHistoryMetadataSchema = z
  .object({
    type: MediaHistoryTypeSchema,
    description: z.string().trim().min(1),
    affectedNodeIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

type MediaHistoryResult = {
  success: boolean;
  error?: string;
};

interface ExecuteMediaHistoryInput {
  metadata: z.input<typeof MediaHistoryMetadataSchema>;
  redo?: () => Promise<void>;
  undo?: () => Promise<void>;
}

export function useMediaHistory() {
  const { execute } = useHistory();

  async function executeMediaHistory(
    input: ExecuteMediaHistoryInput,
  ): Promise<MediaHistoryResult> {
    const parsedMetadata = MediaHistoryMetadataSchema.safeParse(input.metadata);
    if (!parsedMetadata.success) {
      return {
        success: false,
        error:
          parsedMetadata.error.issues[0]?.message ??
          "Invalid media history metadata",
      };
    }

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      affectedNodeIds: parsedMetadata.data.affectedNodeIds,
      redo: input.redo ?? (async () => {}),
      undo: input.undo ?? (async () => {}),
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error?.message ?? "Failed to execute media history",
      };
    }

    return { success: true };
  }

  async function recordMediaEvent(
    metadata: z.input<typeof MediaHistoryMetadataSchema>,
  ): Promise<MediaHistoryResult> {
    return executeMediaHistory({ metadata });
  }

  return {
    executeMediaHistory,
    recordMediaEvent,
  };
}
