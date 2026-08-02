import { z } from "zod";

import { BuilderNodeSchema } from "../../../../lib/schemas/nodes";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { cloneDeep } from "../../Core";
import { useHistory } from "../../History";
import type { OperationType } from "../../History";

const LayerHistoryItemTypeSchema = z.enum(["page", "layout", "component"]);

const LayerReorderBlocksSchema = z
  .object({
    previousBlocks: z.array(BuilderNodeSchema),
    nextBlocks: z.array(BuilderNodeSchema),
  })
  .strict();

const LayerReorderMetadataSchema = z
  .object({
    type: z.literal("reorder-nodes"),
    description: z.string().trim().min(1),
    itemType: LayerHistoryItemTypeSchema.optional(),
    itemSlug: z.string().trim().min(1).optional(),
  })
  .strict();

type LayerReorderHistoryResult = {
  success: boolean;
  error?: string;
};

interface RecordLayerReorderInput {
  previousBlocks: BuilderNode[];
  nextBlocks: BuilderNode[];
  description: string;
  itemType?: "page" | "layout" | "component";
  itemSlug?: string;
  alreadyApplied?: boolean;
  applyBlocks: (blocks: BuilderNode[]) => void | Promise<void>;
  previousLayoutSnapshot?: string;
  nextLayoutSnapshot?: string;
  applyLayoutSnapshot?: (snapshot: string) => void | Promise<void>;
}

function buildLayerHistoryGroupKey(
  itemType?: "page" | "layout" | "component",
  itemSlug?: string,
): string {
  return `layers-reorder:${itemType ?? "unknown"}:${itemSlug ?? "unknown"}`;
}

export function useLayerReorderHistory(
  dependencies?: Pick<ReturnType<typeof useHistory>, "execute">,
) {
  const { execute } = dependencies ?? useHistory();

  async function recordLayerReorder(
    input: RecordLayerReorderInput,
  ): Promise<LayerReorderHistoryResult> {
    const parsedBlocks = LayerReorderBlocksSchema.safeParse({
      previousBlocks: input.previousBlocks,
      nextBlocks: input.nextBlocks,
    });
    if (!parsedBlocks.success) {
      return {
        success: false,
        error:
          parsedBlocks.error.issues[0]?.message ??
          "Invalid layer reorder block payload",
      };
    }

    const parsedMetadata = LayerReorderMetadataSchema.safeParse({
      type: "reorder-nodes",
      description: input.description,
      itemType: input.itemType,
      itemSlug: input.itemSlug,
    });
    if (!parsedMetadata.success) {
      return {
        success: false,
        error:
          parsedMetadata.error.issues[0]?.message ??
          "Invalid layer reorder history metadata",
      };
    }

    const previousBlocks = parsedBlocks.data.previousBlocks;
    const nextBlocks = parsedBlocks.data.nextBlocks;
    let skipInitialRedo = input.alreadyApplied === true;

    const result = await execute({
      type: parsedMetadata.data.type as OperationType,
      description: parsedMetadata.data.description,
      undo: async () => {
        await input.applyBlocks(cloneDeep(previousBlocks));
        if (input.applyLayoutSnapshot && input.previousLayoutSnapshot) {
          await input.applyLayoutSnapshot(input.previousLayoutSnapshot);
        }
      },
      redo: async () => {
        if (skipInitialRedo) {
          skipInitialRedo = false;
          return;
        }

        await input.applyBlocks(cloneDeep(nextBlocks));
        if (input.applyLayoutSnapshot && input.nextLayoutSnapshot) {
          await input.applyLayoutSnapshot(input.nextLayoutSnapshot);
        }
      },
      timestamp: Date.now(),
      group: {
        key: buildLayerHistoryGroupKey(
          parsedMetadata.data.itemType,
          parsedMetadata.data.itemSlug,
        ),
        windowMs: 900,
      },
    });

    if (!result.success) {
      return {
        success: false,
        error:
          result.error?.message ??
          "Failed to execute layer reorder history operation",
      };
    }

    return { success: true };
  }

  return {
    recordLayerReorder,
  };
}
