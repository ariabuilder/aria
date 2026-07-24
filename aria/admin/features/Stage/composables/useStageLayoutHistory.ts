import { z } from "zod";

import type { LayoutDSL } from "../../../../lib/types/nodes";
import { cloneDeep } from "../../Core/utils/clone";
import {
  LayoutInspectorMetadataSchema,
  type LayoutInspectorMetadata,
} from "../../Core/types/layout";
import type { OperationType, useHistory } from "../../History";

const StageLayoutHistoryMetadataSchema = z
  .object({
    type: z.literal("update-layout-metadata"),
    description: z.string().trim().min(1),
  })
  .strict();

const StageLayoutSelectionSchema = z
  .object({
    previousLayout: z.string().trim().min(1).optional(),
    nextLayout: z.string().trim().min(1).optional(),
  })
  .strict();

type StageLayoutHistoryResult = {
  success: boolean;
  error?: string;
};

type StageLayoutMetadataValue =
  | LayoutDSL["metadata"]
  | LayoutInspectorMetadata
  | undefined;

interface StageLayoutHistoryCallbacks {
  redo: () => void | Promise<void>;
  undo: () => void | Promise<void>;
}

interface RecordLayoutSelectionChangeInput {
  previousLayout?: string;
  nextLayout?: string;
  applyLayoutSelection: (layoutSlug?: string) => void | Promise<void>;
}

interface RecordLayoutMetadataUpdateInput {
  previousMetadata?: StageLayoutMetadataValue;
  nextMetadata: LayoutInspectorMetadata;
  applyMetadata: (metadata: StageLayoutMetadataValue) => void | Promise<void>;
}

export function useStageLayoutHistory(
  history: Pick<ReturnType<typeof useHistory>, "execute">,
) {
  async function executeStageLayoutHistory(
    description: string,
    callbacks: StageLayoutHistoryCallbacks,
  ): Promise<StageLayoutHistoryResult> {
    const parsedMetadata = StageLayoutHistoryMetadataSchema.safeParse({
      type: "update-layout-metadata",
      description,
    });
    if (!parsedMetadata.success) {
      return {
        success: false,
        error:
          parsedMetadata.error.issues[0]?.message ??
          "Invalid Stage layout history metadata",
      };
    }

    const result = await history.execute({
      type: parsedMetadata.data.type as OperationType,
      timestamp: Date.now(),
      description: parsedMetadata.data.description,
      redo: callbacks.redo,
      undo: callbacks.undo,
    });

    if (!result.success) {
      return {
        success: false,
        error:
          result.error?.message ??
          "Failed to execute Stage layout history operation",
      };
    }

    return { success: true };
  }

  async function recordLayoutSelectionChange(
    input: RecordLayoutSelectionChangeInput,
  ): Promise<StageLayoutHistoryResult> {
    const parsedSelection = StageLayoutSelectionSchema.safeParse({
      previousLayout: input.previousLayout,
      nextLayout: input.nextLayout,
    });
    if (!parsedSelection.success) {
      return {
        success: false,
        error:
          parsedSelection.error.issues[0]?.message ??
          "Invalid Stage layout selection change",
      };
    }

    const { previousLayout, nextLayout } = parsedSelection.data;

    return executeStageLayoutHistory(
      `Change layout to ${nextLayout ?? "none"}`,
      {
        redo: async () => {
          await input.applyLayoutSelection(nextLayout);
        },
        undo: async () => {
          await input.applyLayoutSelection(previousLayout);
        },
      },
    );
  }

  async function recordLayoutMetadataUpdate(
    input: RecordLayoutMetadataUpdateInput,
  ): Promise<StageLayoutHistoryResult> {
    const parsedNextMetadata = LayoutInspectorMetadataSchema.safeParse(
      input.nextMetadata,
    );
    if (!parsedNextMetadata.success) {
      return {
        success: false,
        error:
          parsedNextMetadata.error.issues[0]?.message ??
          "Invalid Stage layout metadata update",
      };
    }

    const nextMetadata = cloneDeep(parsedNextMetadata.data);
    const previousMetadata = cloneDeep(input.previousMetadata);

    return executeStageLayoutHistory("Update layout configuration", {
      redo: async () => {
        await input.applyMetadata(cloneDeep(nextMetadata));
      },
      undo: async () => {
        await input.applyMetadata(cloneDeep(previousMetadata));
      },
    });
  }

  return {
    executeStageLayoutHistory,
    recordLayoutSelectionChange,
    recordLayoutMetadataUpdate,
  };
}
